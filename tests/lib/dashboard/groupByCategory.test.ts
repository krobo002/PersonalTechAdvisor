import { describe, it, expect } from 'vitest';
import { groupByCategory } from '@/lib/dashboard/groupByCategory';

describe('groupByCategory', () => {
  it('splits rows into maintain and grow buckets', () => {
    const rows = [
      { id: '1', category: 'maintain' as const },
      { id: '2', category: 'grow' as const },
      { id: '3', category: 'maintain' as const },
    ];

    expect(groupByCategory(rows)).toEqual({
      maintain: [rows[0], rows[2]],
      grow: [rows[1]],
    });
  });

  it('returns empty buckets for an empty input', () => {
    expect(groupByCategory([])).toEqual({ maintain: [], grow: [] });
  });
});
