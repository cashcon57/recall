# Setup Prompts

Recall is designed to be set up by an AI. Paste one of the prompts below into Claude Code (or any MCP-capable agent with web fetch), and it'll act as your setup wizard: checking your environment, walking you through Cloudflare signup if needed, deploying the worker, wiring it into your MCP client, and testing the whole thing end to end. You are never expected to read a long install guide — the agent does that for you.

ChatGPT can also guide you through it, but it can't run commands or edit files, so the experience is text-only. See the ChatGPT section further down.

---

## The one-liner (recommended)

Paste this into Claude Code. It's written for maximum reliability: it pins to a specific release tag so behavior doesn't drift when the repo updates, tells Claude exactly which tool to use, tells it to verify the file before executing, and tells it to execute verbatim rather than summarizing.

```text
Fetch https://raw.githubusercontent.com/cashcon57/recall/v1.1.2/SETUP_PROMPTS.md using Bash (curl -fsSL) so you get the raw markdown, not a summary. Verify it contains a section titled "Prompt 0 — First-time setup". Execute that section verbatim, step by step, adapted and optimized for my current project. Do not summarize. Do not skip. If the fetch fails or the section is missing, stop and tell me.
```

If you only remember one thing from this file, remember that.

### Why is the one-liner written that way?

Four small choices make the difference between "works most of the time" and "works every time":

1. **Pinned to `v1.1.2`, not `main`.** If the repo updates tomorrow, your command still behaves identically. To opt into new features, bump the version string manually.
2. **`raw.githubusercontent.com`, not `github.com`.** Returns raw markdown, not an HTML page. No parsing variance.
3. **Explicit `Bash (curl -fsSL)`.** "Fetch" is ambiguous — Claude could use WebFetch (which summarizes), clone the repo, or skim. Naming the exact tool eliminates the branch and, critically, avoids WebFetch's auto-summarization — `curl` returns raw markdown byte-for-byte, which is what the wizard needs to execute verbatim.
4. **"Verbatim, step by step" + integrity check.** Makes Claude execute the file instead of summarizing it. The "verify the section exists" step catches fetch failures, repo moves, or cache staleness before anything executes.

Friendly fallback if you just want something human-readable:

```text
Go to https://github.com/cashcon57/recall and set it up for my project, adapted to how I work.
```

This works too (Prompt 0 is the canonical path referenced throughout the repo), it's just less deterministic.

---

## For Claude (Claude Code, Claude Desktop, or claude.ai)

