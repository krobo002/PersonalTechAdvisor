'use client';

import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function HomePage() {
  async function handleSignIn() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
  }

  return (
    <main>
      <h1>Tech Relevance Advisor</h1>
      <button onClick={handleSignIn}>Sign in with GitHub</button>
    </main>
  );
}
