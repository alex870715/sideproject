export type VerdictPlanLine = { label: string; value: string };

export type VerdictPlan = {
  key: 'A' | 'B' | 'C';
  title: string;
  tagline: string;
  lines: VerdictPlanLine[];
};
