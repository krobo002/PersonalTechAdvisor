import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchGitHubStackTags } from '@/lib/profile/fetchGitHubStackTags';

describe('fetchGitHubStackTags', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches repos and derives stack tags', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { language: 'Go', topics: ['grpc'] },
          { language: 'Go', topics: [] },
        ],
      })
    );

    const tags = await fetchGitHubStackTags('fake-token');

    expect(tags[0]).toMatchObject({ tag: 'go', weight: 1 });
  });

  it('throws when the GitHub API returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(fetchGitHubStackTags('bad-token')).rejects.toThrow('401');
  });
});
