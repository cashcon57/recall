-- Recall: D1 schema for memory storage + FTS5 keyword search

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  importance REAL NOT NULL DEFAULT 0.5,
  author TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'semantic',
  namespace TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  accessed_at TEXT NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  source_path TEXT,
  source_line_start INTEGER,
  source_line_end INTEGER,
  source_title TEXT,
  source_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  confidence REAL NOT NULL DEFAULT 0.75,
  verified_at TEXT,
  expires_at TEXT,
  supersedes_key TEXT,
  superseded_by_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
CREATE INDEX IF NOT EXISTS idx_memories_author ON memories(author);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_memories_accessed_at ON memories(accessed_at);
CREATE INDEX IF NOT EXISTS idx_memories_namespace ON memories(namespace);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_memories_source_type ON memories(source_type);
CREATE INDEX IF NOT EXISTS idx_memories_verified_at ON memories(verified_at);
CREATE INDEX IF NOT EXISTS idx_memories_superseded_by ON memories(superseded_by_key);

-- FTS5 virtual table for keyword/BM25 search (hybrid search with Vectorize)
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  key,
  content,
  tags,
  tokenize='porter unicode61'
);

-- Graph layer: auto-relationships between memories (similarity, co-access, etc.)
-- Populated automatically on store_memory via embedding similarity.
-- Both A→B and B→A are stored so get_related_memories only needs WHERE from_key = ?.
CREATE TABLE IF NOT EXISTS memory_relationships (
  from_key          TEXT NOT NULL,
  to_key            TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'similar',
  strength          REAL NOT NULL,
  created_at        TEXT NOT NULL,
  PRIMARY KEY (from_key, to_key, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_rel_from ON memory_relationships(from_key);
CREATE INDEX IF NOT EXISTS idx_rel_to   ON memory_relationships(to_key);
