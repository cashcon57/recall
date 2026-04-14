import type {
  Memory,
  MemoryRow,
  MemoryType,
  McpToolDefinition,
  McpToolResult,
  StoreMemoryInput,
  RetrieveMemoryInput,
  ListMemoriesInput,
  DeleteMemoryInput,
  ClearMemoriesInput,
  ConsolidateMemoriesInput,
  GetRelatedMemoriesInput,
} from './types';
import type { RecallAdapter } from './adapter';

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
        memory_type: {
          type: 'string',
          enum: ['episodic', 'semantic', 'procedural'],
          description:
            'Memory tier controlling recency decay half-life. episodic = 7d (events, session context), semantic = 69d (concepts, facts — default), procedural = 693d (stable rules, patterns, credentials).',
        },
        namespace: {
          type: 'string',
          description:
            'Optional project/scope identifier. Memories with a namespace are only returned when retrieve_memory/list_memories filter by the same namespace. Use to isolate memories across projects. Format: alphanumeric, hyphens, underscores, dots.',
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
        namespace: {
          type: 'string',
          description:
            'Filter to memories stored in this namespace. Omit to search across all memories (including unnamespaced ones). When set, unnamespaced memories are NOT returned.',
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
        namespace: {
          type: 'string',
          description: 'Filter to this namespace. Omit to list across all memories.',
        },
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
          maximum: 300,
          description:
            'Maximum memories to scan for similarity (default 200, hard cap 300). Limits AI embedding calls. Pairwise cosine comparison is O(n²) so values above 300 risk hitting Cloudflare Workers CPU time limits on cold starts.',
        },
      },
    },
  },
  {
    name: 'get_related_memories',
    description:
      'Traverse the memory relationship graph. Returns memories that are related to the given key, ordered by relationship strength. Relationships are auto-created on store_memory via embedding similarity (threshold 0.82).',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'The memory key to find related memories for',
        },
        relationship_type: {
          type: 'string',
          description: 'Filter by relationship type (default: all types). Currently only "similar" is auto-generated.',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 20,
          description: 'Max related memories to return (default 10)',
        },
      },
      required: ['key'],
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

const VALID_MEMORY_TYPES = new Set<MemoryType>(['episodic', 'semantic', 'procedural']);

const MAX_NAMESPACE_LEN = 128;

function validateNamespace(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > MAX_NAMESPACE_LEN) {
    throw new Error(`namespace must be a non-empty string (max ${MAX_NAMESPACE_LEN} chars)`);
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!KEY_PATTERN.test(trimmed)) {
    throw new Error('namespace must contain only alphanumeric characters, hyphens, underscores, and dots');
  }
  return trimmed;
}

function validateStoreInput(args: Record<string, unknown>): StoreMemoryInput {
  const { key, content, tags, importance, author, memory_type, namespace } = args;

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

  let validatedMemoryType: MemoryType = 'semantic';
  if (memory_type !== undefined) {
    if (!VALID_MEMORY_TYPES.has(memory_type as MemoryType)) {
      throw new Error('memory_type must be "episodic", "semantic", or "procedural"');
    }
    validatedMemoryType = memory_type as MemoryType;
  }

  return {
    key: key.trim(),
    content: content.trim(),
    tags: validatedTags,
    importance: validatedImportance,
    author: author.trim(),
    memory_type: validatedMemoryType,
    namespace: validateNamespace(namespace),
  };
}

