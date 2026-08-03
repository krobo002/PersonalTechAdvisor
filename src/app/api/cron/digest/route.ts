import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServiceSupabaseClient } from '@/lib/supabase/server';
import { sendDigest } from '@/lib/digest/sendDigest';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: profileRows, error } = await supabase.from('profiles').select('id, email');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const results = [];
  for (const row of profileRows ?? []) {
    try {
      const result = await sendDigest(supabase, resend, row.id, row.email);
      results.push({ profileId: row.id, ...result });
    } catch (error) {
      console.error(`sendDigest failed for profile ${row.id}:`, error);
      results.push({
        profileId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ results });
}
