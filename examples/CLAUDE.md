# Memory Usage — recall MCP server

A persistent memory store is available via the `recall` MCP server. Use it proactively across sessions — this is how you stay smart about this project over time.

## When to retrieve

- **Before starting any non-trivial task.** Call `retrieve_memory` with a natural-language description of what you're about to do. Review results for gotchas, prior decisions, and related context.
- **When the user references past work** ("remember when we fixed that thing?", "we decided X last month"). Search for it instead of guessing.
- **When you hit something unexpected.** An odd error, a test failing for no reason — search memory first before digging.
- **When picking between two approaches.** There may be a prior decision about which way the project leans.

Use varied phrasings if the first query returns nothing useful. Recall uses hybrid search (vector + BM25), so different wordings surface different results.

## When to store

After finishing any task where you learned something non-obvious, call `store_memory`. Good candidates:

- Bug root causes (especially ones that weren't in the traceback)
- Subtle API behavior (things the docs don't mention)
- Architectural decisions and *why* they were made
- "Don't do X" rules from user pushback
- Cross-file invariants (if you change A, you must also change B)
- Environment-specific gotchas (works in dev, breaks in prod, etc.)
- Successful approaches to tricky problems

**Don't store:**
- Things derivable from reading the code — git blame and grep are authoritative for those
- Ephemeral task state — use a plan or todo list instead
- Anything already in this CLAUDE.md or other committed docs
- Conversation context that only matters for the current session

## How to format

- **Key**: kebab-case, descriptive, scoped. `"auth-token-rotation-bug"` not `"bug1"`.
- **Importance**:
  - `0.8–1.0` — critical; forgetting causes bugs or wasted hours
  - `0.5–0.7` — useful context for future work in the same area
  - `0.3–0.5` — nice-to-know
- **Tags**: 1–4 tags from a small consistent set. Suggested: `architecture`, `security`, `gotcha`, `convention`, `decision`, `bug`, `performance`, `deploy`.
- **Author**: your name/handle (`claude`, or the user's handle if they dictated the memory).
- **Content**: include the *why*, not just the *what*. A one-line fact is less useful than three lines explaining the reasoning.

## Hygiene

- If `store_memory` returns a "similar memory already exists" warning, inspect the existing memory and decide whether to update it (reuse the same key) or skip storing.
- When you notice a memory is outdated (the code it describes has changed), either update it via `store_memory` (same key) or delete it with `delete_memory`.
- Trust what you observe in the code now over what memory says. Memory is a point-in-time snapshot; the code is the source of truth.
