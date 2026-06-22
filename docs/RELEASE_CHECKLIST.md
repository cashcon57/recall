# Release Checklist

Use this checklist before tagging or deploying a Recall release.

## Code quality

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] Review `git diff` for accidental secrets, local `wrangler.toml` values, or `.recall-api-key` content.
- [ ] Confirm migrations are numbered, documented, and covered by tests when applicable.

## Cloudflare deploy smoke

- [ ] Apply required D1 migrations to a staging or test instance.
- [ ] `npx wrangler deploy`
- [ ] `curl https://<worker>/health` returns `{ "status": "ok" }` or equivalent minimal health JSON.
- [ ] Authenticated MCP `tools/list` returns the expected tool set.
- [ ] JSON-RPC retrieval smoke: `retrieve_memory` returns valid JSON for an empty or seeded query.
- [ ] JSON-RPC storage smoke: `store_memory` can store a test memory with namespace/provenance fields.
- [ ] Delete the test memory with `delete_memory`.

## Tool surface

- [ ] Core tools: `store_memory`, `retrieve_memory`, `list_memories`, `get_related_memories`, `delete_memory`, `clear_memories`, `consolidate_memories`.
- [ ] Lifecycle/provenance tools from the current release are present and documented.
- [ ] Destructive `clear_memories` remains gated by `ALLOW_DESTRUCTIVE_TOOLS=true` and `confirm: true`.
- [ ] Lifecycle validation rejects invalid statuses, confidence, dates, or supersession cycles.
- [ ] Consolidation remains read-only and does not delete or mutate memories automatically.

## Updater checks

- [ ] `bash -n recall-update.sh`
- [ ] `./recall-update.sh --check` runs without destructive mutation.
- [ ] `./recall-update.sh --doctor` does not print secrets.
- [ ] `./recall-update.sh --install-cron weekly` prints a cron line but does not install without `--yes`.
- [ ] `docs/UPDATING.md` describes migration and rollback behavior for this release.

## Hermes integration checks

- [ ] `docs/HERMES_INTEGRATION.md` namespace guidance is still current.
- [ ] Wrapper-script MCP config examples do not include a real API key.
- [ ] Discord provenance guidance reflects current source fields.
- [ ] README links to updating, Hermes integration, and release checklist docs.

## Release notes

- [ ] `CHANGELOG.md` has a top entry with Added/Changed/Fixed/Security/Upgrade notes as appropriate.
- [ ] README tool count and examples match the actual MCP tool surface.
- [ ] Tag name follows semver (`vX.Y.Z`).
- [ ] GitHub release notes include exact upgrade steps and migration commands.
