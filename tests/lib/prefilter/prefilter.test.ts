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
    const { candidates, embeddingsAvailable } = await prefilterItems(items, profile, 'fake-key');

    expect(embeddingsAvailable).toBe(true);
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

    const { candidates } = await prefilterItems(manyItems, profile, 'fake-key');
    expect(candidates.length).toBeLessThanOrEqual(20);
  });

  it('chunks embedTexts calls when item count exceeds the chunk size, preserving order', async () => {
    const manyItems = Array.from({ length: 130 }, (_, i) => ({
      ...items[0],
      url: `https://chunk-item-${i}.com`,
      // Alternate tags so we can verify per-item embeddings line up by index
      // rather than all collapsing to the same score.
      tags: i % 2 === 0 ? ['typescript'] : ['ai/ml'],
    }));

    const { embedTexts } = await import('@/lib/prefilter/embeddingSimilarity');
    const mockedEmbedTexts = vi.mocked(embedTexts);
    mockedEmbedTexts.mockClear();

    // First call carries stackText + goalText + first 100 item texts.
    mockedEmbedTexts.mockImplementationOnce(async (texts) => {
      expect(texts.length).toBe(2 + 100);
      return [
        [1, 0], // stack embedding
        [0, 1], // goal embedding
        ...Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? [1, 0] : [0, 1])),
      ];
    });
    // Second call carries only the remaining 30 item texts.
    mockedEmbedTexts.mockImplementationOnce(async (texts) => {
      expect(texts.length).toBe(30);
      return Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? [1, 0] : [0, 1]));
    });

    const { candidates, embeddingsAvailable } = await prefilterItems(manyItems, profile, 'fake-key');

    expect(mockedEmbedTexts).toHaveBeenCalledTimes(2);
    expect(embeddingsAvailable).toBe(true);
    // All 130 items score >= MIN_MATCH_SCORE via tag overlap alone, but only
    // the top 20 survive CANDIDATE_LIMIT — the point of this test is that no
    // item embedding was dropped or misaligned across the chunk boundary.
    expect(candidates.length).toBe(20);
    expect(candidates.every((c) => c.category === 'maintain' || c.category === 'grow')).toBe(true);
  });

  it('does not let an empty goalTags profile produce a false grow signal', async () => {
    const { embedTexts } = await import('@/lib/prefilter/embeddingSimilarity');
    vi.mocked(embedTexts).mockResolvedValueOnce([
      [1, 0], // stack embedding
      [0, 1], // goal embedding (would-be signal — must never be used since goalTags is empty)
      [0, 1], // item embedding — deliberately equal to the goal embedding, not the stack embedding
    ]);

    const noGoalsProfile: Profile = {
      id: 'user-2',
      stackTags: [{ tag: 'python', weight: 0.4 }],
      goalTags: [],
    };

    const item: TrendItem = {
      source: 'hacker-news',
      title: 'Python 3.13 release notes',
      url: 'https://c.com',
      tags: ['python'],
      rawSignal: 80,
      fetchedAt: 'now',
    };

    // If the empty-goalTags guard were removed, growSimilarity would be computed
    // against the goal embedding (which the item embedding intentionally matches),
    // producing a growTotal that beats maintainTotal and misclassifying this as 'grow'.
    const { candidates } = await prefilterItems([item], noGoalsProfile, 'fake-key');

    expect(candidates).toHaveLength(1);
    expect(candidates[0].category).toBe('maintain');
  });

  it('excludes items with no tag overlap and near-zero embedding similarity', async () => {
    const { embedTexts } = await import('@/lib/prefilter/embeddingSimilarity');
    vi.mocked(embedTexts).mockResolvedValueOnce([
      [1, 0], // stack embedding
      [0, 1], // goal embedding
      [0, 0], // item embedding — orthogonal to both stack and goal embeddings
    ]);

    const irrelevantItem: TrendItem = {
      source: 'hacker-news',
      title: 'Completely unrelated news',
      url: 'https://d.com',
      tags: ['unrelated-tag'],
      rawSignal: 10,
      fetchedAt: 'now',
    };

    const { candidates } = await prefilterItems([irrelevantItem], profile, 'fake-key');

    expect(candidates).toHaveLength(0);
  });

  it('falls back to tag-overlap-only scoring when the embedding API fails', async () => {
    const { embedTexts } = await import('@/lib/prefilter/embeddingSimilarity');
    vi.mocked(embedTexts).mockRejectedValueOnce(new Error('Voyage API unavailable'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // items[0] has tags: ['typescript'], which matches profile.stackTags' 'typescript' (weight 1),
    // so its tag-overlap-only maintainScore (1) clears MIN_MATCH_SCORE (0.3) on its own.
    const { candidates, embeddingsAvailable } = await prefilterItems([items[0]], profile, 'fake-key');

    expect(candidates).toHaveLength(1);
    expect(candidates[0].category).toBe('maintain');
    expect(candidates[0].matchScore).toBeCloseTo(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(embeddingsAvailable).toBe(false);

    consoleErrorSpy.mockRestore();
  });
});
