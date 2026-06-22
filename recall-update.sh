#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_NAME="$(basename "$0")"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

APPLY=0
CHECK=0
DOCTOR=0
ROLLBACK=0
INSTALL_CRON=""
YES=0

BACKUP_DIR=".recall-update"
PREVIOUS_REVISION_FILE="$BACKUP_DIR/previous-revision"
PROTECTED_PATHS=(
  "wrangler.toml"
  ".dev.vars"
  ".recall-api-key"
  ".mcp.json"
  "mcp.json"
  "claude_desktop_config.json"
)

log() { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
err() { printf 'error: %s\n' "$*" >&2; }

usage() {
  cat <<'USAGE'
Recall optional updater (safe by default)

Usage:
  ./recall-update.sh --check
  ./recall-update.sh --doctor
  ./recall-update.sh --apply [--yes]
  ./recall-update.sh --rollback
  ./recall-update.sh --install-cron weekly [--yes]

Safety contract:
  - --check and --doctor do not intentionally mutate files, deployments, secrets, or databases.
  - --apply refuses a dirty worktree, records the previous git revision, runs tests, applies only pending tracked D1 migrations, deploys, and smoke-tests when enough local config exists.
  - --rollback checks out the recorded previous revision and redeploys. D1 schema rollback is manual.
  - User-owned config/secrets are never regenerated or overwritten by this script: wrangler.toml, .dev.vars, .recall-api-key, MCP configs, D1/Vectorize/secrets/routes/env blocks.
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "missing required command: $1"
    return 1
  fi
}

run() {
  log "+ $*"
  "$@"
}

npx_wrangler() {
  if [[ -x node_modules/.bin/wrangler ]]; then
    node_modules/.bin/wrangler "$@"
  else
    npx wrangler "$@"
  fi
}

current_revision() {
  git rev-parse --short HEAD 2>/dev/null || printf 'unknown'
}

current_ref() {
  git describe --tags --always --dirty 2>/dev/null || current_revision
}

fetch_tags_best_effort() {
  if git remote get-url origin >/dev/null 2>&1; then
    git fetch --tags origin >/dev/null 2>&1 || warn "could not fetch tags from origin; continuing with local tags"
  else
    warn "no git remote named origin; using local tags only"
  fi
}

latest_tag() {
  git tag --sort=-v:refname 2>/dev/null | head -n1 || true
}

latest_remote_target() {
  local tag
  tag="$(latest_tag)"
  if [[ -n "$tag" ]]; then
    printf '%s' "$tag"
    return 0
  fi
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    printf '%s' "origin/main"
    return 0
  fi
  printf '%s' "HEAD"
}

package_version() {
  node -e "try{console.log(require('./package.json').version)}catch(e){process.exit(1)}" 2>/dev/null || printf 'unknown'
}

parse_d1_db_name() {
  [[ -f wrangler.toml ]] || return 1
  node <<'NODE'
const fs = require('fs');
const text = fs.readFileSync('wrangler.toml', 'utf8');
const dbBlock = text.match(/\[\[d1_databases\]\]([\s\S]*?)(?=\n\s*\[|\n\s*\[\[|$)/);
if (!dbBlock) process.exit(1);
const name = dbBlock[1].match(/^\s*database_name\s*=\s*["']([^"']+)["']/m);
if (!name) process.exit(1);
console.log(name[1]);
NODE
}

parse_worker_url() {
  if [[ -n "${RECALL_WORKER_URL:-}" ]]; then
    printf '%s' "${RECALL_WORKER_URL%/}"
    return 0
  fi
  [[ -f wrangler.toml ]] || return 1
  node <<'NODE'
const fs = require('fs');
const text = fs.readFileSync('wrangler.toml', 'utf8');
const route = text.match(/^\s*pattern\s*=\s*["']([^"']+)["']/m);
if (route) {
  let p = route[1].replace(/\/\*$/, '');
  if (!p.startsWith('http')) p = 'https://' + p;
  console.log(p);
  process.exit(0);
}
process.exit(1);
NODE
}

migration_files() {
  if [[ -d migrations ]]; then
    find migrations -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.sql' | sort
  fi
}

query_applied_migrations() {
  local db_name="$1"
  npx_wrangler d1 execute "$db_name" --remote --command "SELECT version FROM schema_migrations ORDER BY version;" 2>/tmp/recall-update-d1.err \
    | sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p'
}

pending_migrations() {
  local db_name applied tmp file base version
  db_name="${1:-}"
  tmp="$(mktemp)"
  if [[ -n "$db_name" ]] && query_applied_migrations "$db_name" >"$tmp"; then
    :
  else
    rm -f "$tmp"
    return 2
  fi
  while IFS= read -r file; do
    base="$(basename "$file")"
    version="${base%%_*}"
    if ! grep -qxF "$version" "$tmp"; then
      printf '%s\n' "$file"
    fi
  done < <(migration_files)
  rm -f "$tmp"
}

print_migration_status() {
  local db_name pending_status
  db_name="$(parse_d1_db_name 2>/dev/null || true)"
  if [[ -z "$db_name" ]]; then
    warn "could not detect D1 database_name from wrangler.toml; skipping remote migration status"
    log "Migration files present:"
    migration_files | sed 's/^/  /' || true
    return 0
  fi
  log "D1 database: $db_name"
  log "Pending migrations:"
  set +e
  local pending
  pending="$(pending_migrations "$db_name")"
  pending_status=$?
  set -e
  if [[ $pending_status -eq 0 ]]; then
    if [[ -n "$pending" ]]; then
      printf '%s\n' "$pending" | sed 's/^/  /'
    else
      log "  none"
    fi
  else
    warn "could not query D1 schema_migrations; continuing without remote migration status"
    if [[ -s /tmp/recall-update-d1.err ]]; then
      sed 's/^/  wrangler: /' /tmp/recall-update-d1.err >&2 || true
    fi
    log "Migration files present:"
    migration_files | sed 's/^/  /' || true
  fi
}

check_clean_worktree() {
  if [[ -n "$(git status --porcelain=v1)" ]]; then
    err "worktree is dirty; commit/stash changes before --apply/--rollback"
    git status --short
    return 1
  fi
}

ensure_target_does_not_change_protected_paths() {
  local target="$1" p
  for p in "${PROTECTED_PATHS[@]}"; do
    if git cat-file -e "HEAD:$p" 2>/dev/null || git cat-file -e "$target:$p" 2>/dev/null; then
      if ! git diff --quiet "HEAD" "$target" -- "$p" 2>/dev/null; then
        err "refusing update: target $target changes protected user-owned config path '$p'"
        err "update manually and preserve local D1/Vectorize/secrets/routes/env settings"
        return 1
      fi
    fi
  done
}

backup_state() {
  mkdir -p "$BACKUP_DIR/protected"
  git rev-parse HEAD >"$PREVIOUS_REVISION_FILE"
  local p dest
  for p in "${PROTECTED_PATHS[@]}"; do
    if [[ -e "$p" ]]; then
      dest="$BACKUP_DIR/protected/$p"
      mkdir -p "$(dirname "$dest")"
      cp -p "$p" "$dest"
    fi
  done
  chmod 700 "$BACKUP_DIR" || true
  log "Recorded previous revision in $PREVIOUS_REVISION_FILE"
}

run_check() {
  require_cmd git
  require_cmd node || true
  log "Recall updater check (no mutations)"
  log "Repository: $ROOT_DIR"
  log "Current git ref: $(current_ref) ($(current_revision))"
  log "Package version: $(package_version)"
  fetch_tags_best_effort
  local tag
  tag="$(latest_tag)"
  if [[ -n "$tag" ]]; then
    log "Latest local/fetched tag: $tag"
  else
    warn "no git tags found"
  fi
  print_migration_status
}

run_doctor() {
  log "Recall updater doctor (best-effort, no intentional mutations)"
  require_cmd git || true
  require_cmd node || true
  if command -v npm >/dev/null 2>&1; then
    log "npm: $(npm --version)"
  else
    warn "npm not found"
  fi
  if [[ -x node_modules/.bin/wrangler ]]; then
    log "wrangler: $(node_modules/.bin/wrangler --version 2>/dev/null || true)"
  elif command -v npx >/dev/null 2>&1; then
    log "wrangler: using npx wrangler (install dependencies first if this prompts)"
  else
    warn "wrangler unavailable: no node_modules/.bin/wrangler and no npx"
  fi
  if [[ -d node_modules ]]; then
    log "node_modules: present"
  else
    warn "node_modules missing; run 'npm ci' before typecheck/test/deploy"
  fi
  if [[ -f package-lock.json ]]; then
    log "package-lock.json: present"
  else
    warn "package-lock.json missing; npm ci will not work"
  fi
  if [[ -f wrangler.toml ]]; then
    log "wrangler.toml: present"
    local db
    db="$(parse_d1_db_name 2>/dev/null || true)"
    [[ -n "$db" ]] && log "D1 database_name detected: $db" || warn "could not detect D1 database_name"
  else
    warn "wrangler.toml missing; copy wrangler.toml.example and fill bindings before deploy"
  fi
  if [[ -f .dev.vars ]]; then
    log ".dev.vars: present (not read)"
  fi
  if [[ -f .recall-api-key ]]; then
    log ".recall-api-key: present (value not printed)"
  else
    warn ".recall-api-key missing; MCP smoke tests will be skipped unless MEMORY_API_KEY is exported"
  fi
  if [[ -f wrangler.toml ]] && ( [[ -x node_modules/.bin/wrangler ]] || command -v npx >/dev/null 2>&1 ); then
    if npx_wrangler secret list 2>/tmp/recall-update-secret-list.err | grep -q 'MEMORY_API_KEY'; then
      log "Cloudflare secret MEMORY_API_KEY: present (name only)"
    else
      warn "could not confirm MEMORY_API_KEY via wrangler secret list (not logged in, no permissions, or secret absent)"
    fi
  fi
  local url
  url="$(parse_worker_url 2>/dev/null || true)"
  if [[ -n "$url" ]]; then
    log "Health URL detected: ${url%/}/health"
    if command -v curl >/dev/null 2>&1; then
      curl -fsS --max-time 10 "${url%/}/health" >/tmp/recall-update-health.json \
        && log "/health: reachable" \
        || warn "/health check failed"
      rm -f /tmp/recall-update-health.json
    fi
  else
    warn "worker URL not detectable; set RECALL_WORKER_URL=https://your-worker.example.com for health checks"
  fi
}

apply_pending_migrations() {
  local db_name pending file base version
  db_name="$(parse_d1_db_name 2>/dev/null || true)"
  if [[ -z "$db_name" ]]; then
    warn "no D1 database_name detected; skipping migrations"
    return 0
  fi
  set +e
  pending="$(pending_migrations "$db_name")"
  local status=$?
  set -e
  if [[ $status -ne 0 ]]; then
    warn "schema_migrations is not reachable; skipping automatic D1 migrations"
    warn "Run pending migrations manually if this release includes schema changes."
    return 0
  fi
  if [[ -z "$pending" ]]; then
    log "No pending D1 migrations"
    return 0
  fi
  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    base="$(basename "$file")"
    version="${base%%_*}"
    run npx_wrangler d1 execute "$db_name" --remote --file="$file"
    run npx_wrangler d1 execute "$db_name" --remote --command "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES ('$version', datetime('now'));"
  done <<<"$pending"
}

smoke_test() {
  local url key auth_url
  url="$(parse_worker_url 2>/dev/null || true)"
  if [[ -z "$url" ]]; then
    warn "worker URL not detectable; skipping smoke tests (set RECALL_WORKER_URL)"
    return 0
  fi
  run curl -fsS --max-time 10 "${url%/}/health" >/dev/null
  if [[ -n "${MEMORY_API_KEY:-}" ]]; then
    key="$MEMORY_API_KEY"
  elif [[ -f .recall-api-key ]]; then
    key="$(tr -d '\r\n' < .recall-api-key)"
  else
    warn "no MEMORY_API_KEY env or .recall-api-key; skipping authenticated MCP tools/list smoke test"
    return 0
  fi
  auth_url="${url%/}/mcp"
  log "+ curl -fsS --max-time 15 -H 'Authorization: Bearer ***' -H 'Content-Type: application/json' -d '{...tools/list...}' '$auth_url'"
  curl -fsS --max-time 15 \
    -H "Authorization: Bearer ${key}" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
    "$auth_url" >/tmp/recall-update-tools.json
  node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('/tmp/recall-update-tools.json','utf8')); if (j.error) throw new Error(JSON.stringify(j.error)); const n=j.result?.tools?.length; if (!n) throw new Error('tools/list returned no tools'); console.log('tools/list:', n, 'tools');"
  rm -f /tmp/recall-update-tools.json
}
run_apply() {
  require_cmd git
  require_cmd node
  require_cmd npm
  check_clean_worktree
  fetch_tags_best_effort
  local target
  target="$(latest_remote_target)"
  log "Apply target: $target"
  if [[ "$target" == "HEAD" ]]; then
    warn "no newer tag or origin/main available; staying on current revision"
  fi
  ensure_target_does_not_change_protected_paths "$target"
  backup_state
  if [[ "$target" != "HEAD" ]]; then
    run git checkout "$target"
  fi
  run npm ci
  run npm run typecheck
  run npm test
  apply_pending_migrations
  run npx_wrangler deploy
  smoke_test
  log "Update apply completed. Protected config files were not regenerated or overwritten."
}

run_rollback() {
  require_cmd git
  require_cmd node
  require_cmd npm || true
  if [[ ! -f "$PREVIOUS_REVISION_FILE" ]]; then
    err "no previous revision recorded at $PREVIOUS_REVISION_FILE"
    return 1
  fi
  check_clean_worktree
  local prev
  prev="$(cat "$PREVIOUS_REVISION_FILE")"
  [[ -n "$prev" ]] || { err "previous revision file is empty"; return 1; }
  warn "D1 schema rollback is manual; this only rolls back worker code."
  ensure_target_does_not_change_protected_paths "$prev"
  run git checkout "$prev"
  if [[ -d node_modules ]]; then
    run npm run typecheck
    run npm test
  else
    warn "node_modules missing; skipping typecheck/test during rollback"
  fi
  run npx_wrangler deploy
  smoke_test
  log "Rollback deploy completed. Review database schema manually if migrations were applied."
}

install_cron_weekly() {
  local line escaped existing tmp
  line="0 4 * * 1 cd '$ROOT_DIR' && ./recall-update.sh --check >> '$ROOT_DIR/$BACKUP_DIR/cron.log' 2>&1 # recall-update weekly check"
  log "Suggested weekly cron line (non-mutating --check):"
  log "$line"
  if [[ $YES -ne 1 ]]; then
    warn "not installing cron without --yes"
    return 0
  fi
  require_cmd crontab
  mkdir -p "$BACKUP_DIR"
  tmp="$(mktemp)"
  crontab -l >"$tmp" 2>/dev/null || true
  if grep -Fq "# recall-update weekly check" "$tmp"; then
    warn "recall-update weekly cron line already present; leaving crontab unchanged"
    rm -f "$tmp"
    return 0
  fi
  printf '%s\n' "$line" >>"$tmp"
  crontab "$tmp"
  rm -f "$tmp"
  log "Installed weekly recall-update --check cron line."
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK=1 ;;
    --doctor) DOCTOR=1 ;;
    --apply) APPLY=1 ;;
    --rollback) ROLLBACK=1 ;;
    --install-cron)
      shift
      INSTALL_CRON="${1:-}"
      if [[ "$INSTALL_CRON" != "weekly" ]]; then
        err "--install-cron currently supports only: weekly"
        exit 2
      fi
      ;;
    --yes|-y) YES=1 ;;
    --help|-h) usage; exit 0 ;;
    *) err "unknown argument: $1"; usage; exit 2 ;;
  esac
  shift
done

selected=$((CHECK + DOCTOR + APPLY + ROLLBACK))
if [[ -n "$INSTALL_CRON" ]]; then
  selected=$((selected + 1))
fi
if [[ $selected -ne 1 ]]; then
  err "choose exactly one command"
  usage
  exit 2
fi

case 1 in
  $CHECK) run_check ;;
  $DOCTOR) run_doctor ;;
  $APPLY) run_apply ;;
  $ROLLBACK) run_rollback ;;
esac

if [[ -n "$INSTALL_CRON" ]]; then
  install_cron_weekly
fi
