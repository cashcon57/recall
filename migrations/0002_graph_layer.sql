-- Migration 0002: Graph layer — memory tiers + auto-relationships
--
-- Run once against your live D1 database:
--   wrangler d1 execute recall --file=migrations/0002_graph_layer.sql
--
-- SQLite does not support ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
-- This migration is idempotent for the CREATE TABLE statements but will
-- error if memory_type column already exists. Safe to run once on a fresh
-- or existing database that has not had this migration applied.

ALTER TABLE memories ADD COLUMN memory_type TEXT NOT NULL DEFAULT 'semantic';

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
