import {
  clearRoomSession,
  normalizeRoomCode,
  readRoomSession,
  writeRoomSession,
  type NegotiationRoomSession,
} from '@/lib/negotiationRoomSession';
import { MOCK_NEGOTIATION_AGENTS } from '@/lib/mockNegotiation/mockNegotiationAgents';
import type { NegotiationWizardStep } from '@/types/negotiationWizard';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

function randomRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return s;
}

const DEFAULT_PARTICIPANTS = MOCK_NEGOTIATION_AGENTS.slice(0, 3).map((a) => a.id);

function sanitizeParticipantIds(ids: string[] | undefined): string[] | undefined {
  if (!ids?.length) return undefined;
  const known = new Set(MOCK_NEGOTIATION_AGENTS.map((a) => a.id));
  const filtered = ids.filter((id) => known.has(id));
  return filtered.length ? filtered : undefined;
}

export type NegotiationRoomRole = 'lobby' | 'host' | 'guest';

type Ctx = {
  role: NegotiationRoomRole;
  roomCode: string | null;
  menuImageUri: string | null;
  wizardStep: NegotiationWizardStep;
  participantAgentIds: string[];
  toggleParticipantAgent: (id: string) => void;
  /** 發起人開房 */
  startHostRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  /** 同房／發起人從 storage 同步菜單、名單、進度 */
  syncRoomSession: () => Promise<void>;
  updateHostMenuUri: (uri: string | null) => Promise<void>;
  /** 發起人推進流程（寫入 session） */
  goWizardStep: (step: NegotiationWizardStep) => Promise<void>;
};

const NegotiationRoomContext = createContext<Ctx | null>(null);

export function NegotiationRoomProvider({
  children,
  initialJoinCode,
}: {
  children: ReactNode;
  initialJoinCode?: string;
}) {
  const [role, setRole] = useState<NegotiationRoomRole>('lobby');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [menuImageUri, setMenuImageUri] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<NegotiationWizardStep>('gathering');
  const [participantAgentIds, setParticipantAgentIds] = useState<string[]>(DEFAULT_PARTICIPANTS);
  const triedJoinRef = useRef(false);

  const participantRef = useRef(participantAgentIds);
  const menuRef = useRef(menuImageUri);
  const wizardRef = useRef(wizardStep);
  participantRef.current = participantAgentIds;
  menuRef.current = menuImageUri;
  wizardRef.current = wizardStep;

  const applySession = useCallback((s: NegotiationRoomSession) => {
    setRoomCode(s.code);
    setMenuImageUri(s.menuImageUri);
    setWizardStep(s.wizardStep ?? 'gathering');
    const ids = sanitizeParticipantIds(s.participantAgentIds);
    if (ids) setParticipantAgentIds(ids);
  }, []);

  const persistHostSession = useCallback(
    async (
      patch: Partial<
        Pick<NegotiationRoomSession, 'menuImageUri' | 'participantAgentIds' | 'wizardStep'>
      >,
    ) => {
      const code = roomCode;
      if (!code || role !== 'host') return;
      const session: NegotiationRoomSession = {
        code,
        menuImageUri:
          patch.menuImageUri !== undefined ? patch.menuImageUri : menuRef.current ?? null,
        participantAgentIds:
          patch.participantAgentIds !== undefined ? patch.participantAgentIds : participantRef.current,
        wizardStep: patch.wizardStep !== undefined ? patch.wizardStep : wizardRef.current,
        updatedAt: Date.now(),
      };
      await writeRoomSession(session);
    },
    [role, roomCode],
  );

  const goWizardStep = useCallback(
    async (step: NegotiationWizardStep) => {
      if (role !== 'host' || !roomCode) return;
      setWizardStep(step);
      wizardRef.current = step;
      await persistHostSession({ wizardStep: step });
    },
    [role, roomCode, persistHostSession],
  );

  const startHostRoom = useCallback(async () => {
    const code = randomRoomCode();
    const ids = participantRef.current;
    const session: NegotiationRoomSession = {
      code,
      menuImageUri: null,
      participantAgentIds: ids,
      wizardStep: 'gathering',
      updatedAt: Date.now(),
    };
    await writeRoomSession(session);
    applySession(session);
    setRole('host');
  }, [applySession]);

  const joinRoom = useCallback(
    async (raw: string) => {
      const code = normalizeRoomCode(raw);
      if (code.length < 4) return false;
      const stored = await readRoomSession();
      if (!stored || stored.code !== code) return false;
      applySession(stored);
      setRole('guest');
      return true;
    },
    [applySession],
  );

  const leaveRoom = useCallback(async () => {
    if (role === 'host') {
      await clearRoomSession();
    }
    setRole('lobby');
    setRoomCode(null);
    setMenuImageUri(null);
    setWizardStep('gathering');
    setParticipantAgentIds(DEFAULT_PARTICIPANTS);
  }, [role]);

  const syncRoomSession = useCallback(async () => {
    if (role === 'lobby' || !roomCode) return;
    const stored = await readRoomSession();
    if (!stored || stored.code !== roomCode) return;
    setMenuImageUri(stored.menuImageUri);
    setWizardStep(stored.wizardStep ?? 'gathering');
    const ids = sanitizeParticipantIds(stored.participantAgentIds);
    if (ids) setParticipantAgentIds(ids);
  }, [role, roomCode]);

  const updateHostMenuUri = useCallback(
    async (uri: string | null) => {
      if (!roomCode || role !== 'host') return;
      setMenuImageUri(uri);
      menuRef.current = uri;
      await persistHostSession({ menuImageUri: uri });
    },
    [roomCode, role, persistHostSession],
  );

  const toggleParticipantAgent = useCallback(
    (id: string) => {
      setParticipantAgentIds((prev) => {
        let next: string[];
        if (prev.includes(id)) {
          if (prev.length <= 1) return prev;
          next = prev.filter((x) => x !== id);
        } else {
          next = [...prev, id];
        }
        participantRef.current = next;
        if (role === 'host' && roomCode) {
          void persistHostSession({ participantAgentIds: next });
        }
        return next;
      });
    },
    [role, roomCode, persistHostSession],
  );

  useEffect(() => {
    if (!initialJoinCode || triedJoinRef.current) return;
    triedJoinRef.current = true;
    void joinRoom(initialJoinCode);
  }, [initialJoinCode, joinRoom]);

  const value = useMemo(
    () =>
      ({
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
      }) satisfies Ctx,
    [
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
    ],
  );

  return <NegotiationRoomContext.Provider value={value}>{children}</NegotiationRoomContext.Provider>;
}

export function useNegotiationRoom(): Ctx {
  const x = useContext(NegotiationRoomContext);
  if (!x) throw new Error('useNegotiationRoom must be inside NegotiationRoomProvider');
  return x;
}
