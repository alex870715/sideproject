import { toYMD } from '@/lib/dateOnly';
import type { MealLogEntry } from '@/types/mealLog';
import type { CuisineCode } from '@/types/tasteProfile';

/** Deterministic PRNG for reproducible fixtures. */
function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

const SNACKS = ['珍珠奶茶半糖', '紅豆餅', '鹹酥雞', '地瓜球', '章魚燒', '雞蛋糕', '豆花'];

const BY_CUISINE: Record<CuisineCode, string[]> = {
  JP: [
    '炙燒鮭魚握壽司拼盤',
    '豚骨拉麵加溏心蛋',
    '親子丼定食',
    '日式咖喱炸猪排',
    '燒肉丼',
    '茶碗蒸與味噌湯套餐',
    '日式炸雞唐揚',
    '蕎麦冷麵',
    '生魚片拼盤（過敏替炙燒）',
    '關東煮組合',
    '大阪燒',
    '抹茶蕨餅',
  ],
  KR: [
    '韓式烤肉吃到飽',
    '銅板烤肉配生菜',
    '泡菜鍋與白飯',
    '辣炒年糕',
    '紫菜包飯套餐',
    '豆腐鍋',
    '炸雞半半',
    '冷麵',
    '魚板湯拉麵',
    '拌飯',
    '海鮮煎餅（過敏替蔬菜煎餅）',
    '柚子茶',
  ],
  TW: [
    '牛肉麵加餛飩',
    '滷肉飯配燙青菜',
    '鍋貼與酸辣湯',
    '蚵仔煎',
    '鹹粥加油條',
    '三杯雞便當',
    '排骨便當',
    '藥膳排骨湯',
    '彰化肉圓',
    '粉漿蛋餅',
    '珍珠奶茶微糖',
    '粉粿剉冰',
  ],
  Western: [
    '班尼迪克蛋早午餐',
    '肋眼牛排套餐',
    '藜麥沙拉烤雞',
    '義大利麵番茄海鮮（過敏換蔬菜）',
    '酸種三明治',
    '南瓜濃湯套餐',
    '夏威夷披薩',
    '松露薯條',
    '法式吐司',
    '法式洋蔥湯',
    '冰美式兩杯',
    '提拉米蘇',
  ],
};

/**
 * ~Feb 1 – May 17 2026（約三個半月），依菜系加權；同一天可有 1～3 筆。
 */
export function generateFixtureLogs(agentSeed: number, cuisines: CuisineCode[]): MealLogEntry[] {
  const rng = mulberry32(agentSeed * 977 + 1337);
  const pool: string[] = [];
  for (const c of cuisines) {
    pool.push(...BY_CUISINE[c]);
  }
  if (pool.length === 0) pool.push(...BY_CUISINE.TW);

  const start = new Date(2026, 1, 1); // Feb 1 2026
  const end = new Date(2026, 4, 17); // May 17 2026
  const logs: MealLogEntry[] = [];
  let seq = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (rng() > 0.62) continue;
    const date = toYMD(d);
    const nMeals = rng() > 0.82 ? 3 : rng() > 0.55 ? 2 : 1;
    for (let k = 0; k < nMeals; k++) {
      let note = pick(rng, pool);
      if (rng() > 0.88) note = `${note}；順便 ${pick(rng, SNACKS)}`;
      if (rng() > 0.94) note = `${note}\n${pick(rng, SNACKS)}`;

      const hour = 8 + Math.floor(rng() * 12);
      const min = Math.floor(rng() * 60);
      logs.push({
        id: `fixture-${agentSeed}-${date}-${seq}`,
        date,
        note,
        photoUri: null,
        createdAt: `${date}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000`,
      });
      seq += 1;
    }
  }

  return logs.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}
