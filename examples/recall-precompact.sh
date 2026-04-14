#!/usr/bin/env bash
# recall-precompact.sh — Claude Code PreCompact hook
#
# Fires before context window compression. Reads the conversation summary
# from stdin (Claude Code injects it as JSON) and stores it as an episodic
# memory in Recall so context is not lost after compaction.
#
# Install:
#   chmod +x recall-precompact.sh
#   Add to ~/.claude/settings.json:
#     "hooks": {
#       "PreCompact": [{"matcher": "", "hooks": [{"type": "command", "command": "/path/to/recall-precompact.sh"}]}]
#     }
#
# Required env vars:
#   RECALL_URL      e.g. https://recall-agentboard.cashcon57.workers.dev
#   RECALL_API_KEY  your Recall bearer token

# NOTE: This hook is for CLAUDE CODE ONLY.
# Codex users: save memories manually with store_memory (see examples/AGENTS.md).

set -euo pipefail

RECALL_URL="${RECALL_URL:?RECALL_URL not set}"
RECALL_API_KEY="${RECALL_API_KEY:?RECALL_API_KEY not set}"

# Read JSON from stdin, extract summary field
INPUT=$(cat)
SUMMARY=$(python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('summary',''))" <<< "$INPUT" 2>/dev/null || true)

[ -z "$SUMMARY" ] && exit 0

KEY="session.precompact.$(date -u +"%Y%m%d-%H%M%S")"

# Write payload to temp file to avoid any shell interpolation in the body
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

python3 - "$KEY" <<< "$SUMMARY" > "$TMPFILE" << 'PYEOF'
import sys, json
key = sys.argv[1]
content = sys.stdin.read().strip()
payload = {
    "jsonrpc": "2.0", "id": 1,
    "method": "tools/call",
    "params": {
        "name": "store_memory",
        "arguments": {
            "key": key,
            "content": content,
            "author": "precompact-hook",
            "memory_type": "episodic",
            "importance": 0.6,
            "tags": ["session", "precompact", "auto"]
        }
    }
}
print(json.dumps(payload))
PYEOF

curl -sf -X POST "${RECALL_URL}/mcp" \
  -H "Authorization: Bearer ${RECALL_API_KEY}" \
  -H "Content-Type: application/json" \
  --data-binary "@${TMPFILE}" > /dev/null

exit 0
