import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sql = (path: string) => readFileSync(join(root, path), 'utf8');

const provenanceColumns = [
  { name: 'source_type', sqlite: /source_type\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'manual'/i, pg: /source_type\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'manual'/i },
  { name: 'source_url', sqlite: /source_url\s+TEXT/i, pg: /source_url\s+TEXT/i },
  { name: 'source_path', sqlite: /source_path\s+TEXT/i, pg: /source_path\s+TEXT/i },
  { name: 'source_line_start', sqlite: /source_line_start\s+INTEGER/i, pg: /source_line_start\s+INTEGER/i },
  { name: 'source_line_end', sqlite: /source_line_end\s+INTEGER/i, pg: /source_line_end\s+INTEGER/i },
  { name: 'source_title', sqlite: /source_title\s+TEXT/i, pg: /source_title\s+TEXT/i },
  { name: 'source_hash', sqlite: /source_hash\s+TEXT/i, pg: /source_hash\s+TEXT/i },
  { name: 'status', sqlite: /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'active'/i, pg: /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'active'/i },
  { name: 'confidence', sqlite: /confidence\s+REAL\s+NOT\s+NULL\s+DEFAULT\s+0\.75/i, pg: /confidence\s+REAL\s+NOT\s+NULL\s+DEFAULT\s+0\.75/i },
  { name: 'verified_at', sqlite: /verified_at\s+TEXT/i, pg: /verified_at\s+TIMESTAMPTZ/i },
  { name: 'expires_at', sqlite: /expires_at\s+TEXT/i, pg: /expires_at\s+TIMESTAMPTZ/i },
  { name: 'supersedes_key', sqlite: /supersedes_key\s+TEXT/i, pg: /supersedes_key\s+TEXT/i },
  { name: 'superseded_by_key', sqlite: /superseded_by_key\s+TEXT/i, pg: /superseded_by_key\s+TEXT/i },
];

const provenanceIndexes = [
  'idx_memories_status',
  'idx_memories_source_type',
  'idx_memories_verified_at',
  'idx_memories_superseded_by',
];

function expectSchemaMigrationsTable(contents: string) {
  expect(contents).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+schema_migrations/i);
  expect(contents).toMatch(/version\s+TEXT\s+PRIMARY\s+KEY/i);
  expect(contents).toMatch(/applied_at\s+TEXT\s+NOT\s+NULL/i);
}

function expectFreshSchemaSeedsCurrentMigrations(contents: string, dialect: 'sqlite' | 'pg') {
  if (dialect === 'sqlite') {
    expect(contents).toMatch(/INSERT\s+OR\s+IGNORE\s+INTO\s+schema_migrations/i);
  } else {
    expect(contents).toMatch(/INSERT\s+INTO\s+schema_migrations/i);
    expect(contents).toMatch(/ON\s+CONFLICT\s*\(version\)\s+DO\s+NOTHING/i);
  }
  for (const version of ['0000', '0002', '0003', '0004']) {
    expect(contents).toContain(`'${version}'`);
  }
}

function expectProvenanceColumns(contents: string, dialect: 'sqlite' | 'pg') {
  for (const column of provenanceColumns) {
    expect(contents, `missing column ${column.name}`).toMatch(column[dialect]);
  }
}

function expectProvenanceIndexes(contents: string) {
  for (const index of provenanceIndexes) {
    expect(contents, `missing index ${index}`).toMatch(new RegExp(`CREATE\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+${index}`, 'i'));
  }
}

describe('schema migrations', () => {
  test('0000 creates schema_migrations tracking table', () => {
    expectSchemaMigrationsTable(sql('migrations/0000_schema_migrations.sql'));
  });

  test('fresh install schemas include migration tracking table', () => {
    for (const path of ['schema.sql', 'local/setup.sql', 'docker/setup.sql']) {
      expectSchemaMigrationsTable(sql(path));
    }
  });

  test('fresh install schemas mark bundled historical migrations as applied', () => {
    expectFreshSchemaSeedsCurrentMigrations(sql('schema.sql'), 'sqlite');
    expectFreshSchemaSeedsCurrentMigrations(sql('local/setup.sql'), 'sqlite');
    expectFreshSchemaSeedsCurrentMigrations(sql('docker/setup.sql'), 'pg');
  });

  test('fresh SQLite/D1 schemas include provenance/lifecycle columns and indexes', () => {
    for (const path of ['schema.sql', 'local/setup.sql']) {
      const contents = sql(path);
      expectProvenanceColumns(contents, 'sqlite');
      expectProvenanceIndexes(contents);
    }
  });

  test('fresh Postgres schema includes provenance/lifecycle columns and indexes', () => {
    const contents = sql('docker/setup.sql');
    expectProvenanceColumns(contents, 'pg');
    expectProvenanceIndexes(contents);
  });

  test('SQLite/D1 0004 migration adds provenance/lifecycle columns and indexes', () => {
    const contents = sql('migrations/0004_provenance_lifecycle.sql');
    for (const column of provenanceColumns) {
      expect(contents, `missing ALTER for ${column.name}`).toMatch(new RegExp(`ALTER\\s+TABLE\\s+memories\\s+ADD\\s+COLUMN\\s+${column.name}`, 'i'));
    }
    expectProvenanceColumns(contents, 'sqlite');
    expectProvenanceIndexes(contents);
  });

  test('Postgres 0004 migration uses idempotent column/index creation', () => {
    const contents = sql('docker/migrations/0004_provenance_lifecycle.sql');
    for (const column of provenanceColumns) {
      expect(contents, `missing idempotent ALTER for ${column.name}`).toMatch(
        new RegExp(`ALTER\\s+TABLE\\s+memories\\s+ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+${column.name}`, 'i'),
      );
    }
    expectProvenanceColumns(contents, 'pg');
    expectProvenanceIndexes(contents);
  });
});
