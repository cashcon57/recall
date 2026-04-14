// docker/src/server.ts
// HTTP MCP server for Recall — same wire protocol as CF Workers deployment.
// Add to Claude Code .mcp.json:
//   "recall-docker": {
//     "url": "http://localhost:8788/mcp",
//     "headers": { "Authorization": "Bearer <MEMORY_API_KEY>" }
//   }

import { createServer } from 'http';
import { URL } from 'url';
import { timingSafeEqual } from 'crypto';
import { DockerAdapter } from './adapter.js';
import { handleMcpRequestWithAdapter, parseJsonRpc } from '../../src/mcp.js';

const PORT = parseInt(process.env.PORT ?? '8788');
const API_KEY = process.env.MEMORY_API_KEY ?? 'local-dev';
if (!process.env.MEMORY_API_KEY) {
  process.stderr.write('[recall-docker] WARNING: MEMORY_API_KEY not set — using insecure default "local-dev"\n');
}

const MAX_BODY_BYTES = 1_000_000;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function verifyAuth(authHeader: string): boolean {
  const expected = `Bearer ${API_KEY}`;
  if (authHeader.length !== expected.length) return false;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  return timingSafeEqual(a, b);
}

let adapter: DockerAdapter;
try {
  adapter = new DockerAdapter();
  await adapter.init();
  process.stderr.write(`recall-docker started, connecting to Postgres. Listening on :${PORT}\n`);
} catch (e) {
  const errMsg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`recall-docker startup failed: ${errMsg}\n`);
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method !== 'POST' || url.pathname !== '/mcp') {
    res.writeHead(404); res.end(); return;
  }

  const authHeader = req.headers['authorization'] ?? '';
  if (!verifyAuth(authHeader)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  if (!checkRateLimit(authHeader)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Rate limit exceeded. Max ${RATE_LIMIT} requests per minute.` }));
    return;
  }

  let body = '';
  req.on('error', (_err) => {
    if (!res.headersSent) { res.writeHead(400); res.end(); }
  });
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
    if (body.length > MAX_BODY_BYTES) {
      body = '';
      if (!res.headersSent) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request body too large' }));
      }
      req.destroy();
    }
  });
  req.on('end', async () => {
    if (res.headersSent) return;
    try {
      const parsed = parseJsonRpc(JSON.parse(body));

      if (Array.isArray(parsed)) {
        const responses = [];
        for (const rpcReq of parsed) {
          const resp = await handleMcpRequestWithAdapter(rpcReq, adapter);
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
