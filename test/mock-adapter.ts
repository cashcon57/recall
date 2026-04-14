import type { RecallAdapter, VectorMatch } from '../src/adapter';

type Row = Record<string, unknown>;

export class MockAdapter implements RecallAdapter {
  memories = new Map<string, Row>();
  vectors = new Map<string, { values: number[]; metadata: Record<string, unknown> }>();
  fts = new Map<string, { content: string; tags: string }>();
  relationships: Array<{ from_key: string; to_key: string; relationship_type: string; strength: number; created_at: string }> = [];
  destructiveAllowed = true;

  async query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const s = sql.trim().toLowerCase();

    // Writes that go through query() (not batch)
    if (s.startsWith('insert into memories ') || s.startsWith('insert into memories(')) {
      await this.execBatchStatement(sql, params);
      return [] as T[];
    }
    if (s.startsWith('update memories set accessed_at')) {
      await this.execBatchStatement(sql, params);
      return [] as T[];
    }

    if (s.startsWith('select 1 from memories where key = ?')) {
      const [key] = params as [string];
      return (this.memories.has(key) ? [{ '1': 1 }] : []) as T[];
    }

    if (s.startsWith('select id from memories where key = ?')) {
      const [key] = params as [string];
      const m = this.memories.get(key);
      return (m ? [{ id: m.id }] : []) as T[];
    }

    if (s.startsWith('select key from memories')) {
      return Array.from(this.memories.values()).map(m => ({ key: m.key })) as T[];
    }

    if (s.startsWith('select * from memories where key in')) {
      const keys = params as string[];
      return keys.map(k => this.memories.get(k)).filter(Boolean) as T[];
    }

    if (s.startsWith('select count(*) as total from memories')) {
      let rows = Array.from(this.memories.values());
      rows = this.applyListFilters(rows, sql, params);
      return [{ total: rows.length }] as T[];
    }

    if (s.includes('from memories') && !s.includes('memory_relationships')) {
      let rows = Array.from(this.memories.values());
      rows = this.applyListFilters(rows, sql, params);
      // Order clauses
      if (s.includes('order by importance desc')) {
        rows.sort((a, b) => (b.importance as number) - (a.importance as number));
      }
      // LIMIT / OFFSET
      const limitMatch = sql.match(/limit \?/i);
      const offsetMatch = sql.match(/offset \?/i);
      if (limitMatch || offsetMatch) {
        const nonFilterParams = this.extractLimitOffsetParams(sql, params);
        if (nonFilterParams.offset !== undefined) rows = rows.slice(nonFilterParams.offset);
        if (nonFilterParams.limit !== undefined) rows = rows.slice(0, nonFilterParams.limit);
      }
      return rows as T[];
    }

    if (s.startsWith('select') && s.includes('memory_relationships')) {
      const [fromKey, ...rest] = params as [string, ...unknown[]];
      let rels = this.relationships.filter(r => r.from_key === fromKey);
      if (rest.length > 0 && typeof rest[0] === 'string' && !s.includes('limit ?1')) {
        // Has relationship_type filter
        if (s.includes('r.relationship_type = ?')) {
          rels = rels.filter(r => r.relationship_type === rest[0]);
        }
      }
      const limit = (rest.at(-1) as number) ?? 10;
      rels = rels.slice(0, limit);
      return rels.map(r => {
        const m = this.memories.get(r.to_key);
        return { ...r, ...(m ?? {}) };
      }) as T[];
    }

