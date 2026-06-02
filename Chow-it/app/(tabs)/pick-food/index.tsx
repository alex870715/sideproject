import { PICK_COUNT_MAX, PICK_COUNT_MIN } from '@/features/pick-food/countLimits';
import { parseCustomLines } from '@/features/pick-food/buildGameLabels';
import { usePickFoodGameSettings } from '@/features/pick-food/usePickFoodGameSettings';
import { foodie } from '@/theme/foodie';
import { type Href, useRouter } from 'expo-router';
import { ChevronRight, CircleDot, Dices, Shuffle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const COUNT_CHIPS = Array.from(
  { length: PICK_COUNT_MAX - PICK_COUNT_MIN + 1 },
  (_, i) => i + PICK_COUNT_MIN,
);

const modes: {
  href: Href;
  title: string;
  sub: string;
  Icon: typeof Dices;
  tint: string;
}[] = [
  {
    href: '/pick-food/lottery',
    title: '口味抽抽樂',
    sub: '排版會跟著數量變形（例：5＝上3下2）。',
    Icon: Dices,
    tint: foodie.orangeDeep,
  },
  {
    href: '/pick-food/wheel',
    title: '幸運轉盤',
    sub: '扇區數＝你設定的選項數。',
    Icon: CircleDot,
    tint: '#2563EB',
  },
  {
    href: '/pick-food/bounce',
    title: '隨機跳跳',
    sub: '只在你的題庫裡暴走。',
    Icon: Shuffle,
    tint: foodie.success,
  },
];

export default function PickFoodHubScreen() {
  const router = useRouter();
  const { settings, update, ready } = usePickFoodGameSettings();
  const [customDraft, setCustomDraft] = useState('');

  useEffect(() => {
    if (ready) setCustomDraft(settings.customText);
  }, [ready, settings.customText]);

  const customLineCount = parseCustomLines(customDraft).length;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.inner}>
      <Text style={styles.lead}>
        從首頁逛了一圈還是沒靈感？先設定題庫與數量，再選玩法。
      </Text>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>遊戲設定（三種共用）</Text>

        <Text style={styles.settingsLabel}>題庫來源</Text>
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeChip, settings.sourceMode === 'random' && styles.modeChipOn]}
            onPress={() => update({ sourceMode: 'random' })}>
            <Text
              style={[
                styles.modeChipLabel,
                settings.sourceMode === 'random' && styles.modeChipLabelOn,
              ]}>
              隨機題庫
            </Text>
            <Text style={styles.modeChipHint}>依品味檔案＋預設池打亂抽取</Text>
          </Pressable>
          <Pressable
            style={[styles.modeChip, settings.sourceMode === 'custom' && styles.modeChipOn]}
            onPress={() => update({ sourceMode: 'custom' })}>
            <Text
              style={[
                styles.modeChipLabel,
                settings.sourceMode === 'custom' && styles.modeChipLabelOn,
              ]}>
              自訂選項
            </Text>
            <Text style={styles.modeChipHint}>一行一道菜（可少於數量，會循環補滿）</Text>
          </Pressable>
        </View>

        <Text style={styles.settingsLabel}>選項數量 · {settings.optionCount} 個</Text>
        <View style={styles.countRow}>
          {COUNT_CHIPS.map((n) => (
            <Pressable
              key={n}
              style={[styles.countChip, settings.optionCount === n && styles.countChipOn]}
              onPress={() => update({ optionCount: n })}>
              <Text
                style={[
                  styles.countChipLabel,
                  settings.optionCount === n && styles.countChipLabelOn,
                ]}>
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.countHint}>
          抽抽樂版面會自動對應：3→1×3、4→2×2、5→3+2⋯⋯
        </Text>

        {settings.sourceMode === 'custom' ? (
          <>
            <Text style={styles.settingsLabel}>自訂菜單（一行一項）</Text>
            <TextInput
              style={styles.customInput}
              multiline
              textAlignVertical="top"
              placeholder={'拉麵\n鹹酥雞\n滷肉飯'}
              placeholderTextColor={foodie.muted}
              value={customDraft}
              onChangeText={setCustomDraft}
              onBlur={() => update({ customText: customDraft })}
            />
            <Text style={styles.customMeta}>
              已輸入 {customLineCount} 行；若不足 {settings.optionCount} 項會循環使用。
            </Text>
          </>
        ) : null}
      </View>

      <Text style={styles.meta}>完成設定後點進任一玩法即可。</Text>

      <View style={styles.list}>
        {modes.map((m) => (
          <Pressable key={m.href.toString()} style={styles.row} onPress={() => router.push(m.href)}>
            <View style={[styles.iconBubble, { backgroundColor: `${m.tint}22` }]}>
              <m.Icon color={m.tint} size={26} strokeWidth={2.4} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{m.title}</Text>
              <Text style={styles.rowSub}>{m.sub}</Text>
            </View>
            <ChevronRight color={foodie.muted} size={22} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: foodie.cream },
  inner: { padding: 16, paddingBottom: 32, gap: 12 },
  lead: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '800',
    color: foodie.ink,
  },
  settingsCard: {
    backgroundColor: foodie.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: foodie.peach,
    padding: 14,
    gap: 10,
  },
  settingsTitle: { fontSize: 16, fontWeight: '900', color: foodie.ink },
  settingsLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: foodie.muted,
    marginTop: 4,
  },
  modeRow: { gap: 10 },
  modeChip: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: foodie.peach,
    padding: 12,
    backgroundColor: foodie.cream,
  },
  modeChipOn: {
    borderColor: foodie.orangeDeep,
    backgroundColor: '#FFE8DC',
  },
  modeChipLabel: { fontSize: 15, fontWeight: '900', color: foodie.ink },
  modeChipLabelOn: { color: foodie.orangeDeep },
  modeChipHint: { fontSize: 11, fontWeight: '600', color: foodie.muted, marginTop: 4 },
  countRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  countChip: {
    minWidth: 40,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: foodie.peach,
    backgroundColor: foodie.cream,
    alignItems: 'center',
  },
  countChipOn: {
    borderColor: foodie.orangeDeep,
    backgroundColor: foodie.orange,
  },
  countChipLabel: { fontSize: 15, fontWeight: '900', color: foodie.ink },
  countChipLabelOn: { color: '#fff' },
  countHint: { fontSize: 11, fontWeight: '600', color: foodie.muted, lineHeight: 16 },
  customInput: {
    minHeight: 110,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: foodie.peach,
    padding: 12,
    fontSize: 15,
    fontWeight: '600',
    color: foodie.ink,
    backgroundColor: foodie.cream,
  },
  customMeta: { fontSize: 11, fontWeight: '600', color: foodie.muted },
  meta: {
    fontSize: 13,
    fontWeight: '600',
    color: foodie.muted,
    lineHeight: 19,
  },
  list: { gap: 12, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: foodie.card,
    borderWidth: 1,
    borderColor: foodie.peach,
  },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 17, fontWeight: '900', color: foodie.ink },
  rowSub: { fontSize: 13, fontWeight: '600', color: foodie.muted },
});
