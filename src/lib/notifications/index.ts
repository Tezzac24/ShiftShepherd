/**
 * Notifications stub.
 *
 * The scaffold simulates notifications through in-app unread badges and the
 * notification preferences screen. No real push delivery happens.
 *
 * TODO: wire to Expo Notifications —
 *   - request permissions & obtain an Expo push token (`push_tokens` table)
 *   - send pushes from Supabase Edge Functions on announcement/rota/chat events
 *   - respect NotificationPreferences per user
 */
export function registerForPushNotificationsAsync(): Promise<string | null> {
  return Promise.resolve(null); // simulated — no real token in the scaffold
}
