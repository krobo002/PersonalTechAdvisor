import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchGitHubStackTags } from '@/lib/profile/fetchGitHubStackTags';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/setup?error=missing_code', request.url));
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(new URL('/setup?error=auth_failed', request.url));
  }

  const providerToken = data.session.provider_token;
  const user = data.session.user;

  try {
    const stackTags = providerToken ? await fetchGitHubStackTags(providerToken) : [];
    const { error: upsertError } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email ?? '',
        stack_tags: stackTags,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (upsertError) {
      console.error('Failed to upsert profile:', upsertError);
      return NextResponse.redirect(new URL('/dashboard?error=profile_save_failed', request.url));
    }
  } catch (fetchError) {
    console.error('Failed to derive stack tags from GitHub:', fetchError);
    const { error: fallbackUpsertError } = await supabase
      .from('profiles')
      .upsert({ id: user.id, email: user.email ?? '' }, { onConflict: 'id', ignoreDuplicates: true });

    if (fallbackUpsertError) {
      console.error('Failed to upsert profile (fallback):', fallbackUpsertError);
      return NextResponse.redirect(new URL('/dashboard?error=profile_save_failed', request.url));
    }
  }

  const { data: profileRow, error: selectError } = await supabase
    .from('profiles')
    .select('goal_tags')
    .eq('id', user.id)
    .single();

  if (selectError) {
    console.error('Failed to read back profile goal_tags:', selectError);
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const goalTags = (profileRow?.goal_tags as unknown[]) ?? [];
  const destination = goalTags.length === 0 ? '/setup' : '/dashboard';

  return NextResponse.redirect(new URL(destination, request.url));
}
