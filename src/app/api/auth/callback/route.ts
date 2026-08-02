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
    await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user.email ?? '',
        stack_tags: stackTags,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch (fetchError) {
    console.error('Failed to derive stack tags from GitHub:', fetchError);
    await supabase
      .from('profiles')
      .upsert({ id: user.id, email: user.email ?? '' }, { onConflict: 'id', ignoreDuplicates: true });
  }

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
