export function normalizeGoalTags(rawInput: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of rawInput.split(',')) {
    const tag = raw.trim().toLowerCase();
    if (tag.length > 0 && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }

  return result;
}
