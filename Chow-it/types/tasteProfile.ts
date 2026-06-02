export type CuisineCode = 'JP' | 'KR' | 'TW' | 'Western';

export type TasteProfile = {
  version: 1;
  cuisines: CuisineCode[];
  beverage: {
    sugar: 'full' | 'half' | 'none';
    caffeine: 'high' | 'moderate' | 'none';
  };
  appetite: 'small' | 'big';
  budget: '$' | '$$' | '$$$';
  allergies: string[];
  spice: 'mild' | 'medium' | 'fire';
  mealStyle: 'social' | 'solo';
  /** Concatenated instructions suitable for LLM system prompt */
  systemPromptSnippet: string;
  completedAt: string;
};

export type QuizAnswers = {
  cuisines: CuisineCode[];
  sugar: 'full' | 'half' | 'none' | null;
  caffeine: 'high' | 'moderate' | 'none' | null;
  appetite: 'small' | 'big' | null;
  budget: '$' | '$$' | '$$$' | null;
  allergies: string[];
  spice: 'mild' | 'medium' | 'fire' | null;
  mealStyle: 'social' | 'solo' | null;
};
