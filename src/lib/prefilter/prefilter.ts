import type { TrendItem } from '../sources/types';
import type { Profile } from '../profile/types';
import type { Candidate } from './types';
import { scoreTagOverlap } from './scoreTagOverlap';
import { embedTexts, cosineSimilarity } from './embeddingSimilarity';

const CANDIDATE_LIMIT = 20;
const EMBEDDING_WEIGHT = 0.5;
const MIN_MATCH_SCORE = 0.3;

// Voyage's batch endpoint has a ceiling around 128 inputs per call. A full run
// can produce ~120 raw items plus 2 profile texts, which sits uncomfortably
// close to that ceiling — any small increase in ingestion volume would tip
// every run into a hard failure. Chunk item texts so a single call never
// carries more than CHUNK_SIZE of them (plus the 2 profile texts on the first
// chunk), well clear of the ceiling regardless of how many sources are added.
const CHUNK_SIZE = 100;

export interface PrefilterResult {
  candidates: Candidate[];
  // KNOWN LIMITATION: when this is false, prefilterItems fell back to
  // tag-overlap-only scoring because the Voyage embeddings API failed. That
  // fallback, combined with MIN_MATCH_SCORE, can plausibly filter out every
  // candidate (tag-overlap-only scores rarely clear 0.3 alone), producing an
  // empty `candidates` array during what is actually a full embedding outage
  // rather than a "nothing relevant found" run. Callers that care about
  // distinguishing those two cases should check this flag rather than
  // inferring outage from an empty/zero result.
  embeddingsAvailable: boolean;
}

export async function prefilterItems(
  items: TrendItem[],
  profile: Profile,
  voyageApiKey: string
): Promise<PrefilterResult> {
  const stackText = profile.stackTags.map((t) => t.tag).join(', ') || 'no stack tags';
  const goalText = profile.goalTags.map((t) => t.tag).join(', ') || 'no goal tags';
  const itemTexts = items.map((item) => `${item.title} ${item.tags.join(' ')}`);

  let stackEmbedding: number[] | null = null;
  let goalEmbedding: number[] | null = null;
  let itemEmbeddings: number[][] = [];
  let embeddingsAvailable = true;

  try {
    const firstChunkTexts = itemTexts.slice(0, CHUNK_SIZE);
    const firstChunkResult = await embedTexts([stackText, goalText, ...firstChunkTexts], voyageApiKey);
    const [firstStackEmbedding, firstGoalEmbedding, ...firstItemEmbeddings] = firstChunkResult;

    const allItemEmbeddings = [...firstItemEmbeddings];
    for (let i = CHUNK_SIZE; i < itemTexts.length; i += CHUNK_SIZE) {
      const chunkTexts = itemTexts.slice(i, i + CHUNK_SIZE);
      const chunkResult = await embedTexts(chunkTexts, voyageApiKey);
      allItemEmbeddings.push(...chunkResult);
    }

    stackEmbedding = firstStackEmbedding;
    goalEmbedding = firstGoalEmbedding;
    itemEmbeddings = allItemEmbeddings;
  } catch (error) {
    console.error('Embedding similarity unavailable, falling back to tag-overlap-only scoring:', error);
    stackEmbedding = null;
    goalEmbedding = null;
    itemEmbeddings = [];
    embeddingsAvailable = false;
  }

  const scored: Candidate[] = items.map((item, index) => {
    const overlap = scoreTagOverlap(item, profile.stackTags, profile.goalTags);
    const maintainSimilarity = stackEmbedding ? cosineSimilarity(itemEmbeddings[index], stackEmbedding) : 0;
    const growSimilarity =
      stackEmbedding && goalEmbedding && profile.goalTags.length > 0
        ? cosineSimilarity(itemEmbeddings[index], goalEmbedding)
        : 0;

    const maintainTotal = overlap.maintainScore + EMBEDDING_WEIGHT * maintainSimilarity;
    const growTotal = overlap.growScore + EMBEDDING_WEIGHT * growSimilarity;

    const category: 'maintain' | 'grow' = growTotal > maintainTotal ? 'grow' : 'maintain';

    return { ...item, matchScore: Math.max(maintainTotal, growTotal), category };
  });

  const relevant = scored.filter((candidate) => candidate.matchScore >= MIN_MATCH_SCORE);

  const candidates = relevant.sort((a, b) => b.matchScore - a.matchScore).slice(0, CANDIDATE_LIMIT);

  return { candidates, embeddingsAvailable };
}
