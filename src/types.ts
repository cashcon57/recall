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

export interface Memory {
  id: string;
  key: string;
  content: string;
  tags: string[];
  importance: number;
  author: string;
  memory_type: MemoryType;
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
}

export interface ListMemoriesInput {
  tag?: string;
  author?: string;
  limit?: number;
  offset?: number;
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
