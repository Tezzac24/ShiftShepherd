/**
 * Pure unread-reducer tests — the single source of truth for the live per-team
 * unread map. Offline, deterministic, no mocks.
 */
import { ChatMessage, TeamChatUnreadEntry } from '../../../types';
import {
  applyIncomingMessage,
  clearTeamUnread,
  pruneUnread,
  sumUnread,
  unreadFromSummary,
} from '../chatUnread';

const ME = 'profile-me';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    organisation_id: 'org-1',
    team_id: 'team-a',
    sender_id: 'someone-else',
    body: 'hi',
    created_at: '2026-07-11T10:00:00.000Z',
    ...overrides,
  };
}

function entry(overrides: Partial<TeamChatUnreadEntry>): TeamChatUnreadEntry {
  return {
    team_id: 'team-a',
    unread_count: 0,
    latest_message_id: null,
    latest_message_created_at: null,
    latest_message_sender_id: null,
    last_read_message_id: null,
    last_read_at: null,
    ...overrides,
  };
}

describe('unreadFromSummary', () => {
  it('keeps positive counts and omits zero-unread teams (sparse map)', () => {
    expect(
      unreadFromSummary([
        entry({ team_id: 'team-a', unread_count: 3 }),
        entry({ team_id: 'team-b', unread_count: 0 }),
        entry({ team_id: 'team-c', unread_count: 1 }),
      ]),
    ).toEqual({ 'team-a': 3, 'team-c': 1 });
  });

  it('forces the actively-viewed team to zero', () => {
    expect(
      unreadFromSummary(
        [
          entry({ team_id: 'team-a', unread_count: 5 }),
          entry({ team_id: 'team-b', unread_count: 2 }),
        ],
        'team-a',
      ),
    ).toEqual({ 'team-b': 2 });
  });

  it('never yields a negative count', () => {
    expect(unreadFromSummary([entry({ team_id: 'team-a', unread_count: -4 })])).toEqual({});
  });
});

describe('applyIncomingMessage', () => {
  const base = { 'team-b': 2 };

  it('increments the correct team for a new foreign message', () => {
    expect(
      applyIncomingMessage(base, {
        message: message({ id: 'x', team_id: 'team-a' }),
        knownMessageIds: new Set(),
        selfProfileId: ME,
        activeTeamId: null,
      }),
    ).toEqual({ 'team-a': 1, 'team-b': 2 });
  });

  it('never increments the sender’s own message', () => {
    expect(
      applyIncomingMessage(base, {
        message: message({ id: 'x', team_id: 'team-a', sender_id: ME }),
        knownMessageIds: new Set(),
        selfProfileId: ME,
        activeTeamId: null,
      }),
    ).toBe(base);
  });

  it('counts a duplicate message event only once', () => {
    const once = applyIncomingMessage(base, {
      message: message({ id: 'dup', team_id: 'team-a' }),
      knownMessageIds: new Set(),
      selfProfileId: ME,
      activeTeamId: null,
    });
    // The same id is now "known" (already merged) → second event is a no-op.
    const twice = applyIncomingMessage(once, {
      message: message({ id: 'dup', team_id: 'team-a' }),
      knownMessageIds: new Set(['dup']),
      selfProfileId: ME,
      activeTeamId: null,
    });
    expect(once).toEqual({ 'team-a': 1, 'team-b': 2 });
    expect(twice).toBe(once);
  });

  it('does not increment a message for the actively-viewed team', () => {
    expect(
      applyIncomingMessage(base, {
        message: message({ id: 'x', team_id: 'team-a' }),
        knownMessageIds: new Set(),
        selfProfileId: ME,
        activeTeamId: 'team-a',
      }),
    ).toBe(base);
  });

  it('keeps teams independent', () => {
    const afterA = applyIncomingMessage({}, {
      message: message({ id: 'a', team_id: 'team-a' }),
      knownMessageIds: new Set(),
      selfProfileId: ME,
      activeTeamId: null,
    });
    const afterB = applyIncomingMessage(afterA, {
      message: message({ id: 'b', team_id: 'team-b' }),
      knownMessageIds: new Set(['a']),
      selfProfileId: ME,
      activeTeamId: null,
    });
    expect(afterB).toEqual({ 'team-a': 1, 'team-b': 1 });
  });
});

describe('clearTeamUnread', () => {
  it('removes the team and returns the same reference when already clear', () => {
    const prev = { 'team-a': 3, 'team-b': 1 };
    expect(clearTeamUnread(prev, 'team-a')).toEqual({ 'team-b': 1 });
    expect(clearTeamUnread(prev, 'team-z')).toBe(prev);
  });
});

describe('pruneUnread', () => {
  it('drops teams no longer accessible, keeps reference when unchanged', () => {
    const prev = { 'team-a': 2, 'team-b': 1 };
    expect(pruneUnread(prev, new Set(['team-a']))).toEqual({ 'team-a': 2 });
    expect(pruneUnread(prev, new Set(['team-a', 'team-b']))).toBe(prev);
  });
});

describe('sumUnread', () => {
  it('sums all teams or a restricted set, treating missing as zero', () => {
    const map = { 'team-a': 2, 'team-b': 3, 'team-c': 4 };
    expect(sumUnread(map)).toBe(9);
    expect(sumUnread(map, ['team-a', 'team-c', 'team-missing'])).toBe(6);
  });
});
