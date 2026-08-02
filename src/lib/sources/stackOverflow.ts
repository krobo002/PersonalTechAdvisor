import type { SourceAdapter, TrendItem } from './types';

const SO_API_URL =
  'https://api.stackexchange.com/2.3/questions?order=desc&sort=activity&site=stackoverflow&pagesize=50';

interface SoQuestion {
  title: string;
  link: string;
  view_count: number;
  tags: string[];
}

export const stackOverflowAdapter: SourceAdapter = {
  name: 'stack-overflow',
  async fetchTrending(): Promise<TrendItem[]> {
    const response = await fetch(SO_API_URL);
    if (!response.ok) {
      throw new Error(`Stack Exchange API returned ${response.status}`);
    }

    const data = (await response.json()) as { items: SoQuestion[] };
    const fetchedAt = new Date().toISOString();

    return data.items.map((question) => ({
      source: 'stack-overflow' as const,
      title: question.title,
      url: question.link,
      tags: question.tags.map((tag) => tag.toLowerCase()),
      rawSignal: question.view_count,
      fetchedAt,
    }));
  },
};
