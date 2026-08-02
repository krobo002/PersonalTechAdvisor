import { describe, it, expect, vi } from 'vitest';
import { prefilterItems } from '@/lib/prefilter/prefilter';
import type { TrendItem } from '@/lib/sources/types';
import type { Profile } from '@/lib/profile/types';

vi.mock('@/lib/prefilter/embeddingSimilarity', () => ({
  embedTexts: vi.fn().mockResolvedValue([
    [1, 0], // stack embedding
    [0, 1], // goal embedding
    [1, 0], // item 0 (matches stack)
    [0, 1], // item 1 (matches goal)
  ]),
  cosineSimilarity: (a: number[], b: number[]) => (a[0] === b[0] && a[1] === b[1] ? 1 : 0),
}));

const profile: Profile = {
  id: 'user-1',
  stackTags: [{ tag: 'typescript', weight: 1 }],
  goalTags: [{ tag: 'ai/ml' }],
};

const items: TrendItem[] = [
  {
    source: 'hacker-news',
    title: 'TypeScript 6 release notes',
    url: 'https://a.com',
    tags: ['typescript'],
    rawSignal: 100,
    fetchedAt: 'now',
  },
  {
    source: 'reddit',
    title: 'New transformer architecture',
    url: 'https://b.com',
    tags: ['ai/ml'],
    rawSignal: 50,
    fetchedAt: 'now',
  },
];

describe('prefilterItems', () => {
  it('categorizes and ranks items by combined tag-overlap and embedding score', async () => {
    const candidates = await prefilterItems(items, profile, 'fake-key');

    expect(candidates).toHaveLength(2);
    expect(candidates.find((c) => c.url === 'https://a.com')?.category).toBe('maintain');
    expect(candidates.find((c) => c.url === 'https://b.com')?.category).toBe('grow');
  });

  it('caps the candidate list at 20 items', async () => {
    const manyItems = Array.from({ length: 30 }, (_, i) => ({
      ...items[0],
      url: `https://item-${i}.com`,
    }));

    const { embedTexts } = await import('@/lib/prefilter/embeddingSimilarity');
    vi.mocked(embedTexts).mockResolvedValueOnce([
      [1, 0],
      [0, 1],
      ...Array.from({ length: 30 }, () => [1, 0]),
    ]);

    const candidates = await prefilterItems(manyItems, profile, 'fake-key');
    expect(candidates.length).toBeLessThanOrEqual(20);
  });
});
