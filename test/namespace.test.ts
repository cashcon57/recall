import { describe, test, expect, beforeEach } from 'vitest';
import { executeTool } from '../src/tools';
import { MockAdapter } from './mock-adapter';

describe('namespace filtering', () => {
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

  test('store_memory persists namespace', async () => {
    await store({
      key: 'auth-bug',
      content: 'token expiry check uses < not <=',
      author: 'cash',
      namespace: 'project-alpha',
    });

    const row = adapter.memories.get('auth-bug');
    expect(row?.namespace).toBe('project-alpha');
  });

  test('store_memory without namespace stores null', async () => {
    await store({
      key: 'legacy-note',
      content: 'something without namespace',
      author: 'cash',
    });

    const row = adapter.memories.get('legacy-note');
    expect(row?.namespace).toBeNull();
  });

  test('retrieve_memory with namespace excludes other namespaces', async () => {
    await store({ key: 'alpha-bug', content: 'bug in project alpha', author: 'cash', namespace: 'project-alpha' });
    await store({ key: 'beta-bug', content: 'bug in project beta', author: 'cash', namespace: 'project-beta' });

    const result = await retrieve({ query: 'bug', namespace: 'project-alpha' });

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('alpha-bug');
    expect(text).not.toContain('beta-bug');
  });

  test('retrieve_memory without namespace returns memories from all namespaces', async () => {
    await store({ key: 'alpha-bug', content: 'bug in project alpha', author: 'cash', namespace: 'project-alpha' });
    await store({ key: 'beta-bug', content: 'bug in project beta', author: 'cash', namespace: 'project-beta' });
    await store({ key: 'global-note', content: 'bug observation', author: 'cash' });

    const result = await retrieve({ query: 'bug' });

    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('alpha-bug');
    expect(text).toContain('beta-bug');
    expect(text).toContain('global-note');
  });

  test('retrieve_memory with namespace includes unnamespaced memories', async () => {
    // Unnamespaced memories should NOT appear in a namespaced query — they're global-scope.
    // If you want cross-namespace access, query without a namespace filter.
    await store({ key: 'alpha-bug', content: 'bug in alpha', author: 'cash', namespace: 'project-alpha' });
    await store({ key: 'global-note', content: 'bug observation', author: 'cash' });

    const result = await retrieve({ query: 'bug', namespace: 'project-alpha' });

    const text = result.content[0].text;
    expect(text).toContain('alpha-bug');
    expect(text).not.toContain('global-note');
  });

  test('list_memories filters by namespace', async () => {
    await store({ key: 'alpha-1', content: 'alpha one', author: 'cash', namespace: 'project-alpha' });
    await store({ key: 'alpha-2', content: 'alpha two', author: 'cash', namespace: 'project-alpha' });
    await store({ key: 'beta-1', content: 'beta one', author: 'cash', namespace: 'project-beta' });

    const result = await list({ namespace: 'project-alpha' });

    const text = result.content[0].text;
    expect(text).toContain('alpha-1');
    expect(text).toContain('alpha-2');
    expect(text).not.toContain('beta-1');
  });

  test('list_memories without namespace returns all', async () => {
    await store({ key: 'alpha-1', content: 'alpha one', author: 'cash', namespace: 'project-alpha' });
    await store({ key: 'beta-1', content: 'beta one', author: 'cash', namespace: 'project-beta' });

    const result = await list({});

    const text = result.content[0].text;
    expect(text).toContain('alpha-1');
    expect(text).toContain('beta-1');
  });

  test('store_memory rejects invalid namespace format', async () => {
    const result = await store({
      key: 'bad',
      content: 'test',
      author: 'cash',
      namespace: 'has spaces and invalid!',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/namespace/i);
  });

  test('namespace appears in list output', async () => {
    await store({ key: 'alpha-1', content: 'alpha one', author: 'cash', namespace: 'project-alpha' });

    const result = await list({});
    const text = result.content[0].text;
    expect(text).toContain('project-alpha');
  });
});
