import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSyncKey, regenerateSyncKey, saveSyncKey } from '../lib/syncKey';
import { getSupabase } from '../lib/supabase';
import { pullPlayerFog, pushPlayerFog } from './fogRemote';
import { useGameStore } from '../store/gameStore';

const DEBOUNCE_MS = 1200;

/** 雲端同步：先拉再推，避免空狀態覆寫伺服器 */
export function useFogSync() {
  const syncKeyRef = useRef('');
  const [displaySyncKey, setDisplaySyncKey] = useState('');
  const [allowPush, setAllowPush] = useState(false);
  const supabaseConfigured = Boolean(getSupabase());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visitPins = useGameStore((s) => s.visitPins);
  const lastKnown = useGameStore((s) => s.lastKnown);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = await loadSyncKey();
      if (cancelled) return;
      syncKeyRef.current = key;
      setDisplaySyncKey(key);

      const remote = await pullPlayerFog(key);
      if (cancelled) return;
      if (remote !== null) {
        useGameStore.getState().replaceVisitPins(remote);
      }
      setAllowPush(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!allowPush) return;
    const key = syncKeyRef.current;
    if (!key || !getSupabase()) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      pushPlayerFog(key, visitPins, lastKnown);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visitPins, lastKnown, allowPush]);

  const applySyncKey = useCallback(async (raw: string) => {
    const t = raw.trim();
    await saveSyncKey(t);
    syncKeyRef.current = t;
    setDisplaySyncKey(t);
    setAllowPush(false);
    useGameStore.getState().resetExploration();
    const remote = await pullPlayerFog(t);
    if (remote !== null) {
      useGameStore.getState().replaceVisitPins(remote);
    }
    setAllowPush(true);
  }, []);

  const reloadLocalKey = useCallback(async () => {
    const key = await loadSyncKey();
    syncKeyRef.current = key;
    setDisplaySyncKey(key);
  }, []);

  const regenerateLocalKey = useCallback(async () => {
    const k = await regenerateSyncKey();
    syncKeyRef.current = k;
    setDisplaySyncKey(k);
    useGameStore.getState().resetExploration();
  }, []);

  return {
    displaySyncKey,
    supabaseConfigured,
    applySyncKey,
    reloadLocalKey,
    regenerateLocalKey,
  };
}
