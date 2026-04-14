// docker/src/adapter.ts
import pg from 'pg';
const { Pool } = pg;
import { pipeline } from '@huggingface/transformers';
import type { RecallAdapter, VectorMatch } from '../../src/adapter.js';

const EMBED_MODEL = 'Xenova/bge-base-en-v1.5';

function toPostgresParams(sql: string): string {
  let i = 1;
  return sql.replace(/\?/g, () => `$${i++}`);
}

export class DockerAdapter implements RecallAdapter {
  private pool: pg.Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private embedder: any = null;

  constructor() {
    this.pool = new Pool({
      host: process.env.PG_HOST ?? 'localhost',
      port: parseInt(process.env.PG_PORT ?? '5432'),
      database: process.env.PG_DB ?? 'recall',
      user: process.env.PG_USER ?? 'recall',
      password: process.env.PG_PASSWORD ?? 'recall',
    });
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const pgSql = toPostgresParams(sql);
    const result = await this.pool.query(pgSql, params);
    return result.rows as T[];
  }

  async batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const { sql, params = [] } of statements) {
        await client.query(toPostgresParams(sql), params);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async vectorUpsert(id: string, values: number[], _metadata: Record<string, unknown>): Promise<void> {
    const vec = `[${values.join(',')}]`;
    await this.pool.query(
      'INSERT INTO vec_memories(key, embedding) VALUES($1, $2::vector) ON CONFLICT(key) DO UPDATE SET embedding = EXCLUDED.embedding',
      [id, vec]
    );
  }

  async vectorDelete(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await this.pool.query(`DELETE FROM vec_memories WHERE key IN (${placeholders})`, ids);
  }

  async vectorQuery(values: number[], topK: number): Promise<VectorMatch[]> {
    const vec = `[${values.join(',')}]`;
    const result = await this.pool.query<{ key: string; score: number }>(
      `SELECT key, 1 - (embedding <=> $1::vector) AS score FROM vec_memories ORDER BY embedding <=> $1::vector LIMIT $2`,
      [vec, topK]
    );
    return result.rows.map((r) => ({ id: r.key, score: r.score }));
  }

  async embed(text: string): Promise<number[]> {
    if (!this.embedder) {
      this.embedder = await pipeline('feature-extraction', EMBED_MODEL, { dtype: 'fp32' });
    }
    const output = await this.embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  }

  async rerank(_query: string, passages: string[]): Promise<number[]> {
    return passages.map(() => 0); // raw logit 0 = neutral after sigmoid
  }

  isDestructiveAllowed(): boolean {
    return process.env.ALLOW_DESTRUCTIVE_TOOLS === 'true';
  }
}
