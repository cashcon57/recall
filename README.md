# Recall

**A self-hosted MCP memory server with hybrid semantic + keyword search, running on Cloudflare Workers.**

Give Claude, Cursor, Windsurf, or any MCP-compatible client a persistent memory that survives across sessions, projects, and devices. No SaaS, no per-token fees, no data leaving your infrastructure. Your Cloudflare account, your data, your rules.

```text
┌─────────────┐      ┌─────────────────────┐      ┌──────────────┐
│ MCP Client  │─────▶│  Cloudflare Worker  │─────▶│  D1 + FTS5   │
│ (Claude/    │ HTTP │   ┌─ Vector search  │      │  Vectorize   │
│  Cursor)    │◀─────│   ├─ Keyword (BM25) │      │  Workers AI  │
└─────────────┘      │   ├─ RRF fusion     │      │  (bge-m3)    │
                     │   ├─ Reranker       │      └──────────────┘
                     │   └─ Recency decay  │
                     └─────────────────────┘
```

## Why Recall?

Most MCP memory servers do one of two things: dump text into SQLite with cosine similarity, or call a hosted vector DB. Recall does both, at the same time, and reranks the combined results.

- **Hybrid search** — Vector similarity (bge-m3, 1024D) + BM25 full-text search, fused via Reciprocal Rank Fusion. Catches both semantic paraphrases and exact keyword matches.
- **Reranked for precision** — Final candidates run through bge-reranker-base for cross-encoder precision.
- **Recency-weighted** — Fresh memories outrank stale ones via exponential decay, so your memory doesn't become a graveyard.
- **Deduplication guard** — Refuses to store memories with > 0.92 cosine similarity to existing entries under different keys.
- **Weekly consolidation** — A scheduled cron analyzes the store for near-duplicates and stale entries, writing a searchable report back into memory.
- **Stateless auth** — HMAC-SHA256 constant-time API key verification. No sessions, no cookies, no database lookups on the hot path.
- **Per-isolate rate limiting** — 60 req/min per key prefix, built-in, no external dependency.
- **Serverless + cheap** — Runs on Cloudflare's free tier for most personal/small-team use. Cold start is sub-10ms.

## How it compares

|                          | mem0   | letta  | zep    | Recall |
|--------------------------|:------:|:------:|:------:|:------:|
| MCP native               |   ✓    |   ✓    |   ✓    |   ✓    |
| Self-hostable            |   ✓    |   ✓    |   ✓    |   ✓    |
| Hybrid (vector + BM25)   |   ✗    |   ✗    |   ✓    |   ✓    |
| Cross-encoder reranking  |   ✗    |   ✗    |   ✗    |   ✓    |
| Recency decay            | partial| partial|   ✓    |   ✓    |
| Scheduled consolidation  |   ✗    |   ✗    |   ✗    |   ✓    |
| Deploy complexity        | docker | docker | docker | 1 command |
| Monthly cost (personal)  |  $0–$  |  $0–$  |  $0–$  |   $0   |

## Quickstart (5 minutes)

### Prerequisites

