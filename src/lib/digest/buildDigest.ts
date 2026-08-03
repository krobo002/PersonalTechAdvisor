import type { SupabaseClient } from '@supabase/supabase-js';

export interface DigestRecommendation {
  id: string;
  title: string;
  url: string;
  category: 'maintain' | 'grow';
  blurb: string;
  learningAction: string;
  learningTimeEstimate: string;
}

export interface DigestContent {
  recommendations: DigestRecommendation[];
  isEmpty: boolean;
}

export async function buildDigest(supabase: SupabaseClient, profileId: string): Promise<DigestContent> {
  const { data: lastDigest, error: lastDigestError } = await supabase
    .from('digest_log')
    .select('sent_at')
    .eq('profile_id', profileId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastDigestError) {
    throw new Error(`Failed to load last digest: ${lastDigestError.message}`);
  }

  const since = lastDigest?.sent_at ?? new Date(0).toISOString();

  const { data: rows, error } = await supabase
    .from('recommendations')
    .select('id, title, url, category, blurb, learning_action, learning_time_estimate')
    .eq('profile_id', profileId)
    .gt('created_at', since)
    .order('score', { ascending: false });

  if (error) {
    throw new Error(`Failed to load recommendations for digest: ${error.message}`);
  }

  const recommendations: DigestRecommendation[] = (rows ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    category: row.category,
    blurb: row.blurb,
    learningAction: row.learning_action,
    learningTimeEstimate: row.learning_time_estimate,
  }));

  return { recommendations, isEmpty: recommendations.length === 0 };
}
