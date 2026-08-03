import { describe, it, expect, vi } from 'vitest';
import { buildDigest } from '@/lib/digest/buildDigest';

function makeSupabaseStub(lastDigestSentAt: string | null, recommendationRows: any[]) {
  const digestLogChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: lastDigestSentAt ? { sent_at: lastDigestSentAt } : null,
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const recommendationsChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gt: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: recommendationRows, error: null }),
        }),
      }),
    }),
  };

  const from = vi.fn((table: string) => (table === 'digest_log' ? digestLogChain : recommendationsChain));
  return { from };
}

describe('buildDigest', () => {
  it('returns isEmpty=true with no recommendations when there is nothing new', async () => {
    const supabase = makeSupabaseStub(null, []);

    const content = await buildDigest(supabase as any, 'profile-1');

    expect(content).toEqual({ recommendations: [], isEmpty: true });
  });

  it('maps recommendation rows created since the last digest', async () => {
    const supabase = makeSupabaseStub('2026-07-01T00:00:00.000Z', [
      {
        id: 'rec-1',
        title: 'Bun 2.0',
        url: 'https://bun.sh',
        category: 'maintain' as const,
        blurb: 'Matters to you.',
        learning_action: 'Skim the docs',
        learning_time_estimate: '20 minutes',
      },
    ]);

    const content = await buildDigest(supabase as any, 'profile-1');

    expect(content.isEmpty).toBe(false);
    expect(content.recommendations[0]).toMatchObject({
      id: 'rec-1',
      learningAction: 'Skim the docs',
      learningTimeEstimate: '20 minutes',
    });
  });
});
