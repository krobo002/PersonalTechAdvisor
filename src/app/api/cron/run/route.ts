import { NextResponse } from 'next/server';
import { createOllamaChatClient } from '@/lib/enrichment/ollamaClient';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { runPipeline } from '@/lib/pipeline/runPipeline';
import { fetchAllTrending } from '@/lib/sources';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: profileRows, error } = await supabase.from('profiles').select('*');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ollamaClient = createOllamaChatClient(
    process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    process.env.OLLAMA_CHAT_MODEL ?? 'llama3.1'
  );
  const voyageApiKey = process.env.VOYAGE_API_KEY!;

  // Fetched once per run and shared across every profile, rather than re-fetched per profile.
  const ingestionResult = await fetchAllTrending();

  const results = [];
  for (const row of profileRows ?? []) {
    const profile = { id: row.id, stackTags: row.stack_tags, goalTags: row.goal_tags };
    try {
      const result = await runPipeline(supabase, profile, ollamaClient, voyageApiKey, ingestionResult);
      results.push({ profileId: profile.id, ...result });
    } catch (error) {
      console.error(`runPipeline failed for profile ${profile.id}:`, error);
      results.push({
        profileId: profile.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ results });
}
