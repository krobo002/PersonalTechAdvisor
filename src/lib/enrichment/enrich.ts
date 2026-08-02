import type Anthropic from '@anthropic-ai/sdk';
import type { Candidate } from '../prefilter/types';
import type { Profile } from '../profile/types';
import type { EnrichedRecommendation } from './types';

interface EnrichmentPayload {
  blurb: string;
  learningAction: string;
  learningTimeEstimate: string;
}

function fallbackEnrichment(candidate: Candidate): EnrichmentPayload {
  const focus = candidate.category === 'maintain' ? 'current stack' : 'growth goal';
  return {
    blurb: `Trending on ${candidate.source}, matches your ${focus} tags.`,
    learningAction: '',
    learningTimeEstimate: '',
  };
}

function isValidPayload(value: unknown): value is EnrichmentPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.blurb === 'string' &&
    typeof record.learningAction === 'string' &&
    typeof record.learningTimeEstimate === 'string'
  );
}

function buildPrompt(candidate: Candidate, profile: Profile): string {
  return `You are helping a developer decide what's worth learning.
Developer's current stack tags: ${profile.stackTags.map((t) => t.tag).join(', ') || 'none'}
Developer's growth goal tags: ${profile.goalTags.map((t) => t.tag).join(', ') || 'none'}

Trending item:
Title: ${candidate.title}
Source: ${candidate.source}
Tags: ${candidate.tags.join(', ')}
Category: ${candidate.category}

Respond with ONLY a JSON object with exactly these keys:
"blurb" (1-2 sentences on why this matters to this specific developer),
"learningAction" (one concrete suggested action, e.g. "skim the release notes"),
"learningTimeEstimate" (a rough time estimate, e.g. "30 minutes").`;
}

export async function enrichCandidate(
  candidate: Candidate,
  profile: Profile,
  client: Pick<Anthropic, 'messages'>
): Promise<EnrichedRecommendation> {
  const prompt = buildPrompt(candidate, profile);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      } as Parameters<Anthropic['messages']['create']>[0]);

      const textBlock = (response as any).content.find((block: any) => block.type === 'text');
      if (!textBlock) {
        throw new Error('No text block in Claude response');
      }

      const parsed = JSON.parse(textBlock.text);
      if (!isValidPayload(parsed)) {
        throw new Error('Claude response did not match expected shape');
      }

      return { ...candidate, ...parsed };
    } catch (error) {
      console.error(`Enrichment failed for "${candidate.title}" (${candidate.source}), attempt ${attempt + 1}:`, error);
      if (attempt === 1) {
        return { ...candidate, ...fallbackEnrichment(candidate) };
      }
    }
  }

  return { ...candidate, ...fallbackEnrichment(candidate) };
}
