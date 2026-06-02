import { buildGameLabels } from '@/features/pick-food/buildGameLabels';
import { lotteryMaxCols, lotteryRowPattern } from '@/features/pick-food/lotteryLayout';
import { shuffleInPlace } from '@/features/pick-food/options';
import { usePickFoodGameSettings } from '@/features/pick-food/usePickFoodGameSettings';
import { usePickFoodOptions } from '@/features/pick-food/usePickFoodOptions';
import { foodie } from '@/theme/foodie';
import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const BOARD_WIDTH = 300;
const GAP = 10;

type Phase = 'preview' | 'shuffling' | 'pick' | 'picked' | 'all_open';

export default function LotteryScreen() {
  const { settings, ready } = usePickFoodGameSettings();
  const options = usePickFoodOptions();
  const [labels, setLabels] = useState<string[]>(['…', '…']);
  const [phase, setPhase] = useState<Phase>('preview');
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const pulse = useMemo(() => new Animated.Value(1), []);

  const optionsKey = options.join('\u0001');

  useEffect(() => {
    if (!ready) return;
    const next = buildGameLabels(settings, options);
    setLabels(next);
    setPhase('preview');
    setPickedIndex(null);
  }, [
    ready,
    settings.sourceMode,
    settings.optionCount,
    settings.customText,
    optionsKey,
  ]);

  /** 揭開你選的那張後，隔 1 秒開剩餘牌 */
  useEffect(() => {
    if (phase !== 'picked' || pickedIndex === null) return;
    const id = setTimeout(() => setPhase('all_open'), 1000);
    return () => clearTimeout(id);
  }, [phase, pickedIndex]);

  const pattern = useMemo(() => lotteryRowPattern(labels.length), [labels.length]);
  const maxCols = useMemo(() => lotteryMaxCols(pattern), [pattern]);
  const cellSize = useMemo(() => {
    if (maxCols <= 0) return 72;
    return Math.max(
      48,
      Math.min(100, Math.floor((BOARD_WIDTH - GAP * (maxCols - 1)) / maxCols)),
    );
  }, [maxCols]);

  const runShuffle = () => {
    if (phase !== 'preview') return;
    setPhase('shuffling');
    setPickedIndex(null);

    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1.08,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 0.96,
        duration: 200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 1.05,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 1,
        duration: 700,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setLabels((prev) => {
        const next = [...prev];
        shuffleInPlace(next);
        return next;
      });
      setPhase('pick');
    });
  };

  const onPickCard = (index: number) => {
    if (phase !== 'pick') return;
    setPickedIndex(index);
    setPhase('picked');
  };

  const playAgain = () => {
    if (!ready) return;
    setLabels(buildGameLabels(settings, options));
    setPhase('preview');
    setPickedIndex(null);
  };

  const cardShowsLabel = (i: number) => {
    if (phase === 'preview') return true;
    if (phase === 'shuffling') return false;
    if (phase === 'pick') return false;
    if (phase === 'picked') return i === pickedIndex;
    return true;
  };

  const others = Math.max(0, labels.length - 1);

  const hintCopy =
    phase === 'preview'
      ? `先看清楚這 ${labels.length} 張口味卡——記住你想吃的，等等洗牌後就要盲抽啦。`
      : phase === 'shuffling'
        ? '洗牌中⋯⋯牌背朝上了，準備憑感覺點一格！'
        : phase === 'pick'
          ? '手動點選一格：先只開你選的那張。'
          : phase === 'picked'
            ? `你選的先開！其它 ${others} 張會在 1 秒後自動翻開。`
            : '全貌公開——金色框是你剛剛下手的那一張。';

  let slotOffset = 0;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.hint}>{hintCopy}</Text>

      <Animated.View style={[styles.gridWrap, { transform: [{ scale: pulse }] }]}>
        <View style={styles.column}>
          {pattern.map((colsInRow, ri) => {
            const rowSlice = labels.slice(slotOffset, slotOffset + colsInRow);
            const rowStart = slotOffset;
            slotOffset += colsInRow;
            return (
              <View key={`row-${ri}`} style={[styles.rowBand, { width: BOARD_WIDTH }]}>
                <View style={[styles.rowInner, { gap: GAP }]}>
                  {rowSlice.map((label, ci) => {
                    const i = rowStart + ci;
                    const open = cardShowsLabel(i);
                    const canTap = phase === 'pick';
                    const yourPick = phase === 'all_open' && pickedIndex === i;
                    return (
                      <Pressable
                        key={`slot-${i}`}
                        disabled={!canTap}
                        onPress={() => onPickCard(i)}
                        style={[
                          styles.card,
                          {
                            width: cellSize,
                            height: cellSize,
                          },
                          !open ? styles.cardFaceDown : null,
                          yourPick ? styles.cardYourPick : null,
                          canTap ? styles.cardTouchable : null,
                        ]}>
                        <Text
                          style={[styles.cardText, cellSize < 64 && styles.cardTextSmall, !open && styles.cardTextMuted]}
                          numberOfLines={3}>
                          {open ? label : '??'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </Animated.View>

      {phase === 'preview' ? (
        <Pressable style={styles.primaryBtn} onPress={runShuffle}>
          <Text style={styles.primaryLabel}>洗牌！蓋住牌背</Text>
        </Pressable>
      ) : null}

      {(phase === 'picked' || phase === 'all_open') && pickedIndex !== null ? (
        <View style={styles.result}>
          <Text style={styles.resultLabel}>
            {phase === 'picked' ? '你選的這一格是⋯⋯' : '你抽中的口味'}
          </Text>
          <Text style={styles.resultValue}>{labels[pickedIndex]}</Text>
          {phase === 'all_open' ? (
            <Pressable style={styles.secondaryBtn} onPress={playAgain}>
              <Text style={styles.secondaryLabel}>換一批 · 再來一局</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: foodie.cream,
    gap: 16,
  },
  hint: {
    fontSize: 14,
    fontWeight: '600',
    color: foodie.muted,
    lineHeight: 21,
  },
  gridWrap: { alignSelf: 'center' },
  column: { alignItems: 'center', gap: GAP },
  rowBand: {
    alignItems: 'center',
  },
  rowInner: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: foodie.peach,
    backgroundColor: foodie.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  cardTouchable: {
    borderColor: foodie.orange,
    borderStyle: 'dashed',
  },
  cardFaceDown: {
    backgroundColor: '#FDE8D8',
  },
  cardYourPick: {
    borderColor: foodie.amber,
    borderWidth: 3,
    backgroundColor: '#FFF5E6',
  },
  cardText: {
    fontSize: 12,
    fontWeight: '900',
    color: foodie.ink,
    textAlign: 'center',
  },
  cardTextSmall: {
    fontSize: 11,
  },
  cardTextMuted: {
    fontSize: 18,
    letterSpacing: 2,
    color: foodie.orangeDeep,
  },
  primaryBtn: {
    marginTop: 4,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: foodie.orangeDeep,
    alignItems: 'center',
  },
  primaryLabel: { fontSize: 17, fontWeight: '900', color: '#fff' },
  result: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: foodie.peach,
    backgroundColor: foodie.card,
    gap: 8,
  },
  resultLabel: { fontSize: 13, fontWeight: '800', color: foodie.muted },
  resultValue: { fontSize: 22, fontWeight: '900', color: foodie.ink },
  secondaryBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: foodie.peach,
  },
  secondaryLabel: { fontSize: 15, fontWeight: '800', color: foodie.orangeDeep },
});
