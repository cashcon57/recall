import type {
  Memory,
  MemoryRow,
  MemoryType,
  MemorySourceType,
  MemoryStatus,
  RetrieveFormat,
  McpToolDefinition,
  McpToolResult,
  StoreMemoryInput,
  MarkMemoryStatusInput,
  VerifyMemoryInput,
  SupersedeMemoryInput,
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
        source_type: {
          type: 'string',
          enum: ['manual', 'chat', 'doc', 'code', 'issue', 'pull_request', 'log', 'web', 'inferred'],
          description: 'Provenance source type for this memory (default: manual).',
        },
        source_url: { type: 'string', description: 'Optional source URL for provenance.' },
        source_path: { type: 'string', description: 'Optional source file/path for provenance.' },
        source_line_start: { type: 'integer', minimum: 1, description: 'Optional starting line number in the source.' },
        source_line_end: { type: 'integer', minimum: 1, description: 'Optional ending line number in the source.' },
        source_title: { type: 'string', description: 'Optional human-readable source title.' },
        source_hash: { type: 'string', description: 'Optional content/source hash for provenance.' },
        status: {
          type: 'string',
          enum: ['active', 'stale', 'superseded', 'deprecated'],
          description: 'Lifecycle status for this memory (default: active).',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Confidence score for this memory, 0.0–1.0 (default: 0.75).',
        },
        verified_at: { type: 'string', description: 'Optional ISO 8601 timestamp when this memory was verified.' },
        expires_at: { type: 'string', description: 'Optional ISO 8601 timestamp when this memory should expire.' },
        supersedes: { type: 'string', description: 'Optional key of a memory this new memory supersedes.' },
      },
      required: ['key', 'content', 'author'],
    },
  },
  {
    name: 'mark_memory_status',
    description: 'Update the lifecycle status of an existing memory without deleting its search indexes. D1 is canonical; vector metadata may remain stale until reindex.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key to update' },
        status: {
          type: 'string',
          enum: ['active', 'stale', 'superseded', 'deprecated'],
          description: 'New lifecycle status for the memory.',
        },
        reason: { type: 'string', description: 'Optional human-readable reason for the status change.' },
      },
      required: ['key', 'status'],
    },
  },
  {
    name: 'verify_memory',
    description: 'Verify an existing memory and update provided provenance, confidence, expiration, and lifecycle fields while preserving unprovided fields.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key to verify' },
        confidence: { type: 'number', minimum: 0, maximum: 1, description: 'Optional confidence score, 0.0–1.0.' },
        source_type: { type: 'string', enum: ['manual', 'chat', 'doc', 'code', 'issue', 'pull_request', 'log', 'web', 'inferred'] },
        source_url: { type: 'string' },
        source_path: { type: 'string' },
        source_line_start: { type: 'integer', minimum: 1 },
        source_line_end: { type: 'integer', minimum: 1 },
        source_title: { type: 'string' },
        source_hash: { type: 'string' },
        verified_at: { type: 'string', description: 'ISO timestamp, or "auto-now" / omitted to use the current time.' },
        expires_at: { type: 'string', description: 'Optional ISO expiration timestamp.' },
        status: { type: 'string', enum: ['active', 'stale', 'superseded', 'deprecated'], description: 'Lifecycle status (default active).' },
      },
      required: ['key'],
    },
  },
  {
    name: 'supersede_memory',
    description: 'Create a replacement memory, mark the old memory superseded, and add supersession relationship edges.',
    inputSchema: {
      type: 'object',
      properties: {
        old_key: { type: 'string', description: 'Existing memory key being replaced.' },
        new_key: { type: 'string', description: 'New memory key to create.' },
        content: { type: 'string', description: 'Replacement memory content.' },
        author: { type: 'string', description: 'Who created the replacement memory.' },
        reason: { type: 'string', description: 'Optional reason for supersession.' },
        tags: { type: 'array', items: { type: 'string' } },
        importance: { type: 'number', minimum: 0, maximum: 1 },
        memory_type: { type: 'string', enum: ['episodic', 'semantic', 'procedural'] },
        namespace: { type: 'string' },
        source_type: { type: 'string', enum: ['manual', 'chat', 'doc', 'code', 'issue', 'pull_request', 'log', 'web', 'inferred'] },
        source_url: { type: 'string' },
        source_path: { type: 'string' },
        source_line_start: { type: 'integer', minimum: 1 },
        source_line_end: { type: 'integer', minimum: 1 },
        source_title: { type: 'string' },
        source_hash: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        verified_at: { type: 'string' },
        expires_at: { type: 'string' },
      },
      required: ['old_key', 'new_key', 'content', 'author'],
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
        include_statuses: {
          type: 'array',
          items: { type: 'string', enum: ['active', 'stale', 'superseded', 'deprecated'] },
          description: 'Lifecycle statuses to include in retrieval (default: active and stale).',
        },
        include_provenance: {
          type: 'boolean',
          description: 'Whether to include provenance metadata in retrieval text output (default: true).',
        },
        format: {
          type: 'string',
          enum: ['text', 'json'],
          description: 'Retrieval output format (default: text).',
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
        status: {
          type: 'string',
          enum: ['active', 'stale', 'superseded', 'deprecated'],
          description: 'Filter by lifecycle status.',
        },
        source_type: {
          type: 'string',
          enum: ['manual', 'chat', 'doc', 'code', 'issue', 'pull_request', 'log', 'web', 'inferred'],
          description: 'Filter by provenance source type.',
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
      'Analyze the memory store for consolidation and lifecycle maintenance opportunities. Finds similar pairs, stale/expired/unverified/low-confidence memories, provenance gaps, superseded-but-accessed entries, and deprecated deletion candidates. This is a READ-ONLY operation — no memories are modified. Returns a report with recommendations that you can act on using mark_memory_status, verify_memory, supersede_memory, store_memory, and delete_memory.',
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
export const VALID_SOURCE_TYPES = new Set<MemorySourceType>([
  'manual',
  'chat',
  'doc',
  'code',
  'issue',
  'pull_request',
  'log',
  'web',
  'inferred',
]);
export const VALID_MEMORY_STATUSES = new Set<MemoryStatus>([
  'active',
  'stale',
  'superseded',
  'deprecated',
]);
const VALID_RETRIEVE_FORMATS = new Set<RetrieveFormat>(['text', 'json']);

const MAX_NAMESPACE_LEN = 128;
const MAX_SOURCE_FIELD_LEN = 2048;
const MAX_SOURCE_TITLE_LEN = 512;
const MAX_REASON_LEN = 2048;

function validateRequiredKeyRef(raw: unknown, field: string): string {
  const key = validateOptionalKeyRef(raw, field);
  if (key === undefined) throw new Error(`${field} must be a non-empty string (max ${MAX_KEY_LEN} chars)`);
  return key;
}

function hasOwn(args: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(args, key);
}

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

export function validateSourceType(raw: unknown, field = 'source_type'): MemorySourceType {
  if (typeof raw !== 'string' || !VALID_SOURCE_TYPES.has(raw as MemorySourceType)) {
    throw new Error(`${field} must be one of: ${[...VALID_SOURCE_TYPES].join(', ')}`);
  }
  return raw as MemorySourceType;
}

export function validateMemoryStatus(raw: unknown, field = 'status'): MemoryStatus {
  if (typeof raw !== 'string' || !VALID_MEMORY_STATUSES.has(raw as MemoryStatus)) {
    throw new Error(`${field} must be one of: ${[...VALID_MEMORY_STATUSES].join(', ')}`);
  }
  return raw as MemoryStatus;
}

export function validateConfidence(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1) {
    throw new Error('confidence must be a number between 0.0 and 1.0');
  }
  return Math.round(raw * 100) / 100;
}

export function validateIsoDateString(raw: unknown, field: string): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new Error(`${field} must be an ISO 8601 date string`);
  const trimmed = raw.trim();
  const parsed = Date.parse(trimmed);
  if (!trimmed || Number.isNaN(parsed)) throw new Error(`${field} must be an ISO 8601 date string`);
  return trimmed;
}

function validateNullableString(raw: unknown, field: string, maxLen = MAX_SOURCE_FIELD_LEN): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > maxLen) {
    throw new Error(`${field} must be a string (max ${maxLen} chars)`);
  }
  const trimmed = raw.trim();
  return trimmed || null;
}

