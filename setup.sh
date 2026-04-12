#!/usr/bin/env bash
#
# Recall — one-shot Cloudflare setup script
#
# Creates the D1 database + Vectorize index, patches wrangler.toml with the
# resulting database_id, applies the schema, and prompts for the API key.
#
# Requires: wrangler logged in (`wrangler login`), node.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

log()   { echo -e "${BOLD}$*${RESET}"; }
ok()    { echo -e "${GREEN}✓${RESET} $*"; }
warn()  { echo -e "${YELLOW}!${RESET} $*"; }
fail()  { echo -e "${RED}✗${RESET} $*"; exit 1; }

# ── Preflight ────────────────────────────────────────────────────────

command -v npx >/dev/null || fail "node/npx not found. Install Node.js first."
[ -f package.json ]       || fail "Run this from the recall/ repo root."

log "→ Installing dependencies"
npm install --silent
ok "Dependencies installed"

if ! npx wrangler whoami >/dev/null 2>&1; then
  warn "You are not logged in to Cloudflare."
  echo "   Running: npx wrangler login"
  npx wrangler login
fi

# Determine which Cloudflare account this deploy targets.
# Order of precedence (matches wrangler's own resolution order):
#   1. $CLOUDFLARE_ACCOUNT_ID env var (if set)
#   2. Single account on the token (if only one)
#   3. Bail out and tell the user to choose (if multiple accounts)
#
# This fixes a bug in earlier versions where the log line just grabbed
# the first 32-hex ID from `wrangler whoami` output, which was always
# the top of the table regardless of which account wrangler would
# actually use for the deploy. Users with multiple accounts on the
# same token (very common for people who have a personal account and
# a business account) would see a log line saying "deploying to account
# A" while wrangler actually deployed to account B, or — worse — see
# the log say "account A" and correctly deploy to A, but then re-run
# setup.sh later without CLOUDFLARE_ACCOUNT_ID set and suddenly land
# on a different account.
if [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  ACCOUNT="$CLOUDFLARE_ACCOUNT_ID"
  ok "Cloudflare account: $ACCOUNT (from CLOUDFLARE_ACCOUNT_ID env var)"
else
  # Parse `wrangler whoami` output for account IDs.
  WHOAMI_OUTPUT="$(npx wrangler whoami 2>/dev/null || true)"
  ACCOUNT_IDS="$(echo "$WHOAMI_OUTPUT" | grep -Eo '[a-f0-9]{32}' || true)"
  ACCOUNT_COUNT="$(echo "$ACCOUNT_IDS" | grep -cv '^$' || true)"

  if [ "$ACCOUNT_COUNT" -eq 0 ]; then
    fail "Could not determine Cloudflare account. Check \`npx wrangler whoami\` output manually."
  elif [ "$ACCOUNT_COUNT" -eq 1 ]; then
    ACCOUNT="$(echo "$ACCOUNT_IDS" | head -1)"
    ok "Cloudflare account: $ACCOUNT"
  else
    # Multiple accounts on this token. wrangler will prompt
    # interactively if run in a TTY, or silently default to the first
    # account if run non-interactively. Neither is safe for a setup
    # script that provisions real resources. Fail fast and tell the
    # user to re-run with CLOUDFLARE_ACCOUNT_ID set.
    warn "Multiple Cloudflare accounts detected on this token:"
    echo "$WHOAMI_OUTPUT" | grep -E '(Account Name|[a-f0-9]{32})' | sed 's/^/   /'
    echo
    fail "Re-run with the account you want explicitly:
  CLOUDFLARE_ACCOUNT_ID=<account-id> ./setup.sh
You can copy the 32-char account ID from the table above."
  fi
fi

# ── wrangler.toml ────────────────────────────────────────────────────

if [ ! -f wrangler.toml ]; then
  log "→ Creating wrangler.toml from template"
  cp wrangler.toml.example wrangler.toml
fi

# ── D1 database ──────────────────────────────────────────────────────

DB_NAME="$(grep -E '^database_name' wrangler.toml | head -1 | sed -E 's/.*"([^"]+)".*/\1/')"
DB_NAME="${DB_NAME:-recall}"

log "→ Creating D1 database: $DB_NAME"
CREATE_OUT="$(npx wrangler d1 create "$DB_NAME" 2>&1 || true)"

if echo "$CREATE_OUT" | grep -q "already exists"; then
  warn "D1 database already exists — reusing"
  DB_ID="$(npx wrangler d1 list --json 2>/dev/null | node -e "
    let data = '';
    process.stdin.on('data', c => data += c);
    process.stdin.on('end', () => {
      try {
        const dbs = JSON.parse(data);
        const db = dbs.find(d => d.name === '$DB_NAME');
        if (db) process.stdout.write(db.uuid);
      } catch {}
    });
  ")"
else
  DB_ID="$(echo "$CREATE_OUT" | grep -Eo 'database_id = "[^"]+"' | head -1 | sed -E 's/.*"([^"]+)".*/\1/')"
  if [ -z "$DB_ID" ]; then
    DB_ID="$(echo "$CREATE_OUT" | grep -Eo '"[a-f0-9-]{36}"' | head -1 | tr -d '"')"
  fi
fi

[ -n "$DB_ID" ] || fail "Could not determine D1 database_id. Check wrangler output manually."
ok "D1 database_id: $DB_ID"

# Patch wrangler.toml with database_id
if grep -q "REPLACE_WITH_YOUR_D1_DATABASE_ID" wrangler.toml; then
  # Portable in-place sed (works on macOS + Linux)
  sed -i.bak "s|REPLACE_WITH_YOUR_D1_DATABASE_ID|$DB_ID|" wrangler.toml
  rm -f wrangler.toml.bak
  ok "Patched wrangler.toml with database_id"
fi

# ── Apply schema ─────────────────────────────────────────────────────

log "→ Applying schema to D1"
npx wrangler d1 execute "$DB_NAME" --file=schema.sql --remote --yes >/dev/null
ok "Schema applied"

# ── Vectorize index ──────────────────────────────────────────────────

INDEX_NAME="$(grep -E '^index_name' wrangler.toml | head -1 | sed -E 's/.*"([^"]+)".*/\1/')"
INDEX_NAME="${INDEX_NAME:-recall-vectors}"

log "→ Creating Vectorize index: $INDEX_NAME"
V_OUT="$(npx wrangler vectorize create "$INDEX_NAME" --dimensions=1024 --metric=cosine 2>&1 || true)"
if echo "$V_OUT" | grep -qi "already exists"; then
  warn "Vectorize index already exists — reusing"
else
  ok "Vectorize index created"
fi

# Vectorize metadata indexes for filtering
for field in importance author; do
  npx wrangler vectorize create-metadata-index "$INDEX_NAME" \
    --property-name="$field" \
    --type="$([ "$field" = "importance" ] && echo "number" || echo "string")" \
    >/dev/null 2>&1 || true
done
ok "Metadata indexes configured"

# ── API key secret ───────────────────────────────────────────────────

log "→ Generating API key and setting secret"
GENERATED_KEY="$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"

# Write to a temporary restricted file first, then pipe from the file to avoid
# the key ever appearing in process args, shell history, or `ps` output.
KEY_FILE="$(mktemp -t recall-setup-key.XXXXXX)"
chmod 600 "$KEY_FILE"
printf '%s' "$GENERATED_KEY" > "$KEY_FILE"

if ! npx wrangler secret put MEMORY_API_KEY < "$KEY_FILE" >/dev/null 2>&1; then
  warn "Automatic secret upload failed. Set it manually:"
  echo "    npx wrangler secret put MEMORY_API_KEY"
  echo "    (paste the key from $KEY_FILE when prompted)"
fi

# Save the key to a local file for the user to retrieve; delete the temp file.
LOCAL_KEY_PATH="$SCRIPT_DIR/.recall-api-key"
mv "$KEY_FILE" "$LOCAL_KEY_PATH"
chmod 600 "$LOCAL_KEY_PATH"

# ── Deploy ───────────────────────────────────────────────────────────

log "→ Deploying worker"
DEPLOY_OUT="$(npx wrangler deploy 2>&1)"
echo "$DEPLOY_OUT" | tail -20

WORKER_URL="$(echo "$DEPLOY_OUT" | grep -Eo 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -1)"

# ── Final summary ────────────────────────────────────────────────────

echo
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "✓ Recall is live"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
[ -n "$WORKER_URL" ] && echo -e "  ${BOLD}Endpoint:${RESET} $WORKER_URL/mcp"
echo -e "  ${BOLD}API key saved to:${RESET} $LOCAL_KEY_PATH (chmod 600)"
echo
echo -e "  ${DIM}The key is written to a local file rather than printed here so it${RESET}"
echo -e "  ${DIM}does not end up in terminal scrollback or screen-sharing history.${RESET}"
echo -e "  ${DIM}Retrieve it with:${RESET}"
echo
echo -e "    cat $LOCAL_KEY_PATH"
echo
echo -e "  ${BOLD}Move the key into a secret manager and delete the file when done:${RESET}"
echo -e "    rm $LOCAL_KEY_PATH"
echo
echo -e "  Add to your MCP client (e.g., Claude Code):"
echo -e "  ${DIM}{"
echo -e "    \"mcpServers\": {"
echo -e "      \"recall\": {"
echo -e "        \"type\": \"http\","
echo -e "        \"url\": \"${WORKER_URL:-<your-worker-url>}/mcp\","
echo -e "        \"headers\": {"
echo -e "          \"Authorization\": \"Bearer \${RECALL_API_KEY}\""
echo -e "        }"
echo -e "      }"
echo -e "    }"
echo -e "  }${RESET}"
echo
