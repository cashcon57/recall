# Setup Prompts

Copy-paste these prompts into Claude or ChatGPT to walk through Recall setup and wire it into your AI workflow.

---

## For Claude (Claude Code, Claude Desktop, or claude.ai)

Claude Code can actually run the setup for you. ChatGPT cannot (see below for what to do there).

### Prompt 1 — Deploy Recall to your Cloudflare account

```
I want you to deploy Recall, a self-hosted MCP memory server, to my Cloudflare
account. The repo is at https://github.com/cashcon57/recall

Do this:

1. Clone the repo into ~/recall (skip if it already exists, just cd into it)
2. Check that I have `wrangler` available (via `npx wrangler`) and that I'm
   logged in with `npx wrangler whoami`. If I'm not logged in, pause and tell
   me to run `npx wrangler login` in my terminal, then wait.
3. Run ./setup.sh and stream the output. The script will:
   - install dependencies
   - create a D1 database named `recall`
   - apply schema.sql to it
   - create a Vectorize index named `recall-vectors` (1024D, cosine)
   - create metadata indexes on `importance` and `author`
   - generate a random 64-char API key and upload it as the MEMORY_API_KEY secret
   - deploy the worker
4. Capture the final worker URL (it ends in .workers.dev) and the API key
   printed at the end of the script.
5. Add Recall to my MCP client config. Ask me which client I use (Claude Code,
   Claude Desktop, Cursor, Windsurf) and edit the appropriate config file:
   - Claude Code: .mcp.json in the project root
   - Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json on macOS
   - Cursor: ~/.cursor/mcp.json
   - Windsurf: ~/.codeium/windsurf/mcp_config.json
6. Use env var substitution (${RECALL_API_KEY}) rather than hardcoding the key.
   Create a .env file next to the config with `RECALL_API_KEY=<the key>` and
   remind me how to source it before launching the client.
7. Tell me to restart the MCP client and verify that the `recall` server shows
   as connected. Offer to call retrieve_memory with a test query to confirm.

Don't skip steps. If anything fails, diagnose and fix before moving on. If
you need me to do something in a browser (Cloudflare dashboard, etc.), stop
and tell me exactly what to do.
```

### Prompt 2 — Teach your agent to use Recall properly

After the server is deployed and connected, run this prompt in the project
where you want Claude to use Recall:

```
I just connected a memory MCP server called `recall` to this project. I want
you to use it throughout our work together. Do this now:

1. Check that `recall` shows as an active MCP server (run /mcp if we're in
   Claude Code). If it's not connected, stop and help me fix it before going on.
2. Call recall's list_memories tool to see if anything is already stored.
3. Open (or create) CLAUDE.md in the project root. Add a "Memory Usage" section
   with these rules, adapted to this project's specifics:

   ---
   ## Memory Usage (recall MCP server)

   A persistent memory store is available via the `recall` MCP server.
   Use it proactively:

   - Before starting any non-trivial task, call `retrieve_memory` with a
     natural-language description of what you're about to do. Review results
     for gotchas, prior decisions, and related context.
   - After finishing any task where you learned something non-obvious, call
     `store_memory` to save it. Good candidates: bug root causes, subtle API
     behavior, architectural decisions, "don't do X" rules, conventions the
     user pushed back on.
   - Use descriptive kebab-case keys (e.g. "auth-flow-token-rotation",
     "neon-migration-gotcha").
   - Set importance: 0.8+ for things that would cause bugs if forgotten,
     0.5 for useful context, 0.3 for nice-to-know.
   - Tag memories with a small set of categories: architecture, security,
     gotcha, convention, decision, bug, etc.
   - Set author to your name/handle (e.g. "claude", "cash", "andrew") so we
     can track who captured what.
   - Don't store anything derivable from the code itself — git blame and
     grep are authoritative for those. Store things that WOULD be lost if
     you forgot the conversation.
   - Run retrieve_memory with different phrasings if the first search
     returns nothing useful — hybrid search rewards variety.
   ---

4. Call store_memory with one initial memory describing this project's
   purpose and tech stack at high level. Use the key "project-overview",
   importance 0.7, tags ["overview"], author "claude".
5. Confirm that the CLAUDE.md change is saved and tell me the memory count
   after storing.
```

---

## For ChatGPT (including o1, GPT-5, GPT-4)

ChatGPT cannot run shell commands or edit files on your machine. It can only
walk you through setup step-by-step. Here is a prompt to do that:

```
I want to deploy Recall, a self-hosted MCP memory server, to my Cloudflare
account. The repo is at https://github.com/cashcon57/recall

Walk me through the setup interactively. Do NOT dump the whole plan at once —
go one step at a time, wait for me to tell you the output or confirm
completion, then advance to the next step.

Assume I have:
- macOS or Linux terminal
- Node.js 20+ installed
- A Cloudflare account (free tier is fine)
- git installed
- an MCP-capable AI client (Claude Desktop, Cursor, Windsurf, or Claude Code)

Your steps should cover:
1. Cloning https://github.com/cashcon57/recall into ~/recall
2. Logging in to Cloudflare via `npx wrangler login` (browser flow)
3. Running ./setup.sh from the repo root
4. Capturing the worker URL and API key from the final output
5. Adding Recall to my MCP client config file (ask me which one I use, then
   tell me the exact file path and JSON to add, with the API key placeholder)
6. Explaining how to set RECALL_API_KEY as an environment variable before
   launching the client
7. Restarting the client and verifying `recall` is connected

For each step, tell me exactly what command to run or what to paste where.
Ask me to confirm each step completed before moving on. If I hit an error,
help me diagnose it before advancing. Do not skip the verification step at
the end.

Also: after setup is verified, give me a second prompt I can feed to my AI
assistant (Claude or similar) that tells it how to USE the memory server
effectively — when to store, when to retrieve, how to format keys and tags.
```

---

## Pro tips

- **Generate the API key yourself** if you don't trust the setup script's
  `openssl rand` step. Any 32+ char random string works. Set it manually
  with `wrangler secret put MEMORY_API_KEY`.
- **Use different memory servers per project context** if you want hard
  isolation. Deploy Recall twice with different worker names (`recall-work`,
  `recall-personal`). They'll share your Cloudflare account but have separate
  D1 databases and API keys.
- **Never commit your API key** to git. The provided `.mcp.json` examples
  use `${RECALL_API_KEY}` env var expansion so the config is safe to commit.
