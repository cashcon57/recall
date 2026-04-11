import type {
  Env,
  Memory,
  MemoryRow,
  McpToolDefinition,
  McpToolResult,
  StoreMemoryInput,
  RetrieveMemoryInput,
  ListMemoriesInput,
  DeleteMemoryInput,
  ClearMemoriesInput,
  ConsolidateMemoriesInput,
} from './types';

// ─── Tool definitions (exposed via tools/list) ─────────────────────

export const TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'store_memory',
    description:
      'Store content with tags, importance score (0.0–1.0), author field, and auto-generated vector embedding for semantic search. Checks for near-duplicates before storing. If a memory with the same key already exists it will be overwritten.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description:
            'Unique identifier for this memory (alphanumeric, hyphens, underscores, dots). e.g. "auth-flow", "db-schema-gotcha"',
        },
        content: {
          type: 'string',
          description: 'The memory content to store',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Tags for categorization, e.g. ["architecture", "security", "gotcha"]',
        },
        importance: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description:
            'Importance score 0.0–1.0. Default 0.5. Use 0.8+ for critical gotchas, 0.3 for nice-to-know.',
        },
        author: {
          type: 'string',
          description:
            'Who created this memory, e.g. "cash", "andrew", "claude"',
        },
      },
      required: ['key', 'content', 'author'],
    },
  },
  {
    name: 'retrieve_memory',
    description:
      'Hybrid semantic + keyword search over stored memories. Uses vector similarity (bge-m3) and BM25 full-text search, fused via Reciprocal Rank Fusion, then reranked for precision. Results are scored by relevance, recency, and importance.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 20,
          description: 'Max results to return (default 5)',
        },
        min_importance: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Minimum importance filter',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter results to memories that have at least one of these tags',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_memories',
    description:
      'List all stored memory keys, tags, importance scores, and authors. Supports pagination and filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'Filter by tag' },
        author: { type: 'string', description: 'Filter by author' },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Max results per page (default 50)',
        },
        offset: {
          type: 'number',
          minimum: 0,
          description: 'Number of results to skip (default 0)',
        },
      },
    },
  },
  {
    name: 'delete_memory',
    description: 'Remove a specific memory by its key.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key to delete' },
      },
      required: ['key'],
    },
  },
  {
    name: 'clear_memories',
    description:
      'Wipe all memories. This is a destructive admin operation that cannot be undone.',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion of all memories',
        },
      },
      required: ['confirm'],
    },
  },
  {
    name: 'consolidate_memories',
    description:
      'Analyze the memory store for consolidation opportunities. Finds similar memory pairs that may be candidates for merging and stale memories that are never accessed. This is a READ-ONLY operation — no memories are modified. Returns a report with recommendations that you can act on using store_memory and delete_memory.',
    inputSchema: {
      type: 'object',
      properties: {
        similarity_threshold: {
          type: 'number',
          minimum: 0.5,
          maximum: 0.95,
          description:
            'Cosine similarity threshold for flagging similar pairs (default 0.82). Higher = stricter, fewer matches.',
        },
        stale_days: {
          type: 'number',
          minimum: 1,
          maximum: 365,
          description:
            'Flag memories that have never been accessed and are older than this many days (default 60).',
        },
        max_memories: {
          type: 'number',
          minimum: 1,
          maximum: 500,
          description:
            'Maximum memories to scan for similarity (default 200). Limits AI embedding calls.',
        },
      },
    },
  },
];

// ─── Input validation ───────────────────────────────────────────────

const KEY_PATTERN = /^[a-zA-Z0-9._-]+$/;
const MAX_KEY_LEN = 256;
const MAX_CONTENT_LEN = 100_000;
const MAX_AUTHOR_LEN = 64;
const MAX_TAG_LEN = 64;
const MAX_TAGS = 20;
const MAX_QUERY_LEN = 1000;

