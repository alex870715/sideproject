import type { CuisineCode, QuizAnswers, TasteProfile } from '@/types/tasteProfile';

type FullQuizAnswers = Omit<QuizAnswers, keyof QuizAnswers> & {
  cuisines: CuisineCode[];
  sugar: NonNullable<QuizAnswers['sugar']>;
  caffeine: NonNullable<QuizAnswers['caffeine']>;
  appetite: NonNullable<QuizAnswers['appetite']>;
  budget: NonNullable<QuizAnswers['budget']>;
  spice: NonNullable<QuizAnswers['spice']>;
  mealStyle: NonNullable<QuizAnswers['mealStyle']>;
  allergies: string[];
};

function promptFromAnswers(a: FullQuizAnswers): string {
  const allergyLine =
    a.allergies.length === 0 ? '無已知過敏食材。' : `必須避開：${a.allergies.join('、')}。`;
  return [
    '你是 Chow-It 使用者的「美食代理人」，需替真人協商用餐決策。',
    `偏好菜系：${a.cuisines.join('、')}。`,
    `飲品：糖量偏好 ${a.sugar}；咖啡因 ${a.caffeine}。`,
    `食量：${a.appetite === 'big' ? '偏大胃王型' : '偏輕食型'}。`,
    `每餐預算感：${a.budget}。`,
    allergyLine,
    `辣度：${a.spice}。`,
    `用餐氛圍：${a.mealStyle === 'social' ? '適合分享、社交' : '快速補充能量、獨享'}。`,
    '談判時要具體引用菜色特徵；尊重過敏與預算；語氣俏皮但專業。',
  ].join('\n');
}

export function buildTasteProfile(answers: QuizAnswers): TasteProfile | null {
  const {
    cuisines,
    sugar,
    caffeine,
    appetite,
    budget,
    allergies,
    spice,
    mealStyle,
  } = answers;

  if (
    cuisines.length === 0 ||
    !sugar ||
    !caffeine ||
    !appetite ||
    !budget ||
    !spice ||
    !mealStyle
  ) {
    return null;
  }

  const full: FullQuizAnswers = {
    cuisines,
    sugar,
    caffeine,
    appetite,
    budget,
    allergies,
    spice,
    mealStyle,
  };

  return {
    version: 1,
    cuisines,
    beverage: { sugar, caffeine },
    appetite,
    budget,
    allergies,
    spice,
    mealStyle,
    systemPromptSnippet: promptFromAnswers(full),
    completedAt: new Date().toISOString(),
  };
}
