import {
  addDaysYMD,
  formatZhTWLong,
  isValidYMD,
  toYMD,
} from '@/lib/dateOnly';
import { confirmAsync, showAlertMessage } from '@/lib/confirmDialog';
import { appendMealLog, loadMealLogs, removeMealLog, updateMealLog } from '@/lib/mealLogStorage';
import { persistPickedImage } from '@/lib/mealLogPhoto';
import { foodie } from '@/theme/foodie';
import type { MealLogEntry } from '@/types/mealLog';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, ChevronLeft, ChevronRight, ImagePlus } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

function newEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function paramString(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

export default function MealLogAddScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string | string[]; id?: string | string[] }>();
  const editId = paramString(params.id);

  const [ymd, setYmd] = useState(() => toYMD(new Date()));
  const [note, setNote] = useState('');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [originalPhotoUri, setOriginalPhotoUri] = useState<string | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(!!editId);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  /** 編輯模式：載入時的原紀錄日期／備註；切換日期時顯示該日其他紀錄備註，無則空白（placeholder） */
  const baselineDateRef = useRef<string | null>(null);
  const baselineNoteRef = useRef('');
  const noteByDayFetchGen = useRef(0);

  useEffect(() => {
    if (editId) return;
    const dRaw = paramString(params.date);
    const d = dRaw && isValidYMD(dRaw) ? dRaw : toYMD(new Date());
    setYmd(d);
    setNote('');
    setPreviewUri(null);
    setOriginalPhotoUri(null);
    setCreatedAt(null);
    baselineDateRef.current = null;
    baselineNoteRef.current = '';
    setLoadingEntry(false);
  }, [editId, params.date]);

  useEffect(() => {
    if (!editId) {
      setLoadingEntry(false);
      return;
    }
    let cancelled = false;
    setLoadingEntry(true);
    (async () => {
      const all = await loadMealLogs();
      const found = all.find((e) => e.id === editId);
      if (cancelled) return;
      if (!found) {
        showAlertMessage('找不到紀錄', '這則紀錄可能已被刪除。', () => router.back());
        return;
      }
      baselineDateRef.current = found.date;
      baselineNoteRef.current = found.note;
      setYmd(found.date);
      setNote(found.note);
      setPreviewUri(found.photoUri);
      setOriginalPhotoUri(found.photoUri);
      setCreatedAt(found.createdAt);
      setLoadingEntry(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, router]);

  useEffect(() => {
    if (!editId || loadingEntry || baselineDateRef.current === null) return;

    const gen = ++noteByDayFetchGen.current;

    if (ymd === baselineDateRef.current) {
      setNote(baselineNoteRef.current);
      return;
    }

    (async () => {
      const all = await loadMealLogs();
      if (gen !== noteByDayFetchGen.current) return;
      const others = all
        .filter((e) => e.date === ymd && e.id !== editId)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      const lines = others.map((e) => e.note.trim()).filter(Boolean);
      setNote(lines.join('\n'));
    })();
  }, [ymd, editId, loadingEntry]);

  const label = formatZhTWLong(ymd);

  const shiftDay = useCallback((delta: number) => {
    setYmd((d) => addDaysYMD(d, delta));
  }, []);

  const pickLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlertMessage('需要相簿權限', '請在系統設定中開啟相簿存取，才能選擇餐點照片。');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      setPreviewUri(res.assets[0].uri);
    }
  };

  const pickCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlertMessage('需要相機權限', '請允許使用相機以現場拍照紀錄餐點。');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled && res.assets[0]?.uri) {
      setPreviewUri(res.assets[0].uri);
    }
  };

  const save = async () => {
    const trimmed = note.trim();
    if (!trimmed && !previewUri) {
      showAlertMessage('再填一下', '請至少輸入文字備註，或加上一張照片。');
      return;
    }
    setSubmitting(true);
    try {
      if (editId) {
        if (!createdAt) {
          setSubmitting(false);
          return;
        }
        let photoUri: string | null = null;
        if (previewUri) {
          if (previewUri === originalPhotoUri) {
            photoUri = previewUri;
          } else {
            photoUri = await persistPickedImage(previewUri, editId);
          }
        }
        const entry: MealLogEntry = {
          id: editId,
          date: ymd,
          note: trimmed,
          photoUri,
          createdAt,
        };
        await updateMealLog(entry);
      } else {
        const id = newEntryId();
        let photoUri: string | null = null;
        if (previewUri) {
          photoUri = await persistPickedImage(previewUri, id);
        }
        const entry: MealLogEntry = {
          id,
          date: ymd,
          note: trimmed,
          photoUri,
          createdAt: new Date().toISOString(),
        };
        await appendMealLog(entry);
      }
      router.back();
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = () => {
    if (!editId) return;
    void (async () => {
      const ok = await confirmAsync({
        title: '刪除紀錄',
        message: '確定要刪除這則用餐紀錄嗎？此動作無法復原。',
        cancelText: '取消',
        confirmText: '刪除',
        destructive: true,
      });
      if (!ok) return;
      await removeMealLog(editId);
      router.back();
    })();
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingHorizontal: 8 }}>
              <Text style={styles.headerLink}>取消</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={save} disabled={submitting || loadingEntry} hitSlop={12} style={{ paddingHorizontal: 8 }}>
              <Text style={[styles.headerLinkBold, (submitting || loadingEntry) && { opacity: 0.5 }]}>儲存</Text>
            </Pressable>
          ),
          title: editId ? '編輯紀錄' : '新增紀錄',
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {loadingEntry ? (
            <Text style={styles.loadingTxt}>載入紀錄中…</Text>
          ) : null}

          <Text style={styles.sectionLabel}>紀錄日期</Text>
          <View style={styles.dateBar}>
            <Pressable
              style={[styles.dateChevron, loadingEntry && styles.dateChevronDisabled]}
              onPress={() => shiftDay(-1)}
              disabled={loadingEntry}
              hitSlop={10}>
              <ChevronLeft color={foodie.ink} size={26} />
            </Pressable>
            <View style={styles.dateCenter}>
              <Text style={styles.dateZh}>{label}</Text>
              <Pressable onPress={() => !loadingEntry && setYmd(toYMD(new Date()))} disabled={loadingEntry}>
                <Text style={[styles.todayLink, loadingEntry && { opacity: 0.4 }]}>設為今天</Text>
              </Pressable>
            </View>
            <Pressable
              style={[styles.dateChevron, loadingEntry && styles.dateChevronDisabled]}
              onPress={() => shiftDay(1)}
              disabled={loadingEntry}
              hitSlop={10}>
              <ChevronRight color={foodie.ink} size={26} />
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>吃了什麼 · 心情 · 預算（選填文字）</Text>
          <TextInput
            style={[styles.input, loadingEntry && styles.inputDisabled]}
            multiline
            editable={!loadingEntry}
            placeholder="例：巷口咖哩飯加蛋，80 元，跟朋友聊工作聊太久。"
            placeholderTextColor={foodie.muted}
            value={note}
            onChangeText={setNote}
            textAlignVertical="top"
          />

          <Text style={styles.sectionLabel}>照片（選填）</Text>
          <View style={styles.photoActions}>
            <Pressable style={styles.photoBtn} onPress={pickLibrary} disabled={loadingEntry}>
              <ImagePlus color={foodie.orangeDeep} size={22} />
              <Text style={styles.photoBtnLabel}>相簿</Text>
            </Pressable>
            <Pressable style={styles.photoBtn} onPress={pickCamera} disabled={loadingEntry}>
              <Camera color={foodie.orangeDeep} size={22} />
              <Text style={styles.photoBtnLabel}>拍照</Text>
            </Pressable>
            {previewUri ? (
              <Pressable style={styles.clearPhoto} onPress={() => setPreviewUri(null)} disabled={loadingEntry}>
                <Text style={styles.clearPhotoTxt}>移除照片</Text>
              </Pressable>
            ) : null}
          </View>

          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" />
          ) : (
            <Text style={styles.photoHint}>沒照片也沒關係，文字就很棒了。</Text>
          )}

          {editId && !loadingEntry ? (
            <Pressable style={styles.deleteBtn} onPress={confirmDelete} disabled={submitting}>
              <Text style={styles.deleteBtnTxt}>刪除此紀錄</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: foodie.cream },
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  loadingTxt: { fontSize: 14, fontWeight: '700', color: foodie.muted, textAlign: 'center', paddingVertical: 8 },
  headerLink: { fontSize: 17, color: foodie.muted, fontWeight: '600' },
  headerLinkBold: { fontSize: 17, color: foodie.orangeDeep, fontWeight: '800' },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: foodie.muted, marginTop: 4 },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: foodie.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: foodie.peach,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  dateChevron: { padding: 8 },
  dateChevronDisabled: { opacity: 0.35 },
  dateCenter: { flex: 1, alignItems: 'center', gap: 6 },
  dateZh: { fontSize: 17, fontWeight: '900', color: foodie.ink },
  todayLink: { fontSize: 13, fontWeight: '700', color: foodie.orangeDeep },
  input: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: foodie.peach,
    backgroundColor: foodie.card,
    padding: 14,
    fontSize: 16,
    lineHeight: 23,
    color: foodie.ink,
    fontWeight: '600',
  },
  inputDisabled: { opacity: 0.6 },
  photoActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: foodie.peach,
    backgroundColor: foodie.card,
  },
  photoBtnLabel: { fontSize: 15, fontWeight: '800', color: foodie.ink },
  clearPhoto: { paddingVertical: 10 },
  clearPhotoTxt: { fontSize: 14, fontWeight: '700', color: foodie.muted },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    backgroundColor: foodie.peach,
    marginTop: 4,
  },
  photoHint: { fontSize: 13, color: foodie.muted, fontWeight: '600' },
  deleteBtn: {
    marginTop: 20,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#DC2626',
    backgroundColor: foodie.card,
  },
  deleteBtnTxt: { fontSize: 16, fontWeight: '900', color: '#DC2626' },
});
