import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlayerProgressState } from '../types';

export type FetchProgressOk = {
  ok: true;
  state: PlayerProgressState;
};

export type FetchProgressErr = {
  ok: false;
  code: 'profile' | 'schema' | 'unknown';
  message: string;
};

export type FetchProgressResult = FetchProgressOk | FetchProgressErr;

/**
 * 聚合 profiles + check_ins + event_participations。
 * 若尚未套用 migration 009（缺表／欄位），回傳对应錯誤碼。
 */
export async function fetchPlayerProgressState(
  supabase: SupabaseClient,
  userId: string,
  visitPinCount: number,
): Promise<FetchProgressResult> {
  const { data: prof, error: pErr } = await supabase
    .from('profiles')
    .select('username, display_name, xp_total, level')
    .eq('id', userId)
    .maybeSingle();

  if (pErr) {
    const msg = pErr.message ?? '';
    if (
      msg.includes('xp_total') ||
      msg.includes('level') ||
      msg.includes('does not exist')
    ) {
      return {
        ok: false,
        code: 'schema',
        message: msg,
      };
    }
    return { ok: false, code: 'profile', message: msg };
  }
  if (!prof) {
    return { ok: false, code: 'profile', message: 'no profile row' };
  }

  let checkInCount = 0;
  let distinctCountries = 0;
  let eventCount = 0;

  const { count: cCount, error: cErr } = await supabase
    .from('check_ins')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (cErr) {
    if (
      cErr.message.includes('check_ins') &&
      cErr.message.includes('does not exist')
    ) {
      return { ok: false, code: 'schema', message: cErr.message };
    }
    /** 其他錯誤仍繼續，打卡數視為 0 */
  } else {
    checkInCount = cCount ?? 0;
  }

  const { data: isoRows, error: isoErr } = await supabase
    .from('check_ins')
    .select('country_iso2')
    .eq('user_id', userId)
    .not('country_iso2', 'is', null);

  if (!isoErr && isoRows) {
    distinctCountries = new Set(
      isoRows
        .map((r) => r.country_iso2 as string | null)
        .filter((x): x is string => Boolean(x)),
    ).size;
  }

  const { count: eCount, error: eErr } = await supabase
    .from('event_participations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (!eErr) {
    eventCount = eCount ?? 0;
  }

  const state: PlayerProgressState = {
    username: prof.username as string,
    displayName: (prof.display_name as string | null) ?? (prof.username as string),
    level: Number(prof.level ?? 1),
    xpTotal: Number(prof.xp_total ?? 0),
    checkInCount,
    distinctCountries,
    eventCount,
    visitPinCount,
  };

  return { ok: true, state };
}
