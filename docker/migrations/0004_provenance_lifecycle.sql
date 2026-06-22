-- Migration 0004: Provenance and lifecycle metadata (Postgres)

ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_path TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_line_start INTEGER;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_line_end INTEGER;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_title TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS source_hash TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE memories ADD COLUMN IF NOT EXISTS confidence REAL NOT NULL DEFAULT 0.75;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS supersedes_key TEXT;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS superseded_by_key TEXT;

CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_memories_source_type ON memories(source_type);
CREATE INDEX IF NOT EXISTS idx_memories_verified_at ON memories(verified_at);
CREATE INDEX IF NOT EXISTS idx_memories_superseded_by ON memories(superseded_by_key);
