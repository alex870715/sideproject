import type { CuisineCode, QuizAnswers } from '@/types/tasteProfile';
import { foodie } from '@/theme/foodie';
import {
  allergyOptions,
  cuisineOptions,
  initialQuizAnswers,
  TOTAL_QUIZ_STEPS,
} from '@/features/onboarding/quizConfig';
import { buildTasteProfile } from '@/lib/tasteProfile';
import { saveTasteProfile } from '@/lib/storage';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function toggleList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function ColdStartQuiz() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>(initialQuizAnswers);

  const progress = (step + 1) / TOTAL_QUIZ_STEPS;

  const goNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, TOTAL_QUIZ_STEPS - 1));
  }, []);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const finish = useCallback(async () => {
    const profile = buildTasteProfile(answers);
    if (!profile) {
      Alert.alert('再檢查一下', '請完成所有題目。');
      return;
    }
    await saveTasteProfile(profile);
    router.replace('/');
  }, [answers, router]);

  const questionTitle = useMemo(() => {
    const titles = [
      '今天舌頭想去哪？（可複選）',
      '手搖飲糖量？',
      '咖啡因要多醒嗎？',
      '食量軍銜？',
      '錢包友善度？',
      '過敏地雷？（可複選）',
      '辣度容忍值？',
      '這餐想怎麼吃？',
    ];
    return titles[step] ?? '';
  }, [step]);

  const canAdvanceStep0 = answers.cuisines.length > 0;

  const headerSubtitle = `第 ${step + 1} / ${TOTAL_QUIZ_STEPS} 題 · 約 30 秒`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => (step === 0 ? router.back() : goBack())} hitSlop={12}>
            <ChevronLeft color={foodie.ink} size={28} />
          </Pressable>
          <View style={styles.headerMain}>
            <Text style={styles.headerCaption}>{headerSubtitle}</Text>
            <View style={styles.segmentRow}>
              {Array.from({ length: TOTAL_QUIZ_STEPS }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.segment,
                    { backgroundColor: i <= step ? foodie.orange : foodie.peach },
                    i === step ? { opacity: 1 } : { opacity: 0.85 },
                  ]}
                />
              ))}
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View key={step} style={styles.questionBlock}>
              <Text style={styles.questionTitle}>{questionTitle}</Text>

              {step === 0 && (
                <View style={styles.blockGap}>
                  <View style={styles.wrapRow}>
                    {cuisineOptions.map((c) => {
                      const selected = answers.cuisines.includes(c.code);
                      return (
                        <Pressable
                          key={c.code}
                          style={[
                            styles.chip,
                            selected ? styles.chipSelected : styles.chipIdle,
                          ]}
                          onPress={() =>
                            setAnswers((prev) => ({
                              ...prev,
                              cuisines: toggleList<CuisineCode>(prev.cuisines, c.code),
                            }))
                          }>
                          <Text style={[styles.chipLabel, selected && styles.chipLabelOn]}>
                            {`${c.emoji} ${c.label}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    style={[styles.primaryBtn, !canAdvanceStep0 && styles.btnDisabled]}
                    disabled={!canAdvanceStep0}
                    onPress={goNext}>
                    <Text style={styles.primaryBtnLabel}>下一步</Text>
                  </Pressable>
                </View>
              )}

              {step === 1 && (
                <OptionColumn
                  options={[
                    { key: 'full', label: '全糖派對' },
                    { key: 'half', label: '半糖剛好' },
                    { key: 'none', label: '無糖清醒地' },
                  ]}
                  onPick={(key) => {
                    setAnswers((p) => ({ ...p, sugar: key as QuizAnswers['sugar'] }));
                    goNext();
                  }}
                />
              )}

              {step === 2 && (
                <OptionColumn
                  options={[
                    { key: 'high', label: '咖啡因拉滿' },
                    { key: 'moderate', label: '適中提神' },
                    { key: 'none', label: '今晚要睡覺' },
                  ]}
                  onPick={(key) => {
                    setAnswers((p) => ({ ...p, caffeine: key as QuizAnswers['caffeine'] }));
                    goNext();
                  }}
                />
              )}

              {step === 3 && (
                <OptionColumn
                  options={[
                    { key: 'small', label: '小鳥胃 · 點到為止' },
                    { key: 'big', label: '大食怪 · 可以加飯' },
                  ]}
                  onPick={(key) => {
                    setAnswers((p) => ({ ...p, appetite: key as QuizAnswers['appetite'] }));
                    goNext();
                  }}
                />
              )}

              {step === 4 && (
                <OptionColumn
                  options={[
                    { key: '$', label: '￥ 佛系省錢' },
                    { key: '$$', label: '￥￥ 平衡美味' },
                    { key: '$$$', label: '￥￥￥ 今日值得' },
                  ]}
                  onPick={(key) => {
                    setAnswers((p) => ({ ...p, budget: key as QuizAnswers['budget'] }));
                    goNext();
                  }}
                />
              )}

              {step === 5 && (
                <View style={styles.blockGap}>
                  <View style={styles.wrapRow}>
                    {allergyOptions.map((a) => {
                      const selected = answers.allergies.includes(a.code);
                      return (
                        <Pressable
                          key={a.code}
                          style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
                          onPress={() =>
                            setAnswers((prev) => ({
                              ...prev,
                              allergies: toggleList(prev.allergies, a.code),
                            }))
                          }>
                          <Text style={[styles.chipLabel, selected && styles.chipLabelOn]}>{a.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Pressable
                    style={[styles.outlineBtn]}
                    onPress={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        allergies: [],
                      }))
                    }>
                    <Text style={styles.outlineBtnLabel}>清楚標記 · 我沒有過敏</Text>
                  </Pressable>
                  <Pressable style={styles.primaryBtn} onPress={goNext}>
                    <Text style={styles.primaryBtnLabel}>下一步</Text>
                  </Pressable>
                </View>
              )}

              {step === 6 && (
                <OptionColumn
                  options={[
                    { key: 'mild', label: '微微辣就好' },
                    { key: 'medium', label: '中庸火辣戀愛中' },
                    { key: 'fire', label: '地獄辣勇者' },
                  ]}
                  onPick={(key) => {
                    setAnswers((p) => ({ ...p, spice: key as QuizAnswers['spice'] }));
                    goNext();
                  }}
                />
              )}

              {step === 7 && (
                <View style={styles.blockGap}>
                  <OptionColumn
                    options={[
                      { key: 'social', label: '好友分享 · 菜色要上桌好看' },
                      { key: 'solo', label: '獨享快充 · 好吃最重要' },
                    ]}
                    onPick={(key) => {
                      setAnswers((p) => ({ ...p, mealStyle: key as QuizAnswers['mealStyle'] }));
                    }}
                  />
                  <Pressable
                    style={[styles.successBtn, !answers.mealStyle && styles.btnDisabled]}
                    disabled={!answers.mealStyle}
                    onPress={finish}>
                    <Text style={styles.successBtnLabel}>生成品味檔案 ✨</Text>
                  </Pressable>
                </View>
              )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function OptionColumn({
  options,
  onPick,
}: {
  options: { key: string; label: string }[];
  onPick: (key: string) => void;
}) {
  return (
    <View style={styles.optionCol}>
      {options.map((o) => (
        <Pressable key={o.key} style={styles.optionBtn} onPress={() => onPick(o.key)}>
          <Text style={styles.optionLabel}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: foodie.cream },
  screen: { flex: 1, backgroundColor: foodie.cream },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerMain: { flex: 1 },
  headerCaption: { fontSize: 12, fontWeight: '600', color: foodie.muted },
  segmentRow: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' },
  segment: { flex: 1, height: 5, borderRadius: 999 },
  progressTrack: {
    marginTop: 8,
    height: 4,
    borderRadius: 999,
    backgroundColor: foodie.peach,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: foodie.orangeDeep,
  },
  scrollContent: { paddingBottom: 28 },
  questionBlock: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  questionTitle: { fontSize: 26, fontWeight: '800', color: foodie.ink, lineHeight: 34 },
  blockGap: { gap: 12 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 2,
  },
  chipIdle: { backgroundColor: foodie.card, borderColor: foodie.peach },
  chipSelected: { backgroundColor: foodie.orange, borderColor: foodie.orangeDeep },
  chipLabel: { fontSize: 16, fontWeight: '700', color: foodie.ink },
  chipLabelOn: { color: '#fff' },
  primaryBtn: {
    marginTop: 4,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: foodie.orangeDeep,
    alignItems: 'center',
  },
  primaryBtnLabel: { fontSize: 17, fontWeight: '800', color: '#fff' },
  outlineBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: foodie.peach,
    alignItems: 'center',
    backgroundColor: foodie.card,
  },
  outlineBtnLabel: { fontSize: 16, fontWeight: '700', color: foodie.ink },
  successBtn: {
    marginTop: 4,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: foodie.success,
    alignItems: 'center',
  },
  successBtnLabel: { fontSize: 17, fontWeight: '900', color: '#fff' },
  btnDisabled: { opacity: 0.45 },
  optionCol: { gap: 12 },
  optionBtn: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: foodie.card,
    borderWidth: 2,
    borderColor: foodie.peach,
  },
  optionLabel: { fontSize: 16, fontWeight: '700', color: foodie.ink },
});
