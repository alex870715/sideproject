export type PickFoodSourceMode = 'random' | 'custom';

export type PickFoodGameSettings = {
  sourceMode: PickFoodSourceMode;
  /** Number of options shown in all three mini-games */
  optionCount: number;
  /** Multiline custom dishes (one per line) */
  customText: string;
};
