import { deriveStackTags, type GitHubRepoSummary } from './deriveStackTags';
import type { StackTag } from './types';

const GITHUB_REPOS_URL = 'https://api.github.com/user/repos?per_page=100&sort=updated';

export async function fetchGitHubStackTags(accessToken: string): Promise<StackTag[]> {
  const response = await fetch(GITHUB_REPOS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub repos API returned ${response.status}`);
  }

  const repos = (await response.json()) as Array<{ language: string | null; topics?: string[] }>;
  const summaries: GitHubRepoSummary[] = repos.map((repo) => ({
    language: repo.language,
    topics: repo.topics ?? [],
  }));

  return deriveStackTags(summaries);
}
