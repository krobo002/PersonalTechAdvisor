import { describe, it, expect, vi, beforeAll } from 'vitest';
import { sendDigest } from '@/lib/digest/sendDigest';

beforeAll(() => {
  process.env.DIGEST_FROM_EMAIL = 'Tech Relevance Advisor <digest@test.example.com>';
});

vi.mock('@/lib/digest/buildDigest', () => ({
  buildDigest: vi.fn().mockResolvedValue({
    isEmpty: false,
    recommendations: [{ id: 'rec-1', title: 't', url: 'u', category: 'maintain', blurb: 'b', learningAction: 'a', learningTimeEstimate: 'e' }],
  }),
}));

describe('sendDigest', () => {
  it('sends the email and logs the digest on success', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as any;
    const resend = { emails: { send: vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }) } };

    const result = await sendDigest(supabase, resend as any, 'profile-1', 'me@example.com');

    expect(resend.emails.send).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: 'profile-1', recommendation_ids: ['rec-1'] })
    );
    expect(result).toEqual({ sent: true, recommendationCount: 1 });
  });

  it('retries once, then leaves recommendations queued (no log entry) on repeated send failure', async () => {
    const insert = vi.fn();
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as any;
    const resend = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: null, error: { message: 'send failed', name: 'application_error' } }),
      },
    };

    const result = await sendDigest(supabase, resend as any, 'profile-1', 'me@example.com');

    expect(resend.emails.send).toHaveBeenCalledTimes(2);
    expect(insert).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: false, recommendationCount: 1 });
  });
});
