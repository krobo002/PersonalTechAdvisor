import type { SupabaseClient } from '@supabase/supabase-js';
import type { Resend } from 'resend';
import { buildDigest } from './buildDigest';
import { renderDigestEmail } from './renderDigestEmail';

export interface SendDigestResult {
  sent: boolean;
  recommendationCount: number;
}

export async function sendDigest(
  supabase: SupabaseClient,
  resend: Pick<Resend, 'emails'>,
  profileId: string,
  toEmail: string
): Promise<SendDigestResult> {
  const content = await buildDigest(supabase, profileId);
  const { subject, html } = renderDigestEmail(content);

  let lastError: unknown;
  let sent = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await resend.emails.send({
        from: process.env.DIGEST_FROM_EMAIL!,
        to: toEmail,
        subject,
        html,
      });
      if (error) {
        throw new Error(error.message);
      }
      sent = true;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!sent) {
    console.error('Digest send failed after retry, leaving recommendations queued:', lastError);
    return { sent: false, recommendationCount: content.recommendations.length };
  }

  const { error: logError } = await supabase.from('digest_log').insert({
    profile_id: profileId,
    sent_at: new Date().toISOString(),
    recommendation_ids: content.recommendations.map((rec) => rec.id),
  });

  if (logError) {
    throw new Error(`Failed to log digest send: ${logError.message}`);
  }

  return { sent: true, recommendationCount: content.recommendations.length };
}
