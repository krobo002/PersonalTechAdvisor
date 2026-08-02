import { describe, it, expect, vi, afterEach } from 'vitest';
import { stackOverflowAdapter } from '@/lib/sources/stackOverflow';

describe('stackOverflowAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps Stack Exchange questions into TrendItems', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              title: 'How to use React Server Components with Next.js 14?',
              link: 'https://stackoverflow.com/q/123',
              view_count: 5000,
              tags: ['reactjs', 'next.js'],
            },
          ],
        }),
      })
    );

    const items = await stackOverflowAdapter.fetchTrending();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'stack-overflow',
      url: 'https://stackoverflow.com/q/123',
      rawSignal: 5000,
      tags: ['reactjs', 'next.js'],
    });
  });

  it('throws when the API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));

    await expect(stackOverflowAdapter.fetchTrending()).rejects.toThrow('400');
  });
});
