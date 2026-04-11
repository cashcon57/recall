# Setup Prompts

Copy-paste these prompts into Claude or ChatGPT to walk through Recall setup and wire it into your AI workflow.

---

## For Claude (Claude Code, Claude Desktop, or claude.ai)

Claude Code can actually run the setup for you. ChatGPT cannot (see below for what to do there).

### Prompt 0 — First-time setup (Claude walks you through everything)

Use this if you don't already have a Cloudflare account, haven't used `wrangler` before, or just want the full end-to-end experience guided. Claude will check your environment, walk you through account creation in a browser, optionally connect the Cloudflare MCP server so it can verify things directly, deploy Recall, and wire it into your MCP client. Paste it into Claude Code running in any directory.

```text
I want to deploy Recall (https://github.com/cashcon57/recall), a self-hosted
MCP memory server, to Cloudflare. I've never done this before, so walk me
through it start to finish. Do one step at a time, wait for me to confirm
each step worked before moving to the next, and explain anything that might
be unfamiliar.

Phase 1 — Local environment check

1. Check what I have installed. Report back:
   - Node.js version (need 20+)
   - git
   - curl
   - Whether `npx wrangler whoami` succeeds
   If Node.js is missing or below 20, tell me to install it from nodejs.org
   and stop until I confirm. Do not try to install it for me.

2. Pick a working directory for the repo. Suggest ~/recall. Ask if I want a
   different location. Do NOT create it yet.

Phase 2 — Cloudflare account

3. Ask me if I already have a Cloudflare account. If no:
   a. Tell me to open https://dash.cloudflare.com/sign-up in a browser.
   b. Walk me through: email, password, email verification. Free plan only.
   c. Wait for me to confirm I've signed in.
   d. Remind me that I do NOT need to add a domain or payment method.

4. Tell me to open https://dash.cloudflare.com/?to=/:account/ai/workers-ai
   in a browser and accept the Workers AI terms if prompted. This is the
   ONE manual browser step that can't be automated. Wait for me to confirm.

5. Run `npx wrangler login` from my terminal. This opens a browser OAuth
   flow that links wrangler to my account. Tell me to run it manually (you
   can't, because it needs browser interaction) and wait for me to confirm.

6. After login, run `npx wrangler whoami`. Report the account email and
   account ID back to me. Confirm with me that this is the right account
   (people sometimes have multiple). If it's the wrong one, help me switch
   with `CLOUDFLARE_ACCOUNT_ID=<correct-id> wrangler ...`.

Phase 3 — Optional: connect the Cloudflare MCP server

7. Ask me if I want to connect the Cloudflare MCP server to Claude Code
   BEFORE we deploy. This lets you (Claude) verify resources, check for
   naming collisions, and confirm things without me having to paste output.
   It's optional but recommended for first-time setup.

   If yes: edit my project's .mcp.json (or create it) to add:

   {
     "mcpServers": {
       "cloudflare-bindings": {
         "type": "http",
         "url": "https://bindings.mcp.cloudflare.com/mcp"
       },
       "cloudflare-docs": {
         "type": "http",
         "url": "https://docs.mcp.cloudflare.com/mcp"
       }
     }
   }

   Tell me to restart Claude Code (or reload MCP servers with /mcp) and
   authenticate with Cloudflare when prompted. The bindings server will
   redirect to CF for OAuth. Wait for me to confirm both servers are
   connected. Use them throughout the rest of this setup where helpful.

Phase 4 — Deploy Recall

8. Clone the repo into the directory we picked:
   git clone https://github.com/cashcon57/recall.git <dir>
   cd <dir>

9. Before running setup.sh, use the cloudflare-bindings MCP (if connected)
   to verify no existing D1 database is named `recall` and no Vectorize
   index is named `recall-vectors`. If either exists, ask me whether to
   reuse or bail out. If not connected, just proceed and let setup.sh
   handle collisions.

10. Run `./setup.sh` and stream the output. Describe what each step does
    as it happens (install deps, create D1, apply schema, create Vectorize
    index, generate API key, deploy).

11. When the script finishes, capture the worker URL (ends in .workers.dev)
    and read the API key from the .recall-api-key file it created. Do NOT
    print the key to the chat log — hold it in a variable for step 12.

12. Smoke test the deployment. Run:
    curl -s -X POST "$WORKER_URL/mcp" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -80
    Confirm you see the 6 tool definitions in the response. If not,
    diagnose (auth? URL? deploy succeeded?) before moving on.

Phase 5 — Wire Recall into my MCP client

13. Ask me which MCP client I'll use Recall with:
    - Claude Code (edits ./.mcp.json in the current project)
    - Claude Desktop (via mcp-remote bridge)
    - Cursor / Windsurf / Cline / other
    Based on my answer, edit the appropriate config file. Use env var
    substitution ${RECALL_API_KEY} so the key is never committed.

14. Create a local .env file next to the config with:
    RECALL_API_KEY=<the key from .recall-api-key>
    Make sure it's chmod 600. Add .env to .gitignore if it isn't already.
    Tell me how to source it before launching the client.

15. Offer to delete .recall-api-key now that the key is saved in .env
    and (hopefully) my secret manager. Wait for confirmation.

Phase 6 — Verify and teach Claude to use it

16. Tell me to restart the MCP client and run /mcp (in Claude Code) or
    the equivalent. Confirm `recall` shows as connected.

17. Call recall's list_memories tool to confirm it works end to end. It
    should return "No memories stored yet" or similar.

18. Store one memory as a smoke test: a one-line description of this
    project with key "setup-complete", importance 0.3, tag "meta",
    author whatever handle I tell you.

19. Retrieve it immediately to confirm the store/query loop works.

20. Offer to run the "teach Claude to use Recall" prompt from
    SETUP_PROMPTS.md (Prompt 2) now, which adds a Memory Usage section
    to this project's CLAUDE.md. Wait for my answer.

Rules throughout:
- One phase at a time. Confirm with me before advancing.
- Never print the API key in the chat log. Treat it like a password.
- If anything fails, diagnose before moving on. Don't mask errors.
- If you need me to do something in a browser, stop, explain exactly
  what I'll see, and wait for me to confirm it worked.
- Never ever commit the API key, .recall-api-key file, or .env to git.
```

### Prompt 1 — Deploy Recall to your Cloudflare account

```text
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

```text
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

```text
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
