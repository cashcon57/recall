// local/src/server.ts
// Stdio MCP server for Recall. Reads JSON-RPC from stdin, writes to stdout.
// Add to Claude Code .mcp.json:
//   "recall-local": {
//     "command": "node",
//     "args": ["/path/to/recall/local/dist/server.js"],
//     "env": { "RECALL_DB_PATH": "~/.recall/recall.db", "MEMORY_API_KEY": "..." }
//   }

import { LocalAdapter } from './adapter.js';
import { handleMcpRequestWithAdapter, parseJsonRpc } from '../../src/mcp.js';
import { resolve } from 'path';
import { homedir } from 'os';
import * as readline from 'readline';
import { mkdirSync } from 'fs';

const DB_PATH = process.env.RECALL_DB_PATH ?? resolve(homedir(), '.recall', 'recall.db');

// Ensure DB directory exists
mkdirSync(resolve(DB_PATH, '..'), { recursive: true });

const adapter = new LocalAdapter(DB_PATH);

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const body = JSON.parse(trimmed);
    const parsed = parseJsonRpc(body);

    if (Array.isArray(parsed)) {
      const responses = [];
      for (const req of parsed) {
        const resp = await handleMcpRequestWithAdapter(req, adapter);
        if (resp) responses.push(resp);
      }
      if (responses.length) process.stdout.write(JSON.stringify(responses) + '\n');
    } else {
      const response = await handleMcpRequestWithAdapter(parsed, adapter);
      if (response) process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (_e) {
    const errResp = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
    process.stdout.write(JSON.stringify(errResp) + '\n');
  }
});

rl.on('close', () => process.exit(0));

// Write startup message to STDERR (not stdout — stdout is for MCP protocol)
process.stderr.write(`recall-local started. DB: ${DB_PATH}\n`);