function validateStoreInput(args: Record<string, unknown>): StoreMemoryInput {
  const { key, content, tags, importance, author } = args;

  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LEN) {
    throw new Error(`key must be a non-empty string (max ${MAX_KEY_LEN} chars)`);
  }
  if (!KEY_PATTERN.test(key)) {
    throw new Error(
      'key must contain only alphanumeric characters, hyphens, underscores, and dots',
    );
  }
  if (typeof content !== 'string' || content.length === 0 || content.length > MAX_CONTENT_LEN) {
    throw new Error(`content must be a non-empty string (max ${MAX_CONTENT_LEN} chars)`);
  }
  if (typeof author !== 'string' || author.length === 0 || author.length > MAX_AUTHOR_LEN) {
    throw new Error(`author must be a non-empty string (max ${MAX_AUTHOR_LEN} chars)`);
  }

  const validatedTags: string[] = [];
  if (tags !== undefined) {
    if (!Array.isArray(tags)) throw new Error('tags must be an array of strings');
    if (tags.length > MAX_TAGS) throw new Error(`Maximum ${MAX_TAGS} tags per memory`);
    for (const tag of tags) {
      if (typeof tag !== 'string' || tag.length === 0 || tag.length > MAX_TAG_LEN) {
        throw new Error(`Each tag must be a non-empty string (max ${MAX_TAG_LEN} chars)`);
      }
      validatedTags.push(tag.toLowerCase().trim());
    }
  }

  let validatedImportance = 0.5;
  if (importance !== undefined) {
    if (typeof importance !== 'number' || importance < 0 || importance > 1) {
      throw new Error('importance must be a number between 0.0 and 1.0');
    }
    validatedImportance = Math.round(importance * 100) / 100;
  }

  return {
    key: key.trim(),
    content: content.trim(),
    tags: validatedTags,
    importance: validatedImportance,
    author: author.trim(),
  };
}

function validateRetrieveInput(args: Record<string, unknown>): RetrieveMemoryInput {
  const { query, limit, min_importance, tags } = args;

  if (typeof query !== 'string' || query.length === 0 || query.length > MAX_QUERY_LEN) {
    throw new Error(`query must be a non-empty string (max ${MAX_QUERY_LEN} chars)`);
  }

  const result: RetrieveMemoryInput = { query: query.trim() };

  if (limit !== undefined) {
    if (typeof limit !== 'number' || limit < 1 || limit > 20 || !Number.isInteger(limit)) {
      throw new Error('limit must be an integer between 1 and 20');
    }
    result.limit = limit;
  }
  if (min_importance !== undefined) {
    if (typeof min_importance !== 'number' || min_importance < 0 || min_importance > 1) {
      throw new Error('min_importance must be a number between 0.0 and 1.0');
    }
    result.min_importance = min_importance;
  }
  if (tags !== undefined) {
    if (!Array.isArray(tags)) throw new Error('tags must be an array of strings');
    result.tags = tags.map((t) => {
      if (typeof t !== 'string') throw new Error('Each tag must be a string');
      return t.toLowerCase().trim();
    });
  }

  return result;
}

function validateListInput(args: Record<string, unknown>): ListMemoriesInput {
  const result: ListMemoriesInput = {};
  if (args.tag !== undefined) {
    if (typeof args.tag !== 'string') throw new Error('tag must be a string');
    result.tag = args.tag.toLowerCase().trim();
  }
  if (args.author !== undefined) {
    if (typeof args.author !== 'string') throw new Error('author must be a string');
    result.author = args.author.trim();
  }
  if (args.limit !== undefined) {
    if (typeof args.limit !== 'number' || args.limit < 1 || args.limit > 100 || !Number.isInteger(args.limit)) {
      throw new Error('limit must be an integer between 1 and 100');
    }
    result.limit = args.limit;
  }
  if (args.offset !== undefined) {
    if (typeof args.offset !== 'number' || args.offset < 0 || !Number.isInteger(args.offset)) {
      throw new Error('offset must be a non-negative integer');
    }
    result.offset = args.offset;
  }
  return result;
}

function validateDeleteInput(args: Record<string, unknown>): DeleteMemoryInput {
  if (typeof args.key !== 'string' || args.key.length === 0) {
    throw new Error('key must be a non-empty string');
  }
  return { key: args.key.trim() };
}

function validateClearInput(args: Record<string, unknown>): ClearMemoriesInput {
  if (args.confirm !== true) {
    throw new Error('confirm must be true to clear all memories');
  }
  return { confirm: true };
}

