import type { StackTag, GoalTag } from '../profile/types';
import type { TrendItem } from '../sources/types';

export interface OverlapScore {
  maintainScore: number;
  growScore: number;
}

function tokenize(tag: string): string[] {
  return tag.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
}

export function scoreTagOverlap(item: TrendItem, stackTags: StackTag[], goalTags: GoalTag[]): OverlapScore {
  const itemTags = new Set(item.tags.map((tag) => tag.toLowerCase()));

  const maintainScore = stackTags.reduce(
    (total, stackTag) => (itemTags.has(stackTag.tag.toLowerCase()) ? total + stackTag.weight : total),
    0
  );

  const growScore = goalTags.reduce((total, goalTag) => {
    const tokens = tokenize(goalTag.tag);
    const hasOverlap = tokens.some((token) => itemTags.has(token));
    return hasOverlap ? total + 1 : total;
  }, 0);

  return { maintainScore, growScore };
}
