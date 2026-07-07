/**
 * Central mock data module. Everything the scaffold "loads" comes from here;
 * when Supabase is wired in these exports are replaced by queries.
 */
import { NotificationPreferences } from '../../types';

export * from './people';
export * from './events';
export * from './announcements';
export * from './songs';
export * from './rotas';
export * from './chat';

/** Default notification preferences (important things on by default). */
export function defaultNotificationPreferences(userId: string): NotificationPreferences {
  return {
    id: `np-${userId}`,
    user_id: userId,
    announcement_notifications: true,
    team_announcement_notifications: true,
    chat_notifications: true,
    rota_notifications: true,
    event_reminders: true,
    availability_reminders: true,
  };
}
