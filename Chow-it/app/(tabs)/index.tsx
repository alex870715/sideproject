import { toYMD } from '@/lib/dateOnly';
import { loadMealLogs } from '@/lib/mealLogStorage';
import { foodie } from '@/theme/foodie';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ChevronRight, Dices, NotebookPen, Sparkles, UserRound } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();
  const [todayMealCount, setTodayMealCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      const today = toYMD(new Date());
      loadMealLogs().then((logs) => {
        const n = logs.filter((e) => e.date === today).length;
        setTodayMealCount(n);
      });
    }, []),
  );

  const journalSub = useMemo(() => {
    if (todayMealCount === null) return '載入中…';
    if (todayMealCount === 0) return '今天尚無紀錄 · 點開進月曆總覽（依日期瀏覽）';
    return `今天已記 ${todayMealCount} 筆 · 點開月曆檢視各日細節`;
  }, [todayMealCount]);

  return (
    <ScrollView style={styles.scrollRoot} contentContainerStyle={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Chow-It · 喬一餐</Text>
        <Text style={styles.headline}>
          好友聚餐，{'\n'}讓代理人去談。
        </Text>
      </View>

      <Pressable style={styles.pickBanner} onPress={() => router.push('/pick-food')}>
        <View style={styles.pickIcon}>
          <Dices color={foodie.orangeDeep} size={26} strokeWidth={2.4} />
        </View>
        <View style={styles.pickTextWrap}>
          <Text style={styles.pickTitle}>不知道吃什麼？</Text>
          <Text style={styles.pickSub}>抽抽樂 · 轉盤 · 隨機跳跳</Text>
        </View>
        <ChevronRight color={foodie.muted} size={22} />
      </Pressable>

      <Pressable onPress={() => router.push('/onboarding/quiz')}>
        <View style={styles.ctaCard}>
          <View style={styles.ctaIcons}>
            <Sparkles color="#fff" size={28} />
            <ChevronRight color="#fff" size={28} />
          </View>
          <Text style={styles.ctaTitle}>30 秒快速測驗</Text>
          <Text style={styles.ctaSub}>swipe-free · 快速點選 · 生成你的 Taste Profile</Text>
        </View>
      </Pressable>

      <View style={styles.secondaryRow}>
        <Pressable
          style={styles.secondaryCard}
          onPress={() => router.push('/journal')}
          accessibilityRole="button"
          accessibilityLabel={
            todayMealCount == null
              ? '用餐紀錄月曆'
              : `用餐紀錄月曆，今日 ${todayMealCount} 筆`
          }>
          <NotebookPen color={foodie.orangeDeep} size={22} />
          <View style={styles.secondaryTextWrap}>
            <View style={styles.secondaryTitleRow}>
              <Text style={styles.secondaryTitle}>用餐紀錄</Text>
              <Text style={styles.secondaryTitleHint}>月曆</Text>
              {todayMealCount != null && todayMealCount > 0 ? (
                <View style={styles.todayBadge}>
                  <Text style={styles.todayBadgeTxt}>今日 {todayMealCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.secondarySub}>{journalSub}</Text>
          </View>
          <ChevronRight color={foodie.muted} size={22} />
        </Pressable>
        <Pressable
          style={[styles.secondaryCard, styles.secondaryCompact]}
          onPress={() => router.push('/journal/add')}>
          <Text style={styles.secondaryAction}>＋ 快速記一筆</Text>
        </Pressable>
      </View>

      <Pressable style={styles.profileRow} onPress={() => router.push('/profile')}>
        <View style={styles.profileIcon}>
          <UserRound color={foodie.orangeDeep} size={22} strokeWidth={2.2} />
        </View>
        <View style={styles.profileTextWrap}>
          <Text style={styles.profileTitle}>AI 代理人 · 品味檔案</Text>
          <Text style={styles.profileSub}>測驗摘要、自訂摘錄與合併預覽請到「個人」編輯。</Text>
        </View>
        <ChevronRight color={foodie.muted} size={22} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollRoot: { flex: 1, backgroundColor: foodie.cream },
  screen: {
    flexGrow: 1,
    backgroundColor: foodie.cream,
    padding: 16,
    gap: 16,
    paddingBottom: 28,
  },
  hero: { gap: 8 },
  kicker: { fontSize: 13, fontWeight: '700', color: foodie.muted },
  headline: { fontSize: 30, fontWeight: '900', color: foodie.ink },
  pickBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: foodie.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: foodie.orange,
  },
  pickIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFE8DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickTextWrap: { flex: 1, gap: 4 },
  pickTitle: { fontSize: 18, fontWeight: '900', color: foodie.ink },
  pickSub: { fontSize: 13, fontWeight: '700', color: foodie.muted },
  ctaCard: {
    backgroundColor: foodie.orange,
    padding: 16,
    borderRadius: 16,
    gap: 8,
    borderWidth: 2,
    borderColor: foodie.orangeDeep,
  },
  ctaIcons: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ctaTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  ctaSub: { fontSize: 14, fontWeight: '600', color: '#fff', opacity: 0.92 },
  secondaryRow: { gap: 10 },
  secondaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: foodie.card,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: foodie.peach,
  },
  secondaryCompact: { justifyContent: 'center' },
  secondaryTextWrap: { flex: 1, gap: 4 },
  secondaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  secondaryTitle: { fontSize: 16, fontWeight: '900', color: foodie.ink },
  secondaryTitleHint: {
    fontSize: 12,
    fontWeight: '800',
    color: foodie.orangeDeep,
    backgroundColor: '#FFE8DC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  todayBadge: {
    backgroundColor: foodie.orangeDeep,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  todayBadgeTxt: { fontSize: 11, fontWeight: '900', color: '#fff' },
  secondarySub: { fontSize: 13, fontWeight: '600', color: foodie.muted },
  secondaryAction: { fontSize: 15, fontWeight: '800', color: foodie.orangeDeep },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: foodie.card,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: foodie.peach,
  },
  profileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFE8DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTextWrap: { flex: 1, gap: 4 },
  profileTitle: { fontSize: 15, fontWeight: '900', color: foodie.ink },
  profileSub: { fontSize: 13, fontWeight: '600', color: foodie.muted, lineHeight: 18 },
});
