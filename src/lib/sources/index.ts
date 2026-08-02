import { hackerNewsAdapter } from './hackerNews';
import { redditAdapter } from './reddit';
import { githubTrendingAdapter } from './githubTrending';
import { stackOverflowAdapter } from './stackOverflow';
import type { SourceAdapter, TrendItem } from './types';

export const allAdapters: SourceAdapter[] = [
  hackerNewsAdapter,
  redditAdapter,
  githubTrendingAdapter,
  stackOverflowAdapter,
];

export interface IngestionResult {
  items: TrendItem[];
  failedSources: string[];
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 200): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

export async function fetchAllTrending(adapters: SourceAdapter[] = allAdapters): Promise<IngestionResult> {
  const items: TrendItem[] = [];
  const failedSources: string[] = [];

  const results = await Promise.allSettled(
    adapters.map((adapter) => withRetry(() => adapter.fetchTrending()))
  );

  results.forEach((result, index) => {
    const adapter = adapters[index];
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      failedSources.push(adapter.name);
      console.error(`Ingestion failed for source ${adapter.name}:`, result.reason);
    }
  });

  return { items, failedSources };
}
