import { describe, it, expect } from 'vitest';
import { scoreTagOverlap } from '@/lib/prefilter/scoreTagOverlap';
import type { TrendItem } from '@/lib/sources/types';

const item: TrendItem = {
  source: 'hacker-news',
  title: 'React Server Components deep dive',
  url: 'https://example.com',
  tags: ['react', 'server', 'components'],
  rawSignal: 100,
  fetchedAt: 'now',
};

describe('scoreTagOverlap', () => {
  it('sums stack-tag weights for maintain, and counts goal-tag matches for grow', () => {
    const result = scoreTagOverlap(
      item,
      [{ tag: 'react', weight: 0.8 }, { tag: 'python', weight: 1 }],
      [{ tag: 'server' }]
    );

    expect(result.maintainScore).toBeCloseTo(0.8);
    expect(result.growScore).toBe(1);
  });

  it('returns zero scores when nothing overlaps', () => {
    const result = scoreTagOverlap(item, [{ tag: 'rust', weight: 1 }], [{ tag: 'kubernetes' }]);
    expect(result).toEqual({ maintainScore: 0, growScore: 0 });
  });

  it('matches tags case-insensitively for stack and goal tags', () => {
    const result = scoreTagOverlap(
      item,
      [{ tag: 'React', weight: 0.9 }, { tag: 'SERVER', weight: 0.5 }],
      [{ tag: 'Components' }, { tag: 'HACKER' }]
    );

    expect(result.maintainScore).toBeCloseTo(1.4);
    expect(result.growScore).toBe(1);
  });
});
