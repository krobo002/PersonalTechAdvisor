import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { normalizeGoalTags } from '@/lib/profile/normalizeGoalTags';

export async function POST(request: Request) {
  let rawInput: any;
  try {
    const body = await request.json();
    rawInput = body.rawInput;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof rawInput !== 'string') {
    return NextResponse.json({ error: 'rawInput must be a string' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const goalTags = normalizeGoalTags(rawInput).map((tag) => ({ tag }));

  const { error } = await supabase
    .from('profiles')
    .update({ goal_tags: goalTags, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ goalTags });
}
