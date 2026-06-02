import {
  buildAgentSystemContext,
  effectiveSystemPromptSnippet,
} from '@/lib/agentContext';
import {
  loadAgentPromptOverrides,
  patchAgentPromptOverrides,
} from '@/lib/agentPromptOverrides';
import { loadMealLogs } from '@/lib/mealLogStorage';
import { loadTasteProfile } from '@/lib/storage';
import { foodie } from '@/theme/foodie';
import type { AgentPromptOverrides } from '@/types/agentPromptOverrides';
import type { MealLogEntry } from '@/types/mealLog';
import type { TasteProfile } from '@/types/tasteProfile';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type EditBlockProps = {
  title: string;
  subtitle?: string;
  hint: string;
  placeholder: string;
  value: string;
  clearLabel: string;
  onSave: (draft: string) => Promise<void>;
  onClearOverride: () => Promise<void>;
};

function EditBlock({
  title,
  subtitle,
  hint,
  placeholder,
  value,
  clearLabel,
  onSave,
  onClearOverride,
}: EditBlockProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const submit = async () => {
    await onSave(draft);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const clear = async () => {
    await onClearOverride();
    setEditing(false);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}

      {editing ? (
        <>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={foodie.muted}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.editActions}>
            <Pressable style={styles.primaryBtn} onPress={submit}>
              <Text style={styles.primaryBtnTxt}>儲存</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={cancel}>
              <Text style={styles.ghostBtnTxt}>取消</Text>
            </Pressable>
            <Pressable style={styles.warnBtn} onPress={clear}>
              <Text style={styles.warnBtnTxt}>{clearLabel}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={value.trim() ? styles.prompt : styles.hint}>{value.trim() ? value : hint}</Text>
          <Pressable style={styles.outlineBtn} onPress={() => setEditing(true)}>
            <Text style={styles.outlineBtnLabel}>編輯</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [logs, setLogs] = useState<MealLogEntry[]>([]);
  const [overrides, setOverrides] = useState<AgentPromptOverrides | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        loadTasteProfile(),
        loadMealLogs(),
        loadAgentPromptOverrides(),
      ]).then(([p, l, o]) => {
        setProfile(p);
        setLogs(l);
        setOverrides(o);
      });
    }, []),
  );

  const mergedPreview =
    overrides != null ? buildAgentSystemContext(profile, logs, overrides) : '';

  const quizSnippet = profile?.systemPromptSnippet?.trim() ?? '';
  const effectiveSnippet =
    overrides != null ? effectiveSystemPromptSnippet(profile, overrides) : '';

  const tasteStory = overrides?.tasteStoryManual?.trim() ?? '';

  const mergedIsManual = Boolean(overrides?.mergedContextManual?.trim());
  const snippetIsManual = Boolean(overrides?.systemPromptSnippetManual?.trim());

  const persistPatch = async (patch: Partial<AgentPromptOverrides>) => {
    const next = await patchAgentPromptOverrides(patch);
    setOverrides(next);
  };

  if (!overrides) {
    return (
      <ScrollView style={styles.scroll}>
        <View style={styles.inner}>
          <Text style={styles.hint}>載入中…</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>我的 AI 代理人</Text>
          <Text style={styles.sub}>
            下方三段皆可自行編輯並存在這台裝置；談判／未來接模型時會優先採用你存的版本。
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>用餐手記 · 代理人參考</Text>
          <Text style={styles.hint}>
            目前已有 {logs.length} 則依日期紀錄（文字／照片）。若「合併預覽」為自動組合，會附上這些紀錄摘要。
          </Text>
          <Pressable style={styles.outlineBtn} onPress={() => router.push('/journal')}>
            <Text style={styles.outlineBtnLabel}>前往紀錄分頁</Text>
          </Pressable>
        </View>

        <EditBlock
          title="品味檔案｜自訂補充"
          subtitle="會插在問卷摘錄前面，一併進入「自動合併」（除非你改用全文手動合併）。"
          hint="還沒寫補充。可以寫給代理人看的口味細節、忌口故事、常去的區域⋯⋯"
          placeholder="例：超愛酸辣、不吃香菜；週五下班都想吃熱炒配啤酒。"
          value={tasteStory}
          clearLabel="清除補充"
          onSave={async (draft) => {
            const t = draft.trim();
            await persistPatch({ tasteStoryManual: t.length ? t : null });
          }}
          onClearOverride={async () => persistPatch({ tasteStoryManual: null })}
        />

        <EditBlock
          title="系統提示摘錄（Taste Profile）"
          subtitle={
            profile
              ? snippetIsManual
                ? '目前為「自訂全文」，覆蓋問卷產生的摘錄。'
                : '目前為問卷產生；你可改成任意文字取代。'
              : '尚未完成問卷時仍可先寫摘錄；完成問卷後會與問卷內容並存供你切換。'
          }
          hint={
            profile
              ? `問卷原文仍保留在 App 裡，可按「還原問卷摘錄」套用。\n（問卷摘錄預覽）\n${quizSnippet || '— 無 —'}`
              : '完成首頁測驗後會自動填問卷版摘錄；現在可先自行輸入。'
          }
          placeholder="貼上或改寫你想給模型看的偏好摘要⋯⋯"
          value={effectiveSnippet}
          clearLabel="還原問卷摘錄"
          onSave={async (draft) => {
            const t = draft.trim();
            await persistPatch({ systemPromptSnippetManual: t.length ? t : null });
          }}
          onClearOverride={async () => persistPatch({ systemPromptSnippetManual: null })}
        />

        <EditBlock
          title="合併預覽（餵給模型用）"
          subtitle={
            mergedIsManual
              ? '目前為「手動全文」：不會再自動串紀錄／問卷。清空後恢復自動組合。'
              : '自動組合：自訂品味補充 → 系統摘錄 → 用餐紀錄摘要。'
          }
          hint={
            mergedPreview.trim()
              ? '(編輯時會載入目前畫面上的全文)'
              : '尚無可預覽內容；完成問卷、補上摘錄或紀錄後會自動產生。仍可直接手動輸入全文。'
          }
          placeholder="若要完全掌控上下文，可直接在此撰寫整份 system 補充⋯⋯"
          value={mergedPreview}
          clearLabel="改回自動合併"
          onSave={async (draft) => {
            const t = draft.trim();
            await persistPatch({ mergedContextManual: t.length ? t : null });
          }}
          onClearOverride={async () => persistPatch({ mergedContextManual: null })}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: foodie.cream },
  inner: { padding: 16, gap: 16, paddingBottom: 40 },
  header: { gap: 8 },
  title: { fontSize: 26, fontWeight: '900', color: foodie.ink },
  sub: { fontSize: 14, color: foodie.muted, lineHeight: 21 },
  card: {
    backgroundColor: foodie.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: foodie.peach,
    gap: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: '900', color: foodie.ink },
  cardSubtitle: { fontSize: 12, fontWeight: '600', color: foodie.muted, lineHeight: 18 },
  prompt: { fontSize: 13, lineHeight: 20, color: foodie.ink },
  hint: { fontSize: 14, color: foodie.muted, lineHeight: 21 },
  input: {
    minHeight: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: foodie.peach,
    padding: 12,
    fontSize: 14,
    lineHeight: 21,
    color: foodie.ink,
    fontWeight: '600',
    backgroundColor: foodie.cream,
  },
  editActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  primaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: foodie.orangeDeep,
  },
  primaryBtnTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
  ghostBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: foodie.peach,
    backgroundColor: foodie.card,
  },
  ghostBtnTxt: { fontSize: 14, fontWeight: '800', color: foodie.ink },
  warnBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DC2626',
    backgroundColor: foodie.card,
  },
  warnBtnTxt: { fontSize: 13, fontWeight: '800', color: '#DC2626' },
  outlineBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: foodie.peach,
    backgroundColor: foodie.card,
  },
  outlineBtnLabel: { fontSize: 14, fontWeight: '700', color: foodie.ink },
});
