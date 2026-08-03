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

function textResponse(json: string) {
  return { content: [{ type: 'text', text: json }] };
}

describe('enrichCandidate', () => {
  it('returns the parsed LLM payload merged onto the candidate', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue(
          textResponse(
            JSON.stringify({
              blurb: 'Bun 2.0 matters because you use JavaScript daily.',
              learningAction: 'Skim the release notes',
              learningTimeEstimate: '20 minutes',
            })
          )
        ),
      },
    };

    const result = await enrichCandidate(candidate, profile, client as any);

    expect(result.blurb).toContain('Bun 2.0');
    expect(result.learningAction).toBe('Skim the release notes');
    expect(result.learningTimeEstimate).toBe('20 minutes');
    expect(result.source).toBe('hacker-news');

    // Pin the request parameters so a future regression (e.g. reverting
    // max_tokens or re-enabling thinking) fails loudly instead of passing
    // silently — these tests only assert on the mocked response otherwise.
    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 2000, thinking: { type: 'disabled' } })
    );
  });

  it('retries once, then falls back to a template on repeated failure', async () => {
    const client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('rate limited')),
      },
    };

    const result = await enrichCandidate(candidate, profile, client as any);

    expect(client.messages.create).toHaveBeenCalledTimes(2);
    expect(result.blurb).toContain('hacker-news');
    expect(result.learningAction).toBe('');
  });

  it('falls back when the response is not valid JSON matching the expected shape', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue(textResponse('not json')),
      },
    };

    const result = await enrichCandidate(candidate, profile, client as any);
    expect(result.learningAction).toBe('');
  });
});
