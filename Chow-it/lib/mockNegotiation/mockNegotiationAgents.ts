import { generateFixtureLogs } from '@/lib/mockNegotiation/generateFixtureLogs';
import type { NegotiationAgentFixture } from '@/lib/mockNegotiation/fixtureTypes';
import { buildTasteProfile } from '@/lib/tasteProfile';
import type { MealLogEntry } from '@/types/mealLog';
import type { QuizAnswers } from '@/types/tasteProfile';

function quiz(a: QuizAnswers) {
  const p = buildTasteProfile(a);
  if (!p) throw new Error('fixture quiz incomplete');
  return p;
}

/** 12 組測試代理人（偏好＋約三個月手記）；談判室可切換 role-play。 */
export const MOCK_NEGOTIATION_AGENTS: NegotiationAgentFixture[] = [
  {
    id: 'umi',
    displayName: '代理人 · 小梅（日式過敏版）',
    emoji: '🍊',
    profile: quiz({
      cuisines: ['JP'],
      sugar: 'none',
      caffeine: 'high',
      appetite: 'small',
      budget: '$$',
      allergies: ['shellfish', 'nuts'],
      spice: 'mild',
      mealStyle: 'social',
    }),
    logs: mergeAnchors(
      [
        { date: '2026-05-17', note: '巧克力' },
        { date: '2026-05-16', note: '冰咖啡,牛肉麵,燒烤' },
        { date: '2026-05-15', note: '生魚片' },
        { date: '2026-05-15', note: '肉桂捲\n咖啡\n紅燒肉便當' },
        { date: '2026-05-14', note: '鍋貼' },
      ],
      generateFixtureLogs(1, ['JP']),
      1,
    ),
  },
  {
    id: 'jin',
    displayName: '代理人 · Jin（韓式烤肉社交）',
    emoji: '🍜',
    profile: quiz({
      cuisines: ['KR'],
      sugar: 'half',
      caffeine: 'moderate',
      appetite: 'big',
      budget: '$$$',
      allergies: [],
      spice: 'medium',
      mealStyle: 'social',
    }),
    logs: generateFixtureLogs(2, ['KR']),
  },
  {
    id: 'bao',
    displayName: '代理人 · 阿包（台式宵夜）',
    emoji: '🧋',
    profile: quiz({
      cuisines: ['TW'],
      sugar: 'full',
      caffeine: 'high',
      appetite: 'big',
      budget: '$',
      allergies: [],
      spice: 'medium',
      mealStyle: 'social',
    }),
    logs: generateFixtureLogs(3, ['TW']),
  },
  {
    id: 'lena',
    displayName: '代理人 · Lena（早午餐）',
    emoji: '🥗',
    profile: quiz({
      cuisines: ['Western'],
      sugar: 'half',
      caffeine: 'high',
      appetite: 'small',
      budget: '$$',
      allergies: ['dairy'],
      spice: 'mild',
      mealStyle: 'solo',
    }),
    logs: generateFixtureLogs(4, ['Western']),
  },
  {
    id: 'kai',
    displayName: '代理人 · Kai（日韓混搭）',
    emoji: '🍱',
    profile: quiz({
      cuisines: ['JP', 'KR'],
      sugar: 'none',
      caffeine: 'moderate',
      appetite: 'small',
      budget: '$$',
      allergies: ['shellfish'],
      spice: 'medium',
      mealStyle: 'social',
    }),
    logs: generateFixtureLogs(5, ['JP', 'KR']),
  },
  {
    id: 'ivy',
    displayName: '代理人 · Ivy（堅果過敏蔬食）',
    emoji: '🥒',
    profile: quiz({
      cuisines: ['TW', 'Western'],
      sugar: 'none',
      caffeine: 'none',
      appetite: 'small',
      budget: '$$',
      allergies: ['nuts'],
      spice: 'mild',
      mealStyle: 'social',
    }),
    logs: generateFixtureLogs(6, ['TW', 'Western']),
  },
  {
    id: 'marc',
    displayName: '代理人 · Marc（重辣獨食）',
    emoji: '🔥',
    profile: quiz({
      cuisines: ['TW', 'KR'],
      sugar: 'half',
      caffeine: 'high',
      appetite: 'big',
      budget: '$',
      allergies: [],
      spice: 'fire',
      mealStyle: 'solo',
    }),
    logs: generateFixtureLogs(7, ['TW', 'KR']),
  },
  {
    id: 'sofia',
    displayName: '代理人 · Sofia（無咖啡因精品）',
    emoji: '☕',
    profile: quiz({
      cuisines: ['Western', 'JP'],
      sugar: 'half',
      caffeine: 'none',
      appetite: 'small',
      budget: '$$$',
      allergies: [],
      spice: 'mild',
      mealStyle: 'social',
    }),
    logs: generateFixtureLogs(8, ['Western', 'JP']),
  },
  {
    id: 'haru',
    displayName: '代理人 · Haru（拉麵獨享）',
    emoji: '🍜',
    profile: quiz({
      cuisines: ['JP'],
      sugar: 'full',
      caffeine: 'moderate',
      appetite: 'big',
      budget: '$',
      allergies: [],
      spice: 'medium',
      mealStyle: 'solo',
    }),
    logs: generateFixtureLogs(9, ['JP']),
  },
  {
    id: 'mina',
    displayName: '代理人 · Mina（乳製過敏）',
    emoji: '🍼',
    profile: quiz({
      cuisines: ['KR', 'Western'],
      sugar: 'none',
      caffeine: 'moderate',
      appetite: 'small',
      budget: '$$',
      allergies: ['dairy'],
      spice: 'medium',
      mealStyle: 'social',
    }),
    logs: generateFixtureLogs(10, ['KR', 'Western']),
  },
  {
    id: 'tao',
    displayName: '代理人 · Tao（台式家常）',
    emoji: '🍚',
    profile: quiz({
      cuisines: ['TW'],
      sugar: 'half',
      caffeine: 'moderate',
      appetite: 'small',
      budget: '$$',
      allergies: ['shellfish'],
      spice: 'mild',
      mealStyle: 'social',
    }),
    logs: generateFixtureLogs(11, ['TW']),
  },
  {
    id: 'rex',
    displayName: '代理人 · Rex（西式高蛋白）',
    emoji: '🥩',
    profile: quiz({
      cuisines: ['Western'],
      sugar: 'none',
      caffeine: 'high',
      appetite: 'big',
      budget: '$$',
      allergies: ['nuts'],
      spice: 'medium',
      mealStyle: 'social',
    }),
    logs: generateFixtureLogs(12, ['Western']),
  },
  {
    id: 'nico',
    displayName: '代理人 · Nico（獨食重辣日韓）',
    emoji: '🌶️',
    profile: quiz({
      cuisines: ['JP', 'KR'],
      sugar: 'half',
      caffeine: 'moderate',
      appetite: 'big',
      budget: '$',
      allergies: [],
      spice: 'fire',
      mealStyle: 'solo',
    }),
    logs: generateFixtureLogs(13, ['JP', 'KR']),
  },
  {
    id: 'ella',
    displayName: '代理人 · Ella（台義聚餐）',
    emoji: '🍝',
    profile: quiz({
      cuisines: ['TW', 'Western'],
      sugar: 'full',
      caffeine: 'moderate',
      appetite: 'small',
      budget: '$$',
      allergies: ['dairy'],
      spice: 'mild',
      mealStyle: 'social',
    }),
    logs: generateFixtureLogs(14, ['TW', 'Western']),
  },
  {
    id: 'ken',
    displayName: '代理人 · Ken（日義混搭堅果過敏）',
    emoji: '🍕',
    profile: quiz({
      cuisines: ['JP', 'Western'],
      sugar: 'none',
      caffeine: 'high',
      appetite: 'big',
      budget: '$$$',
      allergies: ['nuts'],
      spice: 'medium',
      mealStyle: 'social',
    }),
    logs: generateFixtureLogs(15, ['JP', 'Western']),
  },
];

function mergeAnchors(
  anchors: { date: string; note: string }[],
  generated: MealLogEntry[],
  seed: number,
): MealLogEntry[] {
  const mapped = anchors.map((row, i) => ({
    id: `fixture-anchor-${seed}-${row.date}-${i}`,
    date: row.date,
    note: row.note,
    photoUri: null as string | null,
    createdAt: `${row.date}T${String(11 + i).padStart(2, '0')}:20:00.000`,
  }));
  const merged = [...mapped, ...generated];
  merged.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
  return merged;
}

export function getNegotiationAgentFixture(id: string): NegotiationAgentFixture | undefined {
  return MOCK_NEGOTIATION_AGENTS.find((a) => a.id === id);
}

/** 依勾選順序解析代理人；若为空或全部無效則退回預設三位。 */
export function resolveParticipantFixtures(ids: string[]): NegotiationAgentFixture[] {
  const list = ids
    .map((id) => getNegotiationAgentFixture(id))
    .filter((x): x is NegotiationAgentFixture => x != null);
  if (list.length > 0) return list;
  return MOCK_NEGOTIATION_AGENTS.slice(0, 3);
}
