import type { NegotiationAgentFixture } from '@/lib/mockNegotiation/fixtureTypes';
import { foodie } from '@/theme/foodie';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AgentVisual = { id: string; label: string; emoji: string; bubble: string };

const BUBBLE_PALETTE = [
  foodie.orange,
  '#3B82F6',
  '#10B981',
  '#EAB308',
  '#A855F7',
  '#EC4899',
  '#F97316',
  '#14B8A6',
];

function fixturesToVisuals(fixtures: NegotiationAgentFixture[]): AgentVisual[] {
  return fixtures.map((f, i) => ({
    id: f.id,
    label: f.displayName,
    emoji: f.emoji,
    bubble: BUBBLE_PALETTE[i % BUBBLE_PALETTE.length]!,
  }));
}

type TimelineStep =
  | { kind: 'typing'; slot: number; ms: number }
  | { kind: 'message'; slot: number; menuText: string; blindText: string; ms: number };

const BASE_TIMELINE: TimelineStep[] = [
  { kind: 'typing', slot: 0, ms: 700 },
  {
    kind: 'message',
    slot: 0,
    menuText:
      '我看過菜單了——生食／刺身區這頁看起來最穩，蛋白質也高；我會盯緊過敏食材跟沾醬。',
    blindText:
      '先假設店里有生食主打——這條路線蛋白質通常夠；我會盯緊過敏食材跟沾醬。',
    ms: 900,
  },
  { kind: 'typing', slot: 1, ms: 650 },
  {
    kind: 'message',
    slot: 1,
    menuText:
      '我也對過菜單：這裡有拼盤／套餐類可以分食，符合我今天要的聚餐氛圍。',
    blindText:
      '我也要維持「可分食」——別一人一盅把桌面鎖死；大家一起動筷子比較像談判成功。',
    ms: 950,
  },
  { kind: 'typing', slot: 2, ms: 720 },
  {
    kind: 'message',
    slot: 2,
    menuText:
      '我看甜點飲料頁了——低碳水的人可以先把主餐鎖死，甜點我只試一小口或改炙燒少醋飯路線。',
    blindText:
      '低碳水先把主餐鎖死；甜點我願意退一步——炙燒或換配菜都行，別炸碳水地雷就好。',
    ms: 900,
  },
  { kind: 'typing', slot: 0, ms: 600 },
  {
    kind: 'message',
    slot: 0,
    menuText:
      '綜合大家剛剛對菜單的理解：主廚拼盤＋炙燒＋野菜平衡一下；白飯不行的請師傅換秋葵芥末這類配菜頂一下。',
    blindText:
      '綜合共識：高蛋白＋可共享的路線；醬料與配菜請店家協調替換，把過敏與碳水地雷拔掉。',
    ms: 1200,
  },
];

export type ChatMessage = {
  id: string;
  agentId: string;
  agentLabel: string;
  emoji: string;
  bubble: string;
  text: string;
};

