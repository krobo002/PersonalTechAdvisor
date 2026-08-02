import { describe, it, expect } from 'vitest';
import { deriveStackTags } from '@/lib/profile/deriveStackTags';

describe('deriveStackTags', () => {
  it('weights primary language higher than topics, normalized to 0-1', () => {
    const tags = deriveStackTags([
      { language: 'TypeScript', topics: ['react'] },
      { language: 'TypeScript', topics: ['nextjs'] },
    ]);

    expect(tags[0]).toMatchObject({ tag: 'typescript', weight: 1 });
    expect(tags.find((t) => t.tag === 'react')?.weight).toBeLessThan(1);
  });

  it('returns an empty array for no repos', () => {
    expect(deriveStackTags([])).toEqual([]);
  });
});
