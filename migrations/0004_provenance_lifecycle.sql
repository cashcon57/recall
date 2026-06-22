-- Migration 0004: Provenance and lifecycle metadata
--
-- Adds source/provenance fields plus lifecycle, verification, expiration,
-- and supersession metadata to memories.
--
-- Run once against your live D1 database:
--   wrangler d1 execute recall --remote --file=migrations/0004_provenance_lifecycle.sql
--
-- SQLite does not support ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
-- Index creation is idempotent; ALTER TABLE will error if a column already
-- exists. Safe to run once on any database that has not had this migration applied.

ALTER TABLE memories ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE memories ADD COLUMN source_url TEXT;
ALTER TABLE memories ADD COLUMN source_path TEXT;
ALTER TABLE memories ADD COLUMN source_line_start INTEGER;
ALTER TABLE memories ADD COLUMN source_line_end INTEGER;
ALTER TABLE memories ADD COLUMN source_title TEXT;
ALTER TABLE memories ADD COLUMN source_hash TEXT;
ALTER TABLE memories ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE memories ADD COLUMN confidence REAL NOT NULL DEFAULT 0.75;
ALTER TABLE memories ADD COLUMN verified_at TEXT;
ALTER TABLE memories ADD COLUMN expires_at TEXT;
ALTER TABLE memories ADD COLUMN supersedes_key TEXT;
ALTER TABLE memories ADD COLUMN superseded_by_key TEXT;

CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_memories_source_type ON memories(source_type);
CREATE INDEX IF NOT EXISTS idx_memories_verified_at ON memories(verified_at);
CREATE INDEX IF NOT EXISTS idx_memories_superseded_by ON memories(superseded_by_key);
