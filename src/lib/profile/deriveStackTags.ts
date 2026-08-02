import type { StackTag } from './types';

export interface GitHubRepoSummary {
  language: string | null;
  topics: string[];
}

export function deriveStackTags(repos: GitHubRepoSummary[]): StackTag[] {
  const counts = new Map<string, number>();

  for (const repo of repos) {
    if (repo.language) {
      const tag = repo.language.toLowerCase();
      counts.set(tag, (counts.get(tag) ?? 0) + 2);
    }
    for (const topic of repo.topics) {
      const tag = topic.toLowerCase();
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  if (counts.size === 0) return [];

  const maxCount = Math.max(...counts.values());

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, weight: count / maxCount }))
    .sort((a, b) => b.weight - a.weight);
}
