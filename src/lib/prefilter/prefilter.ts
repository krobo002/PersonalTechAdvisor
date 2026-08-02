import type { TrendItem } from '../sources/types';
import type { Profile } from '../profile/types';
import type { Candidate } from './types';
import { scoreTagOverlap } from './scoreTagOverlap';
import { embedTexts, cosineSimilarity } from './embeddingSimilarity';

const CANDIDATE_LIMIT = 20;
const EMBEDDING_WEIGHT = 0.5;

export async function prefilterItems(
  items: TrendItem[],
  profile: Profile,
  voyageApiKey: string
): Promise<Candidate[]> {
  const stackText = profile.stackTags.map((t) => t.tag).join(', ') || 'no stack tags';
  const goalText = profile.goalTags.map((t) => t.tag).join(', ') || 'no goal tags';
  const itemTexts = items.map((item) => `${item.title} ${item.tags.join(' ')}`);

  const embeddings = await embedTexts([stackText, goalText, ...itemTexts], voyageApiKey);
  const [stackEmbedding, goalEmbedding, ...itemEmbeddings] = embeddings;

  const scored: Candidate[] = items.map((item, index) => {
    const overlap = scoreTagOverlap(item, profile.stackTags, profile.goalTags);
    const itemEmbedding = itemEmbeddings[index];
    const maintainSimilarity = cosineSimilarity(itemEmbedding, stackEmbedding);
    const growSimilarity = profile.goalTags.length > 0 ? cosineSimilarity(itemEmbedding, goalEmbedding) : 0;

    const maintainTotal = overlap.maintainScore + EMBEDDING_WEIGHT * maintainSimilarity;
    const growTotal = overlap.growScore + EMBEDDING_WEIGHT * growSimilarity;

    const category: 'maintain' | 'grow' = growTotal > maintainTotal ? 'grow' : 'maintain';

    return { ...item, matchScore: Math.max(maintainTotal, growTotal), category };
  });

  return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, CANDIDATE_LIMIT);
}