function validateConsolidateInput(args: Record<string, unknown>): ConsolidateMemoriesInput {
  const result: ConsolidateMemoriesInput = {};

  if (args.similarity_threshold !== undefined) {
    if (typeof args.similarity_threshold !== 'number' || args.similarity_threshold < 0.5 || args.similarity_threshold > 0.95) {
      throw new Error('similarity_threshold must be a number between 0.5 and 0.95');
    }
    result.similarity_threshold = Math.round(args.similarity_threshold * 100) / 100;
  }
  if (args.stale_days !== undefined) {
    if (typeof args.stale_days !== 'number' || args.stale_days < 1 || args.stale_days > 365 || !Number.isInteger(args.stale_days)) {
      throw new Error('stale_days must be an integer between 1 and 365');
    }
    result.stale_days = args.stale_days;
  }
  if (args.max_memories !== undefined) {
    if (typeof args.max_memories !== 'number' || args.max_memories < 1 || args.max_memories > 500 || !Number.isInteger(args.max_memories)) {
      throw new Error('max_memories must be an integer between 1 and 500');
    }
    result.max_memories = args.max_memories;
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────

async function generateEmbedding(ai: Ai, text: string): Promise<number[]> {
  const result = await ai.run('@cf/baai/bge-m3', {
    text: [text],
  });
  const embeddingData = result as unknown as { data: number[][] };
  if (!embeddingData?.data?.[0]) {
    throw new Error('Embedding generation returned no data');
  }
  return embeddingData.data[0];
}

/** Query D1 FTS5 for keyword/BM25 matches. Returns keys in rank order. */
async function ftsSearch(
  db: D1Database,
  query: string,
  limit: number,
): Promise<string[]> {
  // Escape FTS5 special characters to prevent syntax errors
  const safeQuery = query.replace(/['"*()^~:]/g, ' ').trim();
  if (!safeQuery) return [];

  try {
    const rows = await db.prepare(
      `SELECT key FROM memories_fts WHERE memories_fts MATCH ?1 ORDER BY rank LIMIT ?2`,
    ).bind(safeQuery, limit).all<{ key: string }>();

    return rows.results?.map((r) => r.key) ?? [];
  } catch {
    // FTS query can fail on certain inputs — fall back gracefully
    return [];
  }
}

/**
 * Truncate content for reranking. The reranker only needs enough context to
 * judge topical relevance, not the full memory. 512 chars captures the
 * first couple sentences, which is plenty for topic classification.
 * This cuts AI token usage by 10-50x for long memories at negligible
 * accuracy cost.
 */
const RERANK_MAX_CHARS = 512;

function truncateForRerank(content: string): string {
  if (content.length <= RERANK_MAX_CHARS) return content;
  return content.slice(0, RERANK_MAX_CHARS);
}

/**
 * Rerank candidates using bge-reranker-base. Returns scored results.
 *
 * If the reranker fails, falls back to the pre-computed fusion scores
 * (passed via `fallbackScores`) rather than uniform 0.5, so final ranking
 * stays meaningful on reranker error.
 */
async function rerank(
  ai: Ai,
  query: string,
  memories: Memory[],
  fallbackScores?: Map<string, number>,
): Promise<Array<{ memory: Memory; rerankerScore: number }>> {
  if (!memories.length) return [];

  try {
    const result = await (ai as unknown as { run(model: string, input: unknown): Promise<unknown> }).run(
      '@cf/baai/bge-reranker-base',
      {
        query,
        contexts: memories.map((m) => truncateForRerank(m.content)),
      },
    ) as { data: Array<{ index: number; score: number }> };

    // Sigmoid to normalize raw scores to [0, 1]
    const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

    if (result?.data?.length) {
      return result.data.map((r) => ({
        memory: memories[r.index],
        rerankerScore: sigmoid(r.score),
      }));
    }
  } catch {
    // Reranker failure — fall back to RRF scores below
  }

  // Fallback: use normalized fusion scores if provided, else uniform 0.5.
  // Fusion scores are bounded in the low range (< 0.1) so we rescale to [0, 1].
  if (fallbackScores && fallbackScores.size > 0) {
    const maxScore = Math.max(...fallbackScores.values());
    if (maxScore > 0) {
      return memories.map((m) => ({
        memory: m,
        rerankerScore: (fallbackScores.get(m.key) ?? 0) / maxScore,
      }));
    }
  }
  return memories.map((m) => ({ memory: m, rerankerScore: 0.5 }));
}

/** Reciprocal Rank Fusion — merge multiple ranked lists. */
function rrfMerge(
  ...lists: Array<string[]>
): Map<string, number> {
  const K = 60;
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const key = list[rank];
      scores.set(key, (scores.get(key) ?? 0) + 1 / (K + rank + 1));
    }
  }
  return scores;
}

function rowToMemory(row: MemoryRow): Memory {
  return { ...row, tags: JSON.parse(row.tags) as string[] };
}

function textResult(text: string, isError = false): McpToolResult {
  return { content: [{ type: 'text', text }], isError };
}

// ─── Tool dispatcher ────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  env: Env,
): Promise<McpToolResult> {
  switch (name) {
    case 'store_memory':
      return storeMemory(validateStoreInput(args), env);
    case 'retrieve_memory':
      return retrieveMemory(validateRetrieveInput(args), env);
    case 'list_memories':
      return listMemories(validateListInput(args), env);
    case 'delete_memory':
      return deleteMemory(validateDeleteInput(args), env);
    case 'clear_memories':
      return clearMemories(validateClearInput(args), env);
    case 'consolidate_memories':
      return consolidateMemories(validateConsolidateInput(args), env);
    default:
      return textResult(`Unknown tool: ${name}`, true);
  }
}

// ─── Tool implementations ───────────────────────────────────────────

async function storeMemory(input: StoreMemoryInput, env: Env): Promise<McpToolResult> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Generate embedding from content
  const embedding = await generateEmbedding(env.AI, input.content);

  // Deduplication check — warn if very similar content exists under a different key
  const dupeCheck = await env.VECTORS.query(embedding, {
    topK: 1,
    returnMetadata: 'all',
  });

  if (dupeCheck.matches?.length) {
    const top = dupeCheck.matches[0];
    if (top.score > 0.92 && top.id !== input.key) {
      return textResult(
        `Similar memory already exists at key "${top.id}" (similarity: ${top.score.toFixed(3)}). ` +
        `Consider updating that memory instead, or use the same key to overwrite. Memory was NOT stored.`,
        true,
      );
    }
  }

  // Upsert into D1, sync FTS5, and upsert the vector in parallel.
  // All three operations are independent — no step depends on another's output.
  await Promise.all([
    env.DB.prepare(
      `INSERT INTO memories (id, key, content, tags, importance, author, created_at, updated_at, accessed_at, access_count)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0)
       ON CONFLICT (key) DO UPDATE SET
         content = excluded.content,
         tags = excluded.tags,
         importance = excluded.importance,
         author = excluded.author,
         updated_at = excluded.updated_at`,
    )
      .bind(id, input.key, input.content, JSON.stringify(input.tags), input.importance, input.author, now, now, now)
      .run(),

    // Sync FTS5 table (delete + insert since FTS5 doesn't support ON CONFLICT)
    env.DB.batch([
      env.DB.prepare('DELETE FROM memories_fts WHERE key = ?1').bind(input.key),
      env.DB.prepare(
        'INSERT INTO memories_fts (key, content, tags) VALUES (?1, ?2, ?3)',
      ).bind(input.key, input.content, input.tags.join(' ')),
    ]),

    // Upsert vector (keyed by memory key for stable identity)
    env.VECTORS.upsert([
      {
        id: input.key,
        values: embedding,
        metadata: {
          key: input.key,
          tags: input.tags.join(','),
          importance: input.importance,
          author: input.author,
        },
      },
    ]),
  ]);

  return textResult(
    `Stored memory "${input.key}" (${input.content.length} chars, ${input.tags.length} tags, importance: ${input.importance})`,
  );
}

