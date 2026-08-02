import { describe, it, expect, vi, afterEach } from 'vitest';
import { hackerNewsAdapter } from '@/lib/sources/hackerNews';

describe('hackerNewsAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps HN Algolia hits into TrendItems', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hits: [
            { objectID: '1', title: 'Bun 2.0 released', url: 'https://bun.sh', points: 500 },
            { objectID: '2', title: 'Ask HN: best rust crates', url: null, points: 20 },
          ],
        }),
      })
    );

    const items = await hackerNewsAdapter.fetchTrending();

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: 'hacker-news',
      title: 'Bun 2.0 released',
      url: 'https://bun.sh',
      rawSignal: 500,
    });
    expect(items[0].tags).toContain('bun');
    expect(items[1].url).toBe('https://news.ycombinator.com/item?id=2');
  });

  it('throws when the API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(hackerNewsAdapter.fetchTrending()).rejects.toThrow('503');
  });
});
