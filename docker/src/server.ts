// docker/src/server.ts
// HTTP MCP server for Recall — same wire protocol as CF Workers deployment.
// Add to Claude Code .mcp.json:
//   "recall-docker": {
//     "url": "http://localhost:8788",
//     "headers": { "Authorization": "Bearer <MEMORY_API_KEY>" }
//   }

import { createServer } from 'http';
import { DockerAdapter } from './adapter.js';
import { handleMcpRequestWithAdapter, parseJsonRpc } from '../../src/mcp.js';

const PORT = parseInt(process.env.PORT ?? '8788');
const API_KEY = process.env.MEMORY_API_KEY ?? 'local-dev';

let adapter: DockerAdapter;
try {
  adapter = new DockerAdapter();
  process.stderr.write(`recall-docker connecting to Postgres...\n`);
} catch (e) {
  const errMsg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`recall-docker startup failed: ${errMsg}\n`);
  process.exit(1);
}

const server = createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405); res.end(); return;
  }

  const authHeader = req.headers['authorization'] ?? '';
  if (authHeader !== `Bearer ${API_KEY}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  let body = '';
  req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
  req.on('end', async () => {
    try {
      const parsed = parseJsonRpc(JSON.parse(body));

      if (Array.isArray(parsed)) {
        const responses = [];
        for (const req of parsed) {
          const resp = await handleMcpRequestWithAdapter(req, adapter);
          if (resp) responses.push(resp);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responses));
      } else {
        const response = await handleMcpRequestWithAdapter(parsed, adapter);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad request' }));
    }
  });
});

server.listen(PORT, () => {
  process.stderr.write(`recall-docker listening on :${PORT}\n`);
});
