import { beforeEach, describe, expect, test } from 'vitest';
import { executeTool } from '../src/tools';
import { MockAdapter } from './mock-adapter';

describe('v2.2 lifecycle/provenance retrieval and listing', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  async function store(args: Record<string, unknown>) {
    return executeTool('store_memory', args, adapter);
  }

  async function retrieve(args: Record<string, unknown>) {
    return executeTool('retrieve_memory', args, adapter);
  }

  async function list(args: Record<string, unknown> = {}) {
    return executeTool('list_memories', args, adapter);
  }

  test('store_memory persists lifecycle/provenance fields in MockAdapter row and vector metadata', async () => {
    await store({
      key: 'phase3-new',
      content: 'phase three persisted provenance lifecycle',
      author: 'test',
      tags: ['Recall'],
      namespace: 'recall-v22',
      source_type: 'code',
      source_url: 'https://example.com/repo/blob/src/tools.ts',
      source_path: 'src/tools.ts',
      source_line_start: 10,
      source_line_end: 20,
      source_title: 'tools.ts',
      source_hash: 'sha256:abc123',
      status: 'stale',
      confidence: 0.42,
      verified_at: '2026-06-22T00:00:00.000Z',
      expires_at: '2026-07-22T00:00:00.000Z',
      supersedes: 'phase3-old',
    });

    const row = adapter.memories.get('phase3-new');
    expect(row).toMatchObject({
      source_type: 'code',
      source_url: 'https://example.com/repo/blob/src/tools.ts',
      source_path: 'src/tools.ts',
      source_line_start: 10,
      source_line_end: 20,
      source_title: 'tools.ts',
      source_hash: 'sha256:abc123',
      status: 'stale',
      confidence: 0.42,
      verified_at: '2026-06-22T00:00:00.000Z',
      expires_at: '2026-07-22T00:00:00.000Z',
      supersedes_key: 'phase3-old',
      superseded_by_key: null,
    });
    expect(adapter.vectors.get('phase3-new')?.metadata).toMatchObject({
      status: 'stale',
      source_type: 'code',
      confidence: 0.42,
      namespace: 'recall-v22',
    });
  });

  test('default retrieve excludes superseded/deprecated and includes active/stale', async () => {
    await store({ key: 'active-note', content: 'lifecycle query active result', author: 'test', status: 'active' });
    await store({ key: 'stale-note', content: 'lifecycle query stale result', author: 'test', status: 'stale' });
    await store({ key: 'superseded-note', content: 'lifecycle query superseded result', author: 'test', status: 'superseded' });
    await store({ key: 'deprecated-note', content: 'lifecycle query deprecated result', author: 'test', status: 'deprecated' });

    const text = (await retrieve({ query: 'lifecycle query', limit: 10 })).content[0].text;
    expect(text).toContain('active-note');
    expect(text).toContain('stale-note');
    expect(text).not.toContain('superseded-note');
    expect(text).not.toContain('deprecated-note');
  });

  test('explicit include_statuses can retrieve superseded', async () => {
    await store({ key: 'superseded-only', content: 'superseded explicit lookup', author: 'test', status: 'superseded' });
    const row = adapter.memories.get('superseded-only');
    if (row) row.superseded_by_key = 'replacement-note';

    const text = (await retrieve({ query: 'superseded explicit', include_statuses: ['superseded'] })).content[0].text;
    expect(text).toContain('superseded-only');
    expect(text).toContain('Warning: superseded by replacement-note; prefer the replacement.');
  });

  test('stale result has warning and visible status/score', async () => {
    await store({ key: 'stale-warning', content: 'stale penalty visible', author: 'test', status: 'stale', confidence: 0.49 });

    const text = (await retrieve({ query: 'stale penalty visible' })).content[0].text;
    expect(text).toContain('stale-warning');
    expect(text).toMatch(/score: \d+\.\d{3}/);
    expect(text).toContain('status: stale');
    expect(text).toContain('confidence: 0.49');
    expect(text).toContain('Warning: stale memory; verify before relying on it.');
    expect(text).toContain('Warning: low confidence (0.49).');
  });

  test('JSON format parses and contains provenance/lifecycle/supersession/warnings', async () => {
    await store({
      key: 'json-lifecycle',
      content: 'json lifecycle output',
      author: 'test',
      source_type: 'doc',
      source_url: 'https://example.com/docs',
      status: 'stale',
      confidence: 0.4,
      supersedes: 'json-old',
    });

    const text = (await retrieve({ query: 'json lifecycle output', format: 'json' })).content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.results[0]).toMatchObject({
      key: 'json-lifecycle',
      provenance: { source_type: 'doc', source_url: 'https://example.com/docs' },
      lifecycle: { status: 'stale', confidence: 0.4 },
      supersession: { supersedes_key: 'json-old', superseded_by_key: null },
    });
    expect(parsed.results[0].warnings).toContain('Warning: stale memory; verify before relying on it.');
    expect(parsed.results[0].warnings).toContain('Warning: low confidence (0.4).');
  });

  test('include_provenance false omits Source line', async () => {
    await store({
      key: 'no-source-line',
      content: 'hide source line output',
      author: 'test',
      source_type: 'code',
      source_path: 'src/tools.ts',
      source_line_start: 1,
      source_line_end: 2,
    });

    const withSource = (await retrieve({ query: 'hide source line output' })).content[0].text;
    const withoutSource = (await retrieve({ query: 'hide source line output', include_provenance: false })).content[0].text;
    expect(withSource).toContain('Source:');
    expect(withoutSource).not.toContain('Source:');
  });

  test('list_memories status/source_type filters work and output includes lifecycle fields', async () => {
    await store({ key: 'code-stale', content: 'code stale listed', author: 'test', status: 'stale', source_type: 'code', confidence: 0.66 });
    await store({ key: 'doc-stale', content: 'doc stale listed', author: 'test', status: 'stale', source_type: 'doc' });
    await store({ key: 'code-active', content: 'code active listed', author: 'test', status: 'active', source_type: 'code' });

    const text = (await list({ status: 'stale', source_type: 'code' })).content[0].text;
    expect(text).toContain('code-stale');
    expect(text).not.toContain('doc-stale');
    expect(text).not.toContain('code-active');
    expect(text).toContain('status: stale');
    expect(text).toContain('confidence: 0.66');
    expect(text).toContain('source: code');
  });
});
