import type { NegotiationAgentFixture } from '@/lib/mockNegotiation/fixtureTypes';
import type { VerdictPlan } from '@/types/negotiationVerdict';

function spiceSummary(fixtures: NegotiationAgentFixture[]): string {
  let mild = 0;
  let medium = 0;
  let fire = 0;
  for (const f of fixtures) {
    if (f.profile.spice === 'mild') mild++;
    else if (f.profile.spice === 'medium') medium++;
    else fire++;
  }
  if (fire >= fixtures.length / 2) return '整桌偏能耐辣（達半數為中辣以上）';
  if (mild >= fixtures.length / 2) return '整桌偏怕辣（多半 mild）';
  return '辣度意見分歧 · 建議分蘸碟';
}

function caffeineLean(fixtures: NegotiationAgentFixture[]): 'high' | 'mixed' | 'low' {
  let hi = 0;
  let none = 0;
  for (const f of fixtures) {
    if (f.profile.beverage.caffeine === 'high') hi++;
    if (f.profile.beverage.caffeine === 'none') none++;
  }
  if (hi >= none && hi > 0) return 'high';
  if (none > hi) return 'low';
  return 'mixed';
}

function budgetBand(fixtures: NegotiationAgentFixture[]): string {
  const ranks = { $: 1, $$: 2, $$$: 3 };
  let max = 1;
  for (const f of fixtures) {
    max = Math.max(max, ranks[f.profile.budget]);
  }
  if (max >= 3) return '預算上限偏高（有人習慣 $$$）';
  if (max === 2) return '預算中等（$$ 為主）';
  return '預算輕鬆（偏 $）';
}

/**
 * 依「代理人數」（代表同桌偏好維度數）與各代理人檔案，產出三種聚餐配置草案。
 */
export function buildNegotiationVerdictPlans(fixtures: NegotiationAgentFixture[]): VerdictPlan[] {
  const n = Math.max(fixtures.length, 1);
  const big = fixtures.filter((f) => f.profile.appetite === 'big').length;
  const small = fixtures.filter((f) => f.profile.appetite === 'small').length;
  const social = fixtures.filter((f) => f.profile.mealStyle === 'social').length;

  const spiceLine = spiceSummary(fixtures);
  const caf = caffeineLean(fixtures);
  const budget = budgetBand(fixtures);

  /** 主食／分享主食份量係數 */
  const portionLight = Math.max(1, Math.round(n * 0.75 + small * 0.15));
  const portionStd = Math.max(n, Math.round(n + big * 0.2));
  const portionHeavy = Math.max(portionStd + 1, Math.round(n * 1.2 + big * 0.35));

  /** 飯碗：偏輕食略減、偏大胃略加 */
  const riceLight = Math.max(0, Math.round(n * 0.55 - small * 0.05));
  const riceStd = Math.round(n * (big > small ? 1.05 : 0.95));
  const riceHeavy = Math.round(n * (big >= n / 2 ? 1.35 : 1.15));

  /** 飲料杯數：無咖啡因偏好高時多備無咖啡因杯 */
  let drinkBase = n + Math.ceil(n / 3);
  if (caf === 'high') drinkBase += Math.ceil(n / 4);
  if (caf === 'low') drinkBase += Math.ceil(n / 5);

  const drinksA = Math.max(n, drinkBase - 1);
  const drinksB = drinkBase + Math.ceil(n / 4);
  const drinksC = drinkBase + Math.ceil(n / 2) + (social >= n / 2 ? 2 : 0);

  /** 酒：社交＋預算鬆 → 方案 C 偏多 */
  const alcBase = social >= n / 2 ? Math.ceil(n / 3) : Math.max(1, Math.ceil(n / 4));
  const alcA = Math.max(0, alcBase - 1);
  const alcB = alcBase + (budget.includes('$$$') ? 1 : 0);
  const alcC = alcBase + 2 + (budget.includes('偏高') ? 1 : 0);

  const alcUnit = social >= n / 2 ? '瓶／壺（共享斟倒）' : '杯（標準杯量）';

  const spicyAdjustA =
        spiceLine.includes('怕辣') ? '全桌微辣底，辣椒油與生蘸碟另上（少量）' : '主菜辣度降一級，蘸碟加辣自由調';
  const spicyAdjustB =
    spiceLine.includes('分歧') ? '鍋底／醬料「半辣 split」：一側温和一側中辣' : '標準辣度＋桌上備一小碟辣醬';
  const spicyAdjustC =
    spiceLine.includes('能耐辣') ? '可上中辣～小辣；仍備白開水解辣' : '中辣為主，怕辣者配蔬菜碟解辣';

  const shareNote =
    social >= n / 2 ? '共享拼盤為主，個人碗份量輔助' : '個人主食為主，必要時加一兩道分享冷盤';

  return [
    {
      key: 'A',
      title: '方案 A · 精準控量',
      tagline: '怕浪費、辣度保守、酒最少',
      lines: [
        { label: '人頭基準', value: `${n} 位代理人偏好納入計算` },
        { label: '主食／分享份量', value: `約 ${portionLight} 份（輕量版；${shareNote}）` },
        { label: '飯碗數', value: `${riceLight} 碗（偏輕食／或少飯）` },
        { label: '飲料杯數', value: `${drinksA} 杯（含備援；咖啡因偏好：${caf === 'high' ? '多備咖啡系' : caf === 'low' ? '多備無咖啡因' : '混搭'}）` },
        { label: '酒精', value: `${alcA} ${alcUnit}（可有可無，最少配置）` },
        { label: '辣度調整', value: `${spicyAdjustA}（判定：${spiceLine}）` },
        { label: '預算感', value: budget },
      ],
    },
    {
      key: 'B',
      title: '方案 B · 平衡聚餐',
      tagline: '人頭換算＋蘸碟折衷，最常上桌',
      lines: [
        { label: '人頭基準', value: `${n} 位代理人偏好納入計算` },
        { label: '主食／分享份量', value: `約 ${portionStd} 份（標準桌；${shareNote}）` },
        { label: '飯碗數', value: `${riceStd} 碗（依大／小食量比例折衷）` },
        { label: '飲料杯數', value: `${drinksB} 杯（含共享斟倒緩衝杯）` },
        { label: '酒精', value: `${alcB} ${alcUnit}（桌間敬酒／Share 友善）` },
        { label: '辣度調整', value: `${spicyAdjustB}（判定：${spiceLine}）` },
        { label: '預算感', value: budget },
      ],
    },
    {
      key: 'C',
      title: '方案 C · 豪放共享',
      tagline: '拼盤加大、飲料酒水備援最多',
      lines: [
        { label: '人頭基準', value: `${n} 位代理人偏好納入計算` },
        { label: '主食／分享份量', value: `約 ${portionHeavy} 份（加量版；${shareNote}）` },
        { label: '飯碗數', value: `${riceHeavy} 碗（偏大食量／續碗緩衝）` },
        { label: '飲料杯數', value: `${drinksC} 杯（含「加點一杯」備援）` },
        { label: '酒精', value: `${alcC} ${alcUnit}（社交場合備量較足）` },
        { label: '辣度調整', value: `${spicyAdjustC}（判定：${spiceLine}）` },
        { label: '預算感', value: budget },
      ],
    },
  ];
}
