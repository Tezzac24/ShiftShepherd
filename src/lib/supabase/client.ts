/**
 * Supabase client.
 *
 * Created lazily from EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
 * (public, RLS-protected values — never put a service_role key anywhere near
 * the app). When the env vars are missing the app keeps working in demo mode:
 * `getSupabase()` returns null and callers fall back to mock behaviour.
 *
 * Live Supabase currently handles auth/session operations, the signed-in
 * user's profile lookup, and the announcements and events feature slices.
 * Everything else (teams, rotas, songs, chat, notification preferences)
 * stays mocked/local — see docs/supabase-integration-plan.md for the order.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True when the app has real Supabase credentials configured. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

/**
 * The shared Supabase client, or null when env vars are absent (demo mode).
 * Lazy so importing this module never throws — including during web export,
 * where no session storage exists at build time.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        // AsyncStorage backs session persistence on iOS/Android; on web,
        // supabase-js uses localStorage itself (AsyncStorage's web shim can
        // race the auth client during static export).
        ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
        persistSession: true,
        autoRefreshToken: true,
        // No OAuth redirects in this phase.
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
