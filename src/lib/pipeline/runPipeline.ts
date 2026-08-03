import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import type { IngestionResult } from '../sources';
import { prefilterItems } from '../prefilter/prefilter';
import { enrichCandidate } from '../enrichment/enrich';
import { upsertRecommendation } from '../db/recommendations';
import type { Profile } from '../profile/types';

export interface PipelineResult {
  processedCount: number;
  failedSources: string[];
  // False when prefilterItems fell back to tag-overlap-only scoring because
  // the Voyage embeddings API failed. Defaults to true (embeddings were used
  // normally, or the pipeline short-circuited before prefiltering ran).
  embeddingsAvailable: boolean;
}

export async function runPipeline(
  supabase: SupabaseClient,
  profile: Profile,
  claudeClient: Pick<Anthropic, 'messages'>,
  voyageApiKey: string,
  ingestionResult: IngestionResult
): Promise<PipelineResult> {
  const { items, failedSources } = ingestionResult;

  if (items.length === 0) {
    return { processedCount: 0, failedSources, embeddingsAvailable: true };
  }

  const { candidates, embeddingsAvailable } = await prefilterItems(items, profile, voyageApiKey);

  for (const candidate of candidates) {
    const enriched = await enrichCandidate(candidate, profile, claudeClient);
    await upsertRecommendation(supabase, profile.id, enriched);
  }

  return { processedCount: candidates.length, failedSources, embeddingsAvailable };
}
