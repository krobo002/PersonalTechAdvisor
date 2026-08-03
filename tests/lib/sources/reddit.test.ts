import { describe, it, expect, vi, afterEach } from 'vitest';
import { redditAdapter } from '@/lib/sources/reddit';

describe('redditAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps Reddit listing children into TrendItems', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            children: [
              {
                data: {
                  title: 'Svelte 5 is out',
                  url: 'https://svelte.dev',
                  ups: 342,
                  permalink: '/r/programming/comments/abc/svelte_5/',
                },
              },
            ],
          },
        }),
      })
    );

    const items = await redditAdapter.fetchTrending();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'reddit',
      title: 'Svelte 5 is out',
      url: 'https://svelte.dev',
      rawSignal: 342,
    });
    expect(items[0].tags).toContain('svelte');
  });

  it('throws when the API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    await expect(redditAdapter.fetchTrending()).rejects.toThrow('429');
  });
});