1. **A Cloudflare account** — free. [Sign up here](https://dash.cloudflare.com/sign-up). You do **not** need a custom domain. Cloudflare gives every worker a free `*.workers.dev` subdomain on signup, and Recall deploys to that by default. If you already have a domain on Cloudflare, you can route Recall through it later — see [Custom domain (optional)](#custom-domain-optional) below.
2. **Workers AI access** — still free, but you must accept the terms once at [dash.cloudflare.com → AI → Workers AI](https://dash.cloudflare.com/?to=/:account/ai/workers-ai). First-time visit prompts you to agree. Without this, embeddings will fail.
3. **Node.js 20+** — [download here](https://nodejs.org) if you don't have it.

> **Total cost for personal use: $0.** Recall runs entirely within Cloudflare's free tier for all the services it needs (Workers, D1, Vectorize, Workers AI). See the [Costs](#costs) section for limits.

### Deploy

```bash
git clone https://github.com/cashcon57/recall.git
cd recall
./setup.sh
```

The setup script will:

1. Log you in to Cloudflare if needed
2. Create a D1 database, apply the schema, and patch `wrangler.toml` with the generated ID
3. Create a Vectorize index (`1024D`, cosine) with metadata indexes on `importance` and `author`
4. Generate a cryptographically random `MEMORY_API_KEY` and upload it as a secret
5. Deploy the worker
6. Print the endpoint URL and API key

**Save the API key.** It is not stored locally and will not be shown again.

## Add to your MCP client

### Claude Code (`.mcp.json`)

```json
{
  "mcpServers": {
    "recall": {
      "type": "http",
      "url": "https://your-worker.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer ${RECALL_API_KEY}"
      }
    }
  }
}
```

Then export the key before launching Claude Code:

```bash
export RECALL_API_KEY=your-api-key-here
claude
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "recall": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-worker.workers.dev/mcp",
        "--header",
        "Authorization: Bearer your-api-key-here"
      ]
    }
  }
}
```

Claude Desktop doesn't currently support direct HTTP transports — `mcp-remote` bridges it to stdio.

### Cursor / Windsurf

Add the same block as Claude Code to your client's MCP config file (see your editor's docs for the path).

### Custom domain (optional)

The default `https://recall.<your-subdomain>.workers.dev/mcp` URL works perfectly and requires no domain. If you want a nicer URL like `https://memory.yourdomain.com/mcp`:

**Step 1 — Add your domain to Cloudflare** (if it's not already). Follow their [add-a-site flow](https://dash.cloudflare.com/?to=/:account/add-site). You'll update your registrar's nameservers to Cloudflare's — this is a one-time DNS move.

**Step 2 — Add a route in `wrangler.toml`:**

```toml
[[routes]]
pattern = "memory.yourdomain.com/*"
zone_name = "yourdomain.com"
custom_domain = true
```

**Step 3 — Redeploy:** `npx wrangler deploy`. Cloudflare issues the TLS cert automatically.

You do not need a custom domain to use Recall. It's purely cosmetic.

## Team usage

Recall works as a shared team memory with zero code changes. Everyone points at the same worker, passes the same API key, and distinguishes their contributions via the `author` field on each memory. Team retrieves default to the pooled store; personal focus comes from filtering by author.

**Important:** there is one API key. Teammates can read, overwrite, and delete each other's memories — author is a convention, not access control. Don't store secrets.

See [`TEAM_USAGE.md`](./TEAM_USAGE.md) for full team setup, conventions, privacy tradeoffs, and per-project `CLAUDE.md` templates.

## Tool reference

All tools are callable via the standard MCP `tools/call` method.

| Tool                  | Purpose |
|-----------------------|---------|
| `store_memory`        | Save a memory under a unique key with tags, importance (0–1), and author. Auto-generates embedding. Refuses if a near-duplicate exists under a different key. |
| `retrieve_memory`     | Hybrid search (vector + BM25 → RRF → rerank → recency decay → importance). Returns top-N with combined scores. |
| `list_memories`       | Browse with pagination + filters (tag, author, limit, offset). Returns metadata only. |
| `delete_memory`       | Remove a memory by key from D1, FTS5, and Vectorize. |
| `clear_memories`      | Wipe everything. Requires explicit `confirm: true`. |
| `consolidate_memories`| Read-only analysis: flags similar memory pairs and stale entries. Returns a markdown report. |

### `store_memory` example

```json
{
  "name": "store_memory",
  "arguments": {
    "key": "postgres-migration-gotcha",
    "content": "The `citext` extension must be installed BEFORE creating columns of type citext, otherwise the migration silently fails on some pooled Neon connections.",
    "tags": ["database", "neon", "gotcha"],
    "importance": 0.8,
    "author": "cash"
  }
}
```

### `retrieve_memory` example

```json
{
  "name": "retrieve_memory",
  "arguments": {
    "query": "neon case insensitive text columns",
    "limit": 5,
    "min_importance": 0.5
  }
}
```

Returns memories ranked by:

- `0.5 × reranker_score` (bge-reranker-base, sigmoid-normalized)
- `0.3 × recency_decay` (exp(-0.001 × hours_since_last_access))
- `0.2 × importance` (author-assigned 0–1)

## Managing secrets with Wrangler

Recall uses a single secret — `MEMORY_API_KEY` — to authenticate MCP clients. The setup script handles this automatically on first deploy, but you'll want to know how to manage it yourself for rotation, multi-environment setups, and local dev.

### Core commands

**Set or update a secret:**

```bash
# Interactive — prompts you to paste the value (does not appear in shell history)
npx wrangler secret put MEMORY_API_KEY

# Non-interactive — pipe the value in (careful: it may land in shell history)
echo "your-key-here" | npx wrangler secret put MEMORY_API_KEY
```

**List secrets** (names only — values are never retrievable after set):

```bash
npx wrangler secret list
```

**Delete a secret:**

```bash
npx wrangler secret delete MEMORY_API_KEY
```

**Rotate the key** (zero-downtime is not possible with a single key — coordinate with clients):

```bash
# 1. Generate a new key
NEW_KEY=$(openssl rand -hex 32)

# 2. Tell teammates / update your own MCP clients to use the new key
# 3. Set the new secret (this takes effect on the next request)
echo "$NEW_KEY" | npx wrangler secret put MEMORY_API_KEY

# 4. The old key stops working immediately — any in-flight requests will fail
```

### Local development secrets

For `wrangler dev`, secrets come from `.dev.vars` (not `.env`). This file is git-ignored by default.

```bash
# .dev.vars
MEMORY_API_KEY=local-dev-key-doesnt-need-to-be-secure
```

`wrangler dev` will load these automatically when running locally. They are completely separate from the deployed worker's secrets — setting one does not affect the other.

### Multiple environments (dev, staging, prod)

If you deploy Recall to multiple environments, each environment has its own secret store:

```bash
# Deploy to a named environment defined in wrangler.toml
npx wrangler deploy --env staging

# Set a secret for just that environment
npx wrangler secret put MEMORY_API_KEY --env staging

# List secrets for a specific environment
npx wrangler secret list --env staging
```

Add an environment block to `wrangler.toml`:

```toml
[env.staging]
name = "recall-staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "recall-staging"
database_id = "your-staging-d1-id"

[[env.staging.vectorize]]
binding = "VECTORS"
index_name = "recall-staging-vectors"
```

### Bulk secrets (if you extend Recall)

If you add more secrets (e.g., OAuth keys, webhook signing tokens):

```bash
# From a JSON file — { "KEY1": "value1", "KEY2": "value2" }
npx wrangler secret bulk secrets.json

# Delete the file immediately after
rm secrets.json
```

### Where secrets actually live

- **Deployed**: Cloudflare encrypts them and injects as env vars into your worker at runtime. They're not visible in the dashboard, API, or `wrangler tail` output.
- **Not deployed**: `.dev.vars` only, plaintext on your disk, never uploaded.
- **Never in**: `wrangler.toml`, git, build artifacts, or `console.log` output.

If you accidentally commit a secret, rotate it immediately with `secret put` and treat the old value as compromised. Cloudflare does not roll back secrets from git history for you.

### Secret troubleshooting

**`Error: MEMORY_API_KEY is undefined` after deploy**
Check `npx wrangler secret list` — if the key isn't there, the `secret put` step failed. Run it again.

**Changes to `.dev.vars` not taking effect**
Restart `wrangler dev` — secrets are loaded at startup, not on file watch.

**Different behavior between local and prod**
Your `.dev.vars` value and your deployed secret are independent. This is usually what you want (different keys per environment), but can be confusing.

## Architecture

### Storage layers

- **D1 (SQLite)** — canonical memory rows (id, key, content, tags, importance, author, timestamps, access count)
- **D1 FTS5** — virtual table with `porter unicode61` tokenizer for BM25 keyword search
- **Vectorize** — 1024D cosine index keyed by memory `key`, with metadata for `importance`, `author`, `tags`

### Search pipeline

1. Generate query embedding via Workers AI `@cf/baai/bge-m3`
2. In parallel: Vectorize top-40 + FTS5 top-40
3. **Reciprocal Rank Fusion** merges both lists with `K = 60`
4. Fetch top-20 full rows from D1
5. Apply post-query tag filter (D1 lacks JSON array ops)
6. **Rerank** with `@cf/baai/bge-reranker-base`
7. Combine reranker + recency decay + importance into final score
8. Update `accessed_at` and `access_count` for returned results

### Security

- **Bearer auth** on `/mcp`, HMAC-SHA256 constant-time compare (no timing side channels)
- **Rate limit** 60 req/min, keyed off a SHA-256 hash of the full API key (not a prefix)
- **Payload size cap** 1 MB enforced via streaming reader (not Content-Length alone)
- **Destructive tools default-disabled** — `clear_memories` requires explicit `ALLOW_DESTRUCTIVE_TOOLS=true` secret
- **Weak key warning** — logs a warning if `MEMORY_API_KEY` is under 32 chars; fails closed if missing
- **Input validation** with strict length + character limits on every field
- **FTS5 injection safe** — special characters stripped before query
- **No session state** — each request is independent; no session hijack vector
- **No CORS** — MCP clients are not browsers; don't add CORS unless you're building a web UI

For the full threat model, hardening checklist, and vulnerability disclosure process, see [`SECURITY.md`](./SECURITY.md).

### Cron consolidation

Runs every Sunday at 03:00 UTC by default (`0 3 * * SUN`). Scans up to 200 memories, finds pairs above `similarity_threshold` (default 0.82) and entries with zero accesses older than `stale_days` (default 60). Stores a markdown report as a searchable memory under the key `_system.consolidation-report`. Never modifies or deletes memories automatically — the report is a recommendation for humans or agents to act on.

Tune the schedule in [`wrangler.toml.example`](./wrangler.toml.example) `[triggers]` section.

## Development

```bash
npm install
npm run dev        # Local dev with wrangler (remote bindings)
npm run typecheck  # TypeScript strict mode
npm run tail       # Stream production logs
```

### Repository layout

```text
recall/
├── src/
│   ├── index.ts      # Worker fetch + scheduled handler, rate limit, auth
│   ├── mcp.ts        # JSON-RPC 2.0 / MCP protocol dispatcher
│   ├── tools.ts      # 6 tool implementations + search pipeline + consolidation
│   ├── auth.ts       # Constant-time HMAC-SHA256 API key verify
│   └── types.ts      # Env bindings + domain + JSON-RPC types
├── schema.sql        # D1 table + indexes + FTS5 virtual table
├── wrangler.toml.example
├── setup.sh          # One-command Cloudflare deploy
└── examples/         # Sample MCP client configs
```

### Customization ideas

- **Change scoring weights** — edit `combinedScore` in `src/tools.ts:retrieveMemory`
- **Swap embedding model** — replace `@cf/baai/bge-m3` with any Workers AI embedding model, update dimensions in `wrangler.toml` + Vectorize index
- **Adjust rate limit** — `checkRateLimit` call in `src/index.ts`
- **Add tool** — append to `TOOL_DEFINITIONS` and `executeTool` dispatch in `src/tools.ts`

## Costs

**TL;DR: $0/month for 95% of users.** Recall is designed to fit inside Cloudflare's free tier for personal and small-team use.

### Cloudflare free-tier limits (the resources Recall touches)

| Resource       | Free tier / day                        | What Recall uses per call                      |
|----------------|----------------------------------------|-------------------------------------------------|
| Workers        | 100,000 requests                       | 1 request per tool call                         |
| D1             | 5M reads, 100K writes, 5GB storage     | ~1–3 reads, 1–3 writes per store, ~2 reads per retrieve |
| Vectorize      | 30M queried dims/day, 5M stored vectors| 1024 dims per query, 1024 dims per stored memory |
| Workers AI     | 10,000 neurons/day                     | ~2–6 neurons per embedding, ~4 per rerank       |

Neurons are Cloudflare's AI billing unit. Roughly: one embedding via `bge-m3` ≈ 2–6 neurons, one rerank pass ≈ 4 neurons for small batches.

### Real-world usage profiles

These are honest estimates — not marketing math. All assume the free tier and no custom domain.

#### Profile 1 — Solo dev, casual use

- **Usage**: ~20 `store_memory` + 50 `retrieve_memory` calls per day
- **D1 writes**: ~120/day (well below 100K)
- **D1 reads**: ~150/day (well below 5M)
- **Vectorize**: ~70 × 1024 = 72K queried dims/day (well below 30M)
- **AI**: ~70 embeddings + 50 reranks ≈ 340 neurons/day (well below 10K)
- **Storage**: < 5 MB D1, < 1 MB Vectorize
- **Cost: $0/month** ✓

#### Profile 2 — Active solo dev + Claude Code all day

- **Usage**: ~50 `store_memory` + 300 `retrieve_memory` calls per day
- **D1 writes**: ~300/day (+ 300 debounced access updates = ~60/day after debounce)
- **D1 reads**: ~900/day
- **Vectorize**: ~350 × 1024 = 360K queried dims/day
- **AI**: ~350 embeddings + 300 reranks ≈ 2,300 neurons/day
- **Storage**: ~20 MB D1, ~3 MB Vectorize
- **Cost: $0/month** ✓

#### Profile 3 — 5-person team sharing one instance

- **Usage**: ~100 stores + 1,000 retrieves per day across the team
- **D1 writes**: ~500/day (after access debouncing)
- **D1 reads**: ~3,000/day
- **Vectorize**: ~1,100 × 1024 = 1.1M queried dims/day
- **AI**: ~1,100 embeddings + 1,000 reranks ≈ 7,500 neurons/day
- **Storage**: ~100 MB D1, ~15 MB Vectorize
- **Cost: $0/month** ✓ (comfortably within free tier)

#### Profile 4 — Heavy team or automated agent fleet

- **Usage**: ~500 stores + 5,000 retrieves per day
- **D1 writes**: ~2,500/day
- **D1 reads**: ~15,000/day
- **Vectorize**: 5.5M queried dims/day
- **AI**: ~5,500 embeddings + 5,000 reranks ≈ 40,000 neurons/day
- **Storage**: ~500 MB D1, ~50 MB Vectorize
- **Cost: ~$3–5/month** — you've blown through the daily neurons free tier. Everything else is still free. Workers AI overage is $0.011 per 1,000 neurons, so 30K/day overage × 30 days = ~$10 worst case.

#### Profile 5 — Ludicrous (10K+ retrieves/day)

At this scale you're likely running 50+ agents or building a product on top. Workers AI becomes the dominant cost. Expect ~$20–50/month. At that point, consider:

- Lowering `candidateCount` from 20 to 10 in `retrieveMemory` to halve the rerank cost
- Caching query embeddings on the client side for repeated identical queries
- Swapping to a smaller embedding model (`@cf/baai/bge-small-en-v1.5`, 384D) if you don't need multilingual or long-context support

### The cost nobody mentions

Cloudflare's free tier is per-account, not per-worker. If you already use D1, Vectorize, or Workers AI for other projects, Recall's usage adds to the same daily counters. Usually not a problem, but worth knowing.

**No hosted tier, no subscription.** You are the host. All infrastructure runs on your Cloudflare account under your control.

## Troubleshooting

**`wrangler: command not found`**
The setup script uses `npx wrangler`, so you shouldn't need a global install. If you hit this, run `npm install` first.

**Schema apply hangs**
D1 `--remote` applies can take a few seconds. If it hangs >30s, cancel and retry — Cloudflare API occasionally throttles new accounts.

**`Embedding generation returned no data`**
Workers AI throws this when the account isn't subscribed to the AI product. Visit `dash.cloudflare.com → AI → Workers AI` and accept the terms once.

**Vectorize dimension mismatch**
If you change embedding models, you must delete and recreate the Vectorize index with the new dimension count. Existing vectors won't survive.

**MCP client says `connection failed`**
Check: (1) the URL ends in `/mcp`, (2) the Authorization header is present, (3) your API key matches what `wrangler secret list` shows.

## Contributing

PRs welcome. Keep scope tight: this is infrastructure, not a framework. Changes should preserve:

- Zero external runtime dependencies beyond Cloudflare bindings
- Stateless request handling
- Constant-time auth
- Single-file-per-concern layout

File issues for bugs, feature discussions, or architectural questions.

## License

MIT. See [LICENSE](./LICENSE).

## Credits

Recall was extracted from a private memory server I built for my own projects. The hybrid search + reranker + recency decay pipeline turned out to generalize well, so here it is. Cloudflare's bge-m3 and bge-reranker-base models do most of the heavy lifting.
