import { describe, it, expect, vi } from 'vitest';
import { enrichCandidate } from '@/lib/enrichment/enrich';
import type { Candidate } from '@/lib/prefilter/types';
import type { Profile } from '@/lib/profile/types';

const candidate: Candidate = {
  source: 'hacker-news',
  title: 'Bun 2.0 released',
  url: 'https://bun.sh',
  tags: ['bun'],
  rawSignal: 500,
  fetchedAt: 'now',
  matchScore: 0.9,
  category: 'maintain',
};

const profile: Profile = {
  id: 'user-1',
  stackTags: [{ tag: 'javascript', weight: 1 }],
  goalTags: [],
};

describe('enrichCandidate', () => {
  it('returns the parsed LLM payload merged onto the candidate', async () => {
    const client = {
      generate: vi.fn().mockResolvedValue(
        JSON.stringify({
          blurb: 'Bun 2.0 matters because you use JavaScript daily.',
          learningAction: 'Skim the release notes',
          learningTimeEstimate: '20 minutes',
        })
      ),
    };

    const result = await enrichCandidate(candidate, profile, client);

    expect(result.blurb).toContain('Bun 2.0');
    expect(result.learningAction).toBe('Skim the release notes');
    expect(result.learningTimeEstimate).toBe('20 minutes');
    expect(result.source).toBe('hacker-news');
  });

  it('retries once, then falls back to a template on repeated failure', async () => {
    const client = {
      generate: vi.fn().mockRejectedValue(new Error('connection refused')),
    };

    const result = await enrichCandidate(candidate, profile, client);

    expect(client.generate).toHaveBeenCalledTimes(2);
    expect(result.blurb).toContain('hacker-news');
    expect(result.learningAction).toBe('');
  });

  it('falls back when the response is not valid JSON matching the expected shape', async () => {
    const client = {
      generate: vi.fn().mockResolvedValue('not json'),
    };

    const result = await enrichCandidate(candidate, profile, client);
    expect(result.learningAction).toBe('');
  });
});
