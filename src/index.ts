import { verifyApiKey } from './auth';
import { handleMcpRequest, parseJsonRpc } from './mcp';
import { runConsolidationReport } from './tools';
import type { Env, JsonRpcResponse } from './types';

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

// ─── Worker fetch handler ───────────────────────────────────────────

export default {
  // ─── Weekly consolidation cron ───────────────────────────────────
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledConsolidation(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check — unauthenticated
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({
        status: 'ok',
        service: 'recall',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      });
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

    // ── Rate limiting (60 req/min per key prefix) ───────────────
    if (!checkRateLimit(apiKey.slice(0, 8), 60, 60_000)) {
      return Response.json(
        { error: 'Rate limit exceeded. Max 60 requests per minute.' },
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
  let body: unknown;
  try {
    body = await request.json();
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

  if (isInitialize) {
    sessionId = crypto.randomUUID();
  } else if (!sessionId) {
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

// ─── Scheduled consolidation ───────────────────────────────────────

async function runScheduledConsolidation(env: Env): Promise<void> {
  const now = new Date().toISOString();
  const reportKey = '_system.consolidation-report';

  try {
    const report = await runConsolidationReport(env);

    // Generate embedding so the report is searchable via retrieve_memory
    const aiResult = await env.AI.run('@cf/baai/bge-m3', { text: [report] });
    const embeddingData = aiResult as unknown as { data: number[][] };
    const embedding = embeddingData?.data?.[0];

    const id = crypto.randomUUID();
    const tags = JSON.stringify(['_system', 'consolidation']);

    // Upsert report into D1
    await env.DB.prepare(
      `INSERT INTO memories (id, key, content, tags, importance, author, created_at, updated_at, accessed_at, access_count)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0)
       ON CONFLICT (key) DO UPDATE SET
         content = excluded.content,
         tags = excluded.tags,
         updated_at = excluded.updated_at`,
    )
      .bind(id, reportKey, report, tags, 0.3, 'system-cron', now, now, now)
      .run();

    // Sync FTS5
    await env.DB.batch([
      env.DB.prepare('DELETE FROM memories_fts WHERE key = ?1').bind(reportKey),
      env.DB.prepare(
        'INSERT INTO memories_fts (key, content, tags) VALUES (?1, ?2, ?3)',
      ).bind(reportKey, report, '_system consolidation'),
    ]);

    // Sync Vectorize (only if embedding succeeded)
    if (embedding?.length) {
      await env.VECTORS.upsert([
        {
          id: reportKey,
          values: embedding,
          metadata: {
            key: reportKey,
            tags: '_system,consolidation',
            importance: 0.3,
            author: 'system-cron',
          },
        },
      ]);
    }

    console.log(`[consolidation] Report stored at ${now}`);
  } catch (err) {
    console.error(
      '[consolidation] Failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
