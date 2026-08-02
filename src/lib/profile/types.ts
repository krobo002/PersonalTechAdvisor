export interface StackTag {
  tag: string;
  weight: number;
}

export interface GoalTag {
  tag: string;
}

export interface Profile {
  id: string;
  stackTags: StackTag[];
  goalTags: GoalTag[];
}
