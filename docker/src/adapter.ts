// docker/src/adapter.ts
import pg from 'pg';
const { Pool } = pg;
import { pipeline } from '@huggingface/transformers';
import type { RecallAdapter, VectorMatch } from '../../src/adapter.js';

const EMBED_MODEL = 'Xenova/bge-m3';
const EMBED_DIM = 1024;

function toPostgresParams(sql: string, paramCount: number): string {
  let i = 1;
  const pgSql = sql.replace(/\?/g, () => `$${i++}`);
  if (i - 1 !== paramCount) {
    throw new Error(`SQL placeholder/param count mismatch: ${i - 1} placeholders, ${paramCount} params. SQL: ${sql}`);
  }
  return pgSql;
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
    const pgSql = toPostgresParams(sql, params.length);
    const result = await this.pool.query(pgSql, params);
    return result.rows.map((row) => {
      const normalized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        // Re-serialize JSONB values (arrays/objects) that pg auto-parses,
        // so shared tools.ts code (written for D1 string columns) can JSON.parse() them.
        normalized[k] = (Array.isArray(v) || (v !== null && typeof v === 'object' && !(v instanceof Date)))
          ? JSON.stringify(v)
          : v;
      }
      return normalized as T;
    }) as T[];
  }

  async batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const { sql, params = [] } of statements) {
        await client.query(toPostgresParams(sql, params.length), params);
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

  // Eager-load embedder. Must be called before any tool operations.
  async init(): Promise<void> {
    if (!this.embedder) {
      process.stderr.write('[recall-docker] loading embedding model (first run downloads ~580MB)...\n');
      this.embedder = await pipeline('feature-extraction', EMBED_MODEL, { dtype: 'fp32' });
      process.stderr.write('[recall-docker] embedding model ready\n');
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.embedder) {
      this.embedder = await pipeline('feature-extraction', EMBED_MODEL, { dtype: 'fp32' });
    }
    const output = await this.embedder(text, { pooling: 'cls', normalize: true });
    const vec = Array.from(output.data as Float32Array);
    if (vec.length !== EMBED_DIM) {
      throw new Error(`Unexpected embedding dimension: got ${vec.length}, expected ${EMBED_DIM}. Model: ${EMBED_MODEL}`);
    }
    return vec;
  }

  async ftsSearch(query: string, limit: number): Promise<string[]> {
    try {
      const result = await this.pool.query<{ key: string }>(
        `SELECT key FROM memories
         WHERE to_tsvector('english', content || ' ' || key) @@ plainto_tsquery('english', $1)
         ORDER BY ts_rank(to_tsvector('english', content || ' ' || key), plainto_tsquery('english', $1)) DESC
         LIMIT $2`,
        [query, limit]
      );
      return result.rows.map(r => r.key);
    } catch (err) {
      process.stderr.write(`[fts:pg] search failed: ${err instanceof Error ? err.message : err}\n`);
      return [];
    }
  }

  async ftsUpsert(_key: string, _content: string, _tags: string): Promise<void> {
    // No-op: Postgres GIN index auto-maintains from the memories table
  }

  async ftsDelete(_keys: string[]): Promise<void> {
    // No-op: row DELETE from memories cascades via auto-maintained GIN index
  }

  async rerank(_query: string, passages: string[]): Promise<number[]> {
    return passages.map(() => 0); // raw logit 0 = neutral after sigmoid
  }

  isDestructiveAllowed(): boolean {
    return process.env.ALLOW_DESTRUCTIVE_TOOLS === 'true';
  }
}