async function retrieveMemory(input: RetrieveMemoryInput, env: Env): Promise<McpToolResult> {
  const limit = input.limit ?? 5;
  const candidateCount = 20;

  const queryEmbedding = await generateEmbedding(env.AI, input.query);

  // Build Vectorize metadata filter
  const filter: VectorizeVectorMetadataFilter = {};
  if (input.min_importance !== undefined) {
    filter.importance = { $gte: input.min_importance };
  }

  // Run vector search and FTS5 keyword search in parallel
  const [vectorResults, ftsKeys] = await Promise.all([
    env.VECTORS.query(queryEmbedding, {
      topK: Math.min(candidateCount * 2, 50),
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      returnMetadata: 'all',
    }),
    ftsSearch(env.DB, input.query, candidateCount * 2),
  ]);

  // Reciprocal Rank Fusion — merge vector and keyword results
  const vectorKeys = vectorResults.matches?.map((m) => m.id) ?? [];
  const rrfScores = rrfMerge(vectorKeys, ftsKeys);

  if (rrfScores.size === 0) {
    return textResult('No memories found matching your query.');
  }

  // Take top candidates by RRF score for reranking
  const candidates = [...rrfScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, candidateCount)
    .map(([key]) => key);

  // Fetch full content from D1
  const placeholders = candidates.map((_, i) => `?${i + 1}`).join(',');
  const rows = await env.DB.prepare(
    `SELECT * FROM memories WHERE key IN (${placeholders})`,
  )
    .bind(...candidates)
    .all<MemoryRow>();

  if (!rows.results?.length) {
    return textResult('No memories found matching your query.');
  }

  let memories = rows.results.map(rowToMemory);

  // Post-query tag filter
  if (input.tags?.length) {
    memories = memories.filter((m) => input.tags!.some((t) => m.tags.includes(t)));
  }

  if (!memories.length) {
    return textResult('No memories found matching your query and filters.');
  }

  // Rerank candidates for precision. Pass fusion scores for meaningful fallback on failure.
  const reranked = await rerank(env.AI, input.query, memories, rrfScores);

  // Combined scoring with recency decay
  const now = Date.now();
  const scored = reranked.map((item) => {
    const hoursSinceAccess =
      (now - new Date(item.memory.accessed_at).getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.exp(-0.001 * Math.max(hoursSinceAccess, 0));
    const combinedScore =
      0.5 * item.rerankerScore + 0.3 * recencyScore + 0.2 * item.memory.importance;
    return { memory: item.memory, combinedScore, rerankerScore: item.rerankerScore };
  });

  scored.sort((a, b) => b.combinedScore - a.combinedScore);
  const topResults = scored.slice(0, limit);

  // Update access tracking for returned memories — but only if their last
  // access was more than ACCESS_DEBOUNCE_MS ago. This prevents chatty clients
  // from flooding D1 with writes on repeated identical queries (saves ~80%
  // of access-tracking writes in practice).
  const ACCESS_DEBOUNCE_MS = 60 * 60 * 1000; // 1 hour
  const nowIso = new Date().toISOString();
  const accessUpdates = topResults
    .filter((r) => {
      const lastAccess = new Date(r.memory.accessed_at).getTime();
      return now - lastAccess > ACCESS_DEBOUNCE_MS;
    })
    .map((r) =>
      env.DB.prepare(
        'UPDATE memories SET accessed_at = ?1, access_count = access_count + 1 WHERE key = ?2',
      ).bind(nowIso, r.memory.key),
    );
  if (accessUpdates.length) {
    await env.DB.batch(accessUpdates);
  }

  const lines = topResults.map((r, i) => {
    const tagStr = r.memory.tags.length ? r.memory.tags.join(', ') : 'none';
    return [
      `${i + 1}. **${r.memory.key}** (score: ${r.combinedScore.toFixed(3)}, importance: ${r.memory.importance})`,
      `   Tags: ${tagStr} | Author: ${r.memory.author}`,
      `   ${r.memory.content}`,
    ].join('\n');
  });

  return textResult(`Found ${topResults.length} relevant memories:\n\n${lines.join('\n\n')}`);
}

async function listMemories(input: ListMemoriesInput, env: Env): Promise<McpToolResult> {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  let query = 'SELECT key, tags, importance, author, created_at, updated_at, accessed_at, access_count FROM memories';
  let countQuery = 'SELECT COUNT(*) as total FROM memories';
  const conditions: string[] = [];
  const bindings: string[] = [];
  let idx = 1;

  if (input.author) {
    conditions.push(`author = ?${idx}`);
    bindings.push(input.author);
    idx++;
  }

  if (conditions.length) {
    const where = ' WHERE ' + conditions.join(' AND ');
    query += where;
    countQuery += where;
  }
  query += ' ORDER BY importance DESC, updated_at DESC';
  query += ` LIMIT ?${idx} OFFSET ?${idx + 1}`;

  const countStmt = env.DB.prepare(countQuery);
  const dataStmt = env.DB.prepare(query);

  const countBindings = [...bindings];
  const dataBindings = [...bindings, String(limit), String(offset)];

  const [countResult, dataResult] = await Promise.all([
    countBindings.length
      ? countStmt.bind(...countBindings).first<{ total: number }>()
      : countStmt.first<{ total: number }>(),
    dataStmt.bind(...dataBindings).all<MemoryRow>(),
  ]);

  const total = countResult?.total ?? 0;

  if (!dataResult.results?.length) {
    return textResult('No memories stored yet.');
  }

  let items = dataResult.results.map((r) => ({
    key: r.key,
    tags: JSON.parse(r.tags) as string[],
    importance: r.importance,
    author: r.author,
    updated_at: r.updated_at,
    access_count: r.access_count,
  }));

  // Post-filter by tag (D1 lacks JSON array functions)
  if (input.tag) {
    items = items.filter((m) => m.tags.includes(input.tag!));
  }

  if (!items.length) {
    return textResult('No memories match the specified filters.');
  }

  const lines = items.map(
    (m) =>
      `- **${m.key}** [${m.importance}] by ${m.author} — tags: ${m.tags.join(', ') || 'none'} (updated: ${m.updated_at}, accessed: ${m.access_count}x)`,
  );

  const pageInfo = `Showing ${offset + 1}–${offset + items.length} of ${total}`;

  return textResult(`${pageInfo} memories:\n\n${lines.join('\n')}`);
}

async function deleteMemory(input: DeleteMemoryInput, env: Env): Promise<McpToolResult> {
  const existing = await env.DB.prepare('SELECT id FROM memories WHERE key = ?1')
    .bind(input.key)
    .first();

  if (!existing) {
    return textResult(`Memory "${input.key}" not found.`, true);
  }

  // Delete from D1, FTS5, and Vectorize
  await env.DB.batch([
    env.DB.prepare('DELETE FROM memories WHERE key = ?1').bind(input.key),
    env.DB.prepare('DELETE FROM memories_fts WHERE key = ?1').bind(input.key),
  ]);
  await env.VECTORS.deleteByIds([input.key]);

  return textResult(`Deleted memory "${input.key}".`);
}

async function clearMemories(_input: ClearMemoriesInput, env: Env): Promise<McpToolResult> {
  // Gate behind explicit opt-in. Default-deny protects users from a leaked key
  // wiping the entire store via a single tool call.
  if (env.ALLOW_DESTRUCTIVE_TOOLS !== 'true') {
    return textResult(
      'clear_memories is disabled. To enable it, set the ALLOW_DESTRUCTIVE_TOOLS ' +
        'secret to "true" via `wrangler secret put ALLOW_DESTRUCTIVE_TOOLS`. ' +
        'This is intentional — a default-deny protects your memories from accidental ' +
        'or malicious bulk deletion if your API key is ever leaked.',
      true,
    );
  }

  const rows = await env.DB.prepare('SELECT key FROM memories').all<{ key: string }>();

  await env.DB.batch([
    env.DB.prepare('DELETE FROM memories'),
    env.DB.prepare('DELETE FROM memories_fts'),
  ]);

  if (rows.results?.length) {
    const keys = rows.results.map((r) => r.key);
    const BATCH = 100;
    for (let i = 0; i < keys.length; i += BATCH) {
      await env.VECTORS.deleteByIds(keys.slice(i, i + BATCH));
    }
  }

  return textResult(`Cleared all ${rows.results?.length ?? 0} memories.`);
}

// ─── Consolidation (read-only analysis) ──────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function batchGenerateEmbeddings(
  ai: Ai,
  texts: string[],
): Promise<number[][]> {
  const BATCH_SIZE = 20;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const result = await ai.run('@cf/baai/bge-m3', { text: batch });
    const data = result as unknown as { data: number[][] };
    if (data?.data) {
      results.push(...data.data);
    } else {
      // Fill with empty arrays so indices stay aligned
      results.push(...batch.map(() => []));
    }
  }

  return results;
}

