import { beforeEach, describe, expect, test } from 'vitest';
import { executeTool } from '../src/tools';
import { MockAdapter } from './mock-adapter';

describe('v2.2 phase 4 lifecycle tools', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  const text = async (tool: string, args: Record<string, unknown>) =>
    (await executeTool(tool, args, adapter)).content[0].text;

  const result = (tool: string, args: Record<string, unknown>) => executeTool(tool, args, adapter);

  async function store(args: Record<string, unknown>) {
    return executeTool('store_memory', args, adapter);
  }

  test('mark_memory_status marks stale and retrieval warning appears', async () => {
    await store({ key: 'phase4-stale', content: 'phase four stale warning lookup', author: 'test' });

    const mark = await result('mark_memory_status', { key: 'phase4-stale', status: 'stale', reason: 'needs review' });
    expect(mark.isError).toBeFalsy();
    expect(mark.content[0].text).toContain('needs review');
    expect(adapter.memories.get('phase4-stale')).toMatchObject({ status: 'stale' });

    const retrieved = await text('retrieve_memory', { query: 'phase four stale warning lookup' });
    expect(retrieved).toContain('phase4-stale');
    expect(retrieved).toContain('status: stale');
    expect(retrieved).toContain('Warning: stale memory; verify before relying on it.');
  });

  test('verify_memory defaults verified_at and preserves status while updating provided provenance/confidence', async () => {
    await store({ key: 'phase4-verify', content: 'phase four verify defaults', author: 'test', status: 'stale' });

    const before = Date.now();
    const verify = await result('verify_memory', {
      key: 'phase4-verify',
      confidence: 0.91,
      source_type: 'code',
      source_path: 'src/tools.ts',
      source_line_start: 12,
      source_line_end: 20,
      source_title: 'Lifecycle tools',
      source_hash: 'sha256:phase4',
    });
    const after = Date.now();

    expect(verify.isError).toBeFalsy();
    const row = adapter.memories.get('phase4-verify');
    expect(row).toMatchObject({
      status: 'stale',
      confidence: 0.91,
      source_type: 'code',
      source_path: 'src/tools.ts',
      source_line_start: 12,
      source_line_end: 20,
      source_title: 'Lifecycle tools',
      source_hash: 'sha256:phase4',
    });
    const verifiedAt = Date.parse(row?.verified_at as string);
    expect(verifiedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(verifiedAt).toBeLessThanOrEqual(after + 1000);
  });

  test('verify_memory preserves unprovided provenance fields', async () => {
    await store({
      key: 'phase4-preserve',
      content: 'phase four verify preserve',
      author: 'test',
      source_type: 'doc',
      source_url: 'https://example.com/original',
      source_path: 'docs/original.md',
      source_line_start: 3,
      source_line_end: 7,
      source_title: 'Original doc',
      source_hash: 'sha256:original',
      confidence: 0.4,
      status: 'stale',
    });

    await result('verify_memory', { key: 'phase4-preserve', confidence: 0.8, verified_at: '2026-06-22T12:00:00.000Z' });

    expect(adapter.memories.get('phase4-preserve')).toMatchObject({
      source_type: 'doc',
      source_url: 'https://example.com/original',
      source_path: 'docs/original.md',
      source_line_start: 3,
      source_line_end: 7,
      source_title: 'Original doc',
      source_hash: 'sha256:original',
      confidence: 0.8,
      verified_at: '2026-06-22T12:00:00.000Z',
      status: 'stale',
    });
  });

  test('verify_memory can explicitly reactivate when status is provided', async () => {
    await store({ key: 'phase4-reactivate', content: 'phase four verify explicit active', author: 'test', status: 'stale' });

    const verify = await result('verify_memory', { key: 'phase4-reactivate', status: 'active' });

    expect(verify.isError).toBeFalsy();
    expect(verify.content[0].text).toContain('status active');
    expect(adapter.memories.get('phase4-reactivate')).toMatchObject({ status: 'active' });
  });

  test('supersede_memory creates new row, marks old, and retrieval lifecycle behavior works', async () => {
    await store({ key: 'phase4-old', content: 'phase four old replacement topic', author: 'test', tags: ['old'] });

    const supersede = await result('supersede_memory', {
      old_key: 'phase4-old',
      new_key: 'phase4-new',
      content: 'phase four new replacement topic',
      author: 'test',
      tags: ['new'],
      importance: 0.9,
      reason: 'newer source',
    });

    expect(supersede.isError).toBeFalsy();
    expect(adapter.memories.get('phase4-new')).toMatchObject({
      key: 'phase4-new',
      status: 'active',
      supersedes_key: 'phase4-old',
    });
    expect(adapter.memories.get('phase4-old')).toMatchObject({
      status: 'superseded',
      superseded_by_key: 'phase4-new',
    });

    const defaultRetrieved = await text('retrieve_memory', { query: 'phase four replacement topic', limit: 10 });
    expect(defaultRetrieved).toContain('phase4-new');
    expect(defaultRetrieved).not.toContain('phase4-old');

    const oldRetrieved = await text('retrieve_memory', { query: 'phase four old replacement topic', include_statuses: ['superseded'] });
    expect(oldRetrieved).toContain('phase4-old');
    expect(oldRetrieved).toContain('Warning: superseded by phase4-new; prefer the replacement.');
  });

  test('get_related_memories with relationship_type supersedes returns old', async () => {
    await store({ key: 'phase4-related-old', content: 'phase four relation old', author: 'test' });
    await result('supersede_memory', {
      old_key: 'phase4-related-old',
      new_key: 'phase4-related-new',
      content: 'phase four relation new',
      author: 'test',
    });

    const related = await text('get_related_memories', { key: 'phase4-related-new', relationship_type: 'supersedes' });
    expect(related).toContain('phase4-related-old');
    expect(related).toContain('supersedes');
  });

  test('supersede_memory bypasses duplicate guard for the memory being replaced', async () => {
    await store({ key: 'phase4-dupe-old', content: 'identical replacement content', author: 'test' });

    const supersede = await result('supersede_memory', {
      old_key: 'phase4-dupe-old',
      new_key: 'phase4-dupe-new',
      content: 'identical replacement content',
      author: 'test',
    });

    expect(supersede.isError).toBeFalsy();
    expect(adapter.memories.get('phase4-dupe-new')).toMatchObject({
      key: 'phase4-dupe-new',
      supersedes_key: 'phase4-dupe-old',
      status: 'active',
    });
    expect(adapter.memories.get('phase4-dupe-old')).toMatchObject({
      status: 'superseded',
      superseded_by_key: 'phase4-dupe-new',
    });
  });

  test('invalid/missing keys error', async () => {
    expect((await result('mark_memory_status', { key: 'missing', status: 'stale' })).isError).toBe(true);
    expect((await result('verify_memory', { key: 'missing' })).isError).toBe(true);
    expect((await result('supersede_memory', { old_key: 'missing', new_key: 'new', content: 'replacement', author: 'test' })).isError).toBe(true);
    expect((await result('supersede_memory', { old_key: 'same', new_key: 'same', content: 'replacement', author: 'test' })).isError).toBe(true);
  });
});
