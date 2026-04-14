import type { RecallAdapter, VectorMatch } from '../adapter';
import type { Env } from '../types';

const EMBED_MODEL = '@cf/baai/bge-m3';
const EMBED_DIM = 1024;
const RERANK_MODEL = '@cf/baai/bge-reranker-base';

export class CloudflareAdapter implements RecallAdapter {
  constructor(private env: Env) {}

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.env.DB.prepare(sql);
    const bound = params.length > 0 ? stmt.bind(...params) : stmt;
    const result = await bound.all<T>();
    return result.results ?? [];
  }

  async batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    const stmts = statements.map(({ sql, params = [] }) => {
      const stmt = this.env.DB.prepare(sql);
      return params.length > 0 ? stmt.bind(...params) : stmt;
    });
    await this.env.DB.batch(stmts);
  }

  async vectorUpsert(id: string, values: number[], metadata: Record<string, unknown>): Promise<void> {
    await this.env.VECTORS.upsert([{ id, values, metadata: metadata as Record<string, VectorizeVectorMetadata> }]);
  }

  async vectorDelete(ids: string[]): Promise<void> {
    await this.env.VECTORS.deleteByIds(ids);
  }

  async vectorQuery(values: number[], topK: number): Promise<VectorMatch[]> {
    const result = await this.env.VECTORS.query(values, { topK, returnMetadata: 'all' });
    return (result.matches ?? []).map((m) => ({
      id: m.id,
      score: m.score,
      metadata: m.metadata as Record<string, unknown> | undefined,
    }));
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.env.AI.run(EMBED_MODEL, { text: [text] });
    const data = result as unknown as { data: number[][] };
    const vec = data?.data?.[0];
    if (!Array.isArray(vec)) throw new Error('Embedding generation returned no data');
    if (vec.length !== EMBED_DIM) throw new Error(`Unexpected embedding dimension: ${vec.length}`);
    return vec;
  }

  async rerank(query: string, passages: string[]): Promise<number[]> {
    const result = await (this.env.AI as unknown as { run(model: string, input: unknown): Promise<unknown> }).run(
      RERANK_MODEL,
      { query, contexts: passages.map((text) => ({ text })) },
    ) as { data: Array<{ index: number; score: number }> };
    if (!result?.data?.length) return passages.map(() => 0);
    const scores = new Array(passages.length).fill(0);
    for (const r of result.data) scores[r.index] = r.score; // raw logits
    return scores;
  }

  async ftsSearch(query: string, limit: number): Promise<string[]> {
    const safeQuery = query.replace(/['"*()^~:]/g, ' ').trim();
    if (!safeQuery) return [];
    try {
      const result = await this.env.DB.prepare(
        `SELECT key FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?`
      ).bind(safeQuery, limit).all<{ key: string }>();
      return result.results?.map(r => r.key) ?? [];
    } catch (err) {
      console.error('[fts:cf] search failed:', err instanceof Error ? err.message : err);
      return [];
    }
  }

  async ftsUpsert(key: string, content: string, tags: string): Promise<void> {
    await this.env.DB.batch([
      this.env.DB.prepare('DELETE FROM memories_fts WHERE key = ?').bind(key),
      this.env.DB.prepare('INSERT INTO memories_fts (key, content, tags) VALUES (?, ?, ?)').bind(key, content, tags),
    ]);
  }

  async ftsDelete(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const placeholders = keys.map(() => '?').join(',');
    await this.env.DB.prepare(`DELETE FROM memories_fts WHERE key IN (${placeholders})`).bind(...keys).run();
  }

  isDestructiveAllowed(): boolean {
    return this.env.ALLOW_DESTRUCTIVE_TOOLS === 'true';
  }
}
