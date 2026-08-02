import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { runPipeline } from '@/lib/pipeline/runPipeline';

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

  const claudeClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const voyageApiKey = process.env.VOYAGE_API_KEY!;

  const results = [];
  for (const row of profileRows ?? []) {
    const profile = { id: row.id, stackTags: row.stack_tags, goalTags: row.goal_tags };
    const result = await runPipeline(supabase, profile, claudeClient, voyageApiKey);
    results.push({ profileId: profile.id, ...result });
  }

  return NextResponse.json({ results });
}
