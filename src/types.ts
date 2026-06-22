// --- Worker environment bindings ---

export interface Env {
  DB: D1Database;
  VECTORS: VectorizeIndex;
  AI: Ai;
  MEMORY_API_KEY: string;
  /**
   * Optional: set to "true" via `wrangler secret put ALLOW_DESTRUCTIVE_TOOLS`
   * or as a plain var to enable the `clear_memories` tool. Defaults to
   * disabled so a leaked API key cannot wipe the entire store in one call.
   */
  ALLOW_DESTRUCTIVE_TOOLS?: string;
}

// --- Domain types ---

export type MemoryType = 'episodic' | 'semantic' | 'procedural';
export type MemorySourceType = 'manual' | 'chat' | 'doc' | 'code' | 'issue' | 'pull_request' | 'log' | 'web' | 'inferred';
export type MemoryStatus = 'active' | 'stale' | 'superseded' | 'deprecated';
export type RetrieveFormat = 'text' | 'json';

export interface Memory {
  id: string;
  key: string;
  content: string;
  tags: string[];
  importance: number;
  author: string;
  memory_type: MemoryType;
  namespace: string | null;
  source_type: MemorySourceType;
  source_url: string | null;
  source_path: string | null;
  source_line_start: number | null;
  source_line_end: number | null;
  source_title: string | null;
  source_hash: string | null;
  status: MemoryStatus;
  confidence: number;
  verified_at: string | null;
  expires_at: string | null;
  supersedes_key: string | null;
  superseded_by_key: string | null;
  created_at: string;
  updated_at: string;
  accessed_at: string;
  access_count: number;
}

/** Raw row from D1 — tags is a JSON string, not a parsed array. */
export interface MemoryRow {
  id: string;
  key: string;
  content: string;
  tags: string;
  importance: number;
  author: string;
  memory_type: MemoryType;
  namespace: string | null;
  source_type: MemorySourceType;
  source_url: string | null;
  source_path: string | null;
  source_line_start: number | null;
  source_line_end: number | null;
  source_title: string | null;
  source_hash: string | null;
  status: MemoryStatus;
  confidence: number;
  verified_at: string | null;
  expires_at: string | null;
  supersedes_key: string | null;
  superseded_by_key: string | null;
  created_at: string;
  updated_at: string;
  accessed_at: string;
  access_count: number;
}

export interface MemoryRelationship {
  from_key: string;
  to_key: string;
  relationship_type: string;
  strength: number;
  created_at: string;
}

// --- JSON-RPC 2.0 types ---

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// --- MCP tool types ---

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// --- Tool input types ---

export interface StoreMemoryInput {
  key: string;
  content: string;
  tags: string[];
  importance: number;
  author: string;
  memory_type: MemoryType;
  namespace: string | null;
  source_type: MemorySourceType;
  source_url: string | null;
  source_path: string | null;
  source_line_start: number | null;
  source_line_end: number | null;
  source_title: string | null;
  source_hash: string | null;
  status: MemoryStatus;
  confidence: number;
  verified_at: string | null;
  expires_at: string | null;
  supersedes?: string;
}

export interface MarkMemoryStatusInput {
  key: string;
  status: MemoryStatus;
  reason?: string;
}

export interface VerifyMemoryInput {
  key: string;
  confidence?: number;
  source_type?: MemorySourceType;
  source_url?: string | null;
  source_path?: string | null;
  source_line_start?: number | null;
  source_line_end?: number | null;
  source_title?: string | null;
  source_hash?: string | null;
  verified_at: string;
  expires_at?: string | null;
  status: MemoryStatus;
}

export interface SupersedeMemoryInput extends StoreMemoryInput {
  old_key: string;
  new_key: string;
  reason?: string;
}

export interface GetRelatedMemoriesInput {
  key: string;
  relationship_type?: string;
  limit?: number;
}

export interface RetrieveMemoryInput {
  query: string;
  limit?: number;
  min_importance?: number;
  tags?: string[];
  namespace?: string;
  include_statuses?: MemoryStatus[];
  include_provenance?: boolean;
  format?: RetrieveFormat;
}

export interface ListMemoriesInput {
  tag?: string;
  author?: string;
  namespace?: string;
  limit?: number;
  offset?: number;
  status?: MemoryStatus;
  source_type?: MemorySourceType;
}

export interface DeleteMemoryInput {
  key: string;
}

export interface ClearMemoriesInput {
  confirm: boolean;
}

export interface ConsolidateMemoriesInput {
  similarity_threshold?: number;
  stale_days?: number;
  max_memories?: number;
}
