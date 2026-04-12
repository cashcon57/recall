# Changelog

All notable changes to Recall are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-04-11

First public release.

### Added

- **Hybrid search retrieval pipeline**: `@cf/baai/bge-m3` vector embeddings (1024D) + D1 FTS5 BM25 keyword search, run in parallel and fused with Reciprocal Rank Fusion (k=60).
- **Cross-encoder reranking** via `@cf/baai/bge-reranker-base`, with content truncated to 512 characters pre-rerank (10–50x AI token savings vs full content at negligible accuracy loss).
- **Recency and importance scoring**: final combined score is `0.5 × reranker + 0.3 × exp(-0.001 × hours_since_access) + 0.2 × importance`.
- **Graceful reranker fallback**: when Workers AI reranker fails, the pipeline degrades to normalized RRF fusion scores rather than uniform 0.5, preventing silent precision collapse.
- **Six MCP tools**: `store_memory`, `retrieve_memory`, `list_memories`, `delete_memory`, `clear_memories`, `consolidate_memories`.
- **Weekly "dreaming" consolidation cron** (Sunday 03:00 UTC): analyzes the store for near-duplicates and stale memories, writes a searchable markdown report back as `_system.consolidation-report`. Read-only — never modifies memories automatically.
- **One-command setup script** (`./setup.sh`): provisions D1 database, applies schema, creates Vectorize index with metadata filters, generates a 32-byte random API key, uploads it as a worker secret, and deploys the worker. Writes the API key to a `chmod 600` local file rather than stdout.
- **Claude-Code-guided setup wizard** (Prompt 0 in `SETUP_PROMPTS.md`): an 8-phase end-to-end install flow with project-aware adaptation, functional smoke test, context file cleanup, optional upstream update check, and a final "how this was adapted to your setup" report.
- **Six scoping options** for how to organize memory across projects: single repo, shared pool across multiple repos, grouped by project type, per-repo isolated, user-global, and **team + per-user personal pools** (the only configuration with enforced cross-teammate privacy via separate API keys).
- **Optional opt-in update check**: a 2-day client-side mechanism that checks the Recall repo for new release tags and offers a context-aware guided update (compare release notes against the user's project, only apply changes that are relevant, preserve local customizations).
- **Functional smoke test phase** in the wizard: verifies BM25 keyword path, vector semantic paraphrase path, rerank score variance, metadata filter, delete roundtrip, destructive-tool gate rejection, and HTTP 401 on bad auth.
- **Deterministic one-line install**: pinned to `v1.0.0` with explicit `WebFetch` tool, section-title integrity check, and verbatim-execution language. Users paste one sentence into Claude Code and the wizard runs.

### Security

- **Constant-time HMAC-SHA256** bearer token authentication, no timing side channels.
- **Destructive tools default-disabled**: `clear_memories` requires an explicit `ALLOW_DESTRUCTIVE_TOOLS=true` secret to be enabled. A leaked API key alone cannot wipe the store.
- **Streaming body size cap** at 1 MB, enforced via a byte-counting reader (not Content-Length alone) so malformed or lying clients still hit the hard limit.
- **Hashed rate-limit buckets**: the in-memory sliding window uses a SHA-256 hash of the full API key (not a prefix) to prevent collisions between similar keys.
- **Weak-key warning**: the worker logs a warning at request time if `MEMORY_API_KEY` is shorter than 32 characters, and returns HTTP 503 if the secret is missing entirely.
- **Minimal health check**: `/health` returns only `{ status: "ok" }` — no version or service-name leak.
- **FTS5 injection-safe**: special characters are stripped from queries before reaching SQLite. Failures are logged and degrade gracefully to vector-only search.
- **No session state, no CORS surface**: every request is independently authenticated; there are no cookies, no session hijack vector, and no browser attack surface.
- **Sequenced dual-store writes** in `store_memory`: D1 → FTS5 → Vectorize, with explicit per-step error handling. If Vectorize fails after D1 succeeds, the tool reports partial success honestly rather than silently failing or corrupting state.

### Hardening documentation

- **SECURITY.md** with a full threat model, hardening checklist, vulnerability disclosure process, and honest documentation of known limitations (per-isolate rate limiter as soft control, `delete_memory` not gated, dual-write consistency under partial failure, multi-tenant limitations).
- **TEAM_USAGE.md** covering both team modes (shared pool and team + per-user personal pools) with privacy tradeoffs.

### Known limitations

- **Per-isolate rate limiter is a soft control**, not a hard cost guardrail. Use Cloudflare WAF rate-limiting rules for hard caps. See SECURITY.md.
- **`delete_memory` is not gated** behind `ALLOW_DESTRUCTIVE_TOOLS`. Only `clear_memories` is. A leaked key can iteratively delete memories; the right mitigation is key rotation + backups. See SECURITY.md.
- **Dual-write consistency** is best-effort. If Vectorize fails after D1 has committed, the memory is saved but not semantically searchable until the next upsert of that key. A reconciliation pass in the consolidation cron is planned for a future release.
- **Single-tenant by design**: each Recall instance has one API key and no per-user access control. Team + per-user personal pools (scoping option F) is the workaround for enforced privacy between teammates.

### Infrastructure

- Cloudflare Workers runtime, zero runtime dependencies beyond CF bindings (D1, Vectorize, Workers AI).
- TypeScript strict mode throughout.
- MIT license.
- Runs entirely on Cloudflare's free tier for solo and small-team use. Heavy agent fleets may incur ~$3–5/month in Workers AI neuron overage. Full cost breakdown in `README.md`.

[1.0.0]: https://github.com/cashcon57/recall/releases/tag/v1.0.0
