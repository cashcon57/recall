import { verifyApiKey } from './auth';
import { handleMcpRequest, parseJsonRpc } from './mcp';
import { runConsolidationReport } from './tools';
import { CloudflareAdapter } from './adapters/cloudflare';
import type { Env, JsonRpcResponse } from './types';

// ─── Constants ──────────────────────────────────────────────────────

const MAX_REQUEST_BODY_BYTES = 1_000_000; // 1 MB — generous for normal MCP traffic
const MIN_API_KEY_LENGTH = 32;            // soft-enforced at request time
const RATE_LIMIT_PER_MIN = 60;
const HEALTH_RESPONSE_CACHE_MS = 60_000;

// ─── Per-isolate rate limiter ───────────────────────────────────────

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
let lastPrune = 0;

function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();

  // Periodic cleanup of expired entries
  if (now - lastPrune > 60_000) {
    lastPrune = now;
    for (const [k, v] of rateBuckets) {
      if (now > v.resetAt) rateBuckets.delete(k);
    }
  }

  const entry = rateBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

/**
 * Derive a stable, non-reversible rate-limit bucket from the API key.
 * Uses the full key so two keys with the same prefix don't collide.
 */
async function rateLimitBucket(apiKey: string): Promise<string> {
  const data = new TextEncoder().encode(apiKey);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  // First 8 bytes is plenty for a bucket identifier
  let hex = '';
  for (let i = 0; i < 8; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// ─── Worker fetch handler ───────────────────────────────────────────

export default {
  // ─── Weekly consolidation cron ───────────────────────────────────
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledConsolidation(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── Startup sanity check on the API key ────────────────────
    // Soft warning only — fail closed on missing, permit short keys with a log.
    if (!env.MEMORY_API_KEY || env.MEMORY_API_KEY.length < MIN_API_KEY_LENGTH) {
      if (!env.MEMORY_API_KEY) {
        return Response.json(
          { error: 'Server misconfigured: MEMORY_API_KEY secret is not set. Run `wrangler secret put MEMORY_API_KEY`.' },
          { status: 503 },
        );
      }
      console.warn(
        `[recall] MEMORY_API_KEY is shorter than ${MIN_API_KEY_LENGTH} chars — consider rotating to a stronger key.`,
      );
    }

    // Health check — unauthenticated, intentionally minimal (no version leak)
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json(
        { status: 'ok' },
        { headers: { 'Cache-Control': `public, max-age=${HEALTH_RESPONSE_CACHE_MS / 1000}` } },
      );
    }

    // Only /mcp is a valid endpoint
    if (url.pathname !== '/mcp') {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // ── Authentication ──────────────────────────────────────────
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json(
        { error: 'Missing or malformed Authorization header' },
        { status: 401 },
      );
    }

    const apiKey = authHeader.slice(7);
    if (!apiKey || !(await verifyApiKey(apiKey, env.MEMORY_API_KEY))) {
      return Response.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // ── Rate limiting (hashed bucket, full-key derived) ────────
    const bucket = await rateLimitBucket(apiKey);
    if (!checkRateLimit(bucket, RATE_LIMIT_PER_MIN, 60_000)) {
      return Response.json(
        { error: `Rate limit exceeded. Max ${RATE_LIMIT_PER_MIN} requests per minute.` },
        { status: 429 },
      );
    }

    // ── Route by HTTP method ────────────────────────────────────
    switch (request.method) {
      case 'POST':
        return handlePost(request, env);
      case 'DELETE':
        // Backwards compat — old clients may send DELETE to close sessions
        return new Response(null, { status: 204 });
      default:
        return Response.json(
          { error: 'Method not allowed' },
          { status: 405 },
        );
    }
  },
};

// ─── POST /mcp — JSON-RPC requests ─────────────────────────────────

async function handlePost(request: Request, env: Env): Promise<Response> {
  // Enforce payload size limit to prevent memory exhaustion attacks.
  // Trust Content-Length first, fall back to streaming byte count.
  const contentLength = Number(request.headers.get('Content-Length') ?? '0');
  if (contentLength > MAX_REQUEST_BODY_BYTES) {
    return Response.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: `Request body too large (max ${MAX_REQUEST_BODY_BYTES} bytes)` },
      },
      { status: 413, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let bodyText: string;
  try {
    bodyText = await readBodyWithLimit(request, MAX_REQUEST_BODY_BYTES);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read body';
    const isSizeError = message.includes('too large');
    return Response.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message },
      },
      {
        status: isSizeError ? 413 : 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return Response.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: invalid JSON' },
      },
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Session management — stateless. Accept header for compat, generate on initialize.
  let sessionId = request.headers.get('Mcp-Session-Id') ?? '';
  const isInitialize =
    !Array.isArray(body) &&
    typeof body === 'object' &&
    body !== null &&
    (body as Record<string, unknown>).method === 'initialize';

  if (isInitialize || !sessionId) {
    sessionId = crypto.randomUUID();
  }

  try {
    const parsed = parseJsonRpc(body);

    // Batch request
    if (Array.isArray(parsed)) {
      const responses: JsonRpcResponse[] = [];
      for (const req of parsed) {
        const resp = await handleMcpRequest(req, env);
        if (resp) responses.push(resp);
      }
      return Response.json(responses, {
        headers: {
          'Content-Type': 'application/json',
          'Mcp-Session-Id': sessionId,
        },
      });
    }

    // Single request
    const response = await handleMcpRequest(parsed, env);

    if (!response) {
      return new Response(null, {
        status: 204,
        headers: { 'Mcp-Session-Id': sessionId },
      });
    }

    return Response.json(response, {
      headers: {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': sessionId,
      },
    });
  } catch {
    return Response.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid request' },
      },
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

/**
 * Stream-read the request body with a hard byte limit. Throws if the body
 * exceeds `maxBytes`, preventing memory exhaustion from attackers who omit
 * or lie about Content-Length.
 */
async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel();
      throw new Error(`Request body too large (max ${maxBytes} bytes)`);
    }
    chunks.push(value);
  }

  // Concatenate and decode as UTF-8
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

// ─── Scheduled consolidation ───────────────────────────────────────

async function runScheduledConsolidation(env: Env): Promise<void> {
  const adapter = new CloudflareAdapter(env);
  const reportKey = '_system.consolidation-report';

  try {
    const report = await runConsolidationReport(adapter);

    const embedding = await adapter.embed(report);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const tags = JSON.stringify(['_system', 'consolidation']);

    await adapter.batch([
      {
        sql: `INSERT INTO memories (id, key, content, tags, importance, author, memory_type, created_at, updated_at, accessed_at, access_count) VALUES (?,?,?,?,?,?,?,?,?,?,0) ON CONFLICT (key) DO UPDATE SET content=excluded.content, tags=excluded.tags, updated_at=excluded.updated_at`,
        params: [id, reportKey, report, tags, 0.3, 'system-cron', 'semantic', now, now, now],
      },
      { sql: 'DELETE FROM memories_fts WHERE key = ?', params: [reportKey] },
      { sql: 'INSERT INTO memories_fts (key, content, tags) VALUES (?,?,?)', params: [reportKey, report, '_system consolidation'] },
    ]);

    if (embedding.length) {
      await adapter.vectorUpsert(reportKey, embedding, {
        key: reportKey,
        tags: '_system,consolidation',
        importance: 0.3,
        author: 'system-cron',
      });
    }

    console.log(`[consolidation] Report stored at ${now}`);
  } catch (err) {
    console.error(
      '[consolidation] Failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
