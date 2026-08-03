import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const VALID_STATUSES = ['new', 'in-progress', 'learned', 'skipped'];

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let status: unknown;
  try {
    const body = await request.json();
    status = body.status;
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { error } = await supabase
    .from('recommendations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('profile_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status });
}
