import { describe, it, expect } from 'vitest';
import { normalizeGoalTags } from '@/lib/profile/normalizeGoalTags';

describe('normalizeGoalTags', () => {
  it('splits on commas, trims, lowercases, and dedupes', () => {
    expect(normalizeGoalTags(' Backend Infra, AI/ML, backend infra ')).toEqual([
      'backend infra',
      'ai/ml',
    ]);
  });

  it('returns an empty array for blank input', () => {
    expect(normalizeGoalTags('   ')).toEqual([]);
  });
});
