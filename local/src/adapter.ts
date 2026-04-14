// local/src/adapter.ts
import Database from 'better-sqlite3';
import { pipeline } from '@huggingface/transformers';
import type { RecallAdapter, VectorMatch } from '../../src/adapter.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const EMBED_MODEL = 'Xenova/bge-m3';
const EMBED_DIM = 1024;
const __dirname_local = dirname(fileURLToPath(import.meta.url));

export class LocalAdapter implements RecallAdapter {
  private db: Database.Database;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private embedder: any = null;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    // Load sqlite-vec extension.
    // Notes:
    // - better-sqlite3 loadExtension appends the OS extension (.dylib on macOS, .so on Linux)
    //   automatically, so the path must NOT include the .dylib/.so extension.
    // - The bundled sqlite-vec.dylib uses entrypoint "sqlite3_vec_init". If the user provides
    //   a different build they can override via SQLITE_VEC_ENTRYPOINT.
    // - With rootDir="..", this file compiles to dist/local/src/adapter.js, so __dirname_local
    //   at runtime is <project>/local/dist/local/src — three levels up reaches <project>/local/.
    const vecPathDefault = resolve(__dirname_local, '../../../sqlite-vec');
    const vecPathEnv = process.env.SQLITE_VEC_PATH;
    // If the env var includes an extension, strip it so better-sqlite3 can append the correct one
    const vecPath = vecPathEnv
      ? vecPathEnv.replace(/\.(dylib|so|dll)$/, '')
      : vecPathDefault;
    const vecEntrypoint = process.env.SQLITE_VEC_ENTRYPOINT ?? 'sqlite3_vec_init';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any).loadExtension(vecPath, vecEntrypoint);
    } catch (e) {
      throw new Error(
        `Failed to load sqlite-vec from ${vecPath} (entrypoint: ${vecEntrypoint}). ` +
        `Set SQLITE_VEC_PATH (path to sqlite-vec extension, with or without file extension) and optionally SQLITE_VEC_ENTRYPOINT. ` +
        `Error: ${String(e)}`
      );
    }

    // Run setup SQL (creates regular tables + FTS5)
    const setupSql = readFileSync(resolve(__dirname_local, '../../../setup.sql'), 'utf-8');
    this.db.exec(setupSql);

    // Create vec_memories AFTER extension is loaded (requires vec0 virtual table support)
    this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
      key TEXT PRIMARY KEY,
      embedding FLOAT[${EMBED_DIM}]
    )`);
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return stmt.all(...(params as any[])) as T[];
  }

  async batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    const runAll = this.db.transaction(() => {
      for (const { sql, params = [] } of statements) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.db.prepare(sql).run(...(params as any[]));
      }
    });
    runAll();
  }

  async vectorUpsert(id: string, values: number[], _metadata: Record<string, unknown>): Promise<void> {
    // sqlite-vec expects a JSON array string for vector values
    const vecJson = JSON.stringify(values);
    this.db.prepare(
      'INSERT INTO vec_memories(key, embedding) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET embedding = excluded.embedding'
    ).run(id, vecJson);
  }

  async vectorDelete(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.db.prepare(`DELETE FROM vec_memories WHERE key IN (${placeholders})`).run(...(ids as any[]));
  }

  async vectorQuery(values: number[], topK: number): Promise<VectorMatch[]> {
    // sqlite-vec KNN query: ORDER BY distance returns L2 distance
    const vecJson = JSON.stringify(values);
    const rows = this.db.prepare(
      `SELECT key, distance FROM vec_memories WHERE embedding MATCH ? AND k = ? ORDER BY distance LIMIT ?`
    ).all(vecJson, topK, topK) as Array<{ key: string; distance: number }>;

    // For L2-normalized vectors: L2² = 2(1 - cos) → cos = 1 - L2²/2
    return rows.map((r) => ({
      id: r.key,
      score: Math.max(0, Math.min(1, 1 - (r.distance * r.distance) / 2)),
    }));
  }

  // Eager-load embedder. Must be called before any tool operations.
  async init(): Promise<void> {
    if (!this.embedder) {
      process.stderr.write('[recall-local] loading embedding model (first run downloads ~580MB)...\n');
      this.embedder = await pipeline('feature-extraction', EMBED_MODEL, { dtype: 'fp32' });
      process.stderr.write('[recall-local] embedding model ready\n');
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
    const safeQuery = query.replace(/['"*()^~:]/g, ' ').trim();
    if (!safeQuery) return [];
    try {
      const rows = this.db.prepare(
        `SELECT key FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?`
      ).all(safeQuery, limit) as Array<{ key: string }>;
      return rows.map(r => r.key);
    } catch (err) {
      process.stderr.write(`[fts:local] search failed: ${err instanceof Error ? err.message : err}\n`);
      return [];
    }
  }

  async ftsUpsert(key: string, content: string, tags: string): Promise<void> {
    const txn = this.db.transaction(() => {
      this.db.prepare('DELETE FROM memories_fts WHERE key = ?').run(key);
      this.db.prepare('INSERT INTO memories_fts (key, content, tags) VALUES (?, ?, ?)').run(key, content, tags);
    });
    txn();
  }

  async ftsDelete(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const placeholders = keys.map(() => '?').join(',');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.db.prepare(`DELETE FROM memories_fts WHERE key IN (${placeholders})`).run(...(keys as any[]));
  }

  async rerank(_query: string, passages: string[]): Promise<number[]> {
    // No local cross-encoder — return uniform raw logits (0 = neutral after sigmoid)
    return passages.map(() => 0);
  }

  isDestructiveAllowed(): boolean {
    return process.env.ALLOW_DESTRUCTIVE_TOOLS === 'true';
  }
}
