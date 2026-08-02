import type { StackTag, GoalTag } from '../profile/types';
import type { TrendItem } from '../sources/types';

export interface OverlapScore {
  maintainScore: number;
  growScore: number;
}

export function scoreTagOverlap(item: TrendItem, stackTags: StackTag[], goalTags: GoalTag[]): OverlapScore {
  const itemTags = new Set(item.tags.map((tag) => tag.toLowerCase()));

  const maintainScore = stackTags.reduce(
    (total, stackTag) => (itemTags.has(stackTag.tag) ? total + stackTag.weight : total),
    0
  );

  const growScore = goalTags.reduce(
    (total, goalTag) => (itemTags.has(goalTag.tag) ? total + 1 : total),
    0
  );

  return { maintainScore, growScore };
}
