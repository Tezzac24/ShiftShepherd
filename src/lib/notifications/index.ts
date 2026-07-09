/**
 * Notifications stub.
 *
 * Notification *preferences* are persisted for real (live Supabase rows for
 * linked Supabase sessions, local demo state otherwise — see
 * src/lib/supabase/services/notifications.ts), but no push notification is
 * ever sent yet and no device is registered.
 *
 * Push token registration is deliberately deferred because this build cannot
 * do it: `expo-notifications` is not installed, there is no EAS project id in
 * app config (`getExpoPushTokenAsync` requires one), and Expo Go cannot
 * receive remote push notifications since SDK 53 — a development build is
 * needed. The settings screen explains that delivery isn't active yet instead
 * of offering a broken flow.
 *
 * TODO: wire to Expo Notifications once the app runs as a development build
 * with an EAS project id —
 *   - request permission from a user-initiated flow (no nagging at startup)
 *   - obtain the Expo push token and upsert it into `push_tokens`
 *     (RLS already restricts rows to the caller's own profile; the
 *     authenticated grants for the table ship with that pass)
 *   - send pushes from Supabase Edge Functions on announcement/rota/chat
 *     events, filtered through each person's NotificationPreferences
 */
export function registerForPushNotificationsAsync(): Promise<string | null> {
  return Promise.resolve(null); // simulated — no real token in this build
}
