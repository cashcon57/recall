// src/adapter.ts

export interface VectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RecallAdapter {
  // Execute single SQL query, returns rows
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  // Execute multiple SQL statements atomically
  batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void>;

  // Upsert a vector
  vectorUpsert(id: string, values: number[], metadata: Record<string, unknown>): Promise<void>;

  // Delete vectors by id
  vectorDelete(ids: string[]): Promise<void>;

  // ANN query, top-k matches
  vectorQuery(values: number[], topK: number): Promise<VectorMatch[]>;

  // Generate embedding for single text
  embed(text: string): Promise<number[]>;

  // Cross-encoder rerank: returns score per passage
  rerank(query: string, passages: string[]): Promise<number[]>;

  // Whether destructive ops (clear_memories) are enabled
  isDestructiveAllowed(): boolean;
}
