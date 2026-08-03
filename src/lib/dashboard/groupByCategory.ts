export interface CategorizedRow {
  category: 'maintain' | 'grow';
}

export function groupByCategory<T extends CategorizedRow>(rows: T[]): { maintain: T[]; grow: T[] } {
  return {
    maintain: rows.filter((row) => row.category === 'maintain'),
    grow: rows.filter((row) => row.category === 'grow'),
  };
}
