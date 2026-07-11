/**
 * Chat selector regression tests (pure functions, no mocks needed).
 *
 * Guards the Chat Image Attachments V1 preview behaviour and the private
 * unread tracking semantics that back the Messages/Teams badges.
 */
import { ChatAttachment, ChatMessage } from '../../../types';
import { chatMessagePreview, countUnreadByTeam, messagesForTeam } from '../selectors';

function makeMessage(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'msg-1',
    organisation_id: 'org-1',
    team_id: 'team-a',
    sender_id: 'sender-other',
    body: 'Hello there',
    created_at: '2026-07-11T10:00:00.000Z',
    ...overrides,
  };
}

function makeAttachment(): ChatAttachment {
  return {
    id: 'att-1',
    message_id: 'msg-1',
    file_url: 'teams/team-a/messages/msg-1/photo.jpg',
    file_type: 'image/jpeg',
    file_name: 'photo.jpg',
    file_size_bytes: 1234,
    created_at: '2026-07-11T10:00:00.000Z',
  };
}

describe('chatMessagePreview', () => {
  it('shows the message text for a text message', () => {
    expect(chatMessagePreview(makeMessage({ body: 'See you Sunday!' }))).toBe('See you Sunday!');
  });

  it('shows the text for a captioned image, not the Photo label', () => {
    expect(
      chatMessagePreview(makeMessage({ body: 'Our new banner', attachment: makeAttachment() })),
    ).toBe('Our new banner');
  });

  it('labels an image-only message "Photo" instead of showing a blank preview', () => {
    expect(chatMessagePreview(makeMessage({ body: '', attachment: makeAttachment() }))).toBe(
      'Photo',
    );
    // Whitespace-only bodies count as image-only too.
    expect(chatMessagePreview(makeMessage({ body: '   ', attachment: makeAttachment() }))).toBe(
      'Photo',
    );
  });

  it('falls back to "Message" when there is neither text nor an attachment', () => {
    expect(chatMessagePreview(makeMessage({ body: '  ' }))).toBe('Message');
  });
});

describe('countUnreadByTeam', () => {
  const ME = 'profile-me';
  const READ_STATES = [{ team_id: 'team-a', last_read_at: '2026-07-11T10:00:00.000Z' }];
  const BASELINE = '2026-07-11T09:00:00.000Z';

  it('never counts the user’s own messages', () => {
    const messages = [
      makeMessage({ id: 'm1', sender_id: ME, created_at: '2026-07-11T11:00:00.000Z' }),
      makeMessage({ id: 'm2', sender_id: ME, created_at: '2026-07-11T12:00:00.000Z' }),
    ];
    expect(countUnreadByTeam(messages, READ_STATES, BASELINE, ME)).toEqual({});
  });

  it('counts other people’s messages newer than the team’s last_read_at', () => {
    const messages = [
      // At or before the read point: already read.
      makeMessage({ id: 'm1', created_at: '2026-07-11T09:59:00.000Z' }),
      makeMessage({ id: 'm2', created_at: '2026-07-11T10:00:00.000Z' }),
      // Strictly newer: unread.
      makeMessage({ id: 'm3', created_at: '2026-07-11T10:01:00.000Z' }),
      makeMessage({ id: 'm4', created_at: '2026-07-11T10:02:00.000Z' }),
    ];
    expect(countUnreadByTeam(messages, READ_STATES, BASELINE, ME)).toEqual({ 'team-a': 2 });
  });

  it('uses the baseline for teams the user has never opened', () => {
    const messages = [
      makeMessage({ id: 'm1', team_id: 'team-b', created_at: '2026-07-11T08:59:00.000Z' }),
      makeMessage({ id: 'm2', team_id: 'team-b', created_at: '2026-07-11T09:01:00.000Z' }),
    ];
    // team-b has no read state row, so only the post-baseline message counts —
    // history from before this session never floods in as unread.
    expect(countUnreadByTeam(messages, READ_STATES, BASELINE, ME)).toEqual({ 'team-b': 1 });
  });

  it('tracks each team independently', () => {
    const messages = [
      makeMessage({ id: 'm1', team_id: 'team-a', created_at: '2026-07-11T10:30:00.000Z' }),
      makeMessage({ id: 'm2', team_id: 'team-b', created_at: '2026-07-11T09:30:00.000Z' }),
      makeMessage({ id: 'm3', team_id: 'team-b', sender_id: ME, created_at: '2026-07-11T09:45:00.000Z' }),
    ];
    expect(countUnreadByTeam(messages, READ_STATES, BASELINE, ME)).toEqual({
      'team-a': 1,
      'team-b': 1,
    });
  });
});

describe('messagesForTeam', () => {
  it('filters to the team and keeps same-timestamp messages in a stable id order', () => {
    const at = '2026-07-11T10:00:00.000Z';
    const messages = [
      makeMessage({ id: 'msg-b', created_at: at }),
      makeMessage({ id: 'msg-other-team', team_id: 'team-z', created_at: at }),
      makeMessage({ id: 'msg-a', created_at: at }),
    ];
    expect(messagesForTeam('team-a', messages).map((m) => m.id)).toEqual(['msg-a', 'msg-b']);
  });
});
