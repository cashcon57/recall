# Recall

**A self-hosted MCP memory server with hybrid semantic + keyword search, running on Cloudflare Workers.**

Give Claude, Cursor, Windsurf, or any MCP-compatible client a persistent memory that survives across sessions, projects, and devices. No SaaS, no per-token fees, no data leaving your infrastructure. Your Cloudflare account, your data, your rules.

```
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

**Prerequisites:** a [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works) and Node.js 20+.

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
- **Rate limit** 60 req/min per first 8 chars of API key (in-memory, per-isolate)
- **Input validation** with strict length + character limits on every field
- **FTS5 injection safe** — special characters stripped before query
- **No session state** — each request is independent; no session hijack vector

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
```
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

For personal / small-team use, Recall runs **well within Cloudflare's free tier**:

| Resource       | Free tier / day                       |
|----------------|---------------------------------------|
| Workers        | 100,000 requests                      |
| D1             | 5M reads, 100K writes, 5GB storage    |
| Vectorize      | 30M queried vector dims, 5M stored    |
| Workers AI     | 10,000 neurons (~1000 embeddings)     |

For heavy use (thousands of memories, hundreds of queries/day), expect < $5/month. There is no hosted tier — you are the host.

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
