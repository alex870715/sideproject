export type AchievementTier = 'bronze' | 'silver' | 'gold';

/** 供成就條件與 API 聚合共用 */
export type PlayerProgressState = {
  username: string;
  displayName: string;
  level: number;
  xpTotal: number;
  checkInCount: number;
  distinctCountries: number;
  eventCount: number;
  visitPinCount: number;
};

export type AchievementDef = {
  id: string;
  tier: AchievementTier;
  /** 列表排序（小排前） */
  order: number;
  condition: (s: PlayerProgressState) => boolean;
};

export type EvaluatedAchievement = {
  id: string;
  tier: AchievementTier;
  unlocked: boolean;
  order: number;
};
