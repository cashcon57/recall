CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  importance REAL NOT NULL DEFAULT 0.5,
  author TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'semantic',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  accessed_at TEXT NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
CREATE INDEX IF NOT EXISTS idx_memories_author ON memories(author);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_memories_accessed_at ON memories(accessed_at);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  key,
  content,
  tags,
  tokenize='porter unicode61'
);

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
