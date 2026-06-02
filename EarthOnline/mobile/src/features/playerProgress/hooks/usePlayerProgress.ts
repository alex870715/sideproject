import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../../../store/gameStore';
import { fetchPlayerProgressState } from '../api/fetchPlayerProgressState';
import { evaluateAchievements } from '../achievements/evaluateAchievements';
import type { EvaluatedAchievement, PlayerProgressState } from '../types';
import { levelFromXp, xpProgressWithinLevel, xpToReachNextLevel } from '../levelXp';

export type UsePlayerProgressResult = {
  loading: boolean;
  error: string | null;
  schemaHint: boolean;
  /** 未登入時為 null */
  state: PlayerProgressState | null;
  achievements: EvaluatedAchievement[];
  progress01: number;
  xpToNext: number;
  effectiveLevel: number;
  refresh: () => void;
};

const GUEST_STATE = (
  visitPins: number,
): PlayerProgressState => ({
  username: '',
  displayName: '',
  level: 1,
  xpTotal: 0,
  checkInCount: 0,
  distinctCountries: 0,
  eventCount: 0,
  visitPinCount: visitPins,
});

export function usePlayerProgress(
  session: Session | null,
  supabase: SupabaseClient | null,
): UsePlayerProgressResult {
  const visitPins = useGameStore((s) => s.visitPins);
  const visitPinCount = visitPins.length;

  const [loading, setLoading] = useState(Boolean(session && supabase));
  const [error, setError] = useState<string | null>(null);
  const [schemaHint, setSchemaHint] = useState(false);
  const [state, setState] = useState<PlayerProgressState | null>(
    session ? null : GUEST_STATE(visitPinCount),
  );

  const load = useCallback(() => {
    if (!session?.user || !supabase) {
      setState(GUEST_STATE(visitPinCount));
      setLoading(false);
      setError(null);
      setSchemaHint(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSchemaHint(false);

    void (async () => {
      const res = await fetchPlayerProgressState(
        supabase,
        session.user.id,
        visitPinCount,
      );
      if (!res.ok) {
        if (res.code === 'schema') {
          setSchemaHint(true);
          setError(res.message);
          setState(null);
        } else {
          setSchemaHint(false);
          setError(res.message);
          setState(null);
        }
        setLoading(false);
        return;
      }
      setState(res.state);
      setLoading(false);
    })();
  }, [session, supabase, visitPinCount]);

  useEffect(() => {
    load();
  }, [load]);

  const achievements =
    state != null
      ? evaluateAchievements(state)
      : !session
        ? evaluateAchievements(GUEST_STATE(visitPinCount))
        : [];

  const xpTotal = state?.xpTotal ?? 0;
  const effectiveLevel = state != null ? state.level : levelFromXp(xpTotal);
  const progress01 = xpProgressWithinLevel(xpTotal);
  const xpToNext = xpToReachNextLevel(xpTotal);

  return {
    loading,
    error,
    schemaHint,
    state,
    achievements,
    progress01,
    xpToNext,
    effectiveLevel,
    refresh: load,
  };
}
