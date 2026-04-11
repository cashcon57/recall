# Setup Prompts

Recall is designed to be set up by an AI. Paste one of the prompts below into Claude Code (or any MCP-capable agent with web fetch), and it'll act as your setup wizard: checking your environment, walking you through Cloudflare signup if needed, deploying the worker, wiring it into your MCP client, and testing the whole thing end to end. You are never expected to read a long install guide — the agent does that for you.

ChatGPT can also guide you through it, but it can't run commands or edit files, so the experience is text-only. See the ChatGPT section further down.

---

## The one-liner (recommended)

Paste this single sentence into Claude Code. It's a natural-language version of the full setup — the agent will fetch this file, look at your current project so it can tailor the install, follow Prompt 0 below, and handle everything including asking you how you want to scope memory across your projects.

```text
Set up Recall, adapted and optimized for my project and the way I work. The
repo is https://github.com/cashcon57/recall. Fetch SETUP_PROMPTS.md from it
and follow "Prompt 0 — First-time setup" exactly. Before deploying, look at
my current project to understand what I'm building, then ask me how I want
to scope memory across my projects: single repo, shared pool across
multiple repos, grouped by project type, per-repo isolated, or user-global.
Walk me through every step.
```

That's it. If you only remember one thing from this file, remember that sentence.

---

## For Claude (Claude Code, Claude Desktop, or claude.ai)

### Prompt 0 — First-time setup (the full wizard)

This is the expanded version that the one-liner points to. You don't normally need to paste this yourself — the one-liner above tells Claude to fetch it. But if you want to read what the agent will actually do, or adapt it to something unusual, here it is.

