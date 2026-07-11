/**
 * A user who has never saved notification settings has no
 * notification_preferences row — the app (and the chat push Edge Function)
 * treat that as "everything on". This pins the client-side default so the
 * two sides can't silently drift.
 */
import { defaultNotificationPreferences } from '../index';

describe('defaultNotificationPreferences', () => {
  it('defaults every notification type to on for the given user', () => {
    const prefs = defaultNotificationPreferences('profile-123');
    expect(prefs.user_id).toBe('profile-123');
    expect(prefs).toMatchObject({
      announcement_notifications: true,
      team_announcement_notifications: true,
      chat_notifications: true,
      rota_notifications: true,
      event_reminders: true,
      availability_reminders: true,
    });
  });
});
