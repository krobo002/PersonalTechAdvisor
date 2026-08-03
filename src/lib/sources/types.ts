export interface TrendItem {
  source: 'hacker-news' | 'reddit' | 'github-trending' | 'stack-overflow';
  title: string;
  url: string;
  tags: string[];
  rawSignal: number;
  fetchedAt: string;
}

export interface SourceAdapter {
  name: TrendItem['source'];
  fetchTrending(): Promise<TrendItem[]>;
}