### Prompt 0 — First-time setup

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
   my projects. Present these SIX options clearly and ask me to pick one.
   Explain the tradeoffs in plain language:

   A) SINGLE REPO — one Recall instance wired into just this repo's
      .mcp.json. Simplest. Good if I'm experimenting or only have one
      project that needs memory.

   B) SHARED POOL ACROSS MULTIPLE REPOS — one Recall instance, wired into
      several projects' .mcp.json files. Every project sees the same
      memories. Good if I want knowledge to flow between projects (a
      postgres gotcha learned on project A surfaces on project B).
      One deploy, multiple config files. RECOMMENDED DEFAULT for solo devs.

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

   F) TEAM + PER-USER PERSONAL POOL — TWO or more Recall instances:
      one shared team pool that every teammate reads and writes, plus
      one personal pool per teammate that only they can access. This
      is the ONLY option that gives real privacy between teammates —
      because Recall is single-key per instance, the personal pool
      each teammate gets a different API key nobody else has.

      How it works at runtime:
      - Team knowledge (architecture, gotchas, shared decisions) goes
        to the team instance. Everyone sees it.
      - Personal preferences ("I like tabs", "don't suggest emoji
        commits", "my author handle is alice") go to the personal
        instance. Only that teammate's Claude sees them.
      - When Claude retrieves, it queries BOTH servers and merges
        results. Personal entries override team conventions for that
        user only.

      Good if I'm working on a codebase with one or more collaborators
      and we each want some private memory alongside our shared pool.
      The only option where "teammate A can tell Claude to do X and
      teammate B can tell Claude to do Y, and they don't conflict" is
      actually true — because each personal pool is literally a
      different database with a different key. RECOMMENDED DEFAULT
      for teams.

   Give me a project-aware recommendation based on Phase 0. Examples:
   - "You're in a mono-repo with 4 sub-projects and git log shows
     only one committer — I'd recommend (B). Shared pool across the
     sub-projects, no multi-user concern."
   - "You're in a single React Native app, only one committer —
     I'd recommend (A) or (E). (B) is overkill until you have
     multiple projects."
   - "I see work stuff and personal stuff in different parent
     directories, both yours — I'd recommend (C) with recall-work
     and recall-personal groups."
   - "Git log shows two committers (cash, andrew) on this repo. If
     you want real privacy for each teammate's personal preferences,
     (F) is the only option that enforces it. Otherwise (B) works
     but everything is shared-by-default."

   Then tell me: "If you're not sure, pick the one I recommended. You
   can always split later with `wrangler deploy` on a new instance."

4. Based on my answer, confirm the deploy plan BEFORE touching anything:
   - A or E: single deploy, worker named `recall`
   - B: single deploy, worker named `recall`, wired into N repos
   - C: N deploys, workers named `recall-<group>`, I must give group names
   - D: one deploy per repo, worker named `recall-<repo-name>`
   - F: TEAM deploy (worker `recall-<project>-team`) PLUS one
        PERSONAL deploy per teammate (worker `recall-<project>-<handle>`).
        Ask me:
        (a) The project name for the team worker (suggest from Phase 0)
        (b) How many teammates, and their handles
        (c) Which handle is mine (I'll get the personal key for this one)
        (d) Whether teammates will run their own setup later or I'm
            doing all deploys right now with their consent

        For option F: I must give you my teammate handles out loud.
        If I only give you my own handle, confirm that I'm setting
        up a "team of one" structure that future teammates can add
        themselves to later (just run setup.sh with a new handle).

   For C, D, and F, confirm the count and names with me out loud. For
   B, ask me now for the list of repo paths I want wired in (I can
   give them later if I don't know yet).

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

Phase 4 — Install Cloudflare MCP servers (strongly recommended)

9. Install Cloudflare's official MCP servers before we deploy. This is
   strongly recommended because it lets you (Claude) directly verify
   resources, check for naming collisions, read deployment logs, and
   diagnose issues instead of parsing streaming CLI output. Without
   these, the wizard still works — but it's blinder and slower.

   Present it as:

   "I strongly recommend installing Cloudflare's official MCP servers
   before we deploy. They give me direct access to your Cloudflare
   account to verify resources, read logs, and diagnose issues without
   needing to parse wrangler output. It's five HTTP servers, one-time
   OAuth, and they're free. Worth the two minutes. Want me to set
   them up? (You can still skip if you'd rather — setup will work,
   just with less visibility.)"

   If yes, edit the project's .mcp.json (create if missing) and add:

     {
       "mcpServers": {
         "cloudflare-bindings": {
           "type": "http",
           "url": "https://bindings.mcp.cloudflare.com/mcp"
         },
         "cloudflare-docs": {
           "type": "http",
           "url": "https://docs.mcp.cloudflare.com/mcp"
         },
         "cloudflare-builds": {
           "type": "http",
           "url": "https://builds.mcp.cloudflare.com/mcp"
         },
         "cloudflare-observability": {
           "type": "http",
           "url": "https://observability.mcp.cloudflare.com/mcp"
         }
       }
     }

   What each one does:
   - bindings — list/read/modify D1 databases, Vectorize indexes,
     R2 buckets, KV namespaces. Used throughout deploy for
     collision detection and verification.
   - docs — on-demand Cloudflare documentation lookups. Helpful
     when diagnosing obscure wrangler errors.
   - builds — deployment history, worker versions, rollback info.
     Useful when iterating on the worker post-install.
   - observability — log streams (equivalent to wrangler tail)
     and metrics. This is the one that matters most long-term —
     when something breaks in production, you'll use this to see
     what the worker is actually doing without having to open a
     terminal.

   Tell me to restart Claude Code (or reload MCP servers with /mcp)
   and authenticate with Cloudflare when prompted. Each server will
   redirect to CF OAuth once; subsequent sessions reuse the token.
   Wait for me to confirm all four servers are connected before
   proceeding to Phase 5.

   If the user declines, proceed without the Cloudflare MCPs and
   note in the adaptations log that streaming wrangler output is
   the only visibility channel. Do not retry the ask.

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

    For scoping F (team + per-user personal pools):
      a. Deploy the TEAM instance first. Edit wrangler.toml.example
         → wrangler.toml with:
         - name = "recall-<project>-team"
         - database_name = "recall-<project>-team"
         - index_name = "recall-<project>-team-vectors"
         Run ./setup.sh. Capture the worker URL and team API key.
      b. Then deploy ONE PERSONAL instance per teammate handle I
         gave you in step 4. For each teammate:
         - name = "recall-<project>-<handle>"
         - database_name = "recall-<project>-<handle>"
         - index_name = "recall-<project>-<handle>-vectors"
         Run ./setup.sh for each. Capture the worker URL and
         personal API key.
      c. Report back a table of all deployed instances:
         | Kind     | Worker name              | URL         | Key var             |
         |----------|--------------------------|-------------|---------------------|
         | team     | recall-switchr-team      | https://... | RECALL_TEAM_KEY     |
         | personal | recall-switchr-cash      | https://... | RECALL_PERSONAL_KEY |
         | personal | recall-switchr-andrew    | https://... | (for andrew)        |
      d. IMPORTANT: for each personal instance, the API key belongs
         to ONLY that teammate. Do NOT share it with the team. The
         personal key for teammates other than me should be delivered
         to them out of band (1Password, Signal, etc.) — don't commit
         them, don't print them in my chat log more than necessary.
      e. Warn me if any deploy fails, and stop the loop until I
         acknowledge.
      f. Before finishing Phase 5 for option F: remind me that each
         teammate will need to set THEIR OWN personal key as an env
         var on THEIR machine. I only need to set my own personal key
         on my machine. Everyone sets the same team key.

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
    (or distinct var names for grouped/team modes) so keys are never
    hardcoded or committed.

    Scoping-specific wiring:
    - A: edit ./.mcp.json in this one repo with ONE server entry
      pointing at recall-<project>
    - B: edit ./.mcp.json in every repo path I gave you in step 4,
      ONE server entry each, all pointing at the same worker
    - C: edit ./.mcp.json in each repo with ONE server entry, pointing
      at that group's worker
    - D: edit ./.mcp.json in each repo with ONE server entry, pointing
      at its own worker
    - E: edit ~/.claude.json (user scope) with ONE server entry so
      Recall follows me everywhere

    - F: edit ./.mcp.json with TWO server entries. Both point at
      Recall but go to different workers:

        {
          "mcpServers": {
            "recall-team": {
              "type": "http",
              "url": "https://recall-<project>-team.<sub>.workers.dev/mcp",
              "headers": {
                "Authorization": "Bearer ${RECALL_TEAM_KEY}"
              }
            },
            "recall-personal": {
              "type": "http",
              "url": "https://recall-<project>-<my-handle>.<sub>.workers.dev/mcp",
              "headers": {
                "Authorization": "Bearer ${RECALL_PERSONAL_KEY}"
              }
            }
          }
        }

      The server names "recall-team" and "recall-personal" matter —
      the CLAUDE.md rulebook in Phase 7c uses these names to tell
      Claude which server to use for what. Do NOT pick different names.

      This .mcp.json is identical for every teammate. The difference
      is in their env vars: each teammate's RECALL_PERSONAL_KEY
      resolves to THEIR personal instance's key. The team key is
      the same for everyone.

      If teammates use different handles, they will each need to
      update the `recall-personal` URL to point at their own worker
      when they set up on their machine. Mention this explicitly.

14b. Pre-approve the new MCP server(s) in the user's Claude Code
     trust state, so the new session doesn't need to show a trust
     prompt. This is CRITICAL — without this step, the new session
     may see the server as "not yet trusted" and silently disable
     it, leaving the user with a wizard that appears successful
     but an /mcp output that doesn't show recall.

     Claude Code stores per-project MCP trust state in
     ~/.claude.json (the user-level config file, NOT the project's
     .mcp.json). The relevant structure:

       {
         "projects": {
           "<absolute-project-path>": {
             "enabledMcpjsonServers": [...],
             "disabledMcpjsonServers": [...]
           }
         }
       }

     Do this:

     a. Read ~/.claude.json. If the file doesn't exist, skip this
        step entirely — it means Claude Code has never been launched
        here and the first launch will create it fresh with the
        server(s) in a pending state. Tell the user they'll see a
        trust prompt on first launch and to approve it.

     b. Locate the absolute path of the project we're wiring Recall
        into (for scoping A/B/C/D/F, this is the repo path; for
        scoping E with a user-global server, this step does not
        apply — skip it).

     c. If projects.<path> exists: read its enabledMcpjsonServers
        and disabledMcpjsonServers arrays. For each server name
        you just added to .mcp.json (e.g. "recall", or
        "recall-team" + "recall-personal" for option F):

          - Remove it from disabledMcpjsonServers if present
            (this handles the case where the user previously
            denied a trust prompt for a server with the same name)
          - Add it to enabledMcpjsonServers if not already present

        Write the modified ~/.claude.json back. Preserve all other
        fields in the file exactly — do NOT use a regex or shell
        cat+echo pattern, use a proper JSON parse+modify+write
        flow (node -e, python3 json module, or jq).

     d. If projects.<path> does NOT exist yet in ~/.claude.json:
        add it with:
          {
            "enabledMcpjsonServers": [<your server names>],
            "disabledMcpjsonServers": [],
            "hasTrustDialogAccepted": true
          }
        Then write the file back.

     e. Verify the write succeeded by re-reading ~/.claude.json
        and confirming the server names are now in
        enabledMcpjsonServers under the correct project path.

     f. Tell the user what you just did in one sentence:
        "Pre-approved the new MCP server(s) in your Claude Code
        trust state so the new session loads them automatically
        without a trust prompt."

     For scoping B (shared pool across multiple repos): run steps
     a-e for EACH of the repo paths the user wired in. Each
     project path needs its own trust entry in ~/.claude.json.

     For scoping F (team + per-user personal pools): add BOTH
     "recall-team" AND "recall-personal" to enabledMcpjsonServers.

     For scoping E (user-global via ~/.claude.json top-level
     mcpServers): this is already user-scoped, no per-project
     trust entry needed. Skip the pre-approval step entirely.

     SAFETY RULES:
     - Do NOT touch any field in ~/.claude.json other than the
       specific enabledMcpjsonServers and disabledMcpjsonServers
       arrays under the project path(s) you're wiring. That file
       holds a lot of other state (user preferences, session
       history, etc.) and clobbering any of it is a catastrophic
       UX failure.
     - Do NOT remove servers from enabledMcpjsonServers that
       you didn't add. Only manage the ones from this install.
     - If the file has unusual structure or content you don't
       recognize, STOP and tell the user what you found rather
       than writing speculatively.

15. Add the Recall API key(s) to a local .env file. This step is
    APPEND-ONLY — if the project already has a .env file with other
    content, DO NOT overwrite or replace it. Preserve every existing
    line and only add what's missing.

    CRITICAL rules, in order:

    a. Check if .env already exists at the project root. It probably
       does — most projects have a .env for framework-specific config
       (VITE_, EXPO_PUBLIC_, NEXT_PUBLIC_, etc.). If it exists:
         - Read the current content verbatim
         - Check whether RECALL_API_KEY (or the scoping-specific
           variable names below) is already set
         - If already set with the correct value: leave it alone
           and skip to step 15d
         - If already set with a DIFFERENT value: STOP and tell the
           user which key is there, ask whether to overwrite, rotate,
           or abort. Do not silently replace.
         - If not set: APPEND the new line(s) to the end of the file,
           preserving every existing line exactly. Use a blank line
           and a comment header to visually separate the Recall
           section from the existing content.

    b. If .env does not exist, create it from scratch.

    c. The lines to add (vary by scoping choice):

       For scopings A, B, C, D, E:
         # Recall MCP memory server
         RECALL_API_KEY=<the key>
         (For scoping C, use distinct var names like RECALL_API_KEY_WORK,
         RECALL_API_KEY_PERSONAL per group.)

       For scoping F (team + per-user personal pools):
         # Recall MCP memory server — team + personal pools
         RECALL_TEAM_KEY=<team key, shared with teammates>
         RECALL_PERSONAL_KEY=<my personal key, NEVER shared>

    d. After writing, chmod the file to 600 (owner read/write only).
       Verify .env is in .gitignore. If it isn't, add it (most
       projects already have it, but some Rust/Go/misc projects
       don't).

    e. Tell me how to source the .env before launching the client
       (`source .env` from the project root, before running `claude`).
       For option F, explicitly warn me: "Never share
       RECALL_PERSONAL_KEY with anyone — it's the only thing giving
       you true privacy on this setup. If you leak it, rotate
       immediately with `wrangler secret put MEMORY_API_KEY --name
       recall-<project>-<my-handle>`."

    WHY this matters: an earlier version of this wizard just said
    "Create a local .env file" and a naive implementation would
    overwrite the existing file. Users whose projects had
    VITE_API_PORT, database URLs, framework config, or other
    secrets in .env would lose all of that content. Never overwrite.
    Always read-check-append.

16. Offer to delete .recall-api-key now that the key is saved in .env
    and (hopefully) my secret manager. Wait for confirmation.

Phase 6.5 — Generate the resume prompt before asking the user to restart

Before Phase 7 can run, the user has to restart their MCP client so
the new .mcp.json and env vars take effect. The new session starts
EMPTY — no memory of this wizard, no adaptations log, no scoping
choice, no collaborator handles, nothing. Unless you hand the user
a resume prompt that encodes the current state, they'll come back to
a new session that has no idea what happened and will re-run the
wizard from scratch.

Generate a resume prompt now, package it in a fenced code block, and
tell the user to paste it into their new Claude Code session AFTER
restarting. The prompt should include every decision the user has
made so far, adapted from the adaptations log you've been keeping
since Phase 0.

16b. Build the resume prompt. Use this template, filling in every
     <placeholder> from the current session's adaptations log:

     ```text
     I'm mid-way through setting up Recall (the MCP memory server
     from https://github.com/cashcon57/recall). I just restarted
     Claude Code to pick up the new .mcp.json and env vars. Please
     continue the setup wizard from Phase 7a (Connectivity check)
     without re-running any earlier phase. Do NOT fetch the
     upstream SETUP_PROMPTS.md again — the prior session already
     made all the project-specific decisions and here's the state:

     PROJECT CONTEXT (from Phase 0)
     - What I'm building: <one-sentence summary from Phase 0>
     - Stack: <frameworks/languages/infra>
     - Mono-repo vs single project: <which>
     - Existing MCP servers wired in before Recall: <list>
     - Directory conventions noted: <if any>

     MY IDENTITY
     - Author handle for memories: <handle>
     - Detected via: <git config | user provided | other>

     SCOPING CHOICE (from Phase 2)
     - Option picked: <A | B | C | D | E | F>
     - Reason: <one-liner why we picked it>
     - For option B: repos wired in: <list of paths>
     - For option C: group names: <list>
     - For option D: per-repo worker names: <list>
     - For option F: team worker name: <name>, teammate handles:
       <list>, my personal worker name: <name>

     CLOUDFLARE STATE
     - Account ID: <from wrangler whoami>
     - Workers AI terms accepted: <yes/no>
     - Cloudflare MCP servers connected: <bindings | docs |
       builds | observability | none>

     DEPLOYED INSTANCES (from Phase 5)
     For each worker deployed:
       - Worker name: <name>
       - Worker URL: <https://...workers.dev>
       - D1 database name: <name>
       - Vectorize index name: <name>
       - API key env var name: <RECALL_API_KEY or equivalent>
     Functional smoke test result (from Phase 5 step 13): <passed | failed>

     MCP CLIENT WIRING (from Phase 6)
     - Client(s) configured: <Claude Code | Claude Desktop | Cursor | etc.>
     - .mcp.json path: <path>
     - Env vars needed in shell: <list of var names, NOT values>
     - .env file path: <path>
     - .recall-api-key deleted: <yes/no>

     WHAT'S LEFT TO DO
     - Phase 7a: Connectivity check (verify `recall` shows in /mcp)
     - Phase 7b: Functional smoke test (10 steps — store 3 memories,
       test BM25 path, vector path, rerank variance, metadata filter,
       delete, destructive-tool gate, auth rejection, cleanup)
     - Phase 7c: Teach Claude to use Recall (update CLAUDE.md)
     - Phase 7d: Optional — context file cleanup pass
     - Phase 7bb: Optional — upstream update check
     - Phase 8: Print the "how this install was adapted to your
       setup" report

     Please resume at Phase 7a. Do NOT restart the wizard. Do NOT
     re-inspect my project (Phase 0 already ran). Do NOT re-ask
     for my scoping choice. Trust the state above. If any of this
     looks wrong or incomplete, stop and ask me.
     ```

     CRITICAL rules for building this resume prompt:

     - Fill in EVERY placeholder. Do not leave <project>, <name>,
       <handle>, etc. in the output. If a placeholder doesn't
       apply to the user's scoping choice (e.g. "team worker
       name" is only for option F), omit that line entirely
       rather than leaving an empty placeholder.
     - Never include actual API keys or secret values in the
       resume prompt. The prompt lists ENV VAR NAMES (like
       RECALL_API_KEY) but not their values. Secrets stay in the
       .env file and the user's shell.
     - Never include the URL sub-domain prefix leakage — use the
       full captured worker URL from Phase 5 exactly as deployed.
     - Keep it in a single fenced code block so the user can
       triple-click and copy the whole thing.

16c. Present the resume prompt to the user with this framing:

     "Setup is almost done. Before you restart Claude Code, here's
     a resume prompt that captures everything we've decided so far.
     Copy it and keep it somewhere — clipboard is fine, a temporary
     note is better. After you restart Claude Code, paste this
     prompt into the new session as your very first message.

     The new session won't remember any of this conversation, so
     the resume prompt is what lets the new Claude pick up where
     we left off without re-running the whole wizard.

     [resume prompt in a fenced code block]

     Ready? When you've copied it, I'll walk you through the
     restart and you can pick up from there."

     Wait for the user to confirm they've copied the prompt
     BEFORE moving to Phase 7.

Phase 7a — Connectivity check

17. Tell me to restart the MCP client. The restart is required so the
    new .mcp.json is loaded and the env vars resolve inside the MCP
    client. Give me these exact instructions, in this exact order,
    because the steps matter and the order matters:

    For Claude Code:

      a. Quit the current session completely: run /quit, or press
         Cmd+D (macOS) / Ctrl+D (Linux), or close the terminal.
         Do NOT just hit Cmd+C — that can leave a detached claude
         process alive which will confuse the restart.

      b. In the SAME terminal window (same shell instance): source
         the .env file so the env vars are in this process's
         environment:
           source .env        # or: source ~/.env if it's at home
         Verify it worked by running:
           echo "RECALL_API_KEY is ${RECALL_API_KEY:+set}${RECALL_API_KEY:-EMPTY}"
         You should see "set". If you see "EMPTY", the source
         command didn't work — check the .env path. For option F,
         also verify RECALL_TEAM_KEY and RECALL_PERSONAL_KEY.

         CRITICAL: do not open a new terminal tab or window to
         launch claude. Env vars do not propagate across shells.
         You must source .env in the exact shell you launch claude
         from.

      c. From the SAME shell, cd into the project directory and
         launch claude:
           cd <project-path>
           claude

      d. The new MCP server(s) should load automatically because
         step 14b pre-approved them in your ~/.claude.json trust
         state. You shouldn't see a trust prompt.

         If you DO see a trust prompt (e.g. because the pre-approval
         step failed, or your Claude Code version handles trust
         differently), approve it. Look for text like:
           "This project includes MCP server(s) defined in .mcp.json:
            - recall (http)
            Do you want to allow these servers?"
         Approve it. If you don't see the prompt but the server
         also isn't in /mcp, run /mcp right away — it will show
         you pending MCP servers that need approval.

    For Claude Desktop:

      a. Fully quit the app (Cmd+Q on macOS, or right-click the
         taskbar icon → Quit on Windows). Don't just close the
         window.
      b. Re-launch Claude Desktop. It reads its config file on
         launch, no env var gymnastics needed.
      c. Claude Desktop will prompt to trust new MCP servers on
         first use. Approve them.

    For Cursor / Windsurf / Cline:

      a. Restart the editor (fully quit + re-launch).
      b. Ensure env vars are set at the user level (in your
         ~/.zshrc or ~/.bashrc) — these editors usually inherit
         from the shell that launched them, which for GUI apps
         is the login shell, not an interactive one. If the env
         vars aren't in your profile, the substitution will fail
         silently.
      c. Approve any trust prompts when prompted.

    IMPORTANT: This is where the current Claude session ends. The
    new session starts empty and cannot continue the wizard without
    the resume prompt from step 16b. Tell the user to paste it as
    their first message in the new session.

17a. (Runs in the NEW Claude Code session, after the user pastes
     the resume prompt.) Acknowledge the resume prompt, read back
     the state as a 3-line summary ("Here's what I see: you chose
     scoping option X, deployed workers A and B, and are ready for
     Phase 7a connectivity check"), and ask the user to confirm it
     matches what they remember from the previous session. This
     catches copy-paste truncation.

17b. Run /mcp (in Claude Code) or the equivalent. Check whether
     `recall` shows as connected. For multi-instance setups
     (C, D, F), check each one separately — in option F, both
     `recall-team` and `recall-personal` must show as connected.

     If everything is connected: great, proceed to step 18.
     If anything is missing or not connected: go to step 17c.

17c. DIAGNOSTIC FLOW — the memory server isn't visible in /mcp.
     This is the #1 failure point in the wizard and it's usually
     one of five specific causes. Diagnose them in this order, one
     at a time, until you find the problem. Do NOT jump to the
     next step until the current one is confirmed.

     Cause 1: Trust state in ~/.claude.json didn't stick.
       Step 14b should have pre-approved the server by adding
       it to enabledMcpjsonServers under the project path in
       ~/.claude.json. If that step was skipped, failed, or the
       user previously denied the same server name in a prior
       install attempt (and it ended up in disabledMcpjsonServers),
       the new session won't load it.

       Check: read ~/.claude.json, find the projects.<path> entry
       for the current project. Report back what's in
       enabledMcpjsonServers and disabledMcpjsonServers for that
       project. If `recall` (or the option F names) is in
       disabledMcpjsonServers, that's the problem. Fix: re-run
       step 14b's logic — remove from disabled, add to enabled,
       write the file back, restart claude.

       If `recall` isn't in either list and also isn't visible
       in /mcp, that means Claude Code didn't even detect the
       .mcp.json entry on startup. Proceed to Cause 3.

     Cause 2: Env var not set in the current shell.
       If the user sourced .env in a different terminal than the
       one they launched claude from, the ${RECALL_API_KEY}
       substitution in .mcp.json failed. Claude Code tries to
       connect with a literal "${RECALL_API_KEY}" as the bearer
       token, the server returns 401, and the client drops the
       connection.

       Check: ask the user to run this in the terminal they
       launched claude from (NOT a fresh terminal):
         echo "${RECALL_API_KEY:+set}${RECALL_API_KEY:-EMPTY}"
       If it says EMPTY, this is the cause. Fix: quit claude,
       source .env in this shell, relaunch.

       For option F: also check RECALL_TEAM_KEY and
       RECALL_PERSONAL_KEY. Both must be set.

     Cause 3: .mcp.json in wrong location or malformed.
       The wizard writes to the project root. If the user
       launched claude from a different directory, it won't find
       the file. If an earlier edit broke the JSON, Claude Code
       silently skips it.

       Check: ask the user to run:
         cat .mcp.json | python3 -m json.tool > /dev/null && echo OK || echo BROKEN
       (Or use node -e "JSON.parse(require('fs').readFileSync('.mcp.json'))" if python3 is unavailable.)

       If BROKEN: ask them to paste the output of cat .mcp.json.
       You'll see the parse error. Fix it. Usually a missing
       comma, a stray trailing comma, or an unescaped quote in
       the URL.

       If the file doesn't exist in the current directory: the
       user launched claude from the wrong place. Tell them to
       cd into the project root (where the setup wizard wrote
       the file) and re-launch claude from there.

     Cause 4: Missing `type: "http"` field.
       HTTP-transport MCP servers in .mcp.json need an explicit
       type field. Without it, Claude Code may default to stdio
       and fail silently trying to spawn a process.

       Check: ask the user to show the `recall` entry from
       .mcp.json. Look for `"type": "http"`. If missing, add it.

     Cause 5: The server is actually down or the URL is wrong.
       Rare, but possible if the deployed worker URL got
       captured wrong in step 11 or if the worker was manually
       deleted.

       Check: ask the user to run (in Bash, not WebFetch):
         curl -s -o /dev/null -w "%{http_code}\n" \
           -X POST "$RECALL_URL/mcp" \
           -H "Authorization: Bearer $RECALL_API_KEY" \
           -H "Content-Type: application/json" \
           -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
       Where $RECALL_URL is the worker URL from the resume
       prompt and $RECALL_API_KEY is from the current shell.
       Expected: 200. If you see 401, the auth/env var is
       wrong (back to cause 2). If 404, the URL is wrong. If
       no response, the worker is down — check
       `npx wrangler tail` or the Cloudflare dashboard.

     After fixing whichever cause applied: ask the user to quit
     claude (/quit), verify the env vars are still set in that
     shell, and re-launch. Then go back to step 17b.

     If you try all five causes and /mcp still doesn't show
     recall, STOP. Tell the user to report the issue at
     https://github.com/cashcon57/recall/issues with the
     output of: `cat .mcp.json`, `echo $RECALL_API_KEY | wc -c`,
     `/mcp` output, and which MCP client they're using.

18. Call recall's list_memories tool to confirm it works end to end. It
    should return "No memories stored yet" or similar.

Phase 7b — Functional smoke test (prove the full pipeline actually works)

This phase catches failure modes that a trivial one-memory store/retrieve
won't: silent reranker failures, broken metadata indexes, missing security
gates, wrong region for Workers AI, etc. Do NOT skip it. Run it from inside
my MCP client using the `recall` tools — don't curl unless I explicitly
say so.

19. Store three topically distinct memories so hybrid search has real
    ranking work to do. Use content relevant to my project (pulled from
    Phase 0) when possible, but it's fine to use these defaults:

    Memory 1:
      key: "smoke-test-database"
      content: "Postgres connection pools exhaust under burst load when
        clients don't release connections back to the pool. Always use
        transaction-scoped acquire/release, never request-scoped."
      tags: ["database", "postgres", "performance"]
      importance: 0.7
      author: <my handle>

    Memory 2:
      key: "smoke-test-animation"
      content: "React Native Reanimated worklets cannot close over JS
        thread variables directly. Use shared values or pass primitives
        as arguments. Otherwise you get cryptic 'not a function' errors
        at runtime."
      tags: ["mobile", "react-native", "gotcha"]
      importance: 0.8
      author: <my handle>

    Memory 3:
      key: "smoke-test-rerank"
      content: "Cross-encoder reranking truncates memory content to
        512 chars before scoring, cutting token usage 10 to 50x with
        negligible accuracy loss. The final score combines reranker,
        recency decay, and importance."
      tags: ["architecture", "search", "performance"]
      importance: 0.6
      author: <my handle>

    Confirm each store_memory returned success. Report the 3 keys back
    to me.

20. Test keyword (BM25) path: retrieve with query "postgres connection
    pool". This should rank Memory 1 first — it contains those exact
    words. If Memory 1 isn't first, FTS5 BM25 is broken. Diagnose
    before moving on.

21. Test vector (semantic) path: retrieve with query "worklet closure
    gotcha". This is a paraphrase of Memory 2's content — the exact
    words don't match, but the meaning does. Memory 2 should be in the
    top 2. If it's not, the embedding or Vectorize path is broken.

22. Test rerank path: retrieve with query "how does cross-encoder
    scoring work here". Memory 3 should be #1 AND its combined score
    should be meaningfully higher than Memory 1 or 2 for this query.
    If all three come back with nearly-identical scores, the reranker
    silently failed and the ranking collapsed to fusion + recency only
    — a known degrade path. Tell me if this happens.

23. Test metadata filter: retrieve with query "gotcha" and
    min_importance=0.75. Only Memory 2 (importance 0.8) should come
    back. If Memories 1 (0.7) or 3 (0.6) appear, the importance
    metadata index on Vectorize isn't working.

24. Test delete_memory: delete "smoke-test-rerank". Then call
    list_memories and confirm only 2 memories remain. Then retrieve
    with the Memory 3 query again — it should no longer appear.

25. Test destructive-tool gate: call clear_memories with {"confirm": true}.
    It MUST return an error message mentioning "ALLOW_DESTRUCTIVE_TOOLS"
    or "disabled". If it actually wipes the store, the security gate is
    broken and we need to roll back immediately. Report the result.

26. Test auth rejection: use Bash/curl to send a request with a bogus
    bearer token:
      curl -s -o /dev/null -w "%{http_code}" -X POST "$WORKER_URL/mcp" \
        -H "Authorization: Bearer wrong-key-abc123" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
    Expected output: 401. If it's 200, auth is bypassed and we have a
    critical problem. Stop and diagnose before anything else.

27. Cleanup the smoke-test memories: delete "smoke-test-database" and
    "smoke-test-animation". Confirm list_memories is empty again.

28. Report the functional smoke test results as a table:
    - BM25 keyword hit: pass/fail
    - Vector semantic hit: pass/fail
    - Rerank score variance: pass/fail
    - Importance metadata filter: pass/fail
    - delete_memory: pass/fail
    - clear_memories gate: pass/fail
    - Auth 401 on bad token: pass/fail
    If anything failed, STOP the wizard and help me diagnose. Do not
    advance to Phase 7c.

Phase 7bb — Optional: periodic upstream update checks

This phase is entirely optional. Skip it cleanly if the user says no
and do not treat "no" as an odd or discouraged choice. Some users
prefer to pin a version forever and never hear about upstream; that
is a legitimate preference, not something to argue about.

What this phase would install if the user says yes: a lightweight
client-side mechanism that future Claude sessions use to check
upstream for new version tags and offer a context-aware update flow
(the full three-stage detect/contextualize/offer process documented
below). It is NOT server-side auto-update. The Recall worker deployed
to the user's Cloudflare account is immutable until re-deployed. This
is a reminder pointer, not an automatic patch system.

Ask me neutrally, without a suggested default:

"One more optional thing: do you want future Claude sessions in this
project to check for Recall updates every couple days? Pros: you
hear about security fixes, performance improvements, and new features
so you can opt into them. Cons: one more thing in your CLAUDE.md,
one more file in your project root, and a tiny WebFetch every few
days. Totally fine to say no — you can always manually check later
by just asking Claude 'any Recall updates?'."

Wait for a clear yes or no. No default. No nudge either way. If I
ask clarifying questions, answer them honestly. If I say no, skip
to Phase 7c and do not bring it up again. If I say yes, do all three:

(a) Append the update-check rulebook to CLAUDE.md (project root):

```text
## Recall update check (once per ~2 days)

Recall is pinned to a version tag, tracked in the file
.recall-installed-version at the project root. New versions ship
security fixes, performance improvements, and new features.

At the start of a Claude Code session, if more than 2 days have
passed since the timestamp in .recall-installed-version, run the
update check. Never block or delay an in-progress task to run it —
check at session start only, in the first idle moment, never
mid-task.

The update check is NOT "run an upgrade." It is a THREE-STAGE
process: detect, contextualize, then offer.

STAGE 1 — Detect

1. WebFetch https://api.github.com/repos/cashcon57/recall/releases/latest
   and parse the tag_name field.
2. Compare to the pinned=... line in .recall-installed-version.
3. If upstream is the same as pinned: update only the last-checked
   timestamp in .recall-installed-version and move on silently. Do
   NOT mention the check to the user.
4. If upstream is newer: proceed to Stage 2.

STAGE 2 — Contextualize the update for THIS user's project

Do NOT show the user a generic "new version available" prompt.
Before saying anything to the user, do this homework:

5. WebFetch the release notes for the new tag:
   https://api.github.com/repos/cashcon57/recall/releases/latest
   Parse the "body" field — it's markdown, use it directly.
6. WebFetch the CHANGELOG or compare view between the user's
   pinned tag and the new tag:
   https://github.com/cashcon57/recall/compare/<pinned>...<newtag>
   Read the commit messages to understand what actually changed.
7. Re-inspect the user's current project the same way Phase 0 did
   on first install: package.json, CLAUDE.md, .mcp.json, rough
   directory structure. You want to know what kind of project
   this is NOW — it might have changed since install.
8. For each notable change in the release, decide whether it
   applies to THIS user's project. Ask yourself:
   - Is this a security fix? (Always applies. Mark as high priority.)
   - Is this a performance improvement to a path the user actually
     hits? (e.g., reranker token savings → yes if they retrieve
     often; new feature for team mode → no if they're solo.)
   - Is this a new scoping option or wizard phase they opted out
     of? (Probably irrelevant to their setup.)
   - Is this a bug fix for a code path they use?

9. Build a user-facing summary with THREE parts:
   a. What's in the update (1-2 sentences, plain language, no jargon)
   b. Whether it helps THIS project specifically, and why (or why not)
   c. What updating would actually do to their setup (re-deploy
      the worker, re-run smoke test, refresh CLAUDE.md rulebook,
      etc.). Be specific — don't say "it'll update things."

   Example of a good contextualized prompt:

   "Recall v1.1.2 shipped. Here's what changed and whether it
   matters for you:

   - Security: hashed rate-limit bucket now uses SHA-512 instead
     of SHA-256. This is a minor hardening improvement. You're
     currently on v1.0.0 which uses SHA-256 — still secure, but
     this tightens it.
   - Feature: the wizard now supports scoping option G (per-team
     regional replicas). You're on option B (shared pool across
     your mono-repo), so this doesn't apply to you.
   - Fix: the reranker fallback now handles empty result sets
     correctly. You WILL benefit from this — I've seen your
     retrieve queries return empty sets a few times this month.

   What updating would do for your setup:
   - Re-deploy the worker to your existing recall D1 instance
     (no data loss, no key rotation required)
   - Re-run the Phase 7b functional smoke test against the new
     worker
   - Refresh the Memory Usage section in CLAUDE.md in case the
     rulebook changed (it didn't this release)

   Total time: about 2 minutes. Want me to proceed?"

   Example of a BAD prompt (do not do this):

   "A new version of Recall is available: v1.1.2. Want to update?"

   (That's what v1.0.0 did and it's useless. Always contextualize.)

STAGE 3 — Offer, adapt, apply

10. If the user says yes:
    a. Fetch SETUP_PROMPTS.md at the NEW tag, not main.
    b. Run ONLY the phases the release notes indicate are
       necessary. Don't re-run the full wizard unless the release
       explicitly says full re-install is required. Typical
       update: Phase 5 (re-deploy with new code) + Phase 7b
       (smoke test) + Phase 7c rulebook refresh if changed.
    c. Adapt every instruction to this user's project, the same
       way Phase 0 does on first install. If the new tag added a
       deploy-time decision (e.g., "do you want to enable
       feature X?"), ask the user BEFORE applying it, with a
       project-aware recommendation.
    d. Update .recall-installed-version with the new tag and
       today's date after a successful update.
    e. Append a one-line note to CLAUDE.md's "Adaptations log"
       section (if one exists) summarizing what was updated.

11. If the user says no (or "remind me later"):
    a. Update only the last-checked field in .recall-installed-version
       so the check doesn't fire again for 14 more days.
    b. Do NOT pester the user about the same version again.
    c. If a user says "never ask about Recall updates again",
       delete the update-check section from CLAUDE.md and stop.

12. If the release notes mention a SECURITY fix AND the user
    declines the update: tell the user clearly which fix they
    are skipping and the risk in one sentence. Do not argue
    further, but make sure they understood what they declined.
```

(b) Create the pointer file `.recall-installed-version` at the project
root with exactly two lines:

```text
pinned=v1.0.0
last-checked=2026-04-11
```

Replace `v1.0.0` with whatever tag the user actually installed from,
and the date with today's ISO date.

(c) Add `.recall-installed-version` to `.gitignore`. This file is
per-machine state, not shared config. Each teammate's timestamp is
independent.

After the three edits, tell the user: "The update check is passive.
Future Claude sessions will ping the repo every 2 days, tell you if
something new shipped, and let you decide whether to update. You can
always manually force a check by telling Claude 'check for Recall
updates'."

Phase 7c — Teach Claude to use it

29. Offer to run the "teach Claude to use Recall" prompt from
    SETUP_PROMPTS.md (Prompt 2) now, which adds a Memory Usage section
    to this project's CLAUDE.md. Wait for my answer.

    If I chose scoping F, use the F-specific variant of the rulebook
    that includes server routing rules (team vs personal pool). See
    "CLAUDE.md rulebook — option F variant" below.

30. If I used scoping B, C, D, or F (multi-repo or multi-server),
    offer to run the appropriate rulebook variant in each additional
    repo so all of them get the same Memory Usage section.

### CLAUDE.md rulebook — option F variant (team + per-user personal pool)

For scoping F specifically, the Memory Usage section in CLAUDE.md
must teach Claude when to use `recall-team` vs `recall-personal`.
Insert this block (adapted to the user's handles) into CLAUDE.md:

```text
## Memory Usage (Recall, team + personal pools)

This project uses two Recall memory instances:

- `recall-team` — shared across all teammates. Everyone reads and
  writes. Use for anything the whole team benefits from.
- `recall-personal` — private to me only. Nobody else on the team
  can see it. Use for my individual preferences and one-off notes.

### When to retrieve

Query BOTH servers at the start of any non-trivial task. Merge
results. If a personal entry contradicts a team entry on a style
or preference question, the personal entry wins for me. On factual
questions (gotchas, architecture), the team entry wins.

Practical rule: for every retrieve_memory call, fire two — one
against each server — and combine them. If Claude Code's tool
namespace distinguishes them as recall-team.retrieve_memory and
recall-personal.retrieve_memory, call both explicitly.

### When to store — pick the right server

Store in `recall-team` when the memory is:
- A gotcha, bug root cause, or cross-file invariant
- An architectural decision the whole team should know
- A convention that applies to everyone touching the codebase
- Anything the user explicitly says "remember this for the team"

Store in `recall-personal` when the memory is:
- My individual preference ("I prefer X over Y", "don't do Z for me")
- A workflow quirk specific to my machine or style
- A one-off note I don't want to bother teammates with
- Anything the user says "remember this just for me" or
  "this is a personal thing" or "note to self"

If unsure, ASK the user: "Should I store this as a team memory
everyone sees, or a personal one only you see?"

### Don't store secrets in either pool

Neither server is encrypted at rest. The team key is shared. The
personal key is yours alone but still stored on disk. Secrets go
in a secret manager, not memories.

### Team mode privacy guarantee

`recall-personal` uses a separate API key that only I have. My
teammates literally cannot connect to it. This is the ONE place
in the Recall setup where privacy between teammates is enforced
by code, not convention. Use it accordingly — but don't rely on
it for anything you wouldn't be OK with being visible if your
machine is ever shared or inspected.
```

When scoping F is used, the Phase 7d cleanup pass should also
split destinations per memory: team-relevant gotchas go to
recall-team, personal preferences go to recall-personal. Ask
the user row-by-row when the destination is ambiguous.

Phase 7d — Context file cleanup and optimization

This phase migrates the user's existing local context files (CLAUDE.md,
memory.md, notes.md, gotchas.md, etc.) to work WITH Recall instead of
duplicating it. It is destructive and requires explicit consent at
multiple gates. NEVER edit or delete any file without the user's
explicit approval first.

31. Explain why this matters to the user in plain language. Adapt the
    phrasing based on what you find but hit these beats:

    "Now that Recall is set up and working, your existing CLAUDE.md
    and any other context files you've been using overlap with what
    Recall can do on demand. Every time Claude turns, the full
    contents of CLAUDE.md are pulled into context and you pay tokens
    on all of it, even the parts that don't apply to what you're
    currently doing. Recall is the opposite: memories only load when
    a retrieve_memory call finds them relevant. That's the whole
    point. If we don't clean up the local files, you'll be paying
    twice for the same information, and worse, Claude might get
    confused about which source is authoritative.

    I'd like to do a cleanup pass. I'll find all of your context
    files, categorize every section into KEEP / MOVE-TO-RECALL /
    DELETE, show you the plan, and only make changes after you
    approve. Want me to proceed?"

    Wait for explicit yes/no. If no, skip to Phase 8.

32. Discovery: find all context files in scope. Check:
    - ./CLAUDE.md (project root)
    - Any CLAUDE.md in subdirectories (monorepos often have several)
    - ~/.claude/CLAUDE.md (user-level)
    - Any memory.md, notes.md, gotchas.md, decisions.md, context.md,
      architecture.md, lessons.md, or similarly named files in the
      repo (grep for them)
    - .cursor/rules, .github/copilot-instructions.md, AGENTS.md, or
      any other editor-specific context files
    - For scoping B/C: the same sweep across each wired-in repo

    Report the list back as a table:
      | File | Size | Last modified | Likely purpose |

    If any file is larger than 4 KB, flag it explicitly as a
    "token-expensive" hot path.

33. Tell me WHAT IS WRONG with the current setup, specifically. Read
    each file and give me concrete examples of problems. Don't be
    vague. Use language like:

    "Looking at your CLAUDE.md, here's what I see that's suboptimal:

    Line 42–58: You have a 'Known Gotchas' section with 6 entries.
    Every turn, Claude reads all 6 even if none apply to what I'm
    doing. At ~600 tokens x 300 turns/day, that's 180K tokens/day
    you're paying for context you don't need. These belong in
    Recall so they only load when relevant.

    Line 80–95: You have a bulleted list of 'Files to check' with
    exact paths and line numbers. This is derivable from the code
    itself via grep. Stale the moment someone refactors. Delete.

    Line 15: 'The codebase uses React 19.2 with TypeScript 5.x.'
    This is in package.json. Redundant and will go stale. Delete.

    Line 110–125: 'Deploy process: run npm run deploy then ...' —
    this is always-on workflow, should stay in CLAUDE.md.

    Your gotchas.md is 12 KB of debugging war stories from the
    last 3 months. These are great Recall material — searchable
    when relevant, invisible otherwise. The entire file should
    migrate."

    Be specific. Quote line numbers. Estimate token cost where you
    can. The user needs to see concretely why the current setup is
    hurting them, not a generic lecture.

34. Present the proposed plan as an explicit THREE-BUCKET table.
    Do NOT touch any file yet. The table format:

    | File | Section/Lines | Bucket | What I'll do | Why |
    |------|---------------|--------|--------------|-----|
    | CLAUDE.md | L42-58 Gotchas | MOVE | 6 store_memory calls | Only pay cost on retrieve |
    | CLAUDE.md | L80-95 File paths | DELETE | Remove section | Derivable via grep |
    | CLAUDE.md | L15 Tech stack | DELETE | Remove line | In package.json |
    | CLAUDE.md | L110-125 Deploy | KEEP | No change | Always-on workflow |
    | gotchas.md | Entire file | MOVE | ~15 store_memory calls + rm file | Situational, not always-on |
    | notes.md | L1-30 TODO list | KEEP AS-IS | Not my business | Your scratchpad, not context |
    | memory.md | L1-end | DELETE | Redundant with Recall | Superseded by this server |

    For each MOVE row, also show:
    - The proposed memory key
    - The proposed tags
    - The proposed importance score
    - The proposed author handle
    - A preview of the first ~100 chars of the content

35. Ask for section-by-section approval, not a blanket yes. Go through
    the table row by row:

    "For CLAUDE.md lines 42-58 (Gotchas section), I want to create
    6 separate memories:
    1. 'neon-citext-migration-order' — database, migration, gotcha
    2. 'react-native-worklet-closures' — mobile, gotcha
    3. ...
    Then delete those lines from CLAUDE.md. OK to proceed with
    these 6 stores and the deletion?"

    Wait for yes/no/edit PER ROW. Let me:
    - Approve as-is
    - Modify (change key/tags/importance/wording)
    - Skip this row
    - Move to a different bucket

    Do NOT batch approvals. The user needs to see each change.

36. Execute approved changes. Rules:
    - Store memories FIRST, delete from files SECOND. Never delete
      before the memory is safely stored.
    - After each store_memory, verify the return value and confirm
      the memory is retrievable before editing any file.
    - Use `git diff` (if the file is tracked) or a backup copy (if
      not) to show me exactly what's being removed before the
      destructive step.
    - If any store_memory fails, HALT — do not continue with the
      delete-from-file step for that section.
    - For DELETE buckets, show me a preview of the file before/after
      and ask for final confirmation before writing.

37. Warn about secrets. If you see anything in the source files that
    looks like an API key, password, JWT, connection string, or
    other credential, STOP immediately and surface it:

    "I see something on line X that looks like a secret. I will
    NOT store this in Recall — Recall isn't encrypted at rest and
    has a shared API key. Delete this from the file manually and
    move it to a secret manager. I'm skipping this row."

38. Handle auto-memory carefully. Claude Code's built-in per-project
    auto-memory at ~/.claude/projects/<project>/memory/ overlaps with
    Recall but serves a different purpose (local session state, not
    shared, not hybrid-searched). Rule: leave it alone unless the
    user specifically asks to consolidate. If they do ask, walk them
    through retrieving notable entries, storing the useful ones in
    Recall via store_memory, and letting the local files age out
    naturally. Do NOT delete ~/.claude/projects/*/memory/ files.

39. After all approved changes are applied, run a verification pass:
    - Show me the new CLAUDE.md size in bytes and estimated tokens
      per turn
    - Show me how many memories were created in Recall during cleanup
    - Estimate the tokens-per-day saved at my typical usage (ask me
      how many Claude turns I average per day if I haven't said)
    - Run list_memories to confirm everything landed

40. If I used scoping B/C/D (multi-repo), offer to run the same
    cleanup pass on each other repo. Each one is a separate
    Phase 7d loop, with its own discovery / plan / approval /
    execution cycle. Do NOT batch across repos.

41. Commit the cleanup changes (if the files are in a git repo) with
    a descriptive message. Ask for approval on the commit message
    and whether to commit now or leave it staged.

    Example commit message:
    "Migrate CLAUDE.md gotchas to Recall MCP memory

    - Moved 6 gotchas sections to Recall (keys: neon-citext-*,
      react-native-worklet-*, auth-rotation, etc.)
    - Deleted 3 derivable/stale sections (tech stack list, file
      paths, version numbers)
    - Kept deploy workflow, code conventions, hard rules
    - Shrunk CLAUDE.md from 4.2 KB to 1.1 KB (~750 tokens/turn saved
      at ~200 turns/day = 150K tokens/day)"

Rules for Phase 7d:
- Never edit a file without showing me the change preview first.
- Never batch approvals. Row by row.
- Never store secrets. Halt and warn.
- Never delete a file until its migrated memories are confirmed
  retrievable from Recall.
- Respect the user saying "skip" or "no" on any row.
- If the user says no to the whole phase, skip cleanly to Phase 8.

Phase 8 — Optimization report (print this last, not first)

42. Print an "Optimized for your setup" summary. Use the adaptations
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

43. If Phase 7d ran, include a cleanup summary section at the
    bottom of the report:

    ### Cleanup pass results
    - Files touched: <list>
    - Memories migrated: <count>
    - Sections deleted: <count>
    - CLAUDE.md shrunk from <old size> to <new size>
    - Estimated tokens saved per day: <number, based on my
      confirmed turns-per-day>

    Only include this section if Phase 7d actually ran and
    made changes. Skip entirely if the user declined the cleanup.

44. End the report with ONE line telling me what to do next:
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
