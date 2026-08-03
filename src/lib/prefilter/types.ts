import type { TrendItem } from '../sources/types';

export interface Candidate extends TrendItem {
  matchScore: number;
  category: 'maintain' | 'grow';
}