```text
I want to deploy Recall (https://github.com/cashcon57/recall), a self-hosted
MCP memory server, to Cloudflare. I've never done this before, so walk me
through it start to finish. Do one step at a time, wait for me to confirm
each step worked before moving to the next, and explain anything that might
be unfamiliar. Adapt and optimize every recommendation you make to fit MY
project and how I actually work — don't give me a generic install.

Phase 0 — Understand my project (before doing anything else)

0. Spend ~2 minutes understanding what I'm building and how. Read in the
   current working directory:
   - package.json / pyproject.toml / Cargo.toml / go.mod / Gemfile (to see
     what language and framework)
   - README.md (if it exists — get the project's purpose)
   - CLAUDE.md or .cursor/rules or .github/copilot-instructions.md
     (to see any conventions I've already written down)
   - The top-level directory structure (mono-repo? single app? workers?
     mobile? CLI? library?)
   - .mcp.json or equivalent (what MCP servers I already have configured)
   - Any other obvious signals (Dockerfile, wrangler.toml, fly.toml, etc.)

   Then summarize back to me what you see in 3 to 5 sentences:
   "You're building X, using Y, structured as Z. You already use MCP
   servers A, B, C. I'll tailor Recall's install to this."

   Use that context for every later decision — naming the worker,
   picking the right memory scope, suggesting importance weights,
   choosing the right CLAUDE.md integration, etc.

   **Keep a running "adaptations log"** as you go through every phase.
   Every time you make a choice that's tailored to my project (worker
   name, scope, which repos to wire in, tags to suggest, author
   handles, CLAUDE.md section wording, etc.), note WHY you picked it
   in one line. You'll print this log back to me at the very end so I
   can see exactly how my install differs from a generic install.

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

Phase 2 — Decide memory scoping

3. Before we deploy anything, ask me how I want to organize memory across
   my projects. Present these five options clearly and ask me to pick one.
   Explain the tradeoffs in plain language:

   A) SINGLE REPO — one Recall instance wired into just this repo's
      .mcp.json. Simplest. Good if I'm experimenting or only have one
      project that needs memory.

   B) SHARED POOL ACROSS MULTIPLE REPOS — one Recall instance, wired into
      several projects' .mcp.json files. Every project sees the same
      memories. Good if I want knowledge to flow between projects (a
      postgres gotcha learned on project A surfaces on project B).
      One deploy, multiple config files. RECOMMENDED DEFAULT.

   C) GROUPED BY PROJECT TYPE — separate Recall instances per category
      (e.g. recall-work vs recall-personal, or recall-mobile vs recall-web).
      Balance of isolation and cross-pollination within a group. Requires
      N deploys, one per group. Each instance gets its own D1, Vectorize,
      and API key.

   D) PER-REPO ISOLATED — one Recall instance per repo, zero sharing.
      Good for client work with confidentiality requirements. Heavy to
      manage: warn me this is expensive to maintain and suggest (C) or
      (B) unless I have a real reason.

   E) USER-GLOBAL — one Recall instance wired into my user-level MCP
      config (~/.claude.json for Claude Code, or the equivalent for
      whatever client I use) so it follows me into any directory. Good
      for a personal knowledge vault independent of project boundaries.

   Give me a project-aware recommendation based on Phase 0. Examples:
   - "You're in a mono-repo with 4 sub-projects — I'd recommend (B) so
     knowledge flows across them, or (E) if you also want it in other
     directories."
   - "You're in a single React Native app — I'd recommend (A) or (E).
     (B) is overkill until you have multiple projects."
   - "I see you have work stuff and personal stuff in different parent
     directories — I'd recommend (C) with recall-work and recall-personal
     groups."
   Then tell me: "If you're not sure, pick the one I recommended. You
   can always split later with `wrangler deploy` on a new instance."

4. Based on my answer, confirm the deploy plan BEFORE touching anything:
   - A or E: single deploy, worker named `recall`
   - B: single deploy, worker named `recall`, wired into N repos
   - C: N deploys, workers named `recall-<group>`, I must give group names
   - D: one deploy per repo, worker named `recall-<repo-name>`
   For C and D, confirm the count and names with me out loud. For B,
   ask me now for the list of repo paths I want wired in (I can give
   them later if I don't know yet).

Phase 3 — Cloudflare account

5. Ask me if I already have a Cloudflare account. If no:
   a. Tell me to open https://dash.cloudflare.com/sign-up in a browser.
   b. Walk me through: email, password, email verification. Free plan only.
   c. Wait for me to confirm I've signed in.
   d. Remind me that I do NOT need to add a domain or payment method.

6. Tell me to open https://dash.cloudflare.com/?to=/:account/ai/workers-ai
   in a browser and accept the Workers AI terms if prompted. This is the
   ONE manual browser step that can't be automated. Wait for me to confirm.

7. Run `npx wrangler login` from my terminal. This opens a browser OAuth
   flow that links wrangler to my account. Tell me to run it manually (you
   can't, because it needs browser interaction) and wait for me to confirm.

8. After login, run `npx wrangler whoami`. Report the account email and
   account ID back to me. Confirm with me that this is the right account
   (people sometimes have multiple). If it's the wrong one, help me switch
   with `CLOUDFLARE_ACCOUNT_ID=<correct-id> wrangler ...`.

Phase 4 — Optional: connect the Cloudflare MCP server

9. Ask me if I want to connect the Cloudflare MCP server to Claude Code
   BEFORE we deploy. This lets you (Claude) verify resources, check for
   naming collisions, and confirm things without me having to paste output.
   Optional but recommended for first-time setup.

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

Phase 5 — Deploy Recall (adapt based on scoping choice from Phase 2)

10. Clone the repo into the directory we picked:
    git clone https://github.com/cashcon57/recall.git <dir>
    cd <dir>

11. Before running setup.sh, check the cloudflare-bindings MCP (if connected)
    for existing D1 databases and Vectorize indexes that would collide with
    the worker name(s) from the scoping plan. If collisions exist, ask me
    whether to reuse or rename. If not connected, proceed and let setup.sh
    surface any collisions.

12. Deploy, looping if the scoping choice requires multiple instances:

    For scoping A, B, or E (single deploy):
      a. Run `./setup.sh` as-is. Stream output. Describe each step
         (install deps, create D1, apply schema, create Vectorize
         index, generate API key, deploy).
      b. Capture the worker URL and read the API key from
         .recall-api-key. Hold in a variable; never print to chat.

    For scoping C (grouped, N deploys) or D (per-repo, M deploys):
      a. For each group/repo, edit wrangler.toml.example → wrangler.toml
         with a unique `name` (e.g. `recall-work`) and unique
         `database_name` / `index_name`. Git-stash or git-worktree
         between deploys if needed to keep configs separate.
      b. Run ./setup.sh for each, capturing the worker URL and API
         key per instance. Keep them in a table for me to see.
      c. Warn me if any deploy fails, and stop the loop until I
         acknowledge.

13. Smoke test each deployment:
    curl -s -X POST "$WORKER_URL/mcp" \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -80
    Confirm you see the 6 tool definitions in the response. If not,
    diagnose (auth? URL? deploy succeeded?) before moving on.

Phase 6 — Wire Recall into my MCP client(s)

14. Ask me which MCP client(s) I'll use Recall with:
    - Claude Code (project-level: ./.mcp.json per repo; or user-level:
      ~/.claude.json for scoping E)
    - Claude Desktop (via mcp-remote bridge)
    - Cursor / Windsurf / Cline / other
    Based on my answer AND the scoping choice from Phase 2, edit the
    correct config file(s). Use env var substitution ${RECALL_API_KEY}
    (or ${RECALL_API_KEY_<GROUP>} for scoping C) so keys are never
    hardcoded or committed.

    Scoping-specific wiring:
    - A: edit ./.mcp.json in this one repo
    - B: edit ./.mcp.json in every repo path I gave you in step 4
    - C: edit ./.mcp.json in each repo, pointing at that group's worker
    - D: edit ./.mcp.json in each repo, pointing at its own worker
    - E: edit ~/.claude.json (user scope) so Recall follows me everywhere

15. Create a local .env file (or .env per repo, or ~/.env for E) with:
    RECALL_API_KEY=<the key>
    (For C, use distinct var names like RECALL_API_KEY_WORK,
    RECALL_API_KEY_PERSONAL.)
    Make sure each .env is chmod 600 and in .gitignore. Tell me how
    to source it before launching the client.

16. Offer to delete .recall-api-key now that the key is saved in .env
    and (hopefully) my secret manager. Wait for confirmation.

Phase 7 — Verify and teach Claude to use it

17. Tell me to restart the MCP client and run /mcp (in Claude Code) or
    the equivalent. Confirm `recall` shows as connected. For multi-instance
    setups (C, D), verify each one separately.

18. Call recall's list_memories tool to confirm it works end to end. It
    should return "No memories stored yet" or similar.

19. Store one memory as a smoke test: a one-line description of this
    project with key "setup-complete", importance 0.3, tag "meta",
    author whatever handle I tell you.

20. Retrieve it immediately to confirm the store/query loop works.

21. Offer to run the "teach Claude to use Recall" prompt from
    SETUP_PROMPTS.md (Prompt 2) now, which adds a Memory Usage section
    to this project's CLAUDE.md. Wait for my answer.

22. If I used scoping B, C, or D (multi-repo), offer to run Prompt 2
    in each additional repo so all of them get the same CLAUDE.md
    memory-usage section.

Phase 8 — Optimization report (print this last, not first)

23. Print an "Optimized for your setup" summary. Use the adaptations
    log you've been keeping since Phase 0. Be specific and honest —
    only list things you actually tailored to this user, not generic
    Recall features.

    Format it as a bullet list under a clear heading:

    ### How this install was adapted to your setup

    For each bullet, say WHAT you did and WHY based on what you saw
    in my project. Examples of what good bullets look like:

    - "Named the worker `recall-switchr` instead of `recall` because
      you already have a `recall` worker in your account."
    - "Picked scope (B) shared pool because I saw you have four
      monorepo sub-projects (mobile, workers, chat-server,
      memory-server) that share context like auth flows and DB schemas."
    - "Wired Recall into ~/.claude.json (user scope) instead of
      per-repo because your work spans more directories than just
      this one, and you told me you switch projects often."
    - "Suggested tags: mobile, workers, chat, memory, e2ee, security —
      because those are the major subsystems I saw in your code."
    - "Used `cash` as the author handle based on your git config."
    - "Set importance default to 0.6 instead of 0.5 because your
      CLAUDE.md shows you care about capturing subtle gotchas, and
      you'll want those to rank higher on retrieval."
    - "Skipped the `ALLOW_DESTRUCTIVE_TOOLS` enable step — you can
      turn it on later if you ever need to wipe the store; default-
      deny is safer given you're solo-admin."
    - "Added a `team` tag convention because your project has a
      second collaborator (I saw `andrew` in git log). Recall is
      single-key, so you'll share it with him via your secret
      manager; don't store credentials in it."

    If I'm a solo dev with one repo, the report will be short.
    If I'm a team with multiple repos, it will be longer. Both are
    fine. Do NOT pad the list with generic Recall features that
    apply to everyone.

    End the report with ONE line telling me what to do next:
    "You're all set. Start a new Claude Code session, ask me
    something about this project, and I'll retrieve any stored
    memories automatically."

Rules throughout:
- One phase at a time. Confirm with me before advancing.
- Never print any API key in the chat log. Treat each like a password.
- If anything fails, diagnose before moving on. Don't mask errors.
- If you need me to do something in a browser, stop, explain exactly
  what I'll see, and wait for me to confirm it worked.
- Never commit any API key, .recall-api-key file, or .env to git.
- For multi-instance setups (C, D), if N > 5 instances, STOP and ask
  me if I really want that many. Suggest B or collapsing groups.
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
