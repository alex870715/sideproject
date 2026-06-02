import AsyncStorage from '@react-native-async-storage/async-storage';

import type { NegotiationWizardStep } from '@/types/negotiationWizard';

const KEY = '@chowit/negotiation_room_session_v1';

const WIZARD_STEPS = ['gathering', 'menu_upload', 'deliberation', 'verdict'] as const;

function parseWizardStep(raw: unknown): NegotiationWizardStep | undefined {
  if (typeof raw !== 'string') return undefined;
  return (WIZARD_STEPS as readonly string[]).includes(raw) ? (raw as NegotiationWizardStep) : undefined;
}

/** 本機 Demo：發起人寫入、同房用房號讀取（同步於同一台裝置）。 */
export type NegotiationRoomSession = {
  code: string;
  menuImageUri: string | null;
  /** 這場談判有哪些代理人加入（fixture id） */
  participantAgentIds?: string[];
  /** 進度（發起人推進） */
  wizardStep?: NegotiationWizardStep;
  updatedAt: number;
};

export async function readRoomSession(): Promise<NegotiationRoomSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NegotiationRoomSession;
    if (!parsed?.code || typeof parsed.code !== 'string') return null;
    const participantAgentIds = Array.isArray(parsed.participantAgentIds)
      ? parsed.participantAgentIds.filter((x): x is string => typeof x === 'string')
      : undefined;
    return {
      code: parsed.code.toUpperCase(),
      menuImageUri: typeof parsed.menuImageUri === 'string' ? parsed.menuImageUri : null,
      participantAgentIds,
      wizardStep: parseWizardStep(parsed.wizardStep),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export async function writeRoomSession(session: NegotiationRoomSession): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(session));
}

export async function clearRoomSession(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}