export function MockNegotiationRoom({
  participants,
  hasMenu,
  replayKey,
  onTimelineComplete,
}: {
  participants: NegotiationAgentFixture[];
  hasMenu: boolean;
  replayKey: string;
  /** Demo 輪播結束時觸發一次（供公布結果按鈕解鎖） */
  onTimelineComplete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingAgentId, setTypingAgentId] = useState<string | null>(null);
  const counter = useRef(0);
  const runId = useRef(0);
  const onDoneRef = useRef(onTimelineComplete);
  onDoneRef.current = onTimelineComplete;

  const visuals = useMemo(() => fixturesToVisuals(participants), [participants]);
  const metaOf = useMemo(() => {
    const map = new Map<string, AgentVisual>();
    for (const v of visuals) map.set(v.id, v);
    return (id: string) => map.get(id)!;
  }, [visuals]);

  const n = Math.max(participants.length, 1);

  useEffect(() => {
    const firstId = participants[0]?.id ?? 'placeholder';
    runId.current += 1;
    const id = runId.current;
    let cancelled = false;
    setMessages([]);
    counter.current = 0;
    setTypingAgentId(firstId);

    const resolveSpeakerId = (slot: number) => participants[slot % n]!.id;

    const pushMsg = (m: ChatMessage) => {
      setMessages((prev) => [...prev, m]);
    };

    const play = async () => {
      for (const step of BASE_TIMELINE) {
        if (cancelled || runId.current !== id) return;
        await new Promise((r) => setTimeout(r, step.ms));
        if (cancelled || runId.current !== id) return;

        const speakerId = resolveSpeakerId(step.slot);
        const meta = metaOf(speakerId);

        if (step.kind === 'typing') {
          setTypingAgentId(speakerId);
        } else {
          const text = hasMenu ? step.menuText : step.blindText;
          counter.current += 1;
          pushMsg({
            id: `m-${counter.current}`,
            agentId: speakerId,
            agentLabel: meta.label,
            emoji: meta.emoji,
            bubble: meta.bubble,
            text,
          });
          setTypingAgentId(null);
        }
      }
      setTypingAgentId(null);
      if (!cancelled && runId.current === id) {
        onDoneRef.current?.();
      }
    };

    play();
    return () => {
      cancelled = true;
    };
  }, [replayKey, hasMenu, participants, n, metaOf]);

  const typingVisual =
    typingAgentId && visuals.length ? metaOf(typingAgentId) : visuals[0] ?? null;

  const rosterHint =
    participants.length > 0
      ? `${participants.map((p) => p.displayName.replace(/^代理人 · /, '')).join('、')}`
      : '';

  const typingBottom = 100 + insets.bottom;

  return (
    <View style={styles.screen}>
      <View style={styles.roomHeader}>
        <Text style={styles.roomTitle}>討論室</Text>
        <Text style={styles.roomCaption}>
          {hasMenu ? '已對照菜單 · ' : '尚無菜單 · '}
          {rosterHint ? `${rosterHint}` : ''}
        </Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.msgRow}>
            <View style={[styles.avatar, { backgroundColor: item.bubble }]}>
              <Text style={styles.avatarEmoji}>{item.emoji}</Text>
            </View>
            <View style={styles.msgBody}>
              <Text style={styles.msgAgent}>{item.agentLabel}</Text>
              <View style={styles.bubble}>
                <Text style={styles.msgText}>{item.text}</Text>
              </View>
            </View>
          </View>
        )}
      />

      {typingVisual && typingAgentId ? (
        <View style={[styles.typingOverlay, { bottom: typingBottom }]}>
          <TypingBubble agent={typingVisual} />
        </View>
      ) : null}
    </View>
  );
}

function TypingBubble({ agent }: { agent: AgentVisual }) {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d % 3) + 1), 420);
    return () => clearInterval(t);
  }, []);
  const typingText = '.'.repeat(dots);

  return (
    <View style={styles.msgRow}>
      <View style={[styles.avatar, { backgroundColor: agent.bubble }]}>
        <Text style={styles.avatarEmoji}>{agent.emoji}</Text>
      </View>
      <View style={styles.msgBody}>
        <Text style={styles.msgAgent}>{agent.label}</Text>
        <View style={styles.bubble}>
          <Text style={styles.typingLabel}>打字中{typingText}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: foodie.cream },
  roomHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: foodie.peach,
  },
  roomTitle: { fontSize: 20, fontWeight: '900', color: foodie.ink },
  roomCaption: { marginTop: 6, fontSize: 13, fontWeight: '600', color: foodie.muted },
  listContent: { padding: 16, paddingBottom: 120 },
  msgRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 14 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 20 },
  msgBody: { flex: 1, gap: 4 },
  msgAgent: { fontSize: 12, fontWeight: '800', color: foodie.muted },
  bubble: {
    backgroundColor: foodie.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: foodie.peach,
  },
  msgText: { fontSize: 15, lineHeight: 22, color: foodie.ink },
  typingLabel: { fontSize: 14, fontWeight: '700', color: foodie.muted },
  typingOverlay: { position: 'absolute', left: 16, right: 16 },
});
