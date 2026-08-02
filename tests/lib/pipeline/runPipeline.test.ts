import { describe, it, expect, vi } from 'vitest';
import { runPipeline } from '@/lib/pipeline/runPipeline';
import type { Profile } from '@/lib/profile/types';

vi.mock('@/lib/sources', () => ({
  fetchAllTrending: vi.fn(),
}));
vi.mock('@/lib/prefilter/prefilter', () => ({
  prefilterItems: vi.fn(),
}));
vi.mock('@/lib/enrichment/enrich', () => ({
  enrichCandidate: vi.fn(),
}));
vi.mock('@/lib/db/recommendations', () => ({
  upsertRecommendation: vi.fn(),
}));

const profile: Profile = { id: 'user-1', stackTags: [], goalTags: [] };
const fakeSupabase = {} as any;
const fakeClaudeClient = {} as any;

describe('runPipeline', () => {
  it('short-circuits with zero processed when ingestion returns no items', async () => {
    const { fetchAllTrending } = await import('@/lib/sources');
    vi.mocked(fetchAllTrending).mockResolvedValue({ items: [], failedSources: ['reddit'] });

    const result = await runPipeline(fakeSupabase, profile, fakeClaudeClient, 'voyage-key');

    expect(result).toEqual({ processedCount: 0, failedSources: ['reddit'] });
  });

  it('runs candidates through enrichment and storage, and reports counts', async () => {
    const { fetchAllTrending } = await import('@/lib/sources');
    const { prefilterItems } = await import('@/lib/prefilter/prefilter');
    const { enrichCandidate } = await import('@/lib/enrichment/enrich');
    const { upsertRecommendation } = await import('@/lib/db/recommendations');

    const item = {
      source: 'hacker-news',
      title: 't',
      url: 'u',
      tags: [],
      rawSignal: 1,
      fetchedAt: 'now',
    };
    const candidate = { ...item, matchScore: 1, category: 'maintain' as const };
    const enriched = { ...candidate, blurb: 'b', learningAction: 'a', learningTimeEstimate: 'e' };

    vi.mocked(fetchAllTrending).mockResolvedValue({ items: [item], failedSources: [] });
    vi.mocked(prefilterItems).mockResolvedValue([candidate]);
    vi.mocked(enrichCandidate).mockResolvedValue(enriched);
    vi.mocked(upsertRecommendation).mockResolvedValue(undefined);

    const result = await runPipeline(fakeSupabase, profile, fakeClaudeClient, 'voyage-key');

    expect(upsertRecommendation).toHaveBeenCalledWith(fakeSupabase, 'user-1', enriched);
    expect(result).toEqual({ processedCount: 1, failedSources: [] });
  });
});
