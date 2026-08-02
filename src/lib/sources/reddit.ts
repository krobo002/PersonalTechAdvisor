import type { SourceAdapter, TrendItem } from './types';
import { extractTags } from './extractTags';

const REDDIT_API_URL = 'https://www.reddit.com/r/programming/top.json?limit=25&t=week';

interface RedditChild {
  data: {
    title: string;
    url: string | null;
    ups: number;
    permalink: string;
  };
}

export const redditAdapter: SourceAdapter = {
  name: 'reddit',
  async fetchTrending(): Promise<TrendItem[]> {
    const response = await fetch(REDDIT_API_URL, {
      headers: { 'User-Agent': 'tech-relevance-advisor/0.1' },
    });
    if (!response.ok) {
      throw new Error(`Reddit API returned ${response.status}`);
    }

    const data = (await response.json()) as { data: { children: RedditChild[] } };
    const fetchedAt = new Date().toISOString();

    return data.data.children.map(({ data: post }) => ({
      source: 'reddit' as const,
      title: post.title,
      url: post.url ?? `https://reddit.com${post.permalink}`,
      tags: extractTags(post.title),
      rawSignal: post.ups,
      fetchedAt,
    }));
  },
};
