import { chatConversations, chatDayLabel, chatTimeline, conversationPreview, conversationTimestamp } from '../chatPresentation';
import { message, PROFILE, TEAM, USER } from './chatTestData';

const now = new Date(2026, 8, 22, 12);

it('orders recent conversations before stable alphabetical empty conversations without mutating inputs', () => {
  const teams = [{ ...TEAM, id: 'z', name: 'Zebras' }, { ...TEAM, id: 'a', name: 'Alpha' }, TEAM,
    { ...TEAM, id: 'b', name: 'Alpha' }, { ...TEAM, id: 'media', name: 'Media' }];
  const messages = [message(), message({ team_id: 'media', id: 'later', created_at: new Date(2026, 8, 22, 10).toISOString() }),
    message({ id: 'message-z', body: 'Same time, later ID' })];
  const originalOrder = teams.map((team) => team.id);
  const rows = chatConversations(USER, teams, messages);
  expect(rows.map(({ team }) => team.id)).toEqual(['media', 'choir', 'a', 'b', 'z']);
  expect(rows[1].lastMessage?.body).toBe('Same time, later ID');
  expect(teams.map((team) => team.id)).toEqual(originalOrder);
  expect(messages.map((item) => item.id)).toEqual(['message-a', 'later', 'message-z']);
});

it('scopes conversations and previews to accessible active teams in the current church', () => {
  const teams = [TEAM, { ...TEAM, id: 'hidden' }, { ...TEAM, id: 'archived', archived_at: '2026-09-01' },
    { ...TEAM, id: 'elsewhere', organisation_id: 'church-b' }];
  const user = { ...USER, orgRole: 'general_member' as const,
    memberships: [{ id: 'm', team_id: TEAM.id, user_id: PROFILE.id, role: 'member' as const, created_at: '' }] };
  const rows = chatConversations(user, teams, [message(), message({ id: 'wrong', organisation_id: 'church-b', created_at: '2030-01-01' })]);
  expect(rows.map(({ team }) => team.id)).toEqual(['choir']);
  expect(rows[0].lastMessage?.id).toBe('message-a');
  expect(chatConversations(USER, teams, []).map(({ team }) => team.id)).toEqual(['choir', 'hidden']);
});

it('retains full long names and compacts a preview without modifying message text', () => {
  const name = 'Oluwatobiloba Alexandra Williams-MacAllister';
  const original = message({ body: 'First line\n\nSecond line\twith details' });
  expect(conversationPreview(original, [{ ...PROFILE, id: original.sender_id, full_name: name }], PROFILE.id))
    .toBe(`${name}: First line Second line with details`);
  expect(original.body).toBe('First line\n\nSecond line\twith details');
  expect(chatConversations(USER, [{ ...TEAM, name }], [original])[0].team.name).toBe(name);
});

it('gives an image-only preview and names own messages without inventing receipt state', () => {
  const photo = message({ body: ' ', sender_id: PROFILE.id, attachment: {
    id: 'image', message_id: 'message-a', file_url: 'private/photo.png', file_type: 'image/png',
    file_name: 'photo.png', file_size_bytes: 1, created_at: '',
  } });
  expect(conversationPreview(photo, [PROFILE], PROFILE.id)).toBe('You: Photo');
});

it('adds one label per local calendar day in the existing stable chronological order', () => {
  const yesterday = new Date(2026, 8, 21, 23, 59).toISOString();
  const today = new Date(2026, 8, 22, 0, 1).toISOString();
  const rows = chatTimeline(TEAM.id, PROFILE.organisation_id, [message({ id: 'b', created_at: today }),
    message({ id: 'y', created_at: yesterday }), message({ id: 'a', created_at: today }),
    message({ id: 'other', team_id: 'media' }), message({ id: 'wrong', organisation_id: 'church-b' })], now);
  expect(rows.map(({ message: item }) => item.id)).toEqual(['y', 'a', 'b']);
  expect(rows.map(({ dayLabel }) => dayLabel)).toEqual(['Yesterday', 'Today', null]);
});

it('uses calendar dates across year boundaries and readable timestamps', () => {
  const january = new Date(2027, 0, 1, 10);
  expect(chatDayLabel(new Date(2026, 11, 31, 23).toISOString(), january)).toBe('Yesterday');
  expect(chatDayLabel(new Date(2025, 0, 1, 10).toISOString(), now)).toContain('2025');
  expect(chatDayLabel('invalid', now)).toBe('Date unavailable');
  expect(conversationTimestamp(message().created_at, now)).toBe(new Date(message().created_at)
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
  expect(conversationTimestamp(new Date(2026, 8, 21, 10).toISOString(), now)).toBe('Yesterday');
});
