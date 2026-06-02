import { ACHIEVEMENT_REGISTRY } from './registry';
import type { EvaluatedAchievement, PlayerProgressState } from '../types';

export function evaluateAchievements(
  state: PlayerProgressState,
): EvaluatedAchievement[] {
  return ACHIEVEMENT_REGISTRY.map((def) => ({
    id: def.id,
    tier: def.tier,
    unlocked: def.condition(state),
    order: def.order,
  })).sort((a, b) => a.order - b.order);
}
