import * as SecureStore from 'expo-secure-store';

import {
  clearPendingInvitation,
  isInvitationToken,
  loadPendingInvitation,
  PENDING_INVITATION_STORAGE_KEY as KEY,
  savePendingInvitation,
} from '../pendingInvitation';

const TOKEN = 'A'.repeat(43);

beforeEach(async () => {
  await SecureStore.deleteItemAsync(KEY);
});

describe('pending invitation secret storage', () => {
  it('accepts only bounded URL-safe bearer tokens', () => {
    expect(isInvitationToken(TOKEN)).toBe(true);
    expect(isInvitationToken('short')).toBe(false);
    expect(isInvitationToken(`${TOKEN}?logged=true`)).toBe(false);
  });

  // A "/" here made every native read, write and delete throw
  // "Invalid key provided to SecureStore", which aborted sign-out.
  it('uses a key SecureStore accepts', () => {
    expect(KEY).toMatch(/^[\w.-]+$/);
    expect(KEY.length).toBeGreaterThan(0);
  });

  it('reads, writes and deletes through the one same key', async () => {
    await savePendingInvitation(TOKEN);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(KEY, expect.any(String), expect.anything());

    await loadPendingInvitation();
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(KEY);

    await clearPendingInvitation();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEY);
  });

  it('never stores the raw token as the key', async () => {
    await savePendingInvitation(TOKEN);
    for (const call of (SecureStore.setItemAsync as jest.Mock).mock.calls) {
      expect(call[0]).not.toContain(TOKEN);
    }
  });

  it('round-trips and deliberately clears the pending token', async () => {
    await savePendingInvitation(TOKEN);
    await expect(loadPendingInvitation()).resolves.toBe(TOKEN);
    await clearPendingInvitation();
    await expect(loadPendingInvitation()).resolves.toBeNull();
  });

  it('clears harmlessly when nothing is stored', async () => {
    await expect(clearPendingInvitation()).resolves.toBeUndefined();
    await expect(clearPendingInvitation()).resolves.toBeUndefined();
  });

  it('expires persisted state after seven days instead of retaining it indefinitely', async () => {
    await SecureStore.setItemAsync(
      KEY,
      JSON.stringify({ token: TOKEN, savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }),
    );
    await expect(loadPendingInvitation()).resolves.toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEY);
  });

  it('never accepts malformed persisted data', async () => {
    await SecureStore.setItemAsync(KEY, JSON.stringify({ token: 'bad', savedAt: Date.now() }));
    await expect(loadPendingInvitation()).resolves.toBeNull();
  });
});
