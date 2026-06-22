import { beforeEach, describe, expect, test } from 'vitest';
import { executeTool } from '../src/tools';
import { MockAdapter } from './mock-adapter';

describe('v2.2 phase 5A lifecycle-aware consolidation report', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  async function store(args: Record<string, unknown>) {
    const key = String(args.key ?? 'memory');
    return executeTool('store_memory', { content: `phase five consolidation lifecycle memory ${key}`, author: 'test', ...args }, adapter);
  }

  async function report(args: Record<string, unknown> = {}) {
    return (await executeTool('consolidate_memories', { max_memories: 50, stale_days: 1, ...args }, adapter)).content[0].text;
  }

  test('report includes expired active/stale memories', async () => {
    await store({
      key: 'expired-active',
      status: 'active',
      expires_at: '2000-01-01T00:00:00.000Z',
      source_type: 'doc',
      source_url: 'https://example.com/expired-active',
    });
    await store({
      key: 'expired-stale',
      status: 'stale',
      expires_at: '2000-01-01T00:00:00.000Z',
      source_type: 'doc',
      source_url: 'https://example.com/expired-stale',
    });

    const text = await report();

    expect(text).toContain('### Expired Active/Stale Memories');
    expect(text).toContain('expired-active');
    expect(text).toContain('status: active');
    expect(text).toContain('expired-stale');
    expect(text).toContain('status: stale');
  });

  test('report includes low-confidence and no-provenance memories', async () => {
    await store({
      key: 'low-confidence',
      confidence: 0.2,
      source_type: 'doc',
      source_url: 'https://example.com/low-confidence',
    });
    await store({
      key: 'no-provenance',
      confidence: 0.8,
    });

    const text = await report();

    expect(text).toContain('### Low-Confidence Memories');
    expect(text).toContain('low-confidence');
    expect(text).toContain('confidence: 0.2');
    expect(text).toContain('### Memories With No Provenance');
    expect(text).toContain('no-provenance');
  });

  test('report includes deprecated deletion candidates', async () => {
    await store({
      key: 'deprecated-delete-me',
      status: 'deprecated',
      source_type: 'doc',
      source_url: 'https://example.com/deprecated',
    });

    const text = await report();

    expect(text).toContain('### Deprecated Memories That Can Be Deleted');
    expect(text).toContain('deprecated-delete-me');
    expect(text).toContain('delete_memory');
  });

  test('report includes superseded but accessed memories', async () => {
    await store({
      key: 'superseded-accessed',
      status: 'superseded',
      source_type: 'doc',
      source_url: 'https://example.com/superseded',
    });
    const row = adapter.memories.get('superseded-accessed');
    if (row) {
      row.access_count = 3;
      row.superseded_by_key = 'replacement-memory';
    }

    const text = await report();

    expect(text).toContain('### Superseded Memories Still Highly Accessed');
    expect(text).toContain('superseded-accessed');
    expect(text).toContain('access_count: 3');
    expect(text).toContain('replacement-memory');
  });

  test('report includes suggested lifecycle tool names and read-only statement', async () => {
    await store({ key: 'needs-review', confidence: 0.1 });

    const text = await report();

    expect(text).toContain('READ-ONLY');
    expect(text).toContain('This report is read-only');
    expect(text).toContain('mark_memory_status');
    expect(text).toContain('verify_memory');
    expect(text).toContain('supersede_memory');
    expect(text).toContain('delete_memory');
  });
});
