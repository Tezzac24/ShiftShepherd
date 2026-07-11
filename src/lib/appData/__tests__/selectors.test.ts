/**
 * Chat selector regression tests (pure functions, no mocks needed).
 *
 * Guards the Chat Image Attachments V1 preview behaviour and team message
 * ordering. Unread counting moved server-side (get_team_chat_unread_summary)
 * with pure client reducers covered by chatUnread.test.ts.
 */
import { ChatAttachment, ChatMessage } from '../../../types';
import { chatMessagePreview, messagesForTeam } from '../selectors';

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
