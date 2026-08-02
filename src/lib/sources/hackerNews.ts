import type { SourceAdapter, TrendItem } from './types';
import { extractTags } from './extractTags';

const HN_API_URL = 'https://hn.algolia.com/api/v1/search?tags=front_page';

interface HnHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
}

export const hackerNewsAdapter: SourceAdapter = {
  name: 'hacker-news',
  async fetchTrending(): Promise<TrendItem[]> {
    const response = await fetch(HN_API_URL);
    if (!response.ok) {
      throw new Error(`Hacker News API returned ${response.status}`);
    }

    const data = (await response.json()) as { hits: HnHit[] };
    const fetchedAt = new Date().toISOString();

    return data.hits.map((hit) => ({
      source: 'hacker-news' as const,
      title: hit.title ?? '',
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      tags: extractTags(hit.title ?? ''),
      rawSignal: hit.points ?? 0,
      fetchedAt,
    }));
  },
};
