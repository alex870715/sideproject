import type { MealLogEntry } from '@/types/mealLog';
import type { TasteProfile } from '@/types/tasteProfile';

/** 單一測試用「美食代理人」：偏好＋約 2～3 個月的用餐手記。 */
export type NegotiationAgentFixture = {
  id: string;
  displayName: string;
  emoji: string;
  profile: TasteProfile;
  logs: MealLogEntry[];
};