function validateOptionalLine(raw: unknown, field: string): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return raw;
}

export function validateOptionalLineRange(args: Record<string, unknown>): {
  source_line_start: number | null;
  source_line_end: number | null;
} {
  const source_line_start = validateOptionalLine(args.source_line_start, 'source_line_start');
  const source_line_end = validateOptionalLine(args.source_line_end, 'source_line_end');
  if (source_line_start !== null && source_line_end !== null && source_line_start > source_line_end) {
    throw new Error('source_line_start must be less than or equal to source_line_end');
  }
  return { source_line_start, source_line_end };
}

export function validateOptionalKeyRef(raw: unknown, field: string): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_KEY_LEN) {
    throw new Error(`${field} must be a non-empty string (max ${MAX_KEY_LEN} chars)`);
  }
  const trimmed = raw.trim();
  if (!KEY_PATTERN.test(trimmed)) {
    throw new Error(`${field} must contain only alphanumeric characters, hyphens, underscores, and dots`);
  }
  return trimmed;
}

export function validateStoreInput(args: Record<string, unknown>): StoreMemoryInput {
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

  const lineRange = validateOptionalLineRange(args);
  const supersedes = validateOptionalKeyRef(args.supersedes, 'supersedes');

  const result: StoreMemoryInput = {
    key: key.trim(),
    content: content.trim(),
    tags: validatedTags,
    importance: validatedImportance,
    author: author.trim(),
    memory_type: validatedMemoryType,
    namespace: validateNamespace(namespace),
    source_type: args.source_type === undefined ? 'manual' : validateSourceType(args.source_type),
    source_url: validateNullableString(args.source_url, 'source_url'),
    source_path: validateNullableString(args.source_path, 'source_path'),
    source_line_start: lineRange.source_line_start,
    source_line_end: lineRange.source_line_end,
    source_title: validateNullableString(args.source_title, 'source_title', MAX_SOURCE_TITLE_LEN),
    source_hash: validateNullableString(args.source_hash, 'source_hash'),
    status: args.status === undefined ? 'active' : validateMemoryStatus(args.status),
    confidence: args.confidence === undefined ? 0.75 : validateConfidence(args.confidence),
    verified_at: validateIsoDateString(args.verified_at, 'verified_at'),
    expires_at: validateIsoDateString(args.expires_at, 'expires_at'),
  };

  if (supersedes !== undefined) result.supersedes = supersedes;
  return result;
}

