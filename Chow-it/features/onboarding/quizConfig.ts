import type { CuisineCode, QuizAnswers } from '@/types/tasteProfile';

export const TOTAL_QUIZ_STEPS = 8;

export const initialQuizAnswers = (): QuizAnswers => ({
  cuisines: [],
  sugar: null,
  caffeine: null,
  appetite: null,
  budget: null,
  allergies: [],
  spice: null,
  mealStyle: null,
});

export const cuisineOptions: { code: CuisineCode; label: string; emoji: string }[] = [
  { code: 'JP', label: '日式', emoji: '🍣' },
  { code: 'KR', label: '韓式', emoji: '🥘' },
  { code: 'TW', label: '台式', emoji: '🍜' },
  { code: 'Western', label: '西式', emoji: '🍝' },
];

export const allergyOptions: { code: string; label: string }[] = [
  { code: 'shellfish', label: '甲殼 / 海鮮' },
  { code: 'nuts', label: '堅果' },
  { code: 'dairy', label: '乳製品' },
  { code: 'gluten', label: '麩質' },
  { code: 'egg', label: '蛋' },
];
