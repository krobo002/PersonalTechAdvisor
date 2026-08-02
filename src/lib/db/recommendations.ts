import type { SupabaseClient } from '@supabase/supabase-js';
import type { EnrichedRecommendation } from '../enrichment/types';

export async function upsertRecommendation(
  supabase: SupabaseClient,
  profileId: string,
  recommendation: EnrichedRecommendation
): Promise<void> {
  const { data: existing, error: selectError } = await supabase
    .from('recommendations')
    .select('id')
    .eq('profile_id', profileId)
    .eq('source', recommendation.source)
    .eq('url', recommendation.url)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to check existing recommendation: ${selectError.message}`);
  }

  const contentFields = {
    profile_id: profileId,
    source: recommendation.source,
    title: recommendation.title,
    url: recommendation.url,
    category: recommendation.category,
    score: recommendation.matchScore,
    blurb: recommendation.blurb,
    learning_action: recommendation.learningAction,
    learning_time_estimate: recommendation.learningTimeEstimate,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error: updateError } = await supabase
      .from('recommendations')
      .update(contentFields)
      .eq('id', existing.id);
    if (updateError) {
      throw new Error(`Failed to update recommendation: ${updateError.message}`);
    }
    return;
  }

  const { error: insertError } = await supabase
    .from('recommendations')
    .insert({ ...contentFields, status: 'new', created_at: new Date().toISOString() });
  if (insertError) {
    throw new Error(`Failed to insert recommendation: ${insertError.message}`);
  }
}
