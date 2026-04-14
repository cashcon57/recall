-- Migration 0003: Namespace filtering
--
-- Adds an optional namespace column to memories so users can scope memories
-- per project/context. NULL namespace = unnamespaced (global). A retrieve
-- or list call with a namespace filter will only return memories stored
-- with that exact namespace; unnamespaced memories are NOT returned when
-- a namespace filter is active.
--
-- Run once against your live D1 database:
--   wrangler d1 execute recall --remote --file=migrations/0003_namespace.sql
--
-- Idempotent for the index creation; ALTER TABLE will error if the column
-- already exists. Safe to run once on any database that has not had this
-- migration applied.

ALTER TABLE memories ADD COLUMN namespace TEXT;

CREATE INDEX IF NOT EXISTS idx_memories_namespace ON memories(namespace);
