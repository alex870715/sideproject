import { buildGameLabels } from '@/features/pick-food/buildGameLabels';
import { usePickFoodGameSettings } from '@/features/pick-food/usePickFoodGameSettings';
import { usePickFoodOptions } from '@/features/pick-food/usePickFoodOptions';
import { foodie } from '@/theme/foodie';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function BounceScreen() {
  const { settings, ready } = usePickFoodGameSettings();
  const options = usePickFoodOptions();
  const optionsKey = options.join('\u0001');

  const labels = useMemo(() => {
    if (!ready) return ['炙燒拉麵', '鹹酥雞'];
    return buildGameLabels(settings, options);
  }, [
    ready,
    settings.sourceMode,
    settings.optionCount,
    settings.customText,
    optionsKey,
  ]);

  const [display, setDisplay] = useState('炙燒拉麵');
  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (labels[0]) setDisplay(labels[0]);
  }, [labels]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    [],
  );

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const schedule = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  };

  const start = () => {
    if (running || labels.length === 0) return;
    clearTimers();
    setRunning(true);
    setWinner(null);

    const finalPick = labels[Math.floor(Math.random() * labels.length)];
    const steps = 24 + Math.floor(Math.random() * 16);
    let step = 0;

    const tick = () => {
      step += 1;
      setDisplay(labels[Math.floor(Math.random() * labels.length)]);
      const delay = Math.min(420, 42 + step * step * 0.42);
      if (step >= steps) {
        setDisplay(finalPick);
        setWinner(finalPick);
        setRunning(false);
        return;
      }
      schedule(tick, delay);
    };

    schedule(tick, 40);
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.hint}>名字會瘋狂跳動，越接近終點越慢——逮住那一刻的味道。</Text>

      <View style={styles.stage}>
        <Text style={[styles.jumpLabel, running && styles.jumpLabelActive]} numberOfLines={3}>
          {display}
        </Text>
      </View>

      <Pressable style={[styles.btn, running && styles.btnDisabled]} onPress={start} disabled={running}>
        <Text style={styles.btnTxt}>{running ? '跳跳中…' : '開始隨機跳跳'}</Text>
      </Pressable>

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>落定結果</Text>
        <Text style={styles.footerValue}>{winner ?? '— 尚未開始 —'}</Text>
      </View>
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
  stage: {
    minHeight: 160,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: foodie.peach,
    backgroundColor: foodie.card,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  jumpLabel: {
    fontSize: 26,
    fontWeight: '900',
    color: foodie.ink,
    textAlign: 'center',
    lineHeight: 34,
  },
  jumpLabelActive: {
    color: foodie.orangeDeep,
  },
  btn: {
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: foodie.success,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.55 },
  btnTxt: { fontSize: 17, fontWeight: '900', color: '#fff' },
  footer: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: foodie.peach,
    backgroundColor: foodie.card,
    gap: 6,
  },
  footerLabel: { fontSize: 13, fontWeight: '800', color: foodie.muted },
  footerValue: { fontSize: 22, fontWeight: '900', color: foodie.ink },
});
