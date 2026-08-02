import type { SourceAdapter, TrendItem } from './types';

const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories';

interface GitHubRepoItem {
  full_name: string;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  topics: string[];
}

function sevenDaysAgoIso(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 10);
}

export const githubTrendingAdapter: SourceAdapter = {
  name: 'github-trending',
  async fetchTrending(): Promise<TrendItem[]> {
    const query = `created:>${sevenDaysAgoIso()}`;
    const url = `${GITHUB_SEARCH_URL}?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=25`;
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) {
      throw new Error(`GitHub search API returned ${response.status}`);
    }

    const data = (await response.json()) as { items: GitHubRepoItem[] };
    const fetchedAt = new Date().toISOString();

    return data.items.map((repo) => ({
      source: 'github-trending' as const,
      title: repo.full_name,
      url: repo.html_url,
      tags: [
        ...(repo.language ? [repo.language.toLowerCase()] : []),
        ...repo.topics.map((topic) => topic.toLowerCase()),
      ],
      rawSignal: repo.stargazers_count,
      fetchedAt,
    }));
  },
};
