import type { OllamaChatClient } from './ollamaClient';
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
  client: OllamaChatClient
): Promise<EnrichedRecommendation> {
  const prompt = buildPrompt(candidate, profile);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await client.generate(prompt);

      const parsed = JSON.parse(content);
      if (!isValidPayload(parsed)) {
        throw new Error('Ollama response did not match expected shape');
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
