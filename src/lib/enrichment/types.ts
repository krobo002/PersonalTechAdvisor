import type { Candidate } from '../prefilter/types';

export interface EnrichedRecommendation extends Candidate {
  blurb: string;
  learningAction: string;
  learningTimeEstimate: string;
}
