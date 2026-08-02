import { describe, it, expect } from 'vitest';
import { extractTags } from '@/lib/sources/extractTags';

describe('extractTags', () => {
  it('lowercases words and strips stopwords/short tokens', () => {
    expect(extractTags('Show HN: A new React Server Components library')).toEqual([
      'show',
      'react',
      'server',
      'components',
      'library',
    ]);
  });

  it('deduplicates repeated words', () => {
    expect(extractTags('Rust rust RUST')).toEqual(['rust']);
  });
});
