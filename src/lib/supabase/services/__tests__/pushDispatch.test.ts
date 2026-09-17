/**
 * Pure dispatch rules of the send-chat-message-push Edge Function
 * (Announcement Push Delivery V1 + the unchanged chat contract).
 *
 * The module under test has no Deno globals, network, or Supabase client, so
 * it is imported straight from supabase/functions and exercised offline.
 * These tests pin request parsing, recipient resolution (readership,
 * self-exclusion, removed/unlinked/cross-organisation exclusion, team
 * membership, dedupe), preference suppression through the existing keys,
 * token grouping, idempotent ledger-claim shapes, and the generic content.
 */
import {
  buildDeliveryAttempts,
  buildExpoMessages,
  chunk,
  disabledRecipientIds,
  EVENT_MAX_AGE_MS,
  EXPO_PUSH_CHUNK_SIZE,
  groupTokensByUser,
  isFreshEvent,
  LOOKUP_CHUNK_SIZE,
  notificationContentFor,
  parsePushRequest,
  preferenceKeyFor,
  scrubTokens,
  selectAnnouncementRecipientIds,
  selectChatRecipientIds,
  type RecipientProfileRow,
} from '../../../../../supabase/functions/send-chat-message-push/dispatch';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const AUTHOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANNOUNCEMENT = '3f2f1a9c-aaaa-4bbb-8ccc-1234567890ab';
const MESSAGE = '4f2f1a9c-aaaa-4bbb-8ccc-1234567890ab';
const TEAM = '5f2f1a9c-aaaa-4bbb-8ccc-1234567890ab';

function profile(
  id: string,
  overrides: Partial<RecipientProfileRow> = {},
): RecipientProfileRow {
  return {
    id,
    organisation_id: ORG,
    auth_user_id: `auth-${id}`,
    access_status: 'active',
    ...overrides,
  };
}

describe('parsePushRequest', () => {
  it('accepts the unchanged chat contract', () => {
    expect(parsePushRequest({ messageId: MESSAGE })).toEqual({
      request: { kind: 'chat_message', id: MESSAGE },
    });
  });

  it('accepts an announcement id', () => {
    expect(parsePushRequest({ announcementId: ANNOUNCEMENT })).toEqual({
      request: { kind: 'announcement', id: ANNOUNCEMENT },
    });
  });

  it('refuses both, neither, malformed ids, and non-object bodies', () => {
    expect(parsePushRequest({ messageId: MESSAGE, announcementId: ANNOUNCEMENT })).toEqual({
      error: 'Provide exactly one of messageId or announcementId',
    });
    expect(parsePushRequest({})).toEqual({
      error: 'Provide exactly one of messageId or announcementId',
    });
    expect(parsePushRequest({ messageId: 'msg-3' })).toEqual({
      error: 'messageId must be a UUID',
    });
    expect(parsePushRequest({ announcementId: 'ann-3' })).toEqual({
      error: 'announcementId must be a UUID',
    });
    expect(parsePushRequest({ announcementId: 42 })).toEqual({
      error: 'announcementId must be a UUID',
    });
    expect(parsePushRequest(null)).toEqual({ error: 'Invalid JSON body' });
    expect(parsePushRequest('x')).toEqual({ error: 'Invalid JSON body' });
    expect(parsePushRequest([ANNOUNCEMENT])).toEqual({ error: 'Invalid JSON body' });
  });
});

describe('isFreshEvent', () => {
  const now = Date.parse('2026-09-17T10:00:00.000Z');

  it('accepts events inside the five-minute window and refuses older or unparseable ones', () => {
    expect(EVENT_MAX_AGE_MS).toBe(5 * 60 * 1000);
    expect(isFreshEvent('2026-09-17T09:55:00.000Z', now)).toBe(true);
    expect(isFreshEvent('2026-09-17T10:00:00.000Z', now)).toBe(true);
    expect(isFreshEvent('2026-09-17T09:54:59.999Z', now)).toBe(false);
    expect(isFreshEvent('not a date', now)).toBe(false);
  });
});

describe('preferenceKeyFor', () => {
  it('maps each kind onto the existing notification_preferences column', () => {
    expect(preferenceKeyFor({ kind: 'chat_message' })).toBe('chat_notifications');
    expect(preferenceKeyFor({ kind: 'announcement', teamId: null })).toBe(
      'announcement_notifications',
    );
    expect(preferenceKeyFor({ kind: 'announcement', teamId: TEAM })).toBe(
      'team_announcement_notifications',
    );
  });
});

