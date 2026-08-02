import { describe, it, expect, vi, afterEach } from 'vitest';
import { githubTrendingAdapter } from '@/lib/sources/githubTrending';

describe('githubTrendingAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps GitHub search results into TrendItems', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              full_name: 'someorg/cool-lib',
              html_url: 'https://github.com/someorg/cool-lib',
              stargazers_count: 1200,
              language: 'TypeScript',
              topics: ['ai', 'agents'],
            },
          ],
        }),
      })
    );

    const items = await githubTrendingAdapter.fetchTrending();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: 'github-trending',
      title: 'someorg/cool-lib',
      url: 'https://github.com/someorg/cool-lib',
      rawSignal: 1200,
    });
    expect(items[0].tags).toEqual(expect.arrayContaining(['typescript', 'ai', 'agents']));
  });

  it('throws when the API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(githubTrendingAdapter.fetchTrending()).rejects.toThrow('403');
  });
});