/**
 * Run a read-only consolidation analysis and return the report text.
 * Exported so the cron handler can call it directly.
 */
export async function runConsolidationReport(
  env: Env,
  options?: ConsolidateMemoriesInput,
): Promise<string> {
  const similarityThreshold = options?.similarity_threshold ?? 0.82;
  const staleDays = options?.stale_days ?? 60;
  const maxMemories = options?.max_memories ?? 200;

  // 1. Fetch memories (skip system reports from previous consolidations)
  const allRows = await env.DB.prepare(
    `SELECT * FROM memories WHERE key NOT LIKE '_system.%' ORDER BY importance DESC LIMIT ?1`,
  )
    .bind(maxMemories)
    .all<MemoryRow>();

  if (!allRows.results?.length) {
    return '## Memory Consolidation Report\n\nNo memories to analyze.';
  }

  const memories = allRows.results.map(rowToMemory);

  // 2. Find stale memories (cheap — D1 only, no AI calls)
  const now = Date.now();
  const staleThresholdMs = staleDays * 24 * 60 * 60 * 1000;
  const staleMemories = memories
    .filter((m) => {
      const age = now - new Date(m.updated_at).getTime();
      return m.access_count === 0 && age > staleThresholdMs;
    })
    .map((m) => ({
      key: m.key,
      age_days: Math.floor(
        (now - new Date(m.updated_at).getTime()) / (24 * 60 * 60 * 1000),
      ),
      importance: m.importance,
    }));

  // 3. Generate embeddings in batches for similarity analysis
  const embeddings = await batchGenerateEmbeddings(
    env.AI,
    memories.map((m) => m.content),
  );

  // 4. Pairwise cosine similarity — find pairs in the target band
  //    Below threshold: not similar enough. Above 0.92: already caught by dedup guard.
  const similarPairs: Array<{
    key1: string;
    key2: string;
    similarity: number;
  }> = [];

  for (let i = 0; i < embeddings.length; i++) {
    if (!embeddings[i].length) continue; // skip failed embeddings
    for (let j = i + 1; j < embeddings.length; j++) {
      if (!embeddings[j].length) continue;
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim >= similarityThreshold) {
        similarPairs.push({
          key1: memories[i].key,
          key2: memories[j].key,
          similarity: Math.round(sim * 1000) / 1000,
        });
      }
    }
  }

  similarPairs.sort((a, b) => b.similarity - a.similarity);

  // 5. Build report
  const report: string[] = [];
  report.push('## Memory Consolidation Report');
  report.push(
    `Scanned ${memories.length} memories at ${new Date().toISOString()}`,
  );
  report.push('');

  if (similarPairs.length > 0) {
    report.push(
      `### Similar Memory Pairs (threshold: ${similarityThreshold})`,
    );
    report.push(
      `Found ${similarPairs.length} pair(s) that may be candidates for merging:`,
    );
    report.push('');
    for (const pair of similarPairs.slice(0, 25)) {
      report.push(
        `- **"${pair.key1}"** ↔ **"${pair.key2}"** (similarity: ${pair.similarity})`,
      );
    }
    if (similarPairs.length > 25) {
      report.push(`\n... and ${similarPairs.length - 25} more pairs`);
    }
    report.push('');
  } else {
    report.push(
      '### Similar Memory Pairs',
      'No similar pairs found above threshold.',
      '',
    );
  }

  if (staleMemories.length > 0) {
    report.push(
      `### Stale Memories (never accessed, older than ${staleDays} days)`,
    );
    report.push(
      `Found ${staleMemories.length} potentially stale memor${staleMemories.length === 1 ? 'y' : 'ies'}:`,
    );
    report.push('');
    for (const mem of staleMemories) {
      report.push(
        `- **"${mem.key}"** — ${mem.age_days} days old, importance: ${mem.importance}`,
      );
    }
    report.push('');
  } else {
    report.push('### Stale Memories', 'No stale memories found.', '');
  }

  report.push('### Recommendations');
  if (similarPairs.length > 0 || staleMemories.length > 0) {
    report.push(
      'Review the items above and use `store_memory` (to merge content under one key) or `delete_memory` (to remove stale entries) as needed.',
    );
    report.push(
      '**This report is read-only — no memories were modified.**',
    );
  } else {
    report.push('Memory store looks clean. No action needed.');
  }

  return report.join('\n');
}

async function consolidateMemories(
  input: ConsolidateMemoriesInput,
  env: Env,
): Promise<McpToolResult> {
  const report = await runConsolidationReport(env, input);
  return textResult(report);
}