describe('selectChatRecipientIds', () => {
  it('keeps the other members once each and never the sender', () => {
    expect(
      selectChatRecipientIds({ senderId: AUTHOR, memberIds: ['b', AUTHOR, 'c', 'b'] }),
    ).toEqual(['b', 'c']);
  });
});

describe('selectAnnouncementRecipientIds', () => {
  it('church-wide: every active linked profile of the organisation except the author, once', () => {
    const recipients = selectAnnouncementRecipientIds({
      organisationId: ORG,
      authorId: AUTHOR,
      memberIds: null,
      profiles: [
        profile(AUTHOR),
        profile('member-1'),
        profile('member-1'),
        profile('member-2'),
        profile('removed', { access_status: 'removed' }),
        profile('unlinked', { auth_user_id: null }),
        profile('blank-link', { auth_user_id: '' }),
        profile('other-org', { organisation_id: OTHER_ORG }),
      ],
    });
    expect(recipients).toEqual(['member-1', 'member-2']);
  });

  it('team: only active linked same-organisation team members, never the author', () => {
    const recipients = selectAnnouncementRecipientIds({
      organisationId: ORG,
      authorId: AUTHOR,
      memberIds: ['member-1', 'removed', 'other-org', AUTHOR, 'member-1'],
      profiles: [
        profile(AUTHOR),
        profile('member-1'),
        profile('member-2'), // active in the organisation but not on the team
        profile('removed', { access_status: 'removed' }),
        profile('other-org', { organisation_id: OTHER_ORG }),
      ],
    });
    expect(recipients).toEqual(['member-1']);
  });

  it('returns nothing when the only reader is the author', () => {
    expect(
      selectAnnouncementRecipientIds({
        organisationId: ORG,
        authorId: AUTHOR,
        memberIds: [AUTHOR],
        profiles: [profile(AUTHOR)],
      }),
    ).toEqual([]);
  });
});

describe('disabledRecipientIds', () => {
  it('suppresses only an explicit false for the requested key', () => {
    const disabled = disabledRecipientIds(
      [
        { user_id: 'off', announcement_notifications: false },
        { user_id: 'on', announcement_notifications: true },
        { user_id: 'null', announcement_notifications: null },
        { user_id: 'other-key-off', team_announcement_notifications: false },
      ],
      'announcement_notifications',
    );
    expect([...disabled]).toEqual(['off']);
  });

  it('treats a missing row as the all-on default', () => {
    expect(disabledRecipientIds([], 'team_announcement_notifications').size).toBe(0);
  });
});

describe('groupTokensByUser', () => {
  it('collects every registered token per recipient', () => {
    const grouped = groupTokensByUser([
      { id: 't1', user_id: 'a', token: 'ExponentPushToken[1]' },
      { id: 't2', user_id: 'a', token: 'ExponentPushToken[2]' },
      { id: 't3', user_id: 'b', token: 'ExponentPushToken[3]' },
    ]);
    expect(grouped.get('a')).toEqual([
      { id: 't1', token: 'ExponentPushToken[1]' },
      { id: 't2', token: 'ExponentPushToken[2]' },
    ]);
    expect(grouped.get('b')).toEqual([{ id: 't3', token: 'ExponentPushToken[3]' }]);
    expect(grouped.has('c')).toBe(false);
  });
});

describe('buildDeliveryAttempts', () => {
  it('claims one skip per suppressed or token-less recipient and one pending row per token', () => {
    const attempts = buildDeliveryAttempts({
      eventType: 'announcement',
      eventId: ANNOUNCEMENT,
      recipientIds: ['off', 'no-token', 'two-devices'],
      disabled: new Set(['off']),
      tokensByUser: new Map([
        ['off', [{ id: 'ignored', token: 'ExponentPushToken[x]' }]],
        [
          'two-devices',
          [
            { id: 't1', token: 'ExponentPushToken[1]' },
            { id: 't2', token: 'ExponentPushToken[2]' },
          ],
        ],
      ]),
    });
    expect(attempts).toEqual([
      {
        event_type: 'announcement',
        event_id: ANNOUNCEMENT,
        recipient_user_id: 'off',
        push_token_id: null,
        status: 'skipped',
        error_code: 'preference_disabled',
      },
      {
        event_type: 'announcement',
        event_id: ANNOUNCEMENT,
        recipient_user_id: 'no-token',
        push_token_id: null,
        status: 'skipped',
        error_code: 'no_push_token',
      },
      {
        event_type: 'announcement',
        event_id: ANNOUNCEMENT,
        recipient_user_id: 'two-devices',
        push_token_id: 't1',
        status: 'pending',
        error_code: null,
      },
      {
        event_type: 'announcement',
        event_id: ANNOUNCEMENT,
        recipient_user_id: 'two-devices',
        push_token_id: 't2',
        status: 'pending',
        error_code: null,
      },
    ]);
    // Never a raw token in a ledger row.
    expect(JSON.stringify(attempts)).not.toContain('ExponentPushToken');
  });

  it('keeps the chat event type for chat claims', () => {
    const [attempt] = buildDeliveryAttempts({
      eventType: 'chat_message',
      eventId: MESSAGE,
      recipientIds: ['a'],
      disabled: new Set(),
      tokensByUser: new Map([['a', [{ id: 't1', token: 'ExponentPushToken[1]' }]]]),
    });
    expect(attempt).toMatchObject({ event_type: 'chat_message', event_id: MESSAGE, status: 'pending' });
  });
});

