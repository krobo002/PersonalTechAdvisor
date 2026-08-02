import { describe, it, expect, vi } from 'vitest';
import { fetchAllTrending } from '@/lib/sources';
import type { SourceAdapter, TrendItem } from '@/lib/sources/types';

function makeItem(source: TrendItem['source'], title: string): TrendItem {
  return { source, title, url: `https://example.com/${title}`, tags: [], rawSignal: 1, fetchedAt: 'now' };
}

describe('fetchAllTrending', () => {
  it('aggregates items from all adapters that succeed', async () => {
    const good: SourceAdapter = {
      name: 'hacker-news',
      fetchTrending: vi.fn().mockResolvedValue([makeItem('hacker-news', 'a')]),
    };
    const alsoGood: SourceAdapter = {
      name: 'reddit',
      fetchTrending: vi.fn().mockResolvedValue([makeItem('reddit', 'b')]),
    };

    const result = await fetchAllTrending([good, alsoGood]);

    expect(result.items).toHaveLength(2);
    expect(result.failedSources).toEqual([]);
  });

  it('retries a failing adapter, then skips it and reports it as failed without throwing', async () => {
    const flaky: SourceAdapter = {
      name: 'github-trending',
      fetchTrending: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const good: SourceAdapter = {
      name: 'stack-overflow',
      fetchTrending: vi.fn().mockResolvedValue([makeItem('stack-overflow', 'c')]),
    };

    const result = await fetchAllTrending([flaky, good]);

    expect(flaky.fetchTrending).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(result.items).toHaveLength(1);
    expect(result.failedSources).toEqual(['github-trending']);
  });
});
