import { describe, it, expect, vi, afterEach } from 'vitest';
import { embedTexts, cosineSimilarity } from '@/lib/prefilter/embeddingSimilarity';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns 0 when a vector is all zeros', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('embedTexts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts texts to the Voyage API and returns embeddings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }),
      })
    );

    const result = await embedTexts(['a', 'b'], 'fake-key');
    expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
  });

  it('throws when the API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(embedTexts(['a'], 'bad-key')).rejects.toThrow('401');
  });
});