function validateRetrieveInput(args: Record<string, unknown>): RetrieveMemoryInput {
  const { query, limit, min_importance, tags, namespace } = args;

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

  const ns = validateNamespace(namespace);
  if (ns) result.namespace = ns;

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
  const ns = validateNamespace(args.namespace);
  if (ns) result.namespace = ns;
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

function validateGetRelatedInput(args: Record<string, unknown>): GetRelatedMemoriesInput {
  if (typeof args.key !== 'string' || args.key.length === 0 || args.key.length > MAX_KEY_LEN) {
    throw new Error(`key must be a non-empty string (max ${MAX_KEY_LEN} chars)`);
  }
  const result: GetRelatedMemoriesInput = { key: args.key.trim() };
  if (args.relationship_type !== undefined) {
    if (typeof args.relationship_type !== 'string') throw new Error('relationship_type must be a string');
    result.relationship_type = args.relationship_type.trim();
  }
  if (args.limit !== undefined) {
    if (typeof args.limit !== 'number' || args.limit < 1 || args.limit > 20 || !Number.isInteger(args.limit)) {
      throw new Error('limit must be an integer between 1 and 20');
    }
    result.limit = args.limit;
  }
  return result;
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
    if (typeof args.max_memories !== 'number' || args.max_memories < 1 || args.max_memories > 300 || !Number.isInteger(args.max_memories)) {
      throw new Error('max_memories must be an integer between 1 and 300 (O(n²) pairwise cosine hits CPU limits above that)');
    }
    result.max_memories = args.max_memories;
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────

// Half-life decay per memory tier (NornicDB-inspired).
// episodic = 7d (session context, events), semantic = 69d (concepts, facts),
// procedural = 693d (stable rules, credentials, architecture).
// recencyScore = 2^(-hoursSinceAccess / halfLife) → 0.5 at exactly one half-life.
const HALF_LIFE_HOURS: Record<string, number> = {
  episodic:   7 * 24,   // 168h
  semantic:   69 * 24,  // 1656h
  procedural: 693 * 24, // 16632h
};

// Auto-link: similarity threshold and max neighbors for relationship graph.
// Threshold matches consolidation default (0.82) — pairs above it get edges,
// not merge suggestions. Separate purposes, same cutoff is intentional.
const AUTO_LINK_THRESHOLD = 0.82;
const AUTO_LINK_TOP_K = 5;


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
async function rerankMemories(
  adapter: RecallAdapter,
  query: string,
  memories: Memory[],
  fallbackScores?: Map<string, number>,
): Promise<Array<{ memory: Memory; rerankerScore: number }>> {
  if (!memories.length) return [];

  try {
    const passages = memories.map((m) => truncateForRerank(m.content));
    const scores = await adapter.rerank(query, passages);

    // Sigmoid to normalize raw scores to [0, 1]
    const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

    return memories.map((memory, i) => ({
      memory,
      rerankerScore: sigmoid(scores[i]),
    }));
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
  adapter: RecallAdapter,
): Promise<McpToolResult> {
  try {
    switch (name) {
      case 'store_memory':
        return await storeMemory(validateStoreInput(args), adapter);
      case 'retrieve_memory':
        return await retrieveMemory(validateRetrieveInput(args), adapter);
      case 'list_memories':
        return await listMemories(validateListInput(args), adapter);
      case 'delete_memory':
        return await deleteMemory(validateDeleteInput(args), adapter);
      case 'clear_memories':
        return await clearMemories(validateClearInput(args), adapter);
      case 'consolidate_memories':
        return await consolidateMemories(validateConsolidateInput(args), adapter);
      case 'get_related_memories':
        return await getRelatedMemories(validateGetRelatedInput(args), adapter);
      default:
        return textResult(`Unknown tool: ${name}`, true);
    }
  } catch (err) {
    return textResult(err instanceof Error ? err.message : 'Tool execution failed', true);
  }
}

// ─── Tool implementations ───────────────────────────────────────────

async function storeMemory(input: StoreMemoryInput, adapter: RecallAdapter): Promise<McpToolResult> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Generate embedding from content
  const embedding = await adapter.embed(input.content);

  // Deduplication check — warn if very similar content exists under a different key
  const dupeMatches = await adapter.vectorQuery(embedding, 1);

  if (dupeMatches.length) {
    const top = dupeMatches[0];
    if (top.score > 0.92 && top.id !== input.key) {
      return textResult(
        `Similar memory already exists at key "${top.id}" (similarity: ${top.score.toFixed(3)}). ` +
        `Consider updating that memory instead, or use the same key to overwrite. Memory was NOT stored.`,
        true,
      );
    }
  }

  // Sequenced writes: D1 is the source of truth. FTS5 + Vectorize are
  // search indexes. If the D1 write fails, we bail cleanly (nothing is
  // written anywhere). If FTS5 fails, D1 still has the row — but the
  // memory won't be keyword-searchable until next upsert. If Vectorize
  // fails, D1 + FTS5 still have the row — it won't be semantically
  // searchable until next upsert. Both cases are logged loudly so the
  // operator notices and the weekly consolidation cron can be extended
  // to detect orphans later.
  //
  // Why not parallel: a concurrent Promise.all fails atomically — if
  // Vectorize 5xxs after D1 has already committed, the caller sees a
  // rejected promise but the D1 row exists, which looks like a bug
  // ("store failed") when the memory is actually half-stored. Sequencing
  // lets us report partial success and keep the user's data discoverable
  // via at least one search path.

  // 1. D1 — source of truth. If this fails, nothing is stored anywhere.
  try {
    await adapter.query(
      `INSERT INTO memories (id, key, content, tags, importance, author, memory_type, namespace, created_at, updated_at, accessed_at, access_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT (key) DO UPDATE SET
         content = excluded.content,
         tags = excluded.tags,
         importance = excluded.importance,
         author = excluded.author,
         memory_type = excluded.memory_type,
         namespace = excluded.namespace,
         updated_at = excluded.updated_at`,
      [id, input.key, input.content, JSON.stringify(input.tags), input.importance, input.author, input.memory_type, input.namespace, now, now, now],
    );
  } catch (err) {
    console.error('[storeMemory] D1 upsert failed:', err instanceof Error ? err.message : err, { key: input.key });
    throw err;
  }

  // 2. FTS index — adapter-specific implementation (FTS5 for SQLite backends,
  //    no-op for Postgres which auto-maintains GIN). Failure warns but does
  //    not unwind the D1/PG write. FTS will be re-synced on next upsert of
  //    this key, or can be rebuilt from the base table by a reindex job.
  let ftsOk = true;
  try {
    await adapter.ftsUpsert(input.key, input.content, input.tags.join(' '));
  } catch (err) {
    ftsOk = false;
    console.error('[storeMemory] FTS sync failed (DB row exists):', err instanceof Error ? err.message : err, { key: input.key });
  }

  // 3. Vectorize — most likely to fail (external service). Failure warns
  //    but does not unwind D1 or FTS5. Vectorize will be re-synced on
  //    next upsert of this key, or detected as orphan by the consolidation
  //    cron and reindexed.
  let vecOk = true;
  try {
    await adapter.vectorUpsert(input.key, embedding, {
      key: input.key,
      tags: input.tags.join(','),
      importance: input.importance,
      author: input.author,
    });
  } catch (err) {
    vecOk = false;
    console.error('[storeMemory] Vectorize upsert failed (D1 row exists):', err instanceof Error ? err.message : err, { key: input.key });
  }

  // 4. Auto-link: find similar memories via Vectorize and create relationship edges.
  //    Reuses the already-computed embedding — zero extra AI calls.
  //    Non-fatal — failure is logged but does not unwind the store.
  //    Both A→B and B→A are stored so get_related_memories only needs WHERE from_key = ?.
  //
  //    On update: stale edges from prior content are pruned before new edges are written,
  //    so the graph stays accurate even when a memory's content changes significantly.
  //
  //    Note: topK is AUTO_LINK_TOP_K + 1 as a buffer. Vectorize has eventual-consistency
  //    propagation — a freshly upserted vector may not be visible yet, so the self-match
  //    is not guaranteed. The application-level filter (`m.id !== input.key`) handles it
  //    either way; the +1 ensures we still get up to AUTO_LINK_TOP_K real neighbors.
  if (vecOk) {
    try {
      const similar = await adapter.vectorQuery(embedding, AUTO_LINK_TOP_K + 1);
      const edges = similar
        .filter((m) => m.id !== input.key && m.score >= AUTO_LINK_THRESHOLD)
        .slice(0, AUTO_LINK_TOP_K);

      // Prune all existing edges for this key (both directions) before re-writing.
      // This keeps the graph accurate when content changes substantially.
      const pruneStmts = [
        { sql: 'DELETE FROM memory_relationships WHERE from_key = ?', params: [input.key] },
        { sql: 'DELETE FROM memory_relationships WHERE to_key = ?', params: [input.key] },
      ];
      const linkStmts = edges.flatMap((m) => [
        {
          sql: `INSERT INTO memory_relationships (from_key, to_key, relationship_type, strength, created_at)
           VALUES (?, ?, 'similar', ?, ?)
           ON CONFLICT (from_key, to_key, relationship_type) DO UPDATE SET strength = excluded.strength`,
          params: [input.key, m.id, m.score, now],
        },
        {
          sql: `INSERT INTO memory_relationships (from_key, to_key, relationship_type, strength, created_at)
           VALUES (?, ?, 'similar', ?, ?)
           ON CONFLICT (from_key, to_key, relationship_type) DO UPDATE SET strength = excluded.strength`,
          params: [m.id, input.key, m.score, now],
        },
      ]);
      await adapter.batch([...pruneStmts, ...linkStmts]);
    } catch (err) {
      console.error('[storeMemory] auto-link failed (non-fatal):', err instanceof Error ? err.message : err, { key: input.key });
    }
  }

  // Return a message that honestly reflects the result. A partial store
  // is still a store — the user's data is safe and discoverable — but
  // the warning surface makes it clear something needs attention.
  if (!ftsOk && !vecOk) {
    return textResult(
      `Stored memory "${input.key}" to D1 but BOTH search indexes failed to sync. ` +
        `The memory is saved but not yet searchable. Retry the store to re-sync, ` +
        `or check wrangler tail for the underlying errors.`,
      true,
    );
  }
  if (!ftsOk) {
    return textResult(
      `Stored memory "${input.key}" (semantic search OK, keyword search sync failed — retry store to fix).`,
      true,
    );
  }
  if (!vecOk) {
    return textResult(
      `Stored memory "${input.key}" (keyword search OK, semantic search sync failed — retry store to fix).`,
      true,
    );
  }
  return textResult(
    `Stored memory "${input.key}" (${input.content.length} chars, ${input.tags.length} tags, importance: ${input.importance})`,
  );
}

async function retrieveMemory(input: RetrieveMemoryInput, adapter: RecallAdapter): Promise<McpToolResult> {
  const limit = input.limit ?? 5;
  const candidateCount = 20;

  const queryEmbedding = await adapter.embed(input.query);

  // Run vector search and FTS keyword search in parallel
  const [vectorMatches, ftsKeys] = await Promise.all([
    adapter.vectorQuery(queryEmbedding, Math.min(candidateCount * 2, 50)),
    adapter.ftsSearch(input.query, candidateCount * 2),
  ]);

  // Reciprocal Rank Fusion — merge vector and keyword results
  const vectorKeys = vectorMatches.map((m) => m.id);
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
  const placeholders = candidates.map(() => '?').join(',');
  const rows = await adapter.query<MemoryRow>(
    `SELECT * FROM memories WHERE key IN (${placeholders})`,
    candidates,
  );

  if (!rows.length) {
    return textResult('No memories found matching your query.');
  }

  let memories = rows.map(rowToMemory);

  // Post-query importance filter
  if (input.min_importance !== undefined) {
    memories = memories.filter((m) => m.importance >= input.min_importance!);
  }

  // Post-query tag filter
  if (input.tags?.length) {
    memories = memories.filter((m) => input.tags!.some((t) => m.tags.includes(t)));
  }

  // Post-query namespace filter — unnamespaced memories are NOT returned when a namespace is specified
  if (input.namespace) {
    memories = memories.filter((m) => m.namespace === input.namespace);
  }

  if (!memories.length) {
    return textResult('No memories found matching your query and filters.');
  }

  // Rerank candidates for precision. Pass fusion scores for meaningful fallback on failure.
  const reranked = await rerankMemories(adapter, input.query, memories, rrfScores);

  // Combined scoring with tier-aware half-life recency decay.
  // episodic decays fast (half-life 7d), procedural barely decays (half-life 693d).
  const now = Date.now();
  const scored = reranked.map((item) => {
    const hoursSinceAccess =
      (now - new Date(item.memory.accessed_at).getTime()) / (1000 * 60 * 60);
    const halfLife = HALF_LIFE_HOURS[item.memory.memory_type] ?? HALF_LIFE_HOURS.semantic;
    const recencyScore = Math.pow(2, -Math.max(hoursSinceAccess, 0) / halfLife);
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
    .map((r) => ({
      sql: 'UPDATE memories SET accessed_at = ?, access_count = access_count + 1 WHERE key = ?',
      params: [nowIso, r.memory.key],
    }));
  if (accessUpdates.length) {
    await adapter.batch(accessUpdates);
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

async function listMemories(input: ListMemoriesInput, adapter: RecallAdapter): Promise<McpToolResult> {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  let query = 'SELECT key, tags, importance, author, memory_type, namespace, created_at, updated_at, accessed_at, access_count FROM memories';
  let countQuery = 'SELECT COUNT(*) as total FROM memories';
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (input.author) {
    conditions.push('author = ?');
    bindings.push(input.author);
  }

  if (input.namespace) {
    conditions.push('namespace = ?');
    bindings.push(input.namespace);
  }

  if (conditions.length) {
    const where = ' WHERE ' + conditions.join(' AND ');
    query += where;
    countQuery += where;
  }
  query += ' ORDER BY importance DESC, updated_at DESC';
  query += ' LIMIT ? OFFSET ?';

  const countBindings = [...bindings];
  const dataBindings = [...bindings, limit, offset];

  const [countRows, dataRows] = await Promise.all([
    adapter.query<{ total: number }>(countQuery, countBindings),
    adapter.query<MemoryRow>(query, dataBindings),
  ]);

  const total = countRows[0]?.total ?? 0;

  if (!dataRows.length) {
    return textResult('No memories stored yet.');
  }

  let items = dataRows.map((r) => ({
    key: r.key,
    tags: JSON.parse(r.tags) as string[],
    importance: r.importance,
    author: r.author,
    memory_type: r.memory_type,
    namespace: r.namespace,
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

  const lines = items.map((m) => {
    const nsPart = m.namespace ? ` [ns: ${m.namespace}]` : '';
    return `- **${m.key}**${nsPart} [${m.importance}] ${m.memory_type} by ${m.author} — tags: ${m.tags.join(', ') || 'none'} (updated: ${m.updated_at}, accessed: ${m.access_count}x)`;
  });

  const pageInfo = `Showing ${offset + 1}–${offset + items.length} of ${total}`;

  return textResult(`${pageInfo} memories:\n\n${lines.join('\n')}`);
}

async function deleteMemory(input: DeleteMemoryInput, adapter: RecallAdapter): Promise<McpToolResult> {
  const existing = await adapter.query('SELECT id FROM memories WHERE key = ?', [input.key]);

  if (!existing.length) {
    return textResult(`Memory "${input.key}" not found.`, true);
  }

  // Delete from DB + relationships atomically. FTS is updated separately via
  // the adapter's ftsDelete (no-op on Postgres where GIN auto-maintains).
  try {
    await adapter.batch([
      { sql: 'DELETE FROM memories WHERE key = ?', params: [input.key] },
      { sql: 'DELETE FROM memory_relationships WHERE from_key = ? OR to_key = ?', params: [input.key, input.key] },
    ]);
  } catch (err) {
    console.error('[deleteMemory] DB delete failed:', err instanceof Error ? err.message : err, { key: input.key });
    throw err;
  }

  // FTS cleanup — separate so a FTS failure doesn't rollback the authoritative delete.
  try {
    await adapter.ftsDelete([input.key]);
  } catch (err) {
    console.error('[deleteMemory] FTS delete failed (DB row already removed):', err instanceof Error ? err.message : err, { key: input.key });
  }

  // Vectorize delete is separate and can fail independently. If it does,
  // we still report success on the D1 side (the memory is gone from the
  // canonical store and keyword search) but warn about the orphan vector.
  // The weekly consolidation cron can be extended to detect and clean
  // these up.
  try {
    await adapter.vectorDelete([input.key]);
  } catch (err) {
    console.error('[deleteMemory] Vectorize delete failed (D1 row already removed):', err instanceof Error ? err.message : err, { key: input.key });
    return textResult(
      `Deleted memory "${input.key}" from D1 but Vectorize delete failed. ` +
        `The memory is gone from the canonical store and keyword search, ` +
        `but an orphan vector remains in the semantic index. It will be ` +
        `ignored on retrieval (no matching D1 row) and can be cleaned up ` +
        `by a reindex job. Check wrangler tail for the underlying error.`,
      true,
    );
  }

  return textResult(`Deleted memory "${input.key}".`);
}

async function clearMemories(_input: ClearMemoriesInput, adapter: RecallAdapter): Promise<McpToolResult> {
  // Gate behind explicit opt-in. Default-deny protects users from a leaked key
  // wiping the entire store via a single tool call.
  if (!adapter.isDestructiveAllowed()) {
    return textResult(
      'clear_memories is disabled. To enable it, set the ALLOW_DESTRUCTIVE_TOOLS ' +
        'secret to "true" via `wrangler secret put ALLOW_DESTRUCTIVE_TOOLS`. ' +
        'This is intentional — a default-deny protects your memories from accidental ' +
        'or malicious bulk deletion if your API key is ever leaked.',
      true,
    );
  }

  const rows = await adapter.query<{ key: string }>('SELECT key FROM memories');
  const allKeys = rows.map((r) => r.key);

  await adapter.batch([
    { sql: 'DELETE FROM memories' },
    { sql: 'DELETE FROM memory_relationships' },
  ]);

  // FTS cleanup — adapter-specific (FTS5 tables on SQLite, no-op on Postgres).
  try {
    await adapter.ftsDelete(allKeys);
  } catch (err) {
    console.error('[clearMemories] FTS delete failed (DB rows already removed):', err instanceof Error ? err.message : err);
  }

  const failedBatches: Array<{ start: number; end: number; error: string }> = [];
  if (allKeys.length) {
    const BATCH = 100;
    for (let i = 0; i < allKeys.length; i += BATCH) {
      const slice = allKeys.slice(i, i + BATCH);
      try {
        await adapter.vectorDelete(slice);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failedBatches.push({ start: i, end: i + slice.length, error: message });
        console.error('[clearMemories] Vectorize batch delete failed:', message, { start: i, count: slice.length });
        // Keep going — deleting the remaining batches is better than
        // bailing out and leaving more orphans.
      }
    }
  }

  const total = allKeys.length;
  if (failedBatches.length > 0) {
    const orphanCount = failedBatches.reduce((sum, b) => sum + (b.end - b.start), 0);
    return textResult(
      `Cleared ${total} memories from D1 but ${orphanCount} vectors in ${failedBatches.length} batch(es) ` +
        `could not be deleted from Vectorize. Those orphan vectors will be ignored on retrieval ` +
        `(no matching D1 row) and can be cleaned up by a reindex job. ` +
        `First failure: ${failedBatches[0].error}. Check wrangler tail for details.`,
      true,
    );
  }

  return textResult(`Cleared all ${total} memories.`);
}

async function getRelatedMemories(input: GetRelatedMemoriesInput, adapter: RecallAdapter): Promise<McpToolResult> {
  const limit = input.limit ?? 10;

  // Distinguish "key doesn't exist" from "key has no relationships yet" — cheap D1 read.
  const exists = await adapter.query('SELECT 1 FROM memories WHERE key = ?', [input.key]);
  if (!exists.length) {
    return textResult(`Memory "${input.key}" not found.`, true);
  }

  let query = `
    SELECT r.to_key, r.relationship_type, r.strength, r.created_at,
           m.content, m.tags, m.importance, m.author, m.memory_type
    FROM memory_relationships r
    JOIN memories m ON m.key = r.to_key
    WHERE r.from_key = ?
  `;
  const bindings: unknown[] = [input.key];

  if (input.relationship_type) {
    query += ' AND r.relationship_type = ?';
    bindings.push(input.relationship_type);
  }

  query += ' ORDER BY r.strength DESC LIMIT ?';
  bindings.push(limit);

  const rows = await adapter.query<{
    to_key: string;
    relationship_type: string;
    strength: number;
    created_at: string;
    content: string;
    tags: string;
    importance: number;
    author: string;
    memory_type: string;
  }>(query, bindings);

  if (!rows.length) {
    return textResult(`No related memories found for "${input.key}".`);
  }

  const lines = rows.map((r, i) => {
    const tags = JSON.parse(r.tags) as string[];
    return [
      `${i + 1}. **${r.to_key}** (${r.relationship_type}, strength: ${r.strength.toFixed(3)})`,
      `   Type: ${r.memory_type} | Importance: ${r.importance} | Tags: ${tags.join(', ') || 'none'}`,
      `   ${r.content}`,
    ].join('\n');
  });

  return textResult(`Found ${rows.length} related memories for "${input.key}":\n\n${lines.join('\n\n')}`);
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

/**
 * Run a read-only consolidation analysis and return the report text.
 * Exported so the cron handler can call it directly.
 */
export async function runConsolidationReport(
  adapter: RecallAdapter,
  options?: ConsolidateMemoriesInput,
): Promise<string> {
  const similarityThreshold = options?.similarity_threshold ?? 0.82;
  const staleDays = options?.stale_days ?? 60;
  const maxMemories = options?.max_memories ?? 200;

  // 1. Fetch memories (skip system reports from previous consolidations)
  const allRows = await adapter.query<MemoryRow>(
    `SELECT * FROM memories WHERE key NOT LIKE '_system.%' ORDER BY importance DESC LIMIT ?`,
    [maxMemories],
  );

  if (!allRows.length) {
    return '## Memory Consolidation Report\n\nNo memories to analyze.';
  }

  const memories = allRows.map(rowToMemory);

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

  // 3. Generate embeddings sequentially for similarity analysis
  const embeddings: number[][] = [];
  for (const m of memories) {
    try {
      const vec = await adapter.embed(m.content);
      embeddings.push(vec);
    } catch {
      // Fill with empty array so indices stay aligned
      embeddings.push([]);
    }
  }

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
  adapter: RecallAdapter,
): Promise<McpToolResult> {
  const report = await runConsolidationReport(adapter, input);
  return textResult(report);
}
