<!-- markdownlint-disable MD024 -- Keep a Changelog repeats Added/Changed/Fixed/Security headings per version, which is intentional. -->

# Changelog

All notable changes to Recall are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] — 2026-04-12

Three bug fixes discovered while running the v1.1.1 wizard end-to-end against a fresh project (the AgentBoard repo). All three would have hit real users; two were silently destructive.

### Fixed

- **`setup.sh` account log was misleading for users with multiple Cloudflare accounts.** The script used `wrangler whoami | grep -Eo '[a-f0-9]{32}' | head -1` to determine the target account, which always returned the first account in the whoami table regardless of which account wrangler would actually use for the deploy. Users with a personal + business account on the same token would see a log line saying "deploying to account A" while the deploy actually went to account B — or worse, the log would correctly say account A, then a re-run without `$CLOUDFLARE_ACCOUNT_ID` set would silently deploy to a different account. Fix: the script now reads `$CLOUDFLARE_ACCOUNT_ID` first (matching wrangler's own resolution order), falls back to parsing whoami for a single-account token, and **fails fast with explicit instructions** if the token has multiple accounts — refusing to guess which one the user wants. The error message prints the available accounts and tells the user to re-run with `CLOUDFLARE_ACCOUNT_ID=<id> ./setup.sh`.

- **Wizard would clobber existing `.env` files.** Phase 6 step 15 said "Create a local .env file" and a naive implementation would overwrite whatever was already there. Real projects almost always have an existing .env with framework config (VITE_API_PORT, EXPO_PUBLIC_*, NEXT_PUBLIC_*, database URLs, etc.). Any user running the wizard on an existing project would lose that content, and since .env is gitignored, there would be no git history to recover from. Fix: step 15 is now APPEND-ONLY with explicit rules — read the existing file first, check whether the Recall key is already set, stop and ask the user if the key is present with a different value, append cleanly with a comment header if missing, and never replace existing content. The step now explicitly explains WHY in the wizard instructions so future rewrites don't reintroduce the bug.

- **`wrangler deploy` emitted `workers_dev` and `preview_urls` warnings on every fresh deploy.** Cosmetic but noisy, and confusing for first-time users who would read the warnings and wonder if something was wrong. Fix: added both fields to `wrangler.toml.example` with explicit defaults (`workers_dev = true`, `preview_urls = false`) so new deploys are silent. The defaults match the intended behavior (deploy to the free workers.dev subdomain, skip preview URLs since Recall is meant to be bound to a stable URL).

### Notes on how these bugs were discovered

I ran the v1.1.1 wizard end-to-end against a real public repo (AgentBoard) to validate the install flow before releasing v1.1.1. Bug 1 almost caused me to deploy to the wrong Cloudflare account (the log said "Admin@switchrdating.com's Account" but the deploy actually went to the intended personal account — I had to check the Cloudflare dashboard to verify). Bug 2 did happen: I overwrote AgentBoard's existing `VITE_API_PORT=3000` .env file before catching it via the 19-byte size difference. Bug 3 was just warning spam in the setup.sh output.

The AgentBoard install is complete and working after the v1.1.2 fixes. The deployed worker `recall-agentboard` on the personal Cloudflare account responds correctly to `tools/list` with all 6 tools.

### Upgrading from v1.1.1

If your v1.1.1 install is working, you don't need to upgrade — v1.1.2 only changes `setup.sh` and the wizard prompt, not the deployed worker code. Your existing install is fine.

If you haven't run the install yet, use the v1.1.2 pinned URL in the install one-liner. All three fixes above will apply automatically.

If you have multiple Cloudflare accounts on your wrangler token and plan to run setup.sh: pass `CLOUDFLARE_ACCOUNT_ID=<account-id>` explicitly. The new setup.sh will fail fast and tell you to do this anyway if the token has more than one account.

## [1.1.1] — 2026-04-12

Bug fix for the #1 real-world install failure: "setup wizard ran successfully but `/mcp` doesn't show the memory server after restart." The root cause was that the wizard wrote `.mcp.json` but didn't update `~/.claude.json`'s per-project trust state, so the new Claude Code session saw the server as "not yet trusted" and silently disabled it.

### Fixed

- **New step 14b: pre-approve MCP servers in `~/.claude.json`.** The wizard now updates the user's Claude Code trust state (adding new server names to `projects.<path>.enabledMcpjsonServers` and removing them from `disabledMcpjsonServers`) BEFORE asking the user to restart. For scoping B/C/D/F this runs per project path; for option F it pre-approves both `recall-team` and `recall-personal`. Safety rules: only touches the enabled/disabled arrays under the specific project paths the wizard is wiring, never modifies any other field, uses proper JSON parse+modify+write (no regex or shell concatenation).
- **Phase 7a restart instructions rewritten** to be sequential and to spell out the shell-environment gotchas that caused confusion in early installs: do not open a new terminal tab, source `.env` in the exact shell you'll launch `claude` from, verify env vars are set before launching, quit with `/quit` not `Ctrl+C`.
- **Phase 7a step 17c: new diagnostic flow** for "memory server not visible in /mcp." Walks the user through the five actual failure causes in order: (1) trust state in `~/.claude.json` didn't stick, (2) env var not set in the launch shell, (3) `.mcp.json` missing, malformed, or in wrong directory, (4) missing `"type": "http"` field, (5) server actually down or URL wrong. Each cause has an explicit diagnostic command and fix path so the user doesn't have to guess.
- **Trust prompt handling in Phase 7a step 17d** now assumes pre-approval succeeded and the new session loads the server automatically. Fallback guidance for the rare case where a trust prompt still appears is still included.

### Notes on upgrading from 1.1.0

If you installed 1.1.0 successfully and the memory server is visible in `/mcp`, you don't need to do anything — 1.1.1 only changes the install wizard, not the deployed worker code. Your existing install is fine.

If you installed 1.1.0 and hit the "server invisible after restart" bug, the fastest fix is to re-run the install one-liner pinned to 1.1.1 (the wizard is idempotent and will pick up your existing deployment). Alternatively, manually edit `~/.claude.json` and add your server name(s) to `projects.<your-project-path>.enabledMcpjsonServers` and restart claude.

## [1.1.0] — 2026-04-12

Polish, hardening, and the features that make Recall genuinely recommendable to strangers. This is the first public-release version you should actually use — v1.0.0 was an internal milestone, v1.1.0 is what you get when you install today.

### Added

- **Scoping option F: team + per-user personal pools.** The setup wizard now offers six scoping options instead of five. Option F deploys one shared team instance plus one personal instance per teammate with a separate API key only they have. Claude queries both on retrieve, merges results, and personal preferences override team conventions for that user only. This is the only configuration where enforced cross-teammate privacy is possible, because each personal pool is a literally separate database with its own key.
- **Opt-in upstream update check (Phase 7bb).** A three-stage detect / contextualize / offer rulebook that installs into CLAUDE.md. Future Claude Code sessions ping the GitHub releases API every 2 days, and when a new version is detected they read the release notes, re-inspect the user's project, evaluate each change against the user's actual setup, and present a context-aware update offer — not a generic "new version available" prompt. Neutrally optional during setup; skipping is treated as an equally valid choice.
- **Resume prompt generation (Phase 6.5).** Before asking the user to restart their MCP client (which ends the current Claude Code session), the wizard now packages the full state — project context, author handle, scoping choice, deployed worker URLs, env var names, wiring decisions, remaining phases — into a copy-paste resume prompt. The user pastes it into the new Claude Code session as their first message and Phase 7a picks up exactly where it left off. The new session reads back a 3-line state summary so copy-paste truncation is caught immediately.
- **CI workflow** (`.github/workflows/ci.yml`) running `npx tsc --noEmit` on every push and pull request to `main`. Adds a green CI badge to the README.
- **Dependabot configuration** (`.github/dependabot.yml`) with weekly npm and GitHub Actions updates.
- **Ko-fi support link** in the README header (flat badge) and as the official Ko-fi button graphic near the bottom. Completely optional, zero pressure — framed as "if it saves you time and you feel like buying me a coffee" rather than a monetization pitch.
- **"Why Cloudflare?" FAQ entry** explaining the architectural tradeoff (D1 + Vectorize + Workers AI + Workers runtime = $0/month, sub-10ms cold start, one-command install) vs a Docker path (Postgres + pgvector + local embeddings + VPS).
- **Docker self-hosted path disclaimer** near the top of the README stating the Cloudflare-only posture is current but a Docker alternative is actively in the works for a later release.
- **Expanded Phase 4 Cloudflare MCP install** from 2 servers (bindings, docs) to 4 (bindings, docs, builds, observability). `observability` is the most useful long-term because it gives Claude direct access to worker log streams without opening a terminal.
- **"Not affiliated with Microsoft Windows Recall"** disambiguator below the README tagline, pre-empting the #1 confused first-comment every time "recall" is mentioned anywhere public.

### Security (post-v1.0.0 hardening from the pre-release code review)

- **Sequenced dual-store writes in `store_memory`**. Previously D1, FTS5, and Vectorize writes ran in parallel via `Promise.all`. If Vectorize failed after D1 committed, the tool rejected but the D1 row existed, producing silent inconsistent state. Now writes are sequenced: D1 is the source of truth, FTS5 is synced second, Vectorize is upserted last. Per-step failures are logged loudly and the tool return value honestly reports partial-success states ("saved but keyword search sync failed, retry to fix") instead of throwing.
- **Embedding length validation** in `generateEmbedding`. Workers AI returning a malformed embedding now throws a descriptive error referencing the expected 1024 dimensions, instead of passing an empty array through to Vectorize where it would produce a cryptic dimension-mismatch failure.
- **`delete_memory` Vectorize error handling**. The Vectorize delete call is now wrapped in try/catch. If Vectorize fails after D1 + FTS5 have succeeded, the tool reports partial success ("memory removed from canonical store but an orphan vector remains, cleanable via reindex") instead of throwing.
- **`clear_memories` per-batch error handling**. Previously a single failed Vectorize batch aborted the entire clear loop, leaving the Vectorize index partially wiped. Now each batch is wrapped individually, failed batches are tracked, and the return value reports exactly how many orphan vectors remain and in which batches.
- **FTS5 query failures are now logged** with the query text for debuggability. Previously all FTS5 errors were silently swallowed.
- **`consolidate_memories` hard cap lowered from 500 to 300**. Pairwise cosine is O(n²) and the 500-memory worst case risks hitting Cloudflare Workers CPU time limits on cold starts. 300 still handles real usage comfortably.
- **Per-isolate rate limiter documented as a soft control** in SECURITY.md, with a recommendation to use Cloudflare WAF rate-limiting rules for hard cost caps. Closes the HN comment pattern that would otherwise pick this up.
- **`delete_memory` documented as not gated** behind `ALLOW_DESTRUCTIVE_TOOLS` (only `clear_memories` is). SECURITY.md explains the tradeoff honestly and names key rotation + backups as the correct mitigation for leaked-key scenarios.
- **Dual-write consistency** added to the "what Recall does NOT protect against" list in SECURITY.md, referencing the sequenced-write pattern and the planned reconciliation pass in the consolidation cron.

### Fixed

- **Install one-liner uses Bash + curl** instead of WebFetch. WebFetch auto-summarizes content and there's no prompt-level override, so users running the one-liner would see Claude self-correct mid-install ("let me fetch the raw file directly") which was janky. Now the one-liner explicitly names `Bash (curl -fsSL)` with a brief "so you get the raw markdown, not a summary" justification.
- **Phase 0 heading renamed** from `### Prompt 0 — First-time setup (the full wizard)` to `### Prompt 0 — First-time setup` so the strict integrity check in the one-liner succeeds. Previously the cosmetic `(the full wizard)` suffix caused Claude to fail the exact-title-match check and bail out of the install.
- **`package.json` now has a real author field** (`Cash Conway`) and `engines: { node: ">=20" }` matching what the setup script requires.
- **Deleted stragglers** — `PORT_FIXES_PROMPT.md` (a historical artifact from a private security-port task) and `examples/mcp-client-config.json` (duplicated content already inline in the README, referenced from nowhere).

### Changed

- **Update check cadence from 14 days to 2 days.** Early-release iteration means users should hear about new versions faster than a fortnight.

## [1.0.0] — 2026-04-11

First public release. Foundational architecture and a usable end-to-end setup wizard.

### Added

- **Hybrid search retrieval pipeline**: `@cf/baai/bge-m3` vector embeddings (1024D) + D1 FTS5 BM25 keyword search, run in parallel and fused with Reciprocal Rank Fusion (k=60).
- **Cross-encoder reranking** via `@cf/baai/bge-reranker-base`, with content truncated to 512 characters pre-rerank (10–50x AI token savings vs full content at negligible accuracy loss).
- **Recency and importance scoring**: final combined score is `0.5 × reranker + 0.3 × exp(-0.001 × hours_since_access) + 0.2 × importance`.
- **Graceful reranker fallback**: when Workers AI reranker fails, the pipeline degrades to normalized RRF fusion scores rather than uniform 0.5, preventing silent precision collapse.
- **Six MCP tools**: `store_memory`, `retrieve_memory`, `list_memories`, `delete_memory`, `clear_memories`, `consolidate_memories`.
- **Weekly "dreaming" consolidation cron** (Sunday 03:00 UTC): analyzes the store for near-duplicates and stale memories, writes a searchable markdown report back as `_system.consolidation-report`. Read-only — never modifies memories automatically.
- **One-command setup script** (`./setup.sh`): provisions D1 database, applies schema, creates Vectorize index with metadata filters, generates a 32-byte random API key, uploads it as a worker secret, and deploys the worker. Writes the API key to a `chmod 600` local file rather than stdout.
- **Claude-Code-guided setup wizard** (Prompt 0 in `SETUP_PROMPTS.md`): an end-to-end install flow with project-aware adaptation, functional smoke test phase, context file cleanup pass, and a final "how this was adapted to your setup" report.
- **Deterministic one-line install**: pinned to a release tag with explicit `WebFetch` tool, section-title integrity check, and verbatim-execution language.
- **Functional smoke test phase** in the wizard: verifies BM25 keyword path, vector semantic paraphrase path, rerank score variance, metadata filter, delete roundtrip, destructive-tool gate rejection, and HTTP 401 on bad auth.
- **Context file cleanup pass** (Phase 7d): opt-in destructive cleanup of existing CLAUDE.md, memory.md, gotchas.md, and other context files, with explicit row-by-row approval gates and secrets detection.

### Security

- **Constant-time HMAC-SHA256** bearer token authentication, no timing side channels.
- **Destructive tools default-disabled**: `clear_memories` requires an explicit `ALLOW_DESTRUCTIVE_TOOLS=true` secret to be enabled. A leaked API key alone cannot wipe the store.
- **Streaming body size cap** at 1 MB, enforced via a byte-counting reader (not Content-Length alone) so malformed or lying clients still hit the hard limit.
- **Hashed rate-limit buckets**: the in-memory sliding window uses a SHA-256 hash of the full API key (not a prefix) to prevent collisions between similar keys.
- **Weak-key warning**: the worker logs a warning at request time if `MEMORY_API_KEY` is shorter than 32 characters, and returns HTTP 503 if the secret is missing entirely.
- **Minimal health check**: `/health` returns only `{ status: "ok" }` — no version or service-name leak.
- **FTS5 injection-safe**: special characters are stripped from queries before reaching SQLite.
- **No session state, no CORS surface**: every request is independently authenticated.

### Infrastructure

- Cloudflare Workers runtime, zero runtime dependencies beyond CF bindings (D1, Vectorize, Workers AI).
- TypeScript strict mode throughout.
- MIT license.
- Runs entirely on Cloudflare's free tier for solo and small-team use.

---

**Note on v1.0.0 tagging history:** Between the initial v1.0.0 tag and the release of v1.1.0, the v1.0.0 tag was force-pushed several times during iterative hardening. This was a mistake — tags should be immutable. With v1.1.0, the tag discipline resets: v1.0.0 is now permanently pinned to its original commit, v1.1.0 is the new pinned default, and future versions will ship as new tags (no force-pushes). See the repository's release notes on GitHub for the canonical per-version state.

[1.1.2]: https://github.com/cashcon57/recall/releases/tag/v1.1.2
[1.1.1]: https://github.com/cashcon57/recall/releases/tag/v1.1.1
[1.1.0]: https://github.com/cashcon57/recall/releases/tag/v1.1.0
[1.0.0]: https://github.com/cashcon57/recall/releases/tag/v1.0.0
