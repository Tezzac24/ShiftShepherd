/**
 * Pure dispatch rules of the send-chat-message-push Edge Function
 * (Rota Push Delivery V1 + the unchanged announcement and chat contracts).
 *
 * The module under test has no Deno globals, network, or Supabase client, so
 * it is imported straight from supabase/functions and exercised offline.
 * These tests pin request parsing, recipient resolution (readership,
 * self-exclusion, removed/unlinked/cross-organisation exclusion, team
 * membership, dedupe), rota event selection (freshness, added vs changed,
 * coalescing), preference suppression through the existing keys, token
 * grouping, idempotent ledger-claim shapes, and the generic content.
 */
import {
  buildDeliveryAttempts,
  buildEventDeliveryAttempts,
  buildExpoMessages,
  chunk,
  disabledRecipientIds,
  EVENT_MAX_AGE_MS,
  EXPO_PUSH_CHUNK_SIZE,
  groupPendingClaimsByToken,
  groupTokensByUser,
  isFreshEvent,
  LOOKUP_CHUNK_SIZE,
  MAX_ROTA_ENTRIES_PER_REQUEST,
  notificationContentFor,
  parsePushRequest,
  preferenceKeyFor,
  scrubTokens,
  selectAnnouncementRecipientIds,
  selectChatRecipientIds,
  selectRotaEvents,
  uniqueRecipientIds,
  type ClaimedDelivery,
  type RecipientProfileRow,
  type RotaAssignmentRow,
  type RotaEntryRow,
} from '../../../../../supabase/functions/send-chat-message-push/dispatch';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const AUTHOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANNOUNCEMENT = '3f2f1a9c-aaaa-4bbb-8ccc-1234567890ab';
const MESSAGE = '4f2f1a9c-aaaa-4bbb-8ccc-1234567890ab';
const TEAM = '5f2f1a9c-aaaa-4bbb-8ccc-1234567890ab';
const OTHER_TEAM = '6f2f1a9c-aaaa-4bbb-8ccc-1234567890ab';
const ACTOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ENTRY_1 = '7f2f1a9c-aaaa-4bbb-8ccc-1234567890ab';
const ENTRY_2 = '8f2f1a9c-aaaa-4bbb-8ccc-1234567890ab';
const CHANGE_1 = '9f2f1a9c-aaaa-4bbb-8ccc-1234567890ab';

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
      error: 'Provide exactly one of messageId, announcementId, or rotaEntryIds',
    });
    expect(parsePushRequest({})).toEqual({
      error: 'Provide exactly one of messageId, announcementId, or rotaEntryIds',
    });
    expect(parsePushRequest({ messageId: MESSAGE, rotaEntryIds: [ENTRY_1] })).toEqual({
      error: 'Provide exactly one of messageId, announcementId, or rotaEntryIds',
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

  it('accepts one to fifty rota entry ids, deduplicated case-insensitively', () => {
    expect(
      parsePushRequest({ rotaEntryIds: [ENTRY_1, ENTRY_2, ENTRY_1.toUpperCase()] }),
    ).toEqual({ request: { kind: 'rota', ids: [ENTRY_1, ENTRY_2] } });
    expect(MAX_ROTA_ENTRIES_PER_REQUEST).toBe(50);
    const fifty = Array.from(
      { length: 50 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    expect(parsePushRequest({ rotaEntryIds: fifty })).toEqual({
      request: { kind: 'rota', ids: fifty },
    });
  });

  it('refuses empty, oversized, non-array, and malformed rota entry id lists', () => {
    const error = { error: 'rotaEntryIds must be 1 to 50 UUIDs' };
    expect(parsePushRequest({ rotaEntryIds: [] })).toEqual(error);
    expect(parsePushRequest({ rotaEntryIds: ENTRY_1 })).toEqual(error);
    expect(parsePushRequest({ rotaEntryIds: [ENTRY_1, 'rota-3'] })).toEqual(error);
    expect(parsePushRequest({ rotaEntryIds: [ENTRY_1, 42] })).toEqual(error);
    expect(parsePushRequest({ rotaEntryIds: Array.from({ length: 51 }, () => ENTRY_1) })).toEqual(
      error,
    );
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
    expect(preferenceKeyFor({ kind: 'rota' })).toBe('rota_notifications');
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

// ---------------------------------------------------------------------------
// Rota Push Delivery V1
// ---------------------------------------------------------------------------

const NOW = Date.parse('2026-09-17T12:00:00.000Z');

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

const ONE_MINUTE = 60 * 1000;
const ONE_DAY = 24 * 60 * ONE_MINUTE;

function rotaEntry(id: string, overrides: Partial<RotaEntryRow> = {}): RotaEntryRow {
  return {
    id,
    organisation_id: ORG,
    team_id: TEAM,
    details_change_id: null,
    details_changed_at: null,
    ...overrides,
  };
}

function assignment(
  id: string,
  userId: string,
  createdAt: string,
  entryId: string = ENTRY_1,
): RotaAssignmentRow {
  return { id, rota_entry_id: entryId, user_id: userId, created_at: createdAt };
}

function rotaEvents(input: {
  entries: RotaEntryRow[];
  assignments: RotaAssignmentRow[];
  profiles?: RecipientProfileRow[];
  memberIds?: string[];
}) {
  return selectRotaEvents({
    nowMs: NOW,
    actorId: ACTOR,
    organisationId: ORG,
    teamId: TEAM,
    entries: input.entries,
    assignments: input.assignments,
    memberIds: input.memberIds ?? [ACTOR, 'member-1', 'member-2', 'member-3'],
    profiles: input.profiles ?? [
      profile(ACTOR),
      profile('member-1'),
      profile('member-2'),
      profile('member-3'),
    ],
  });
}

describe('selectRotaEvents: added to a rota', () => {
  it('creates one event per fresh assignment row for its assignee, never for the actor', () => {
    const events = rotaEvents({
      entries: [rotaEntry(ENTRY_1)],
      assignments: [
        assignment('a1', 'member-1', ago(ONE_MINUTE)),
        assignment('a2', ACTOR, ago(ONE_MINUTE)),
        assignment('a3', 'member-2', ago(EVENT_MAX_AGE_MS + 1)),
        // A second role for the same person on the same date.
        assignment('a4', 'member-1', ago(ONE_MINUTE)),
        assignment('a5', 'member-3', ago(EVENT_MAX_AGE_MS)),
      ],
    });
    expect(events).toEqual([
      { eventType: 'rota_assignment', eventId: 'a1', rotaEntryId: ENTRY_1, recipientIds: ['member-1'] },
      { eventType: 'rota_assignment', eventId: 'a4', rotaEntryId: ENTRY_1, recipientIds: ['member-1'] },
      { eventType: 'rota_assignment', eventId: 'a5', rotaEntryId: ENTRY_1, recipientIds: ['member-3'] },
    ]);
  });

  it('never notifies removed, unlinked, cross-organisation, departed, or unknown profiles', () => {
    const fresh = ago(ONE_MINUTE);
    const events = rotaEvents({
      entries: [rotaEntry(ENTRY_1)],
      assignments: [
        assignment('r1', 'removed', fresh),
        assignment('r2', 'unlinked', fresh),
        assignment('r3', 'blank-link', fresh),
        assignment('r4', 'other-org', fresh),
        assignment('r5', 'left-team', fresh),
        assignment('r6', 'no-profile', fresh),
        assignment('r7', 'member-1', fresh),
      ],
      profiles: [
        profile('removed', { access_status: 'removed' }),
        profile('unlinked', { auth_user_id: null }),
        profile('blank-link', { auth_user_id: '' }),
        profile('other-org', { organisation_id: OTHER_ORG }),
        profile('left-team'),
        profile('member-1'),
      ],
      memberIds: ['removed', 'unlinked', 'blank-link', 'other-org', 'no-profile', 'member-1'],
    });
    expect(events.map((event) => event.recipientIds)).toEqual([['member-1']]);
  });

  it('ignores entries outside the organisation or team and assignments of unrequested entries', () => {
    const fresh = ago(ONE_MINUTE);
    const events = rotaEvents({
      entries: [
        rotaEntry(ENTRY_1, { team_id: OTHER_TEAM, details_change_id: CHANGE_1, details_changed_at: fresh }),
        rotaEntry(ENTRY_2, { organisation_id: OTHER_ORG }),
      ],
      assignments: [
        assignment('x1', 'member-1', fresh, ENTRY_1),
        assignment('x2', 'member-1', fresh, ENTRY_2),
        assignment('x3', 'member-1', fresh, 'unrequested-entry'),
      ],
    });
    expect(events).toEqual([]);
  });
});

describe('selectRotaEvents: a rota changed', () => {
  it('tells the people already on the entry once each, and people added by the same save only that they were added', () => {
    const changedAt = ago(2 * ONE_MINUTE);
    const events = rotaEvents({
      entries: [rotaEntry(ENTRY_1, { details_change_id: CHANGE_1, details_changed_at: changedAt })],
      assignments: [
        assignment('b1', 'member-1', ago(ONE_DAY)),
        assignment('b2', 'member-1', ago(ONE_DAY)),
        assignment('b3', 'member-2', ago(ONE_MINUTE)),
        assignment('b4', ACTOR, ago(ONE_DAY)),
        // Created in the same instant as the change: part of that save.
        assignment('b5', 'member-3', changedAt),
      ],
    });
    expect(events).toEqual([
      { eventType: 'rota_assignment', eventId: 'b3', rotaEntryId: ENTRY_1, recipientIds: ['member-2'] },
      { eventType: 'rota_assignment', eventId: 'b5', rotaEntryId: ENTRY_1, recipientIds: ['member-3'] },
      {
        eventType: 'rota_entry_change',
        eventId: CHANGE_1,
        rotaEntryId: ENTRY_1,
        recipientIds: ['member-1'],
      },
    ]);
  });

  it('keys each change by its server marker, so different changes are different events', () => {
    const events = rotaEvents({
      entries: [
        rotaEntry(ENTRY_1, { details_change_id: CHANGE_1, details_changed_at: ago(ONE_MINUTE) }),
        rotaEntry(ENTRY_2, { details_change_id: ANNOUNCEMENT, details_changed_at: ago(ONE_MINUTE) }),
      ],
      assignments: [
        assignment('c1', 'member-1', ago(ONE_DAY), ENTRY_1),
        assignment('c2', 'member-1', ago(ONE_DAY), ENTRY_2),
      ],
    });
    expect(events.map((event) => [event.eventType, event.eventId, event.rotaEntryId])).toEqual([
      ['rota_entry_change', CHANGE_1, ENTRY_1],
      ['rota_entry_change', ANNOUNCEMENT, ENTRY_2],
    ]);
  });

  it('produces nothing for stale, missing, or unparseable markers, or when only the actor is on the rota', () => {
    const onRota = [assignment('d1', 'member-1', ago(ONE_DAY))];
    expect(
      rotaEvents({
        entries: [
          rotaEntry(ENTRY_1, {
            details_change_id: CHANGE_1,
            details_changed_at: ago(EVENT_MAX_AGE_MS + 1),
          }),
        ],
        assignments: onRota,
      }),
    ).toEqual([]);
    expect(rotaEvents({ entries: [rotaEntry(ENTRY_1)], assignments: onRota })).toEqual([]);
    expect(
      rotaEvents({
        entries: [rotaEntry(ENTRY_1, { details_change_id: CHANGE_1, details_changed_at: 'soon' })],
        assignments: onRota,
      }),
    ).toEqual([]);
    expect(
      rotaEvents({
        entries: [rotaEntry(ENTRY_1, { details_change_id: null, details_changed_at: ago(ONE_MINUTE) })],
        assignments: onRota,
      }),
    ).toEqual([]);
    expect(
      rotaEvents({
        entries: [rotaEntry(ENTRY_1, { details_change_id: CHANGE_1, details_changed_at: ago(ONE_MINUTE) })],
        assignments: [assignment('d2', ACTOR, ago(ONE_DAY))],
      }),
    ).toEqual([]);
  });

  it('excludes removed and departed people from change events too', () => {
    const events = rotaEvents({
      entries: [rotaEntry(ENTRY_1, { details_change_id: CHANGE_1, details_changed_at: ago(ONE_MINUTE) })],
      assignments: [
        assignment('e1', 'removed', ago(ONE_DAY)),
        assignment('e2', 'left-team', ago(ONE_DAY)),
        assignment('e3', 'member-1', ago(ONE_DAY)),
      ],
      profiles: [profile('removed', { access_status: 'removed' }), profile('left-team'), profile('member-1')],
      memberIds: ['removed', 'member-1'],
    });
    expect(events).toEqual([
      {
        eventType: 'rota_entry_change',
        eventId: CHANGE_1,
        rotaEntryId: ENTRY_1,
        recipientIds: ['member-1'],
      },
    ]);
  });
});

describe('uniqueRecipientIds and buildEventDeliveryAttempts', () => {
  it('lists each recipient once across events', () => {
    expect(
      uniqueRecipientIds([
        { eventType: 'rota_assignment', eventId: 'a1', recipientIds: ['m1'] },
        { eventType: 'rota_entry_change', eventId: CHANGE_1, recipientIds: ['m1', 'm2'] },
      ]),
    ).toEqual(['m1', 'm2']);
  });

  it('claims every event for every recipient and device, with per-event skips', () => {
    const attempts = buildEventDeliveryAttempts({
      events: [
        { eventType: 'rota_assignment', eventId: 'a1', recipientIds: ['m1'] },
        { eventType: 'rota_entry_change', eventId: CHANGE_1, recipientIds: ['m1', 'm2', 'm3'] },
      ],
      disabled: new Set(['m2']),
      tokensByUser: new Map([
        [
          'm1',
          [
            { id: 't1', token: 'ExponentPushToken[1]' },
            { id: 't2', token: 'ExponentPushToken[2]' },
          ],
        ],
      ]),
    });
    expect(
      attempts.map((row) => [row.event_type, row.event_id, row.recipient_user_id, row.push_token_id, row.status, row.error_code]),
    ).toEqual([
      ['rota_assignment', 'a1', 'm1', 't1', 'pending', null],
      ['rota_assignment', 'a1', 'm1', 't2', 'pending', null],
      ['rota_entry_change', CHANGE_1, 'm1', 't1', 'pending', null],
      ['rota_entry_change', CHANGE_1, 'm1', 't2', 'pending', null],
      ['rota_entry_change', CHANGE_1, 'm2', null, 'skipped', 'preference_disabled'],
      ['rota_entry_change', CHANGE_1, 'm3', null, 'skipped', 'no_push_token'],
    ]);
  });

  it('is identical to the single-event claims for a chat message or announcement', () => {
    const input = {
      disabled: new Set(['off']),
      tokensByUser: new Map([['on', [{ id: 't1', token: 'ExponentPushToken[1]' }]]]),
    };
    expect(
      buildEventDeliveryAttempts({
        events: [{ eventType: 'announcement', eventId: ANNOUNCEMENT, recipientIds: ['on', 'off'] }],
        ...input,
      }),
    ).toEqual(
      buildDeliveryAttempts({
        eventType: 'announcement',
        eventId: ANNOUNCEMENT,
        recipientIds: ['on', 'off'],
        ...input,
      }),
    );
  });
});

function claim(
  id: string,
  eventType: string,
  eventId: string,
  recipient: string,
  tokenId: string | null,
  status = 'pending',
): ClaimedDelivery {
  return {
    id,
    event_type: eventType,
    event_id: eventId,
    recipient_user_id: recipient,
    push_token_id: tokenId,
    status,
  };
}

describe('groupPendingClaimsByToken', () => {
  const tokenById = new Map([
    ['t1', 'ExponentPushToken[1]'],
    ['t2', 'ExponentPushToken[2]'],
  ]);

  it('coalesces every pending claim of one device into one delivery', () => {
    const devices = groupPendingClaimsByToken(
      [
        claim('l1', 'rota_assignment', 'a1', 'm1', 't1'),
        claim('l2', 'rota_entry_change', CHANGE_1, 'm1', 't1'),
        claim('l3', 'rota_assignment', 'a1', 'm1', 't2'),
        claim('l4', 'rota_entry_change', CHANGE_1, 'm2', null, 'skipped'),
        claim('l5', 'rota_assignment', 'a9', 'm3', 'unknown-token'),
      ],
      tokenById,
    );
    expect(devices).toEqual([
      {
        tokenId: 't1',
        token: 'ExponentPushToken[1]',
        claims: [
          claim('l1', 'rota_assignment', 'a1', 'm1', 't1'),
          claim('l2', 'rota_entry_change', CHANGE_1, 'm1', 't1'),
        ],
      },
      {
        tokenId: 't2',
        token: 'ExponentPushToken[2]',
        claims: [claim('l3', 'rota_assignment', 'a1', 'm1', 't2')],
      },
    ]);
  });

  it('keeps exactly one claim per device, in claim order, for a single chat or announcement event', () => {
    const claimed = [
      claim('l1', 'chat_message', MESSAGE, 'a', 't2'),
      claim('l2', 'chat_message', MESSAGE, 'b', null, 'skipped'),
      claim('l3', 'chat_message', MESSAGE, 'c', 't1'),
    ];
    const devices = groupPendingClaimsByToken(claimed, tokenById);
    expect(devices.map((device) => [device.token, device.claims.map((row) => row.id)])).toEqual([
      ['ExponentPushToken[2]', ['l1']],
      ['ExponentPushToken[1]', ['l3']],
    ]);
  });

  it('turns a whole Plan the Month batch into one notification per device, and a replay into none', () => {
    const entries = [ENTRY_1, ENTRY_2, CHANGE_1].map((id) => rotaEntry(id));
    const events = rotaEvents({
      entries,
      assignments: entries.map((entry, index) =>
        assignment(`plan-${index}`, 'member-1', ago(ONE_MINUTE), entry.id),
      ),
    });
    expect(events).toHaveLength(3);
    const attempts = buildEventDeliveryAttempts({
      events,
      disabled: new Set(),
      tokensByUser: new Map([['member-1', [{ id: 't1', token: 'ExponentPushToken[1]' }]]]),
    });
    const claimed = attempts.map((row, index) => ({
      id: `ledger-${index}`,
      event_type: row.event_type,
      event_id: row.event_id,
      recipient_user_id: row.recipient_user_id,
      push_token_id: row.push_token_id,
      status: row.status,
    }));
    const devices = groupPendingClaimsByToken(claimed, tokenById);
    expect(devices).toHaveLength(1);
    expect(devices[0].claims).toHaveLength(3);
    // A replayed request claims nothing new (ON CONFLICT DO NOTHING), so it sends nothing.
    expect(groupPendingClaimsByToken([], tokenById)).toEqual([]);
  });
});

describe('notificationContentFor: rota', () => {
  const added = (rotaEntryId: string) => ({ eventType: 'rota_assignment', rotaEntryId });
  const changed = (rotaEntryId: string) => ({ eventType: 'rota_entry_change', rotaEntryId });

  it('says the person was added, with the entry id only when one entry is involved', () => {
    expect(
      notificationContentFor({
        kind: 'rota',
        teamId: TEAM,
        teamName: 'Choir',
        events: [added(ENTRY_1), added(ENTRY_1)],
      }),
    ).toEqual({
      title: 'New rota assignment',
      body: 'You have been added to the Choir rota.',
      data: { type: 'rota', teamId: TEAM, rotaEntryId: ENTRY_1 },
    });
    expect(
      notificationContentFor({
        kind: 'rota',
        teamId: TEAM,
        teamName: 'Choir',
        events: [added(ENTRY_1), added(ENTRY_2)],
      }),
    ).toEqual({
      title: 'New rota assignment',
      body: 'You have been added to the Choir rota.',
      data: { type: 'rota', teamId: TEAM },
    });
  });

  it('says a date changed, in the singular or plural', () => {
    expect(
      notificationContentFor({ kind: 'rota', teamId: TEAM, teamName: 'Media', events: [changed(ENTRY_1)] }),
    ).toEqual({
      title: 'Rota updated',
      body: 'A date you are on in the Media rota has changed.',
      data: { type: 'rota', teamId: TEAM, rotaEntryId: ENTRY_1 },
    });
    expect(
      notificationContentFor({
        kind: 'rota',
        teamId: TEAM,
        teamName: 'Media',
        events: [changed(ENTRY_1), changed(ENTRY_2)],
      }).body,
    ).toBe('Some dates you are on in the Media rota have changed.');
  });

  it('combines added and changed events into one update, and copes without a team name', () => {
    expect(
      notificationContentFor({
        kind: 'rota',
        teamId: TEAM,
        teamName: 'Choir',
        events: [added(ENTRY_1), changed(ENTRY_2)],
      }),
    ).toEqual({
      title: 'Rota updated',
      body: 'Your dates on the Choir rota have been updated.',
      data: { type: 'rota', teamId: TEAM },
    });
    expect(
      notificationContentFor({ kind: 'rota', teamId: TEAM, teamName: null, events: [added(ENTRY_1)] })
        .body,
    ).toBe('You have been added to your team rota.');
  });

  it('never carries rota titles, dates, times, notes, roles, or people', () => {
    const content = notificationContentFor({
      kind: 'rota',
      teamId: TEAM,
      teamName: 'Choir',
      events: [added(ENTRY_1)],
    });
    expect(Object.keys(content).sort()).toEqual(['body', 'data', 'title']);
    expect(Object.keys(content.data).sort()).toEqual(['rotaEntryId', 'teamId', 'type']);
  });
});
