import { buildNegotiationVerdictPlans } from '@/features/war-room/buildNegotiationVerdictPlans';
import { useNegotiationRoom } from '@/features/war-room/NegotiationRoomContext';
import { MockNegotiationRoom } from '@/features/war-room/MockNegotiationRoom';
import { buildAgentSystemContext } from '@/lib/agentContext';
import { confirmAsync, showAlertMessage } from '@/lib/confirmDialog';
import {
  MOCK_NEGOTIATION_AGENTS,
  resolveParticipantFixtures,
} from '@/lib/mockNegotiation/mockNegotiationAgents';
import { foodie } from '@/theme/foodie';
import type { NegotiationWizardStep } from '@/types/negotiationWizard';
import type { VerdictPlan } from '@/types/negotiationVerdict';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useFocusEffect } from '@react-navigation/native';
import {
  ArrowRight,
  Camera,
  ChevronLeft,
  Copy,
  DoorOpen,
  ImagePlus,
  MessageCircle,
  QrCode,
  Trophy,
  Users,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

function stepTitle(step: NegotiationWizardStep): string {
  switch (step) {
    case 'gathering':
      return '入場 · 所有人到齊';
    case 'menu_upload':
      return '上傳菜單';
    case 'deliberation':
      return '討論室';
    case 'verdict':
      return '裁定 · 三方案';
    default:
      return '';
  }
}

function stepIndex(step: NegotiationWizardStep): number {
  const order: NegotiationWizardStep[] = ['gathering', 'menu_upload', 'deliberation', 'verdict'];
  return order.indexOf(step) + 1;
}

export function NegotiationRoomScreen() {
  const {
    role,
    roomCode,
    menuImageUri,
    wizardStep,
    participantAgentIds,
    toggleParticipantAgent,
    startHostRoom,
    joinRoom,
    leaveRoom,
    syncRoomSession,
    updateHostMenuUri,
    goWizardStep,
  } = useNegotiationRoom();

  const [joinInput, setJoinInput] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [deliberationDone, setDeliberationDone] = useState(false);
  const [deliberationNonce, setDeliberationNonce] = useState(0);

  useFocusEffect(
    useCallback(() => {
      void syncRoomSession();
    }, [syncRoomSession]),
  );

  useEffect(() => {
    if (wizardStep === 'deliberation') {
      setDeliberationDone(false);
    }
  }, [wizardStep, deliberationNonce]);

  const participantFixtures = useMemo(
    () => resolveParticipantFixtures(participantAgentIds),
    [participantAgentIds],
  );

  const verdictPlans = useMemo<VerdictPlan[]>(
    () => buildNegotiationVerdictPlans(participantFixtures),
    [participantFixtures],
  );

  const mergedAgentContext = useMemo(() => {
    return participantFixtures
      .map((f) => `【${f.displayName}】\n${buildAgentSystemContext(f.profile, f.logs, null)}`)
      .join('\n\n────────\n\n');
  }, [participantFixtures]);

  const joinUrl = useMemo(() => {
    if (!roomCode) return '';
    return Linking.createURL('/room', { queryParams: { join: roomCode } });
  }, [roomCode]);

  const rosterEditable =
    role === 'lobby' || (role === 'host' && wizardStep === 'gathering');

  const replayKey = useMemo(
    () =>
      `${participantAgentIds.join('|')}-${menuImageUri ? 'menu' : 'nomenu'}-${deliberationNonce}`,
    [participantAgentIds, menuImageUri, deliberationNonce],
  );

  const copyJoinLink = async () => {
    if (!joinUrl) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(joinUrl);
        showAlertMessage('已複製', '邀請連結已複製到剪貼簿。');
        return;
      }
      await Share.share({ message: joinUrl, title: '加入 Chow-It 談判室' });
    } catch {
      showAlertMessage('連結', joinUrl);
    }
  };

  const onJoinSubmit = async () => {
    const ok = await joinRoom(joinInput);
    if (!ok) {
      showAlertMessage(
        '無法加入',
        '房號不存在或尚未在同裝置開房。請先用「建立房間」開場；跨裝置需後端同步。',
      );
    }
  };

  const pickMenuPhoto = async () => {
    if (role !== 'host') return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlertMessage('需要相簿權限', '請允許讀取相片以上傳菜單圖。');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      await updateHostMenuUri(res.assets[0].uri);
    }
  };

  const confirmLeave = () => {
    void (async () => {
      const ok = await confirmAsync({
        title: role === 'host' ? '結束房間？' : '離開房間？',
        message:
          role === 'host'
            ? '會清除本機房間資料與流程進度（Demo）。'
            : '你可以稍後再用房號加入。',
        confirmText: '離開',
        destructive: true,
      });
      if (!ok) return;
      await leaveRoom();
    })();
  };

  const hostNextFromGathering = () => void goWizardStep('menu_upload');

  const hostNextFromMenu = () => {
    if (!menuImageUri) {
      showAlertMessage('先上傳菜單', '請先為這場談判上傳菜單照片，代理人才能對照討論。');
      return;
    }
    void goWizardStep('deliberation');
  };

  const hostPublishVerdict = () => void goWizardStep('verdict');

  const hostBackToDeliberation = () => {
    setDeliberationNonce((n) => n + 1);
    void goWizardStep('deliberation');
  };

  const contextModal = (
    <Modal visible={contextOpen} transparent animationType="fade" onRequestClose={() => setContextOpen(false)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setContextOpen(false)}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>代理人上下文 · {participantFixtures.length} 位</Text>
          <ScrollView style={styles.modalScroll}>
            <Text style={styles.modalBody} selectable>
              {mergedAgentContext}
            </Text>
          </ScrollView>
          <Pressable style={styles.modalClose} onPress={() => setContextOpen(false)}>
            <Text style={styles.modalCloseTxt}>關閉</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const renderParticipantChip = (compact: boolean) =>
    MOCK_NEGOTIATION_AGENTS.map((a) => {
      const on = participantAgentIds.includes(a.id);
      const ChipStyles = compact ? styles.chipSm : styles.chip;
      const TxtStyles = compact ? styles.chipTxtSm : styles.chipTxt;
      return (
        <Pressable
          key={a.id}
          style={[ChipStyles, on && styles.chipOn, !rosterEditable && styles.chipLocked]}
          onPress={() => rosterEditable && toggleParticipantAgent(a.id)}
          disabled={!rosterEditable}>
          <Text style={styles.chipEmoji}>{a.emoji}</Text>
          <Text style={[TxtStyles, on && styles.chipTxtOn]} numberOfLines={compact ? 1 : 2}>
            {compact ? a.id : a.displayName.replace(/^代理人 · /, '')}
          </Text>
        </Pressable>
      );
    });

  const progressStrip =
    role !== 'lobby' ? (
      <View style={styles.progressStrip}>
        <Text style={styles.progressTxt}>
          流程 {stepIndex(wizardStep)} / 4 · {stepTitle(wizardStep)}
        </Text>
        <Pressable onPress={() => void syncRoomSession()} hitSlop={10}>
          <Text style={styles.progressSync}>同步</Text>
        </Pressable>
      </View>
    ) : null;

  const topActions = (
    <View style={styles.topBar}>
      <Pressable style={styles.topIconBtn} onPress={() => setContextOpen(true)}>
        <Text style={styles.topIconBtnTxt}>上下文</Text>
      </Pressable>
      <Pressable style={styles.topDangerBtn} onPress={confirmLeave}>
        <Text style={styles.topDangerBtnTxt}>離開</Text>
      </Pressable>
    </View>
  );

  const lobby = (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.lobbyScroll} keyboardShouldPersistTaps="handled">
        {topActions}
        <Text style={styles.lobbyTitle}>談判室</Text>
        <Text style={styles.lobbyHint}>
          流程會拆成：<Text style={styles.strong}>組隊 → 入場／房號 → 上傳菜單 → 討論室 → 三方案裁定</Text>
          ，避免全擠在同一頁。
          {'\n\n'}
          先勾選這場要派出哪些代理人；建立房間後所有人（代理人）算進房，再上傳菜單，最後才進討論。
        </Text>

        <Text style={styles.sectionLabel}>加入談判的代理人（{participantAgentIds.length} 位）</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {renderParticipantChip(false)}
        </ScrollView>

        <Pressable style={styles.primaryBtn} onPress={() => void startHostRoom()}>
          <Users color="#fff" size={22} />
          <Text style={styles.primaryBtnTxt}>建立房間</Text>
        </Pressable>

        <View style={styles.joinRow}>
          <TextInput
            style={styles.joinInput}
            placeholder="同房 · 輸入房號"
            placeholderTextColor={foodie.muted}
            autoCapitalize="characters"
            value={joinInput}
            onChangeText={setJoinInput}
          />
          <Pressable style={styles.secondaryBtn} onPress={() => void onJoinSubmit()}>
            <DoorOpen color={foodie.orangeDeep} size={22} />
            <Text style={styles.secondaryBtnTxt}>加入</Text>
          </Pressable>
        </View>

        <Pressable style={styles.ghostBtn} onPress={() => setContextOpen(true)}>
          <Text style={styles.ghostBtnTxt}>預覽代理人上下文</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const gathering = (
    <ScrollView contentContainerStyle={styles.stepScroll} keyboardShouldPersistTaps="handled">
      {progressStrip}
      {topActions}
      <Text style={styles.stepHead}>房間已建立</Text>
      <Text style={styles.roleHint}>
        {role === 'host' ? '你是發起人 · 可調整入場名單並分享房號' : '同房 · 名單由發起人維護'}
      </Text>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>房號</Text>
        <Text style={styles.codeHuge}>{roomCode}</Text>
      </View>

      <View style={styles.qrBlock}>
        <View style={styles.qrTitleRow}>
          <QrCode color={foodie.muted} size={18} />
          <Text style={styles.qrCaption}>邀請連結 QR</Text>
        </View>
        <View style={styles.qrWrap}>
          {joinUrl ? (
            <QRCode value={joinUrl} size={160} backgroundColor="#fff" color={foodie.ink} />
          ) : null}
        </View>
        <Pressable style={styles.shareChip} onPress={() => void copyJoinLink()}>
          <Copy color={foodie.ink} size={18} />
          <Text style={styles.shareChipTxt}>複製邀請連結</Text>
        </Pressable>
        <Text style={styles.urlMini} numberOfLines={3}>
          {joinUrl}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>本場代理人</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {renderParticipantChip(false)}
      </ScrollView>

      {role === 'host' ? (
        <Pressable style={styles.primaryBtn} onPress={hostNextFromGathering}>
          <ArrowRight color="#fff" size={22} />
          <Text style={styles.primaryBtnTxt}>下一步 · 上傳菜單</Text>
        </Pressable>
      ) : (
        <View style={styles.waitBanner}>
          <Text style={styles.waitBannerTxt}>等待發起人帶大家進「上傳菜單」（可點「同步」）</Text>
        </View>
      )}
    </ScrollView>
  );

  const menuUpload = (
    <ScrollView contentContainerStyle={styles.stepScroll}>
      {progressStrip}
      {topActions}
      <Text style={styles.stepHead}>上傳菜單</Text>
      <Text style={styles.stepSub}>
        代理人會在下一步對照菜單文字討論（Demo）；接上模型後可做圖像辨識。
      </Text>

      {role === 'host' ? (
        <Pressable style={styles.menuHeroBtn} onPress={() => void pickMenuPhoto()}>
          <ImagePlus color={foodie.orangeDeep} size={28} />
          <Text style={styles.menuHeroTxt}>{menuImageUri ? '更換菜單照片' : '從相簿選擇菜單照片'}</Text>
        </Pressable>
      ) : (
        <View style={styles.waitBanner}>
          <Text style={styles.waitBannerTxt}>由發起人上傳菜單</Text>
        </View>
      )}

      {menuImageUri ? (
        <View style={styles.menuPreview}>
          <Image source={{ uri: menuImageUri }} style={styles.menuPreviewImg} resizeMode="cover" />
        </View>
      ) : (
        <View style={styles.menuPlaceholder}>
          <Camera color={foodie.muted} size={36} />
          <Text style={styles.menuPlaceholderTxt}>尚未選擇照片</Text>
        </View>
      )}

      {role === 'host' ? (
        <Pressable
          style={[styles.primaryBtn, !menuImageUri && styles.primaryBtnDisabled]}
          onPress={hostNextFromMenu}
          disabled={!menuImageUri}>
          <MessageCircle color="#fff" size={22} />
          <Text style={styles.primaryBtnTxt}>進入討論室</Text>
        </Pressable>
      ) : (
        <View style={styles.waitBanner}>
          <Text style={styles.waitBannerTxt}>等待發起人開討論室</Text>
        </View>
      )}

      {role === 'host' ? (
        <Pressable style={styles.backLink} onPress={() => void goWizardStep('gathering')}>
          <ChevronLeft color={foodie.muted} size={18} />
          <Text style={styles.backLinkTxt}>返回入場</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );

  const deliberation = (
    <View style={styles.flex}>
      {progressStrip}
      <View style={styles.deliberationTop}>{topActions}</View>
      <View style={styles.chatFlex}>
        <MockNegotiationRoom
          participants={participantFixtures}
          hasMenu={!!menuImageUri}
          replayKey={replayKey}
          onTimelineComplete={() => setDeliberationDone(true)}
        />
      </View>
      <View style={styles.deliberationFooter}>
        {role === 'host' ? (
          <>
            <Pressable onPress={() => setDeliberationDone(true)}>
              <Text style={styles.skipAnimTxt}>略過動畫 · 直接裁定</Text>
            </Pressable>
            <Pressable
              style={[styles.verdictCta, !deliberationDone && styles.verdictCtaMuted]}
              onPress={hostPublishVerdict}
              disabled={!deliberationDone}>
              <Trophy color="#fff" size={22} />
              <Text style={styles.verdictCtaTxt}>公布裁定 · 三方案</Text>
            </Pressable>
            <Pressable style={styles.backLinkRow} onPress={() => void goWizardStep('menu_upload')}>
              <ChevronLeft color={foodie.muted} size={18} />
              <Text style={styles.backLinkTxt}>返回上傳菜單</Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.waitBannerFlat}>
            <Text style={styles.waitBannerTxt}>動畫結束後由發起人公布裁定（可請對方按「略過動畫」）</Text>
          </View>
        )}
      </View>
    </View>
  );

  const verdict = (
    <ScrollView contentContainerStyle={styles.verdictScroll}>
      {progressStrip}
      {topActions}
      <Text style={styles.stepHead}>裁定結果</Text>
      <Text style={styles.stepSub}>
        以下依代理人數（{participantFixtures.length}）與各代理人偏好，試算份量、飲料杯數、酒精、辣度折衷與飯碗數——共三種方案。
      </Text>

      {verdictPlans.map((plan) => (
        <View key={plan.key} style={styles.planCard}>
          <Text style={styles.planTitle}>{plan.title}</Text>
          <Text style={styles.planTag}>{plan.tagline}</Text>
          {plan.lines.map((line, li) => (
            <View key={`${plan.key}-${li}-${line.label}`} style={styles.planRow}>
              <Text style={styles.planLabel}>{line.label}</Text>
              <Text style={styles.planValue}>{line.value}</Text>
            </View>
          ))}
        </View>
      ))}

      {role === 'host' ? (
        <View style={styles.verdictActions}>
          <Pressable style={styles.secondaryWide} onPress={hostBackToDeliberation}>
            <Text style={styles.secondaryWideTxt}>返回討論室</Text>
          </Pressable>
          <Pressable style={styles.ghostWide} onPress={() => void goWizardStep('menu_upload')}>
            <Text style={styles.ghostWideTxt}>回到上傳菜單</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );

  const inRoomBody = () => {
    switch (wizardStep) {
      case 'gathering':
        return gathering;
      case 'menu_upload':
        return menuUpload;
      case 'deliberation':
        return deliberation;
      case 'verdict':
        return verdict;
      default:
        return gathering;
    }
  };

  return (
    <View style={styles.flex}>
      {role === 'lobby' ? lobby : <View style={styles.flex}>{inRoomBody()}</View>}
      {contextModal}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lobbyScroll: { padding: 16, paddingBottom: 48, gap: 12 },
  lobbyTitle: { fontSize: 26, fontWeight: '900', color: foodie.ink },
  lobbyHint: { fontSize: 13, fontWeight: '600', color: foodie.muted, lineHeight: 20 },
  strong: { fontWeight: '900', color: foodie.ink },
  sectionLabel: { fontSize: 14, fontWeight: '900', color: foodie.ink, marginTop: 6 },
  chipRow: { gap: 10, paddingVertical: 4 },
  chip: {
    maxWidth: 160,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: foodie.card,
    borderWidth: 2,
    borderColor: foodie.peach,
    gap: 4,
  },
  chipSm: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: foodie.card,
    borderWidth: 2,
    borderColor: foodie.peach,
    alignItems: 'center',
    minWidth: 56,
  },
  chipOn: { borderColor: foodie.orangeDeep, backgroundColor: '#FFF3E8' },
  chipLocked: { opacity: 0.72 },
  chipEmoji: { fontSize: 18 },
  chipTxt: { fontSize: 11, fontWeight: '800', color: foodie.ink },
  chipTxtSm: { fontSize: 11, fontWeight: '800', color: foodie.muted },
  chipTxtOn: { color: foodie.orangeDeep },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: foodie.orangeDeep,
    marginTop: 12,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnTxt: { fontSize: 17, fontWeight: '900', color: '#fff' },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 8 },
  joinInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: foodie.peach,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '800',
    color: foodie.ink,
    backgroundColor: foodie.card,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: foodie.orangeDeep,
    backgroundColor: foodie.card,
  },
  secondaryBtnTxt: { fontSize: 15, fontWeight: '900', color: foodie.orangeDeep },
  ghostBtn: { paddingVertical: 12, alignItems: 'center' },
  ghostBtnTxt: { fontSize: 14, fontWeight: '800', color: foodie.orangeDeep },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginBottom: 8,
  },
  topIconBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: foodie.card,
    borderWidth: 1,
    borderColor: foodie.peach,
  },
  topIconBtnTxt: { fontSize: 13, fontWeight: '800', color: foodie.ink },
  topDangerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  topDangerBtnTxt: { fontSize: 13, fontWeight: '900', color: '#B91C1C' },
  progressStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  progressTxt: { fontSize: 13, fontWeight: '900', color: foodie.orangeDeep },
  progressSync: { fontSize: 13, fontWeight: '800', color: foodie.muted, textDecorationLine: 'underline' },
  stepScroll: { padding: 16, paddingBottom: 48, gap: 10 },
  verdictScroll: { padding: 16, paddingBottom: 56, gap: 12 },
  stepHead: { fontSize: 22, fontWeight: '900', color: foodie.ink },
  stepSub: { fontSize: 13, fontWeight: '600', color: foodie.muted, lineHeight: 20 },
  roleHint: { fontSize: 13, fontWeight: '700', color: foodie.muted },
  codeCard: {
    marginTop: 8,
    padding: 18,
    borderRadius: 16,
    backgroundColor: foodie.card,
    borderWidth: 2,
    borderColor: foodie.peach,
    alignItems: 'center',
    gap: 6,
  },
  codeLabel: { fontSize: 13, fontWeight: '800', color: foodie.muted },
  codeHuge: { fontSize: 34, fontWeight: '900', color: foodie.ink, letterSpacing: 4 },
  qrBlock: { gap: 10, marginTop: 8 },
  qrTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qrCaption: { fontSize: 13, fontWeight: '800', color: foodie.muted },
  qrWrap: { alignItems: 'center', paddingVertical: 10, backgroundColor: '#fff', borderRadius: 14 },
  shareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: foodie.card,
    borderWidth: 1,
    borderColor: foodie.peach,
  },
  shareChipTxt: { fontSize: 14, fontWeight: '800', color: foodie.ink },
  urlMini: { fontSize: 10, color: foodie.muted, fontWeight: '600' },
  waitBanner: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FFF3E8',
    borderWidth: 1,
    borderColor: foodie.peach,
    marginTop: 8,
  },
  waitBannerFlat: { paddingVertical: 10 },
  waitBannerTxt: { fontSize: 13, fontWeight: '700', color: foodie.muted, textAlign: 'center' },
  menuHeroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 22,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: foodie.orangeDeep,
    backgroundColor: foodie.card,
    marginTop: 10,
  },
  menuHeroTxt: { fontSize: 17, fontWeight: '900', color: foodie.ink },
  menuPreview: { marginTop: 14, borderRadius: 16, overflow: 'hidden' },
  menuPreviewImg: { width: '100%', height: 220, backgroundColor: foodie.peach },
  menuPlaceholder: {
    marginTop: 14,
    height: 180,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: foodie.peach,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  menuPlaceholderTxt: { fontSize: 14, fontWeight: '700', color: foodie.muted },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  backLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  backLinkTxt: { fontSize: 14, fontWeight: '800', color: foodie.muted },
  deliberationTop: { paddingHorizontal: 16, paddingTop: 4 },
  chatFlex: { flex: 1 },
  deliberationFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: foodie.peach,
    backgroundColor: foodie.cream,
  },
  skipAnimTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: foodie.orangeDeep,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  verdictCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: foodie.orangeDeep,
  },
  verdictCtaMuted: { opacity: 0.45 },
  verdictCtaTxt: { fontSize: 17, fontWeight: '900', color: '#fff' },
  planCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: foodie.card,
    borderWidth: 2,
    borderColor: foodie.peach,
    gap: 10,
    marginTop: 6,
  },
  planTitle: { fontSize: 17, fontWeight: '900', color: foodie.ink },
  planTag: { fontSize: 13, fontWeight: '700', color: foodie.orangeDeep },
  planRow: { gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: foodie.peach },
  planLabel: { fontSize: 12, fontWeight: '900', color: foodie.muted },
  planValue: { fontSize: 14, fontWeight: '700', color: foodie.ink, lineHeight: 21 },
  verdictActions: { gap: 10, marginTop: 16 },
  secondaryWide: {
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: foodie.orangeDeep,
    backgroundColor: foodie.card,
    alignItems: 'center',
  },
  secondaryWideTxt: { fontSize: 16, fontWeight: '900', color: foodie.orangeDeep },
  ghostWide: { paddingVertical: 12, alignItems: 'center' },
  ghostWideTxt: { fontSize: 14, fontWeight: '800', color: foodie.muted },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000077',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    maxHeight: '80%',
    backgroundColor: foodie.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 2,
    borderColor: foodie.peach,
  },
  modalTitle: { fontSize: 17, fontWeight: '900', color: foodie.ink, marginBottom: 10 },
  modalScroll: { maxHeight: 420 },
  modalBody: { fontSize: 13, fontWeight: '600', color: foodie.ink, lineHeight: 21 },
  modalClose: {
    marginTop: 14,
    alignSelf: 'flex-end',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: foodie.orangeDeep,
  },
  modalCloseTxt: { fontSize: 15, fontWeight: '900', color: '#fff' },
});