export function validateMarkMemoryStatusInput(args: Record<string, unknown>): MarkMemoryStatusInput {
  const result: MarkMemoryStatusInput = {
    key: validateRequiredKeyRef(args.key, 'key'),
    status: validateMemoryStatus(args.status),
  };
  if (args.reason !== undefined) {
    result.reason = validateNullableString(args.reason, 'reason', MAX_REASON_LEN) ?? undefined;
  }
  return result;
}

export function validateVerifyMemoryInput(args: Record<string, unknown>): VerifyMemoryInput {
  const result: VerifyMemoryInput = {
    key: validateRequiredKeyRef(args.key, 'key'),
    verified_at: new Date().toISOString(),
    status: args.status === undefined ? 'active' : validateMemoryStatus(args.status),
  };

  if (args.verified_at !== undefined && args.verified_at !== 'auto-now') {
    const verified = validateIsoDateString(args.verified_at, 'verified_at');
    if (verified === null) throw new Error('verified_at must be an ISO 8601 date string or "auto-now"');
    result.verified_at = verified;
  }
  if (hasOwn(args, 'confidence')) result.confidence = validateConfidence(args.confidence);
  if (hasOwn(args, 'source_type')) result.source_type = validateSourceType(args.source_type);
  if (hasOwn(args, 'source_url')) result.source_url = validateNullableString(args.source_url, 'source_url');
  if (hasOwn(args, 'source_path')) result.source_path = validateNullableString(args.source_path, 'source_path');
  const lineRange = validateOptionalLineRange(args);
  if (hasOwn(args, 'source_line_start')) result.source_line_start = lineRange.source_line_start;
  if (hasOwn(args, 'source_line_end')) result.source_line_end = lineRange.source_line_end;
  if (hasOwn(args, 'source_title')) result.source_title = validateNullableString(args.source_title, 'source_title', MAX_SOURCE_TITLE_LEN);
  if (hasOwn(args, 'source_hash')) result.source_hash = validateNullableString(args.source_hash, 'source_hash');
  if (hasOwn(args, 'expires_at')) result.expires_at = validateIsoDateString(args.expires_at, 'expires_at');

  return result;
}

export function validateSupersedeMemoryInput(args: Record<string, unknown>): SupersedeMemoryInput {
  const old_key = validateRequiredKeyRef(args.old_key, 'old_key');
  const new_key = validateRequiredKeyRef(args.new_key, 'new_key');
  if (old_key === new_key) throw new Error('new_key must differ from old_key');
  const storeInput = validateStoreInput({ ...args, key: new_key, supersedes: old_key, status: 'active' });
  const result: SupersedeMemoryInput = { ...storeInput, old_key, new_key };
  if (args.reason !== undefined) {
    result.reason = validateNullableString(args.reason, 'reason', MAX_REASON_LEN) ?? undefined;
  }
  return result;
}

