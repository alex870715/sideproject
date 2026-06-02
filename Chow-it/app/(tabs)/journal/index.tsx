import {
  daysInMonth,
  formatZhTWLong,
  shiftCalendarMonth,
  toYMD,
} from '@/lib/dateOnly';
import { confirmAsync } from '@/lib/confirmDialog';
import { loadMealLogs, removeMealLog } from '@/lib/mealLogStorage';
import { foodie } from '@/theme/foodie';
import type { MealLogEntry } from '@/types/mealLog';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'] as const;

type CalendarCell = {
  ymd: string;
  inMonth: boolean;
  dayNum: number;
};

function buildMonthCells(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month - 1, 1);
  const lead = first.getDay();
  const dim = daysInMonth(year, month);
  const iter = new Date(year, month - 1, 1 - lead);
  const totalCells = Math.ceil((lead + dim) / 7) * 7;
  const cells: CalendarCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const ymd = toYMD(iter);
    const inMonth = iter.getMonth() === month - 1;
    const dayNum = iter.getDate();
    cells.push({
      ymd,
      inMonth,
      dayNum,
    });
    iter.setDate(iter.getDate() + 1);
  }
  return cells;
}

function formatSlashYMD(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${y}/${Number(m)}/${Number(d)}`;
}

function chunkWeeks<T>(cells: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export default function MealLogListScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();

  const [entries, setEntries] = useState<MealLogEntry[]>([]);
  const [viewMonth, setViewMonth] = useState(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() + 1 };
  });
  const [selectedYMD, setSelectedYMD] = useState(() => toYMD(new Date()));

  const todayYMD = toYMD(new Date());

  useFocusEffect(
    useCallback(() => {
      loadMealLogs().then(setEntries);
    }, []),
  );

  const datesWithLogs = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);

  const monthCells = useMemo(
    () => buildMonthCells(viewMonth.year, viewMonth.month),
    [viewMonth.year, viewMonth.month],
  );

  const entriesForDay = useMemo(() => {
    return entries
      .filter((e) => e.date === selectedYMD)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [entries, selectedYMD]);

  const gap = 6;
  const cellSize = Math.min(52, Math.floor((windowWidth - 32 - gap * 6) / 7));

  const goToday = () => {
    const t = new Date();
    setViewMonth({ year: t.getFullYear(), month: t.getMonth() + 1 });
    setSelectedYMD(toYMD(t));
  };

  const goAddSelected = () => {
    router.push({ pathname: '/journal/add', params: { date: selectedYMD } });
  };

  const goEdit = (item: MealLogEntry) => {
    router.push({ pathname: '/journal/add', params: { id: item.id } });
  };

  const confirmDelete = (entry: MealLogEntry) => {
    void (async () => {
      const ok = await confirmAsync({
        title: '刪除紀錄',
        message: '確定要刪除這則用餐紀錄嗎？',
        cancelText: '取消',
        confirmText: '刪除',
        destructive: true,
      });
      if (!ok) return;
      await removeMealLog(entry.id);
      setEntries(await loadMealLogs());
    })();
  };

  const selectCell = (cell: CalendarCell) => {
    setSelectedYMD(cell.ymd);
    const [yy, mm] = cell.ymd.split('-').map((x) => parseInt(x, 10));
    setViewMonth({ year: yy, month: mm });
  };

  const prevMonth = () => setViewMonth((v) => shiftCalendarMonth(v.year, v.month, -1));
  const nextMonth = () => setViewMonth((v) => shiftCalendarMonth(v.year, v.month, 1));

  const monthTitle = `${viewMonth.year}年${viewMonth.month}月`;

  const listHeader = (
    <View style={styles.calBlock}>
      <View style={styles.topBar}>
        <Pressable style={styles.topBarBtn} onPress={goToday} hitSlop={10}>
          <Text style={styles.topBarAccent}>今天</Text>
        </Pressable>
        <Text style={styles.topBarCenter}>{formatSlashYMD(selectedYMD)}</Text>
        <Pressable style={styles.topBarBtn} onPress={goAddSelected} hitSlop={10}>
          <Plus color={foodie.orangeDeep} size={26} strokeWidth={2.5} />
        </Pressable>
      </View>

      <View style={styles.monthNav}>
        <Pressable style={styles.monthChevron} onPress={prevMonth} hitSlop={12}>
          <ChevronLeft color={foodie.ink} size={28} />
        </Pressable>
        <Text style={styles.monthNavTitle}>{monthTitle}</Text>
        <Pressable style={styles.monthChevron} onPress={nextMonth} hitSlop={12}>
          <ChevronRight color={foodie.ink} size={28} />
        </Pressable>
      </View>

      <View style={[styles.weekdayRow, { gap }]}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={[styles.weekdayCell, { width: cellSize }]}>
            <Text style={styles.weekdayTxt}>{w}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {chunkWeeks(monthCells).map((week, wi) => (
          <View key={wi} style={[styles.weekRow, { gap }]}>
            {week.map((cell, idx) => {
              const selected = cell.ymd === selectedYMD;
              const isTodayCell = cell.ymd === todayYMD;
              const hasLog = datesWithLogs.has(cell.ymd);
              const monthNum = parseInt(cell.ymd.split('-')[1], 10);
              const label = cell.dayNum === 1 ? `${monthNum}月` : String(cell.dayNum);

              return (
                <Pressable
                  key={`${cell.ymd}-${wi}-${idx}`}
                  style={[
                    styles.cell,
                    { width: cellSize, height: cellSize },
                    !cell.inMonth && styles.cellMuted,
                    isTodayCell && !selected && styles.cellToday,
                    selected && styles.cellSelected,
                  ]}
                  onPress={() => selectCell(cell)}>
                  <Text
                    style={[
                      styles.cellTxt,
                      !cell.inMonth && styles.cellTxtMuted,
                      selected && styles.cellTxtSelected,
                    ]}>
                    {label}
                  </Text>
                  {hasLog ? <View style={styles.logDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.daySectionHead}>
        <Text style={styles.daySectionTitle}>{formatZhTWLong(selectedYMD)}</Text>
        <Text style={styles.daySectionMeta}>
          {entriesForDay.length} 筆紀錄 · 點 + 可新增這一天
        </Text>
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => null,
        }}
      />
      <View style={styles.screen}>
        <Text style={styles.hint}>點選日期查看當天吃了什麼；有紀錄的日期底下有小點標示。</Text>

        {entries.length === 0 ? (
          <ScrollView contentContainerStyle={styles.scrollEmpty} keyboardShouldPersistTaps="handled">
            {listHeader}
            <View style={styles.emptyBelow}>
              <Text style={styles.emptyTitle}>尚無任何紀錄</Text>
              <Text style={styles.emptySub}>選一天後點上方 +，開始記下吃了什麼。</Text>
              <Pressable style={styles.primaryGhost} onPress={goAddSelected}>
                <Text style={styles.primaryGhostLabel}>為選擇的日期新增</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : (
          <FlatList
            data={entriesForDay}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.dayEmpty}>
                <Text style={styles.dayEmptyTitle}>這一天還沒有紀錄</Text>
                <Text style={styles.dayEmptySub}>點上方 + 新增這天的用餐筆記。</Text>
                <Pressable style={styles.secondaryBtn} onPress={goAddSelected}>
                  <Text style={styles.secondaryBtnTxt}>新增紀錄</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => goEdit(item)} onLongPress={() => confirmDelete(item)}>
                <View style={styles.rowMain}>
                  {item.photoUri ? (
                    <Image source={{ uri: item.photoUri }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder]}>
                      <Text style={styles.thumbPlaceholderTxt}>無圖</Text>
                    </View>
                  )}
                  <View style={styles.rowBody}>
                    <Text style={styles.note} numberOfLines={4}>
                      {item.note.trim() ? item.note : '（僅照片紀錄）'}
                    </Text>
                    <Text style={styles.timeHint}>
                      {new Date(item.createdAt).toLocaleTimeString('zh-TW', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' · 點一下編輯 · 長按刪除'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: foodie.cream },
  scrollEmpty: { paddingBottom: 40 },
  hint: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    fontSize: 13,
    lineHeight: 19,
    color: foodie.muted,
    fontWeight: '600',
  },
  calBlock: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingVertical: 4,
  },
  topBarBtn: { minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  topBarAccent: { fontSize: 16, fontWeight: '800', color: foodie.orangeDeep },
  topBarCenter: { fontSize: 17, fontWeight: '900', color: foodie.ink },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  monthChevron: { padding: 8 },
  monthNavTitle: { fontSize: 18, fontWeight: '900', color: foodie.ink },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayCell: { alignItems: 'center', justifyContent: 'center' },
  weekdayTxt: { fontSize: 12, fontWeight: '700', color: foodie.muted },
  grid: { gap: 8 },
  weekRow: { flexDirection: 'row', alignItems: 'center' },
  cell: {
    borderRadius: 12,
    backgroundColor: foodie.card,
    borderWidth: 1,
    borderColor: '#E8DDD4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 6,
  },
  cellMuted: {
    backgroundColor: '#F5EDE6',
    borderColor: 'transparent',
  },
  cellToday: {
    backgroundColor: '#FFF5EC',
    borderColor: foodie.peach,
  },
  cellSelected: {
    borderWidth: 2,
    borderColor: foodie.orangeDeep,
    backgroundColor: '#FFF3E8',
  },
  cellTxt: { fontSize: 14, fontWeight: '800', color: foodie.ink },
  cellTxtMuted: { color: '#B9A899', fontWeight: '700' },
  cellTxtSelected: { color: foodie.orangeDeep },
  logDot: {
    marginTop: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: foodie.orangeDeep,
  },
  daySectionHead: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: foodie.peach,
    gap: 4,
  },
  daySectionTitle: { fontSize: 17, fontWeight: '900', color: foodie.ink },
  daySectionMeta: { fontSize: 12, fontWeight: '600', color: foodie.muted },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  row: {
    backgroundColor: foodie.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: foodie.peach,
    marginBottom: 10,
    overflow: 'hidden',
  },
  rowMain: { flexDirection: 'row', gap: 12, padding: 12 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: foodie.peach },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbPlaceholderTxt: { fontSize: 11, fontWeight: '700', color: foodie.muted },
  rowBody: { flex: 1, gap: 6 },
  note: { fontSize: 15, lineHeight: 21, color: foodie.ink, fontWeight: '600' },
  timeHint: { fontSize: 11, fontWeight: '600', color: foodie.muted },
  dayEmpty: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  dayEmptyTitle: { fontSize: 16, fontWeight: '900', color: foodie.ink },
  dayEmptySub: { fontSize: 13, color: foodie.muted, fontWeight: '600' },
  secondaryBtn: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: foodie.orangeDeep,
    backgroundColor: foodie.card,
  },
  secondaryBtnTxt: { fontSize: 15, fontWeight: '900', color: foodie.orangeDeep },
  emptyBelow: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: foodie.ink },
  emptySub: { fontSize: 14, color: foodie.muted, textAlign: 'center', lineHeight: 21 },
  primaryGhost: {
    marginTop: 4,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: foodie.orange,
    borderWidth: 2,
    borderColor: foodie.orangeDeep,
  },
  primaryGhostLabel: { fontSize: 16, fontWeight: '900', color: '#fff' },
});
