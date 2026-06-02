import type { AchievementDef } from '../types';

/**
 * 成就定義集中於此檔；新增／調整條件不需動 UI。
 * 文案鍵：playerProgress.achievements.<id>.title / .desc
 */
export const ACHIEVEMENT_REGISTRY: AchievementDef[] = [
  {
    id: 'first_pin',
    tier: 'bronze',
    order: 10,
    condition: (s) => s.checkInCount >= 1,
  },
  {
    id: 'explorer_pins',
    tier: 'bronze',
    order: 20,
    condition: (s) => s.visitPinCount >= 10,
  },
  {
    id: 'wanderer_pins',
    tier: 'silver',
    order: 30,
    condition: (s) => s.visitPinCount >= 25,
  },
  {
    id: 'globe_trotter',
    tier: 'silver',
    order: 40,
    condition: (s) => s.distinctCountries >= 3,
  },
  {
    id: 'event_fan',
    tier: 'bronze',
    order: 50,
    condition: (s) => s.eventCount >= 1,
  },
  {
    id: 'event_enthusiast',
    tier: 'gold',
    order: 60,
    condition: (s) => s.eventCount >= 3,
  },
  {
    id: 'seasoned_level',
    tier: 'silver',
    order: 70,
    condition: (s) => s.level >= 5,
  },
  {
    id: 'xp_veteran',
    tier: 'gold',
    order: 80,
    condition: (s) => s.xpTotal >= 5000,
  },
];
