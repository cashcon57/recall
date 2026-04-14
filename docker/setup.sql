CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]',
  importance REAL NOT NULL DEFAULT 0.5,
  author TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'semantic',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
CREATE INDEX IF NOT EXISTS idx_memories_author ON memories(author);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_memories_accessed_at ON memories(accessed_at);

CREATE INDEX IF NOT EXISTS idx_memories_fts ON memories USING GIN(
  to_tsvector('english', content || ' ' || key)
);

CREATE TABLE IF NOT EXISTS vec_memories (
  key TEXT PRIMARY KEY,
  embedding vector(1024) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vec_hnsw ON vec_memories
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS memory_relationships (
  from_key          TEXT NOT NULL,
  to_key            TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'similar',
  strength          REAL NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (from_key, to_key, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_rel_from ON memory_relationships(from_key);
CREATE INDEX IF NOT EXISTS idx_rel_to   ON memory_relationships(to_key);
