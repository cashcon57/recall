# Updating Recall

Recall updates are intentionally conservative. The repository includes an optional helper, `recall-update.sh`, but you can always update manually with Git, Wrangler, and the release notes.

## Configuration preservation contract

Update tooling must preserve user-owned configuration and secrets. It must not regenerate, replace, or normalize:

- `wrangler.toml`
- `.dev.vars`
- `.recall-api-key`
- MCP client config files such as `.mcp.json` or `claude_desktop_config.json`
- D1 database bindings, Vectorize bindings, route/custom-domain blocks, env blocks, or Wrangler secrets

If an upstream release changes a protected config file, the updater refuses to apply it automatically. Review the diff manually and copy only the safe changes into your local config.

## Optional updater script

From the repository root:

```bash
./recall-update.sh --check
./recall-update.sh --doctor
./recall-update.sh --apply
./recall-update.sh --rollback
./recall-update.sh --install-cron weekly
```

### `--check`

Non-mutating. Fetches tags when possible, prints the current git revision/package version, reports the latest tag, and compares `migrations/*.sql` against the remote D1 `schema_migrations` table when Wrangler can query it.

If D1 is unavailable, `--check` warns and continues. It does not deploy, install packages, write config, or apply migrations.

### `--doctor`

Best-effort diagnostics. Checks for Node, npm, Wrangler, `node_modules`, `wrangler.toml`, D1 database name, `MEMORY_API_KEY` secret presence by name only, and `/health` if a worker URL is detectable.

`--doctor` does not intentionally mutate. If dependencies are missing, it tells you to run `npm ci` instead of installing them for you.

### `--apply`

Mutating and intentionally strict:

1. Requires a clean git worktree.
2. Fetches tags.
3. Refuses to proceed if the target revision changes protected config/secrets files.
4. Records the current revision in `.recall-update/previous-revision`.
5. Runs `npm ci`.
6. Runs `npm run typecheck` and `npm test`.
7. Confirms `schema_migrations` is reachable, then applies pending D1 migrations.
8. Runs `wrangler deploy`.
9. Requires smoke tests: `/health` plus authenticated MCP `tools/list`. Set `RECALL_WORKER_URL` if your worker URL cannot be detected from `wrangler.toml`; provide `MEMORY_API_KEY` or `.recall-api-key`.

The updater reads `.recall-api-key` only for the authenticated smoke test and never prints the value. Logs redact authorization examples.

### `--rollback`

Checks out the revision recorded in `.recall-update/previous-revision`, redeploys the worker, and smoke-tests when possible.

Rollback only affects worker code. D1 schema rollback is manual because SQLite/D1 migrations may be destructive or non-reversible. Before applying a risky release, export D1 if you need point-in-time database recovery:

```bash
npx wrangler d1 export <your-db-name> --remote --output recall-backup.sql
```

## Migration behavior

Migrations live in `migrations/` and are tracked by the D1 table `schema_migrations`.

- `--check` lists pending migrations when it can query D1.
- `--apply` runs pending numbered SQL files in order and refuses to continue unless `schema_migrations` is reachable.
- If D1 cannot be queried, fix D1 access or run/record migrations manually before rerunning `--apply`.
- Existing Docker/Postgres and local SQLite installs may have backend-specific migration behavior; check each migration comment header and release notes.

Manual D1 migration example:

```bash
npx wrangler d1 execute <your-db-name> --remote --file=migrations/0004_provenance_lifecycle.sql
npx wrangler d1 execute <your-db-name> --remote \
  --command "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES ('0004', datetime('now'));"
```

## Auto-update opt-in

Auto-update is not enabled by default. To install a weekly non-mutating check:

```bash
./recall-update.sh --install-cron weekly
```

This prints the crontab line only. To actually add it to your user crontab:

```bash
./recall-update.sh --install-cron weekly --yes
```

The cron job runs `--check`, not `--apply`, so it reports availability but does not deploy or migrate.

## GitHub Actions notes

An optional workflow skeleton lives at [`examples/github-actions-update.yml`](../examples/github-actions-update.yml). It is intentionally not installed under `.github/workflows/`.

If you adapt it:

- Store Cloudflare credentials as GitHub Actions secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
- Do not put `MEMORY_API_KEY` in the repository.
- Keep update jobs manual or scheduled only after you are comfortable with your migration/rollback process.
- Prefer running `--check`, `npm run typecheck`, and `npm test` before any deploy step.
