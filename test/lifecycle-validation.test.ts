import { describe, expect, test } from 'vitest';
import {
  validateListInput,
  validateRetrieveInput,
  validateStoreInput,
} from '../src/tools';

describe('v2.2 lifecycle/provenance validation', () => {
  const baseStore = {
    key: 'phase2-note',
    content: 'validated lifecycle provenance defaults',
    author: 'test',
  };

  test('store_memory applies valid lifecycle/provenance defaults', () => {
    expect(validateStoreInput(baseStore)).toMatchObject({
      key: 'phase2-note',
      content: 'validated lifecycle provenance defaults',
      author: 'test',
      source_type: 'manual',
      status: 'active',
      confidence: 0.75,
      source_url: null,
      source_path: null,
      source_line_start: null,
      source_line_end: null,
      source_title: null,
      source_hash: null,
      verified_at: null,
      expires_at: null,
    });
  });

  test('store_memory accepts valid lifecycle/provenance fields', () => {
    const input = validateStoreInput({
      ...baseStore,
      source_type: 'code',
      source_url: 'https://example.com/repo/file.ts',
      source_path: 'src/file.ts',
      source_line_start: 10,
      source_line_end: 12,
      source_title: 'file.ts',
      source_hash: 'sha256:abc123',
      status: 'stale',
      confidence: 0.9,
      verified_at: '2026-06-22T00:00:00.000Z',
      expires_at: '2026-07-22T00:00:00.000Z',
      supersedes: 'old-note',
    });

    expect(input).toMatchObject({
      source_type: 'code',
      source_line_start: 10,
      source_line_end: 12,
      status: 'stale',
      confidence: 0.9,
      verified_at: '2026-06-22T00:00:00.000Z',
      expires_at: '2026-07-22T00:00:00.000Z',
      supersedes: 'old-note',
    });
  });

  test('store_memory rejects invalid status', () => {
    expect(() => validateStoreInput({ ...baseStore, status: 'archived' })).toThrow(/status/i);
  });

  test('store_memory rejects invalid source_type', () => {
    expect(() => validateStoreInput({ ...baseStore, source_type: 'email' })).toThrow(/source_type/i);
  });

  test('store_memory rejects invalid confidence', () => {
    expect(() => validateStoreInput({ ...baseStore, confidence: 1.1 })).toThrow(/confidence/i);
    expect(() => validateStoreInput({ ...baseStore, confidence: -0.1 })).toThrow(/confidence/i);
  });

  test('store_memory rejects invalid line range', () => {
    expect(() => validateStoreInput({
      ...baseStore,
      source_line_start: 42,
      source_line_end: 41,
    })).toThrow(/source_line_start/i);
  });

  test('store_memory rejects invalid date', () => {
    expect(() => validateStoreInput({ ...baseStore, verified_at: 'not-a-date' })).toThrow(/verified_at/i);
    expect(() => validateStoreInput({ ...baseStore, expires_at: 'not-a-date' })).toThrow(/expires_at/i);
  });

  test('retrieve_memory validates include_statuses and format', () => {
    expect(validateRetrieveInput({
      query: 'phase 2',
      include_statuses: ['active', 'deprecated'],
      include_provenance: true,
      format: 'json',
    })).toMatchObject({
      include_statuses: ['active', 'deprecated'],
      include_provenance: true,
      format: 'json',
    });

    expect(() => validateRetrieveInput({ query: 'phase 2', include_statuses: ['archived'] })).toThrow(/include_statuses/i);
    expect(() => validateRetrieveInput({ query: 'phase 2', format: 'xml' })).toThrow(/format/i);
  });

  test('list_memories validates status and source_type filters', () => {
    expect(validateListInput({ status: 'superseded', source_type: 'issue' })).toMatchObject({
      status: 'superseded',
      source_type: 'issue',
    });

    expect(() => validateListInput({ status: 'archived' })).toThrow(/status/i);
    expect(() => validateListInput({ source_type: 'email' })).toThrow(/source_type/i);
  });
});
