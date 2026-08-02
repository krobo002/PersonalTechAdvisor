import { describe, it, expect, vi } from 'vitest';
import { upsertRecommendation } from '@/lib/db/recommendations';
import type { EnrichedRecommendation } from '@/lib/enrichment/types';

const recommendation: EnrichedRecommendation = {
  source: 'hacker-news',
  title: 'Bun 2.0 released',
  url: 'https://bun.sh',
  tags: ['bun'],
  rawSignal: 500,
  fetchedAt: 'now',
  matchScore: 0.9,
  category: 'maintain',
  blurb: 'Matters to you.',
  learningAction: 'Skim the docs',
  learningTimeEstimate: '20 minutes',
};

function makeSupabaseStub(existingRow: { id: string } | null) {
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });

  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    }),
  });

  const from = vi.fn().mockReturnValue({ select, update, insert });
  return { from, update, updateEq, insert, select };
}

describe('upsertRecommendation', () => {
  it('inserts a new row with status "new" when none exists', async () => {
    const supabase = makeSupabaseStub(null);

    await upsertRecommendation(supabase as any, 'profile-1', recommendation);

    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({ profile_id: 'profile-1', status: 'new', title: 'Bun 2.0 released' })
    );
  });

  it('updates content fields but never touches status when a row already exists', async () => {
    const supabase = makeSupabaseStub({ id: 'existing-id' });

    await upsertRecommendation(supabase as any, 'profile-1', recommendation);

    expect(supabase.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: expect.anything() })
    );
    expect(supabase.updateEq).toHaveBeenCalledWith('id', 'existing-id');
  });
});
