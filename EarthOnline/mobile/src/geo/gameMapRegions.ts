import type { Country } from 'world-countries';
import countriesData from 'world-countries';

import countryNamesZhTW from './countryNamesZhTW.json';
import countryNamesZhTWOverrides from './countryNamesZhTW.overrides.json';

type ZhTwCountryNames = typeof countryNamesZhTW;
type ZhTwOverrides = typeof countryNamesZhTWOverrides;

/** 遊戲式分區：美洲拆成南北；另含南極 */
export type GameContinentId =
  | 'asia'
  | 'europe'
  | 'africa'
  | 'north-america'
  | 'south-america'
  | 'oceania'
  | 'antarctic';

export type WorldMapSelection =
  | { level: 'world' }
  | { level: 'continent'; continentId: GameContinentId }
  | { level: 'country'; continentId: GameContinentId; iso2: string };

/** 送進 Mapbox 的攝影機指令（Web / WebView 共用結構） */
export type MapFitCommand =
  | { type: 'world' }
  | { type: 'continent'; w: number; s: number; e: number; n: number }
  | { type: 'country'; lng: number; lat: number; zoom: number };

export const GAME_CONTINENTS: {
  id: GameContinentId;
  /** west, south, east, north */
  bbox: [number, number, number, number];
}[] = [
  { id: 'asia', bbox: [26, -12, 180, 77] },
  { id: 'europe', bbox: [-25, 35, 48, 72] },
  { id: 'africa', bbox: [-18, -35, 52, 38] },
  { id: 'north-america', bbox: [-168, 7, -15, 72] },
  { id: 'south-america', bbox: [-82, -56, -32, 18] },
  { id: 'oceania', bbox: [95, -48, 185, 5] },
  { id: 'antarctic', bbox: [-180, -90, 180, -60] },
];

export function gameContinentFromCountry(c: Country): GameContinentId {
  switch (c.region) {
    case 'Antarctic':
      return 'antarctic';
    case 'Oceania':
      return 'oceania';
    case 'Africa':
      return 'africa';
    case 'Europe':
      return 'europe';
    case 'Asia':
      return 'asia';
    case 'Americas':
      return c.subregion === 'South America' ? 'south-america' : 'north-america';
    default:
      return 'asia';
  }
}

function validLatLng(latlng: [number, number]): boolean {
  const [lat, lng] = latlng;
  if (lat === 0 && lng === 0) return false;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  return true;
}

/** 國家攝影機：world-countries 的 latlng 為 [緯度, 經度] */
export function countryFlyParams(
  iso2: string,
): { center: [number, number]; zoom: number } | null {
  const c = countriesData.find((x) => x.cca2 === iso2);
  if (!c?.latlng || c.latlng.length < 2) return null;
  const [lat, lng] = c.latlng;
  if (!validLatLng([lat, lng])) return null;

  const area = c.area ?? 800_000;
  let zoom: number;
  if (area > 15_000_000) zoom = 2.8;
  else if (area > 6_000_000) zoom = 3.4;
  else if (area > 2_000_000) zoom = 4.2;
  else if (area > 500_000) zoom = 5.2;
  else if (area > 100_000) zoom = 6.2;
  else zoom = 7.5;

  return { center: [lng, lat], zoom: Math.min(zoom, 9) };
}

export function buildMapFitCommand(sel: WorldMapSelection): MapFitCommand {
  if (sel.level === 'world') return { type: 'world' };
  if (sel.level === 'continent') {
    const def = GAME_CONTINENTS.find((x) => x.id === sel.continentId);
    if (!def) return { type: 'world' };
    const [w, s, e, n] = def.bbox;
    return { type: 'continent', w, s, e, n };
  }
  const fly = countryFlyParams(sel.iso2);
  if (!fly) {
    const def = GAME_CONTINENTS.find((x) => x.id === sel.continentId);
    if (!def) return { type: 'world' };
    const [w, s, e, n] = def.bbox;
    return { type: 'continent', w, s, e, n };
  }
  return {
    type: 'country',
    lng: fly.center[0],
    lat: fly.center[1],
    zoom: fly.zoom,
  };
}

export type CountryOption = { iso2: string; label: string };

function translationKeyForAppLocale(lang: string): keyof Country['translations'] | null {
  if (lang === 'zh-CN') return 'zho';
  if (lang === 'zh-TW') return 'zho';
  if (lang === 'ja') return 'jpn';
  if (lang === 'ko') return 'kor';
  return null;
}

function countryDisplayLabel(c: Country, lang: string): string {
  if (lang === 'zh-TW') {
    const override =
      countryNamesZhTWOverrides[c.cca2 as keyof ZhTwOverrides];
    if (typeof override === 'string' && override.length > 0) return override;
    const tw = countryNamesZhTW[c.cca2 as keyof ZhTwCountryNames];
    if (typeof tw === 'string' && tw.length > 0) return tw;
  }
  const tk = translationKeyForAppLocale(lang);
  if (tk && c.translations?.[tk]?.common) return c.translations[tk].common;
  return c.name.common;
}

function sortLocaleForLang(lang: string): string {
  if (lang.startsWith('zh')) return lang === 'zh-CN' ? 'zh-Hans' : 'zh-Hant';
  if (lang === 'ja') return 'ja';
  if (lang === 'ko') return 'ko';
  return 'en';
}

/** 亞洲選單應始終含台灣（TW）；必要時由資料來源補上，避免遺漏。 */
const ASIA_LIST_ENSURE_ISO2: readonly string[] = ['TW'];

export function listCountriesByContinent(
  id: GameContinentId,
  lang: string,
): CountryOption[] {
  const rows = countriesData
    .filter((c) => gameContinentFromCountry(c) === id)
    .filter((c) => c.latlng && validLatLng(c.latlng))
    .map((c) => ({
      iso2: c.cca2,
      label: countryDisplayLabel(c, lang),
    }));

  if (id === 'asia') {
    const have = new Set(rows.map((r) => r.iso2));
    for (const iso2 of ASIA_LIST_ENSURE_ISO2) {
      if (have.has(iso2)) continue;
      const c = countriesData.find((x) => x.cca2 === iso2);
      if (
        !c?.latlng ||
        !validLatLng(c.latlng) ||
        gameContinentFromCountry(c) !== 'asia'
      ) {
        continue;
      }
      rows.push({ iso2: c.cca2, label: countryDisplayLabel(c, lang) });
      have.add(iso2);
    }
  }

  rows.sort((a, b) =>
    a.label.localeCompare(b.label, sortLocaleForLang(lang), { sensitivity: 'base' }),
  );

  if (id === 'asia' && lang.startsWith('zh')) {
    const idx = rows.findIndex((r) => r.iso2 === 'TW');
    if (idx > 0) {
      const [tw] = rows.splice(idx, 1);
      rows.unshift(tw);
    }
  }

  return rows;
}