describe('notificationContentFor', () => {
  it('keeps the chat payload byte-for-byte', () => {
    expect(
      notificationContentFor({ kind: 'chat_message', messageId: MESSAGE, teamId: TEAM, teamName: 'Choir' }),
    ).toEqual({
      title: 'New team message',
      body: 'You have a new message in Choir.',
      data: { type: 'chat_message', teamId: TEAM, messageId: MESSAGE },
    });
    expect(
      notificationContentFor({ kind: 'chat_message', messageId: MESSAGE, teamId: TEAM, teamName: null }).body,
    ).toBe('You have a new message in your team.');
  });

  it('describes a team announcement generically with route-safe ids', () => {
    expect(
      notificationContentFor({
        kind: 'announcement',
        announcementId: ANNOUNCEMENT,
        teamId: TEAM,
        teamName: 'Choir',
        organisationName: 'QA Organisation Alpha',
      }),
    ).toEqual({
      title: 'New team announcement',
      body: 'A new announcement was posted in Choir.',
      data: { type: 'announcement', announcementId: ANNOUNCEMENT, teamId: TEAM },
    });
  });

  it('describes a church-wide announcement generically without a team id', () => {
    const content = notificationContentFor({
      kind: 'announcement',
      announcementId: ANNOUNCEMENT,
      teamId: null,
      teamName: null,
      organisationName: 'QA Organisation Alpha',
    });
    expect(content).toEqual({
      title: 'New church announcement',
      body: 'A new announcement was posted for QA Organisation Alpha.',
      data: { type: 'announcement', announcementId: ANNOUNCEMENT },
    });
    expect(
      notificationContentFor({
        kind: 'announcement',
        announcementId: ANNOUNCEMENT,
        teamId: null,
        teamName: null,
        organisationName: null,
      }).body,
    ).toBe('A new announcement was posted for your church.');
  });

  it('never carries announcement text, author, or image fields', () => {
    const content = notificationContentFor({
      kind: 'announcement',
      announcementId: ANNOUNCEMENT,
      teamId: null,
      teamName: null,
      organisationName: 'Org',
    });
    expect(Object.keys(content).sort()).toEqual(['body', 'data', 'title']);
    expect(Object.keys(content.data).sort()).toEqual(['announcementId', 'type']);
  });
});

describe('buildExpoMessages', () => {
  it('sends the same generic content to every token with the default sound and channel', () => {
    const content = { title: 'T', body: 'B', data: { type: 'announcement', announcementId: ANNOUNCEMENT } };
    expect(buildExpoMessages(['ExponentPushToken[1]', 'ExponentPushToken[2]'], content)).toEqual([
      { to: 'ExponentPushToken[1]', title: 'T', body: 'B', data: content.data, sound: 'default', channelId: 'default' },
      { to: 'ExponentPushToken[2]', title: 'T', body: 'B', data: content.data, sound: 'default', channelId: 'default' },
    ]);
  });
});

describe('scrubTokens and chunk', () => {
  it('redacts Expo tokens from any text', () => {
    expect(scrubTokens('bad ExponentPushToken[abc] and ExpoPushToken[def]')).toBe(
      'bad ExponentPushToken[redacted] and ExponentPushToken[redacted]',
    );
  });

  it('bounds Expo batches and PostgREST in() lookups', () => {
    expect(EXPO_PUSH_CHUNK_SIZE).toBe(100);
    expect(LOOKUP_CHUNK_SIZE).toBe(100);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
  });
});