    return [] as T[];
  }

  private extractLimitOffsetParams(sql: string, params: unknown[]): { limit?: number; offset?: number } {
    const hasLimit = /limit \?/i.test(sql);
    const hasOffset = /offset \?/i.test(sql);
    if (hasLimit && hasOffset) {
      return { limit: params[params.length - 2] as number, offset: params[params.length - 1] as number };
    }
    if (hasLimit) return { limit: params[params.length - 1] as number };
    return {};
  }

  private applyListFilters(rows: Row[], sql: string, params: unknown[]): Row[] {
    const s = sql.toLowerCase();
    let pIdx = 0;
    if (s.includes('author = ?')) {
      rows = rows.filter(r => r.author === params[pIdx]);
      pIdx++;
    }
    if (s.includes('namespace = ?')) {
      rows = rows.filter(r => r.namespace === params[pIdx]);
      pIdx++;
    }
    return rows;
  }

  async batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    for (const { sql, params = [] } of statements) {
      await this.execBatchStatement(sql, params);
    }
  }

  private async execBatchStatement(sql: string, params: unknown[]): Promise<void> {
    const s = sql.trim().toLowerCase();

    if (s.startsWith('insert into memories ') || s.startsWith('insert into memories(')) {
      // Param order: id, key, content, tags, importance, author, memory_type, namespace, created_at, updated_at, accessed_at
      const [id, key, content, tags, importance, author, memory_type, namespace, created_at, updated_at, accessed_at] =
        params as [string, string, string, string, number, string, string, string | null | undefined, string, string, string];
      const existing = this.memories.get(key);
      this.memories.set(key, {
        id: existing?.id ?? id,
        key,
        content,
        tags,
        importance,
        author,
        memory_type,
        namespace: namespace ?? null,
        created_at: existing?.created_at ?? created_at,
        updated_at,
        accessed_at: existing?.accessed_at ?? accessed_at,
        access_count: existing?.access_count ?? 0,
      });
      return;
    }

    if (s.startsWith('update memories set accessed_at')) {
      const [accessedAt, key] = params as [string, string];
      const m = this.memories.get(key);
      if (m) {
        m.accessed_at = accessedAt;
        m.access_count = ((m.access_count as number) ?? 0) + 1;
      }
      return;
    }

    if (s.startsWith('delete from memories where key = ?')) {
      this.memories.delete(params[0] as string);
      return;
    }

    if (s.startsWith('delete from memories') && !s.includes('where')) {
      this.memories.clear();
      return;
    }

    if (s.startsWith('delete from memory_relationships where from_key = ?') && s.includes('or to_key')) {
      const key = params[0] as string;
      this.relationships = this.relationships.filter(r => r.from_key !== key && r.to_key !== key);
      return;
    }

    if (s.startsWith('delete from memory_relationships where from_key = ?')) {
      const key = params[0] as string;
      this.relationships = this.relationships.filter(r => r.from_key !== key);
      return;
    }

    if (s.startsWith('delete from memory_relationships where to_key = ?')) {
      const key = params[0] as string;
      this.relationships = this.relationships.filter(r => r.to_key !== key);
      return;
    }

    if (s.startsWith('delete from memory_relationships') && !s.includes('where')) {
      this.relationships = [];
      return;
    }

    if (s.startsWith('insert into memory_relationships')) {
      const [from_key, to_key, strength, created_at] = params as [string, string, number, string];
      const existing = this.relationships.find(r => r.from_key === from_key && r.to_key === to_key && r.relationship_type === 'similar');
      if (existing) existing.strength = strength;
      else this.relationships.push({ from_key, to_key, relationship_type: 'similar', strength, created_at });
      return;
    }
  }

  async vectorUpsert(id: string, values: number[], metadata: Record<string, unknown>): Promise<void> {
    this.vectors.set(id, { values, metadata });
  }

  async vectorDelete(ids: string[]): Promise<void> {
    for (const id of ids) this.vectors.delete(id);
  }

  async vectorQuery(values: number[], topK: number): Promise<VectorMatch[]> {
    // Cosine similarity over stored unit-normalized vectors
    const matches = Array.from(this.vectors.entries()).map(([id, v]) => {
      let dot = 0;
      for (let i = 0; i < values.length; i++) dot += values[i] * v.values[i];
      return { id, score: dot, metadata: v.metadata };
    });
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, topK);
  }

  async embed(text: string): Promise<number[]> {
    // Deterministic pseudo-embedding via text-seeded LCG → near-orthogonal vectors.
    // Same text → same unit vector; different text → low cosine similarity.
    let seed = 2166136261;
    for (let i = 0; i < text.length; i++) {
      seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
    }
    const vec = new Array(1024);
    let state = seed >>> 0;
    for (let i = 0; i < 1024; i++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      vec[i] = (state / 0x100000000) - 0.5;
    }
    let norm = 0;
    for (const x of vec) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    return vec.map(x => x / norm);
  }

  async rerank(_query: string, passages: string[]): Promise<number[]> {
    return passages.map(() => 0);
  }

  async ftsSearch(query: string, limit: number): Promise<string[]> {
    const lower = query.toLowerCase();
    const hits: string[] = [];
    for (const [key, row] of this.fts.entries()) {
      if (row.content.toLowerCase().includes(lower) || row.tags.toLowerCase().includes(lower) || key.toLowerCase().includes(lower)) {
        hits.push(key);
      }
    }
    return hits.slice(0, limit);
  }

  async ftsUpsert(key: string, content: string, tags: string): Promise<void> {
    this.fts.set(key, { content, tags });
  }

  async ftsDelete(keys: string[]): Promise<void> {
    for (const k of keys) this.fts.delete(k);
  }

  isDestructiveAllowed(): boolean {
    return this.destructiveAllowed;
  }
}
