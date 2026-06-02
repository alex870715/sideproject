import type { CuisineCode, TasteProfile } from '@/types/tasteProfile';

/** Default pool when no profile or to pad choices */
export const FALLBACK_FOOD_OPTIONS: string[] = [
  '炙燒拉麵',
  '鹹酥雞配珍奶',
  '韓式烤肉吃到飽',
  '義大利麵套餐',
  '牛肉湯配炒麵',
  '自助餐盤',
  '鍋燒意麵',
  '滷肉飯半熟蛋',
  '水餃酸辣湯',
  '沙拉輕食碗',
];

const BY_CUISINE: Record<CuisineCode, string[]> = {
  JP: ['豚骨拉麵', '炙燒握壽司', '咖哩飯定食', '燒鳥居酒屋'],
  KR: ['部隊鍋', '韓式烤肉', '石鍋拌飯', '豆腐鍋'],
  TW: ['滷肉飯小吃', '牛肉麵', '鹹酥雞宵夜', '鍋燒意麵'],
  Western: ['班尼迪克早午餐', '美式漢堡', '義大利麵', '烤雞沙拉'],
};

export function resolvePickFoodOptions(profile: TasteProfile | null): string[] {
  const set = new Set<string>();
  if (profile?.cuisines?.length) {
    for (const c of profile.cuisines) {
      for (const item of BY_CUISINE[c]) {
        set.add(item);
      }
    }
  }
  if (set.size < 6) {
    for (const item of FALLBACK_FOOD_OPTIONS) {
      set.add(item);
      if (set.size >= 12) break;
    }
  }
  return [...set].slice(0, 12);
}

export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
