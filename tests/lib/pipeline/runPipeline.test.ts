import { describe, it, expect, vi } from 'vitest';
import { runPipeline } from '@/lib/pipeline/runPipeline';
import type { Profile } from '@/lib/profile/types';
import type { IngestionResult } from '@/lib/sources';

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
    const ingestionResult: IngestionResult = { items: [], failedSources: ['reddit'] };

    const result = await runPipeline(fakeSupabase, profile, fakeClaudeClient, 'voyage-key', ingestionResult);

    expect(result).toEqual({ processedCount: 0, failedSources: ['reddit'], embeddingsAvailable: true });
  });

  it('runs candidates through enrichment and storage, and reports counts', async () => {
    const { prefilterItems } = await import('@/lib/prefilter/prefilter');
    const { enrichCandidate } = await import('@/lib/enrichment/enrich');
    const { upsertRecommendation } = await import('@/lib/db/recommendations');

    const item = {
      source: 'hacker-news' as const,
      title: 't',
      url: 'u',
      tags: [],
      rawSignal: 1,
      fetchedAt: 'now',
    };
    const candidate = { ...item, matchScore: 1, category: 'maintain' as const };
    const enriched = { ...candidate, blurb: 'b', learningAction: 'a', learningTimeEstimate: 'e' };
    const ingestionResult: IngestionResult = { items: [item], failedSources: [] };

    vi.mocked(prefilterItems).mockResolvedValue({ candidates: [candidate], embeddingsAvailable: true });
    vi.mocked(enrichCandidate).mockResolvedValue(enriched);
    vi.mocked(upsertRecommendation).mockResolvedValue(undefined);

    const result = await runPipeline(fakeSupabase, profile, fakeClaudeClient, 'voyage-key', ingestionResult);

    expect(upsertRecommendation).toHaveBeenCalledWith(fakeSupabase, 'user-1', enriched);
    expect(result).toEqual({ processedCount: 1, failedSources: [], embeddingsAvailable: true });
  });

  it('surfaces embeddingsAvailable: false when prefilterItems reports an embedding outage', async () => {
    const { prefilterItems } = await import('@/lib/prefilter/prefilter');
    const { enrichCandidate } = await import('@/lib/enrichment/enrich');
    const { upsertRecommendation } = await import('@/lib/db/recommendations');

    const item = {
      source: 'hacker-news' as const,
      title: 't',
      url: 'u',
      tags: [],
      rawSignal: 1,
      fetchedAt: 'now',
    };
    const candidate = { ...item, matchScore: 1, category: 'maintain' as const };
    const enriched = { ...candidate, blurb: 'b', learningAction: 'a', learningTimeEstimate: 'e' };
    const ingestionResult: IngestionResult = { items: [item], failedSources: [] };

    vi.mocked(prefilterItems).mockResolvedValue({ candidates: [candidate], embeddingsAvailable: false });
    vi.mocked(enrichCandidate).mockResolvedValue(enriched);
    vi.mocked(upsertRecommendation).mockResolvedValue(undefined);

    const result = await runPipeline(fakeSupabase, profile, fakeClaudeClient, 'voyage-key', ingestionResult);

    expect(result).toEqual({ processedCount: 1, failedSources: [], embeddingsAvailable: false });
  });
});
