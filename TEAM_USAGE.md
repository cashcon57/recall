# Team Usage

How to run Recall as a shared memory layer for a small team of humans and agents — so that collective knowledge is pooled without stepping on individual notes.

## The model

Recall already has everything you need for team use, built around the `author` field on every memory:

- **One shared Recall instance** (one Cloudflare deployment, one D1 database, one Vectorize index).
- **One shared `MEMORY_API_KEY`** that every team member loads into their MCP client.
- **Each teammate uses a consistent `author` handle** (e.g. `cash`, `andrew`, `claude-cash`, `claude-andrew`).
- **Team knowledge = unfiltered retrieval.** When any member (or their agent) runs `retrieve_memory` without an `author` filter, they see the pooled store.
- **Personal scoping = author filter.** Filter `list_memories` or post-filter `retrieve_memory` results by your own handle to focus on what *you* wrote.

This gives you the 90% use case without any code changes. Everyone contributes to a shared knowledge pool. Everyone can see everything. Everyone keeps their own corner via the author field.

## Privacy: read this before you use it for secrets

**Recall is not multi-tenant.** There is a single API key. Every team member who has it can:

- Read every memory, regardless of author
- Overwrite any memory by reusing its key
- Delete any memory
- Clear the entire store

The `author` field is a **convention**, not an access control. Think of it like git commit authorship: it tells you who did something, but it doesn't stop anyone else from editing the file.

**Do not store anything that should be hidden from teammates.** If you need real isolation — secrets, private notes, HR stuff — deploy a second Recall instance just for yourself, or keep those notes somewhere else entirely.

## Setup for a team

### One-time, by whoever deploys it

1. **Deploy Recall once** to the account that will host it. A team lead's personal Cloudflare account works. Follow the [quickstart](./README.md#quickstart-5-minutes).
2. **Save the endpoint URL and API key.** You'll share both with the team.
3. **Pick a handle convention** and commit to it. Suggested:
   - Humans: `firstname` (`cash`, `andrew`)
   - Their agents: `claude-firstname` or just `claude` if you don't care to distinguish
   - System cron: `system-cron` (already reserved)
4. **Share the endpoint + API key via your secure channel** — 1Password, Vaultwarden, Bitwarden, signal, whatever. Do not put it in Slack or a git repo.

### Per teammate

Each person adds the server to their MCP client:

```json
{
  "mcpServers": {
    "recall": {
      "type": "http",
      "url": "https://your-team-recall.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer ${RECALL_API_KEY}"
      }
    }
  }
}
```

And exports the key in their shell:

```bash
export RECALL_API_KEY=the-shared-team-key
```

Then each person (or their project's `CLAUDE.md`) sets their author handle — see the next section.

## Agent-side conventions

Drop this into each project's `CLAUDE.md`. Replace `YOUR_HANDLE` with the human handle for that developer's machine (Claude will inherit it from the local file).

```markdown
## Memory Usage (recall MCP server, team mode)

This project uses a shared team memory via the `recall` MCP server. Rules:

### Author handle
- My handle for this workstation is: **YOUR_HANDLE**
- Always pass `author: "YOUR_HANDLE"` when calling `store_memory`.
- Never use a different handle. The server doesn't enforce this — consistency is how we tell memories apart.

### Storing
- Default to team-shared memories. Assume anything you save will be seen by other teammates and their agents.
- Tag memories with a `scope:` tag to signal intent:
  - `scope:team` — shared knowledge, applies to everyone (the default)
  - `scope:mine` — personal to this teammate (organization only, not security)
  - `scope:draft` — in progress, may be wrong, treat with suspicion
- Do NOT store secrets, credentials, or anything you wouldn't put in a PR description. The API key is shared.

### Retrieving
- Start with an unfiltered `retrieve_memory` call — you want team knowledge first.
- If you only want your own previous notes, pass `tags: ["scope:mine"]` AND post-filter for `author == "YOUR_HANDLE"`.
- If you want a specific teammate's context: `tags: [...]` with their handle used as a post-filter.
- When you cite a memory to the user, include the author so it's clear whose note you're relying on:
  *"Per a memory from andrew (2026-03-12): the worker rate limit is per-isolate, not global."*

### Conflicts
- If you find two memories that contradict each other, surface both to the user and ask which is current. Do NOT pick one silently.
- If a teammate's memory looks outdated based on current code, do NOT delete it. Store a new memory explaining the change and let them reconcile.

### The consolidation report
- The weekly cron writes `_system.consolidation-report` with similar-pair and stale-memory recommendations.
- At the start of each week (or whenever convenient), retrieve this report and discuss with the user whether to merge or prune anything.
```

## Patterns that work well

### Pattern 1 — Shared gotchas, private scratchpads

The most common split. Anyone can add gotchas, architectural decisions, or deploy notes to the shared pool. Personal scratchpads (half-finished ideas, reminders, opinions that aren't consensus) get tagged `scope:mine` and filtered out of team retrieves.

### Pattern 2 — Per-project author suffixes

If teammates work on multiple codebases, append the project to the handle: `alice-webapp`, `alice-mobile`. Filter by `author` prefix to get all of one person's notes, or by exact match for project-specific context. No code change needed — Recall stores the string as-is.

### Pattern 3 — Claude-as-author vs human-as-author

If your workflow is mostly "human asks, Claude does and remembers," use the human handle as author. If Claude is genuinely initiating captures on its own, use `claude-<human>` to distinguish machine-authored notes from human-dictated ones. Useful when reviewing the store later — "did I actually decide this, or did Claude infer it?"

### Pattern 4 — The weekly review ritual

Every Monday, one person retrieves `_system.consolidation-report` from the previous Sunday's cron run and discusses it with the team. Merge duplicates, prune stale notes, celebrate what got captured. Turns the memory store into a living artifact instead of a write-once graveyard.

## When to split into multiple instances

Deploy more than one Recall instance if:

- You have **strict confidentiality** between teammates (competing clients, HR data, salary discussions)
- You have **many teams** in one org — a single instance's consolidation runs get noisy past ~1000 memories
- You want **different importance/recency weights** per context — e.g., a fast-moving product team wants aggressive recency decay while a slower research team wants importance-weighted

Each instance costs effectively $0 on Cloudflare's free tier, so splitting is cheap. The only cost is having to manage multiple API keys and endpoints.

## Operational notes

- **Key rotation**: To rotate the shared API key, run `wrangler secret put MEMORY_API_KEY`, enter a new value, and share it with the team. The old key will stop working immediately after deploy. Coordinate with teammates so nobody is mid-call.
- **Audit trail**: There isn't one built-in. If you need "who deleted memory X?", add Cloudflare Worker logs (`console.log` the author on every mutating call) and view them with `wrangler tail`. Logs are not persisted by default.
- **Backup**: Run `wrangler d1 export recall --output=backup.sql` periodically. D1 is reliable but you are responsible for your own backups.
- **Read-only teammates**: Recall has one key with full read/write. If you want someone to have read-only access, they'd need a second key + a routing change in `src/index.ts`. PRs welcome.
