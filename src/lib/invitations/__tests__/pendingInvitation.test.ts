import * as SecureStore from 'expo-secure-store';

import {
  clearPendingInvitation,
  isInvitationToken,
  loadPendingInvitation,
  savePendingInvitation,
} from '../pendingInvitation';

const KEY = 'shift-shepherd/pending-invitation-v1';
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

  it('round-trips and deliberately clears the pending token', async () => {
    await savePendingInvitation(TOKEN);
    await expect(loadPendingInvitation()).resolves.toBe(TOKEN);
    await clearPendingInvitation();
    await expect(loadPendingInvitation()).resolves.toBeNull();
  });

  it('expires persisted state after seven days instead of retaining it indefinitely', async () => {
    await SecureStore.setItemAsync(
      KEY,
      JSON.stringify({ token: TOKEN, savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }),
    );
    await expect(loadPendingInvitation()).resolves.toBeNull();
  });

  it('never accepts malformed persisted data', async () => {
    await SecureStore.setItemAsync(KEY, JSON.stringify({ token: 'bad', savedAt: Date.now() }));
    await expect(loadPendingInvitation()).resolves.toBeNull();
  });
});
