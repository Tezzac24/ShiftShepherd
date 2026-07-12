import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Storage key for the pending invitation.
 *
 * SecureStore rejects any key that is empty or contains a character outside
 * `[A-Za-z0-9._-]`, so this must never grow a `/` or `:` separator. The raw
 * invitation token is always the stored *value* — never part of the key — and
 * the same constant backs the native read, write, and delete as well as the
 * web sessionStorage entry.
 */
export const PENDING_INVITATION_STORAGE_KEY = 'shift_shepherd.pending_invitation.v1';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,200}$/;

interface PendingInvitationEnvelope {
  token: string;
  savedAt: number;
}
let memoryValue: string | null = null;

function isEnvelope(value: unknown): value is PendingInvitationEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PendingInvitationEnvelope>;
  return (
    typeof candidate.token === 'string' &&
    TOKEN_PATTERN.test(candidate.token) &&
    typeof candidate.savedAt === 'number' &&
    Number.isFinite(candidate.savedAt)
  );
}

export function isInvitationToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

function webStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof globalThis.sessionStorage === 'undefined') return null;
  return globalThis.sessionStorage;
}

async function readRaw(): Promise<string | null> {
  const storage = webStorage();
  if (storage) return storage.getItem(PENDING_INVITATION_STORAGE_KEY);
  if (Platform.OS === 'web') return memoryValue;
  if (await SecureStore.isAvailableAsync()) {
    return SecureStore.getItemAsync(PENDING_INVITATION_STORAGE_KEY);
  }
  return memoryValue;
}

async function writeRaw(value: string): Promise<void> {
  const storage = webStorage();
  if (storage) {
    storage.setItem(PENDING_INVITATION_STORAGE_KEY, value);
    return;
  }
  if (Platform.OS !== 'web' && (await SecureStore.isAvailableAsync())) {
    await SecureStore.setItemAsync(PENDING_INVITATION_STORAGE_KEY, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return;
  }
  memoryValue = value;
}

/** Deleting an entry that was never written is a successful no-op on both platforms. */
async function removeRaw(): Promise<void> {
  memoryValue = null;
  const storage = webStorage();
  if (storage) {
    storage.removeItem(PENDING_INVITATION_STORAGE_KEY);
    return;
  }
  if (Platform.OS !== 'web' && (await SecureStore.isAvailableAsync())) {
    await SecureStore.deleteItemAsync(PENDING_INVITATION_STORAGE_KEY);
  }
}

export async function loadPendingInvitation(): Promise<string | null> {
  try {
    const raw = await readRaw();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isEnvelope(parsed) || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      await removeRaw();
      return null;
    }
    return parsed.token;
  } catch {
    await removeRaw().catch(() => undefined);
    return null;
  }
}

export async function savePendingInvitation(token: string): Promise<void> {
  if (!isInvitationToken(token)) throw new Error('This invitation link is not valid.');
  const envelope: PendingInvitationEnvelope = { token, savedAt: Date.now() };
  await writeRaw(JSON.stringify(envelope));
}

export async function clearPendingInvitation(): Promise<void> {
  await removeRaw();
}
