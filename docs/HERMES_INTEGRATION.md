# Hermes Integration Guide

This guide describes a recommended pattern for using one Recall instance as Hermes Agent's durable memory backend across projects.

## One Recall instance for Hermes

For a solo operator or trusted personal automation setup, run one Recall instance and use namespaces to separate scopes instead of deploying a worker per project.

Recommended namespaces:

- `global` — durable facts and preferences that apply everywhere.
- `hermes` — Hermes Agent configuration, skills, profiles, workflows, and agent behavior notes.
- `switchr` — Switchr-specific product, infra, and codebase memories.
- `corkscrew` — Corkscrew-specific product, infra, and codebase memories.
- `oss-dashboard` — OSS dashboard project memories.
- `retro` — retrospectives, mistakes, release notes, and lessons learned.
- `research` — reusable research notes, vendor comparisons, and investigation results.

Namespaces are a retrieval filter, not an access-control boundary. Anyone with the Recall API key can read/write any namespace.

## Provenance for Discord-originated memory

Hermes can store memories that came from Discord, but the memory should carry enough provenance for future agents to understand where it came from.

Suggested source/provenance pattern:

```json
{
  "source_type": "chat",
  "source_url": "https://discord.com/channels/<guild-id>/<channel-id>/<message-id>",
  "source_title": "#channel-name / thread title",
  "tags": ["discord", "decision"],
  "namespace": "hermes"
}
```

For thread discussions, include both the parent channel and thread name in `source_title`, and include a short quote or summary in the memory content. Avoid storing private message content unless you actually want it in long-term agent memory.

### Limitation: no implicit Discord history reconstruction

Recall only knows what was explicitly stored. Hermes cannot reconstruct a Discord channel or thread history from Recall unless messages, decisions, or summaries were saved into Recall at the time (or imported later). Store durable summaries, not raw chat logs, unless raw logs are explicitly needed.

## MCP config without putting the API key in config.yaml

Prefer a tiny wrapper script that reads the API key from a local file or secret manager and launches the MCP bridge. This keeps `config.yaml` generic and avoids committing secrets.

Example wrapper (`~/bin/recall-mcp`):

```bash
#!/usr/bin/env bash
set -euo pipefail
RECALL_URL="${RECALL_URL:-https://your-worker.workers.dev/mcp}"
KEY_FILE="${RECALL_KEY_FILE:-$HOME/.config/recall/api-key}"
if [[ -z "${RECALL_API_KEY:-}" ]]; then
  RECALL_API_KEY="$(tr -d '\r\n' < "$KEY_FILE")"
fi
exec npx -y mcp-remote "$RECALL_URL" \
  --header "Authorization: Bearer ${RECALL_API_KEY}"
```

Hermes MCP config pattern:

```yaml
mcp_servers:
  recall:
    command: /home/you/bin/recall-mcp
    args: []
```

Do not paste the real API key into shared config. If you need to show examples in docs, use `Bearer <redacted>` or `Bearer your-api-key-here`.

## Memory routing rules

Use these conventions when Hermes decides where to store or retrieve memory:

1. Store cross-project personal preferences in `global`.
2. Store Hermes setup, MCP, skill, plugin, cron, and profile behavior in `hermes`.
3. Store project-specific code/infra/product facts in that project's namespace.
4. Store postmortems, mistakes, and durable lessons in `retro`, with project tags when relevant.
5. Store reusable vendor/library/API research in `research`.
6. Never store API keys, passwords, private keys, session cookies, or recovery codes.
7. Prefer memories with provenance: source type, URL/path, title, line range, or Discord channel/thread reference.
8. Mark decisions with a `decision` tag and write the rationale in the content.
9. Supersede stale memories rather than silently overwriting when the old fact may still explain past behavior.
10. Use `confidence`, `verified_at`, and expiration fields for facts that may go stale.

## Cron examples

Weekly Recall update check (non-mutating):

```cron
0 4 * * 1 cd /path/to/recall && ./recall-update.sh --check >> .recall-update/cron.log 2>&1
```

Weekly consolidation report through the deployed worker is configured in `wrangler.toml`:

```toml
[triggers]
crons = ["0 3 * * SUN"]
```

A Hermes-side reminder can retrieve the latest `_system.consolidation-report`, review stale/similar candidates, and ask before deleting or superseding anything.