export function validateRetrieveInput(args: Record<string, unknown>): RetrieveMemoryInput {
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

  if (args.include_statuses !== undefined) {
    if (!Array.isArray(args.include_statuses)) {
      throw new Error('include_statuses must be an array of memory statuses');
    }
    result.include_statuses = args.include_statuses.map((s) => validateMemoryStatus(s, 'include_statuses'));
  }
  if (args.include_provenance !== undefined) {
    if (typeof args.include_provenance !== 'boolean') {
      throw new Error('include_provenance must be a boolean');
    }
    result.include_provenance = args.include_provenance;
  }
  if (args.format !== undefined) {
    if (typeof args.format !== 'string' || !VALID_RETRIEVE_FORMATS.has(args.format as RetrieveFormat)) {
      throw new Error('format must be "text" or "json"');
    }
    result.format = args.format as RetrieveFormat;
  }

  const ns = validateNamespace(namespace);
  if (ns) result.namespace = ns;

  return result;
}

export function validateListInput(args: Record<string, unknown>): ListMemoriesInput {
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
  if (args.status !== undefined) {
    result.status = validateMemoryStatus(args.status);
  }
  if (args.source_type !== undefined) {
    result.source_type = validateSourceType(args.source_type);
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

function rowToMemory(row: MemoryRow | (Partial<MemoryRow> & Pick<MemoryRow, 'id' | 'key' | 'content' | 'tags' | 'importance' | 'author' | 'memory_type'>)): Memory {
  return {
    id: row.id,
    key: row.key,
    content: row.content,
    tags: JSON.parse(row.tags) as string[],
    importance: row.importance,
    author: row.author,
    memory_type: row.memory_type,
    namespace: row.namespace ?? null,
    source_type: row.source_type ?? 'manual',
    source_url: row.source_url ?? null,
    source_path: row.source_path ?? null,
    source_line_start: row.source_line_start ?? null,
    source_line_end: row.source_line_end ?? null,
    source_title: row.source_title ?? null,
    source_hash: row.source_hash ?? null,
    status: row.status ?? 'active',
    confidence: row.confidence ?? 0.75,
    verified_at: row.verified_at ?? null,
    expires_at: row.expires_at ?? null,
    supersedes_key: row.supersedes_key ?? null,
    superseded_by_key: row.superseded_by_key ?? null,
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? new Date(0).toISOString(),
    accessed_at: row.accessed_at ?? row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
    access_count: row.access_count ?? 0,
  };
}

type RetrievalResult = { memory: Memory; combinedScore: number; rerankerScore: number };

function memoryProvenance(memory: Memory) {
  return {
    source_type: memory.source_type,
    source_url: memory.source_url,
    source_path: memory.source_path,
    source_line_start: memory.source_line_start,
    source_line_end: memory.source_line_end,
    source_title: memory.source_title,
    source_hash: memory.source_hash,
  };
}

function memoryLifecycle(memory: Memory) {
  return {
    status: memory.status,
    confidence: memory.confidence,
    verified_at: memory.verified_at,
    expires_at: memory.expires_at,
  };
}

function memorySupersession(memory: Memory) {
  return {
    supersedes_key: memory.supersedes_key,
    superseded_by_key: memory.superseded_by_key,
  };
}

function memoryWarnings(memory: Memory): string[] {
  const warnings: string[] = [];
  if (memory.status === 'stale') warnings.push('Warning: stale memory; verify before relying on it.');
  if (memory.status === 'superseded' && memory.superseded_by_key) {
    warnings.push(`Warning: superseded by ${memory.superseded_by_key}; prefer the replacement.`);
  }
  if (memory.confidence < 0.5) warnings.push(`Warning: low confidence (${memory.confidence}).`);
  return warnings;
}

function provenanceLine(memory: Memory): string | null {
  const hasSpecificSource = Boolean(memory.source_url || memory.source_path || memory.source_title || memory.source_hash || memory.source_line_start || memory.source_line_end);
  if (memory.source_type === 'manual' && !hasSpecificSource) return null;

  const parts = [`type: ${memory.source_type}`];
  if (memory.source_title) parts.push(`title: ${memory.source_title}`);
  if (memory.source_url) parts.push(`url: ${memory.source_url}`);
  if (memory.source_path) {
    let path = memory.source_path;
    if (memory.source_line_start !== null && memory.source_line_end !== null) path += `:${memory.source_line_start}-${memory.source_line_end}`;
    else if (memory.source_line_start !== null) path += `:${memory.source_line_start}`;
    parts.push(`path: ${path}`);
  } else if (memory.source_line_start !== null || memory.source_line_end !== null) {
    const range = memory.source_line_start !== null && memory.source_line_end !== null
      ? `${memory.source_line_start}-${memory.source_line_end}`
      : String(memory.source_line_start ?? memory.source_line_end);
    parts.push(`lines: ${range}`);
  }
  if (memory.source_hash) parts.push(`hash: ${memory.source_hash}`);
  return `   Source: ${parts.join(' | ')}`;
}

function formatJsonResults(results: RetrievalResult[]): string {
  return JSON.stringify({
    results: results.map((r) => ({
      key: r.memory.key,
      content: r.memory.content,
      score: r.combinedScore,
      reranker_score: r.rerankerScore,
      importance: r.memory.importance,
      status: r.memory.status,
      confidence: r.memory.confidence,
      tags: r.memory.tags,
      namespace: r.memory.namespace,
      provenance: memoryProvenance(r.memory),
      lifecycle: memoryLifecycle(r.memory),
      supersession: memorySupersession(r.memory),
      warnings: memoryWarnings(r.memory),
    })),
  }, null, 2);
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
      case 'mark_memory_status':
        return await markMemoryStatus(validateMarkMemoryStatusInput(args), adapter);
      case 'verify_memory':
        return await verifyMemory(validateVerifyMemoryInput(args), adapter);
      case 'supersede_memory':
        return await supersedeMemory(validateSupersedeMemoryInput(args), adapter);
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

async function storeMemory(input: StoreMemoryInput, adapter: RecallAdapter): Promise<McpToolResult> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Generate embedding from content
  const embedding = await adapter.embed(input.content);

  // Deduplication check — warn if very similar content exists under a different key
  const dupeMatches = await adapter.vectorQuery(embedding, 1);

  if (dupeMatches.length) {
    const top = dupeMatches[0];
    if (top.score > 0.92 && top.id !== input.key && top.id !== input.supersedes) {
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
      `INSERT INTO memories (
         id, key, content, tags, importance, author, memory_type, namespace,
         source_type, source_url, source_path, source_line_start, source_line_end,
         source_title, source_hash, status, confidence, verified_at, expires_at,
         supersedes_key, superseded_by_key,
         created_at, updated_at, accessed_at, access_count
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0)
       ON CONFLICT (key) DO UPDATE SET
         content = excluded.content,
         tags = excluded.tags,
         importance = excluded.importance,
         author = excluded.author,
         memory_type = excluded.memory_type,
         namespace = excluded.namespace,
         source_type = excluded.source_type,
         source_url = excluded.source_url,
         source_path = excluded.source_path,
         source_line_start = excluded.source_line_start,
         source_line_end = excluded.source_line_end,
         source_title = excluded.source_title,
         source_hash = excluded.source_hash,
         status = excluded.status,
         confidence = excluded.confidence,
         verified_at = excluded.verified_at,
         expires_at = excluded.expires_at,
         supersedes_key = excluded.supersedes_key,
         superseded_by_key = NULL,
         updated_at = excluded.updated_at`,
      [
        id,
        input.key,
        input.content,
        JSON.stringify(input.tags),
        input.importance,
        input.author,
        input.memory_type,
        input.namespace,
        input.source_type,
        input.source_url,
        input.source_path,
        input.source_line_start,
        input.source_line_end,
        input.source_title,
        input.source_hash,
        input.status,
        input.confidence,
        input.verified_at,
        input.expires_at,
        input.supersedes ?? null,
        now,
        now,
        now,
      ],
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
      status: input.status,
      source_type: input.source_type,
      confidence: input.confidence,
      namespace: input.namespace,
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

async function markMemoryStatus(input: MarkMemoryStatusInput, adapter: RecallAdapter): Promise<McpToolResult> {
  const existing = await adapter.query('SELECT id FROM memories WHERE key = ?', [input.key]);
  if (!existing.length) return textResult(`Memory "${input.key}" not found.`, true);

  const now = new Date().toISOString();
  await adapter.query('UPDATE memories SET status = ?, updated_at = ? WHERE key = ?', [input.status, now, input.key]);

  const reason = input.reason ? ` Reason: ${input.reason}` : '';
  return textResult(`Marked memory "${input.key}" as ${input.status}.${reason}`);
}

async function verifyMemory(input: VerifyMemoryInput, adapter: RecallAdapter): Promise<McpToolResult> {
  const existing = await adapter.query('SELECT id FROM memories WHERE key = ?', [input.key]);
  if (!existing.length) return textResult(`Memory "${input.key}" not found.`, true);

  const assignments: string[] = ['verified_at = ?', 'status = ?', 'updated_at = ?'];
  const now = new Date().toISOString();
  const params: unknown[] = [input.verified_at, input.status, now];

  const optionalFields: Array<keyof VerifyMemoryInput> = [
    'confidence',
    'source_type',
    'source_url',
    'source_path',
    'source_line_start',
    'source_line_end',
    'source_title',
    'source_hash',
    'expires_at',
  ];
  for (const field of optionalFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      assignments.push(`${field} = ?`);
      params.push(input[field]);
    }
  }
  params.push(input.key);

  await adapter.query(`UPDATE memories SET ${assignments.join(', ')} WHERE key = ?`, params);
  return textResult(`Verified memory "${input.key}" at ${input.verified_at} with status ${input.status}.`);
}

async function supersedeMemory(input: SupersedeMemoryInput, adapter: RecallAdapter): Promise<McpToolResult> {
  const oldExists = await adapter.query('SELECT id FROM memories WHERE key = ?', [input.old_key]);
  if (!oldExists.length) return textResult(`Memory "${input.old_key}" not found.`, true);

  const newExistsBefore = await adapter.query('SELECT id FROM memories WHERE key = ?', [input.new_key]);
  if (newExistsBefore.length) return textResult(`Replacement memory "${input.new_key}" already exists.`, true);

  const storeResult = await storeMemory(input, adapter);
  const newExistsAfter = await adapter.query('SELECT id FROM memories WHERE key = ?', [input.new_key]);
  if (!newExistsAfter.length) {
    return storeResult.isError ? storeResult : textResult(`Replacement memory "${input.new_key}" was not stored.`, true);
  }

  const now = new Date().toISOString();
  await adapter.batch([
    {
      sql: 'UPDATE memories SET status = ?, superseded_by_key = ?, updated_at = ? WHERE key = ?',
      params: ['superseded', input.new_key, now, input.old_key],
    },
    {
      sql: `INSERT INTO memory_relationships (from_key, to_key, relationship_type, strength, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (from_key, to_key, relationship_type) DO UPDATE SET strength = excluded.strength`,
      params: [input.new_key, input.old_key, 'supersedes', 1.0, now],
    },
    {
      sql: `INSERT INTO memory_relationships (from_key, to_key, relationship_type, strength, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (from_key, to_key, relationship_type) DO UPDATE SET strength = excluded.strength`,
      params: [input.old_key, input.new_key, 'superseded_by', 1.0, now],
    },
  ]);

  const reason = input.reason ? ` Reason: ${input.reason}` : '';
  const warning = storeResult.isError ? ` Store warning: ${storeResult.content[0]?.text ?? 'index sync warning'}` : '';
  return textResult(`Superseded memory "${input.old_key}" with "${input.new_key}".${reason}${warning}`);
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

  // Lifecycle filter: active/stale by default; superseded/deprecated only when explicitly requested.
  const includeStatuses = input.include_statuses ?? ['active', 'stale'];
  memories = memories.filter((m) => includeStatuses.includes(m.status));

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
    const baseScore = 0.5 * item.rerankerScore + 0.3 * recencyScore + 0.2 * item.memory.importance;
    const combinedScore = item.memory.status === 'stale' ? baseScore - 0.05 : baseScore;
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

  if (input.format === 'json') {
    return textResult(formatJsonResults(topResults));
  }

  const lines = topResults.map((r, i) => {
    const tagStr = r.memory.tags.length ? r.memory.tags.join(', ') : 'none';
    const details = [
      `${i + 1}. **${r.memory.key}** (score: ${r.combinedScore.toFixed(3)}, importance: ${r.memory.importance}, status: ${r.memory.status}, confidence: ${r.memory.confidence})`,
      `   Tags: ${tagStr} | Author: ${r.memory.author}`,
    ];
    const source = input.include_provenance === false ? null : provenanceLine(r.memory);
    if (source) details.push(source);
    details.push(...memoryWarnings(r.memory).map((w) => `   ${w}`));
    details.push(`   ${r.memory.content}`);
    return details.join('\n');
  });

  return textResult(`Found ${topResults.length} relevant memories:\n\n${lines.join('\n\n')}`);
}

async function listMemories(input: ListMemoriesInput, adapter: RecallAdapter): Promise<McpToolResult> {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  let query = 'SELECT key, tags, importance, author, memory_type, namespace, status, confidence, source_type, supersedes_key, superseded_by_key, created_at, updated_at, accessed_at, access_count FROM memories';
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

  if (input.status) {
    conditions.push('status = ?');
    bindings.push(input.status);
  }

  if (input.source_type) {
    conditions.push('source_type = ?');
    bindings.push(input.source_type);
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
    status: r.status ?? 'active',
    confidence: r.confidence ?? 0.75,
    source_type: r.source_type ?? 'manual',
    supersedes_key: r.supersedes_key ?? null,
    superseded_by_key: r.superseded_by_key ?? null,
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
    return `- **${m.key}**${nsPart} [${m.importance}] ${m.memory_type} by ${m.author} — status: ${m.status}, confidence: ${m.confidence}, source: ${m.source_type}, tags: ${m.tags.join(', ') || 'none'} (updated: ${m.updated_at}, accessed: ${m.access_count}x)`;
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
    return '## Memory Consolidation Report\n\n**READ-ONLY: this report did not modify, delete, verify, supersede, or mark any memories.**\n\nNo memories to analyze.';
  }

  const memories = allRows.map(rowToMemory);

  // 2. Find lifecycle maintenance candidates (cheap — D1 only, no AI calls)
  const now = Date.now();
  const staleThresholdMs = staleDays * 24 * 60 * 60 * 1000;
  const activeOrStale = new Set<MemoryStatus>(['active', 'stale']);
  const daysSince = (iso: string): number => Math.floor((now - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  const hasNoProvenance = (m: Memory): boolean =>
    m.source_type === 'manual' &&
    !m.source_url &&
    !m.source_path &&
    !m.source_title &&
    !m.source_hash;

  const staleMemories = memories
    .filter((m) => {
      const age = now - new Date(m.updated_at).getTime();
      return activeOrStale.has(m.status) && m.access_count === 0 && age > staleThresholdMs;
    })
    .map((m) => ({
      key: m.key,
      status: m.status,
      age_days: daysSince(m.updated_at),
      importance: m.importance,
    }));

  const expiredMemories = memories
    .filter((m) => activeOrStale.has(m.status) && m.expires_at && Date.parse(m.expires_at) < now)
    .map((m) => ({ key: m.key, status: m.status, expired_days: daysSince(m.expires_at as string), expires_at: m.expires_at }));

  const oldUnverifiedMemories = memories
    .filter((m) => {
      if (!activeOrStale.has(m.status)) return false;
      if (!m.verified_at) return true;
      return now - Date.parse(m.verified_at) > staleThresholdMs;
    })
    .map((m) => ({
      key: m.key,
      status: m.status,
      verified_at: m.verified_at,
      unverified_days: m.verified_at ? daysSince(m.verified_at) : null,
      confidence: m.confidence,
    }));

  const supersededAccessedMemories = memories
    .filter((m) => m.status === 'superseded' && m.access_count > 0)
    .map((m) => ({ key: m.key, access_count: m.access_count, superseded_by_key: m.superseded_by_key }));

  const lowConfidenceMemories = memories
    .filter((m) => m.confidence < 0.5)
    .map((m) => ({ key: m.key, status: m.status, confidence: m.confidence }));

  const noProvenanceMemories = memories
    .filter(hasNoProvenance)
    .map((m) => ({ key: m.key, status: m.status, confidence: m.confidence }));

  const deprecatedMemories = memories
    .filter((m) => m.status === 'deprecated')
    .map((m) => ({ key: m.key, importance: m.importance, access_count: m.access_count }));

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
  report.push('**READ-ONLY: this report did not modify, delete, verify, supersede, or mark any memories.**');
  report.push('');

  const pushEmpty = (title: string, empty: string): void => {
    report.push(`### ${title}`, empty, '');
  };

  if (similarPairs.length > 0) {
    report.push(
      `### Similar Memory Pairs That May Need Merge/Supersession (threshold: ${similarityThreshold})`,
    );
    report.push(
      `Found ${similarPairs.length} pair(s) that may be candidates for merge or supersession. Suggested lifecycle tools: \`supersede_memory\` when one memory replaces another, or \`store_memory\` followed by \`delete_memory\` when manually merging into a new key.`,
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
    pushEmpty('Similar Memory Pairs That May Need Merge/Supersession', 'No similar pairs found above threshold.');
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
        `- **"${mem.key}"** — status: ${mem.status}, ${mem.age_days} days old, importance: ${mem.importance}. Suggested: \`mark_memory_status\`, \`verify_memory\`, or \`delete_memory\` after review.`,
      );
    }
    report.push('');
  } else {
    pushEmpty('Stale Memories', 'No stale memories found.');
  }

  if (expiredMemories.length > 0) {
    report.push('### Expired Active/Stale Memories');
    report.push('Active or stale memories whose `expires_at` is in the past. Suggested: `verify_memory` to refresh, `mark_memory_status` to stale/deprecated, or `delete_memory` if no longer useful.');
    report.push('');
    for (const mem of expiredMemories) {
      report.push(`- **"${mem.key}"** — status: ${mem.status}, expired ${mem.expired_days} days ago (expires_at: ${mem.expires_at})`);
    }
    report.push('');
  } else {
    pushEmpty('Expired Active/Stale Memories', 'No expired active/stale memories found.');
  }

  if (oldUnverifiedMemories.length > 0) {
    report.push(`### Old Unverified Active/Stale Memories (stale_days: ${staleDays})`);
    report.push('Active or stale memories with `verified_at` missing or older than the configured stale_days. Suggested: `verify_memory` with provenance/confidence, or `mark_memory_status` if trust is uncertain.');
    report.push('');
    for (const mem of oldUnverifiedMemories) {
      const age = mem.unverified_days === null ? 'never verified' : `verified ${mem.unverified_days} days ago`;
      report.push(`- **"${mem.key}"** — status: ${mem.status}, ${age}, confidence: ${mem.confidence}`);
    }
    report.push('');
  } else {
    pushEmpty('Old Unverified Active/Stale Memories', 'No old unverified active/stale memories found.');
  }

  if (supersededAccessedMemories.length > 0) {
    report.push('### Superseded Memories Still Highly Accessed');
    report.push('Superseded memories with access_count > 0 may still be retrieved or referenced. Suggested: inspect callers, `verify_memory`/`mark_memory_status`, or update retrieval habits before `delete_memory`.');
    report.push('');
    for (const mem of supersededAccessedMemories) {
      report.push(`- **"${mem.key}"** — access_count: ${mem.access_count}${mem.superseded_by_key ? `, superseded_by: ${mem.superseded_by_key}` : ''}`);
    }
    report.push('');
  } else {
    pushEmpty('Superseded Memories Still Highly Accessed', 'No superseded memories with access_count > 0 found.');
  }

  if (lowConfidenceMemories.length > 0) {
    report.push('### Low-Confidence Memories (confidence < 0.5)');
    report.push('Suggested: `verify_memory` with stronger provenance/confidence, `mark_memory_status` as stale/deprecated, or `delete_memory` if incorrect.');
    report.push('');
    for (const mem of lowConfidenceMemories) {
      report.push(`- **"${mem.key}"** — status: ${mem.status}, confidence: ${mem.confidence}`);
    }
    report.push('');
  } else {
    pushEmpty('Low-Confidence Memories', 'No memories with confidence < 0.5 found.');
  }

  if (noProvenanceMemories.length > 0) {
    report.push('### Memories With No Provenance');
    report.push('Manual memories without source_url/source_path/source_title/source_hash. Suggested: `verify_memory` to attach provenance or confidence, or `mark_memory_status` if trust cannot be established.');
    report.push('');
    for (const mem of noProvenanceMemories) {
      report.push(`- **"${mem.key}"** — status: ${mem.status}, confidence: ${mem.confidence}`);
    }
    report.push('');
  } else {
    pushEmpty('Memories With No Provenance', 'No manual memories without provenance found.');
  }

  if (deprecatedMemories.length > 0) {
    report.push('### Deprecated Memories That Can Be Deleted');
    report.push('Deprecated memories are deletion candidates after final review. Suggested: `delete_memory` for obsolete entries, or `mark_memory_status` if they should be retained.');
    report.push('');
    for (const mem of deprecatedMemories) {
      report.push(`- **"${mem.key}"** — importance: ${mem.importance}, access_count: ${mem.access_count}`);
    }
    report.push('');
  } else {
    pushEmpty('Deprecated Memories That Can Be Deleted', 'No deprecated deletion candidates found.');
  }

  report.push('### Recommendations');
  const issueCount = similarPairs.length + staleMemories.length + expiredMemories.length + oldUnverifiedMemories.length + supersededAccessedMemories.length + lowConfidenceMemories.length + noProvenanceMemories.length + deprecatedMemories.length;
  if (issueCount > 0) {
    report.push(
      'Review the sections above and apply lifecycle tools deliberately: `verify_memory` to refresh trust/provenance, `mark_memory_status` to active/stale/deprecated/superseded, `supersede_memory` when replacing stale content, `store_memory` for manual merges, and `delete_memory` only after review.',
    );
    report.push('**This report is read-only — no memories were modified.**');
  } else {
    report.push('Memory store looks clean. No lifecycle action needed.');
    report.push('**This report is read-only — no memories were modified.**');
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
