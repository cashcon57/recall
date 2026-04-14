# Memory Usage — recall MCP server (Codex)

A persistent memory store is available via the `recall` MCP server. Use it proactively across sessions.

> **Codex note:** Copy this file to your project root as `AGENTS.md` (or append to an existing one). Codex injects `AGENTS.md` as session-start context.

## When to retrieve

- **Before starting any non-trivial task.** Call `retrieve_memory` with a natural-language description of what you're about to do.
- **When the user references past work** — search memory instead of guessing.
- **When you hit something unexpected** — search memory first.
- **When picking between two approaches** — check for prior decisions.

Use varied phrasings if the first query returns nothing. Recall uses hybrid search (vector + BM25).

## When to store

After finishing any task where you learned something non-obvious:
- Bug root causes
- Architectural decisions and *why* they were made
- "Don't do X" rules from user pushback
- Cross-file invariants
- Environment-specific gotchas

**Don't store:** Things derivable from code, ephemeral task state, anything in committed docs.

## How to format

- **Key**: kebab-case, descriptive. `"auth-token-rotation-bug"` not `"bug1"`.
- **Importance**: `0.8–1.0` critical, `0.5–0.7` useful, `0.3–0.5` nice-to-know
- **memory_type**: `episodic` (events, 7d), `semantic` (facts, 69d), `procedural` (rules, 693d)
- **Tags**: 1–4 tags: `architecture`, `security`, `gotcha`, `convention`, `decision`, `bug`
- **Author**: your handle (`codex`, or the user's handle)
- **Content**: include the *why*, not just the *what*

## Saving context manually (Codex)

Codex does not support PreCompact hooks. To preserve context across sessions, call `store_memory` before ending a long session:

```json
{
  "key": "session-YYYY-MM-DD-topic",
  "content": "Summary of what was accomplished and key decisions.",
  "tags": ["session-summary"],
  "importance": 0.6,
  "author": "codex",
  "memory_type": "episodic"
}
```

## Backends

Recall supports three backends. Choose one:

| Backend | Transport | Vectors | Internet |
|---|---|---|---|
| Cloudflare Workers | HTTP | 1024D bge-m3 | Required |
| Local stdio | stdio | 768D bge-base | No |
| Docker HTTP | HTTP | 768D bge-base | No |

> **Important:** Memories stored in one backend are NOT portable to another (different vector spaces).

See `examples/mcp-config-*.json` for connection config.
