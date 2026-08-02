const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'for', 'and', 'is', 'on', 'with', 'hn', 'new',
]);

export function extractTags(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const word of text
    .toLowerCase()
    .replace(/[^a-z0-9\s.+#-]/g, '')
    .split(/\s+/)) {
    if (word.length > 2 && !STOPWORDS.has(word) && !seen.has(word)) {
      seen.add(word);
      result.push(word);
    }
  }

  return result;
}
