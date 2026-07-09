/**
 * Auth abstraction layer — the only place that knows how a user signs in.
 *
 * Two modes, chosen automatically:
 *
 *  - **Demo mode** (always available): sign in as a mock test user from the
 *    login screen selector. Used for demos and frontend development, and it
 *    is the only mode when Supabase env vars are missing. The selected demo
 *    user is remembered locally so app restarts stay signed in.
 *
 *  - **Supabase mode** (when EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY are set):
 *    real email/password sign-in via Supabase Auth, with session restore on
 *    cold start and an auth-state listener. After login the matching row in
 *    `profiles` (auth_user_id = auth.uid()) is fetched and converted into the
 *    same SessionUser shape the rest of the app already uses, so screens and
 *    permission checks never know which mode is active.
 *
 * Feature data stays mocked in this phase, so a Supabase profile whose email
 * matches a mock user (the seeded demo people) is bridged onto that mock
 * user's id/memberships — keeping rotas, teams, and permissions working.
 * Unrecognised profiles get a real session with their fetched org role but no
 * mock team memberships (their real team ids don't exist in mock data yet).
 *
 * TODO: wire to Supabase data — once feature slices go live, replace the
 * email bridge with sessions built entirely from profiles/organisation_roles/
 * team_memberships queries (docs/supabase-integration-plan.md, step 2+).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { OrganisationRoleName, SessionUser, TeamMembership, UserProfile } from '../../types';
import { mockMemberships, mockOrganisationRoles, mockUsers } from '../mockData';
import { clearPersisted, loadPersisted, savePersisted, STORAGE_KEYS } from '../storage/persistence';
import { getSupabase, isSupabaseConfigured } from '../supabase/client';

type AuthMode = 'demo' | 'supabase';

interface AuthContextValue {
  user: SessionUser | null;
  /** True while the saved session/demo user is being restored at startup. */
  isLoading: boolean;
  /** How the current user signed in; null when signed out. */
  authMode: AuthMode | null;
  /** True when Supabase credentials are configured (real login available). */
  supabaseEnabled: boolean;
  /** Demo-mode login: sign in directly as a mock test user. */
  signInAsTestUser: (userId: string) => void;
  /**
   * Email/password login. Real Supabase Auth when configured; otherwise the
   * demo fallback (any password for a known mock email). Resolves to a
   * friendly error message on failure, or null on success.
   */
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const GENERIC_LOGIN_ERROR =
  'We couldn’t log you in. Please check your email and password and try again.';
const NO_PROFILE_ERROR =
  'Your account isn’t linked to a church profile yet. Please ask your church admin to set this up, then try again.';
const OFFLINE_ERROR =
  'We couldn’t reach the server. Please check your connection and try again.';

function buildMockSession(userId: string): SessionUser | null {
  const profile = mockUsers.find((u) => u.id === userId);
  if (!profile) return null;
  const orgRole =
    mockOrganisationRoles.find((r) => r.user_id === userId)?.role ?? 'general_member';
  const memberships = mockMemberships.filter((m) => m.user_id === userId);
  return { profile, orgRole, memberships };
}

/**
 * Build a SessionUser for a signed-in Supabase auth user.
 * Returns null when no linked `profiles` row exists.
 * Throws on network/query failure (callers translate to a friendly message).
 */
async function buildSupabaseSession(authUserId: string): Promise<SessionUser | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id, auth_user_id, organisation_id, full_name, email, phone, avatar_url, created_at')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profileRow) return null;

  // Phase note: feature data is still mocked, so seeded demo people (matched
  // by email) are bridged onto their mock identity — that keeps their teams,
  // rotas, and permission checks working exactly as in demo mode.
  const bridged = mockUsers.find(
    (u) => u.email.toLowerCase() === String(profileRow.email).toLowerCase(),
  );
  if (bridged) {
    const session = buildMockSession(bridged.id);
    // Keep the real profile id alongside the bridged mock identity — live
    // data services (announcements) must write real UUIDs, not mock ids.
    if (session) return { ...session, supabaseProfileId: profileRow.id };
  }

  // Unrecognised profile: real profile row + real org role, but no mock team
  // memberships (their live team ids don't exist in mock data yet).
  const profile: UserProfile = {
    id: profileRow.id,
    auth_user_id: profileRow.auth_user_id,
    organisation_id: profileRow.organisation_id,
    full_name: profileRow.full_name,
    email: profileRow.email,
    phone: profileRow.phone,
    avatar_url: profileRow.avatar_url,
    created_at: profileRow.created_at,
  };
  const { data: roleRow, error: roleError } = await supabase
    .from('organisation_roles')
    .select('role')
    .eq('user_id', profileRow.id)
    .maybeSingle();
  if (roleError) throw roleError;
  const orgRole = (roleRow?.role ?? 'general_member') as OrganisationRoleName;
  const memberships: TeamMembership[] = [];
  return { profile, orgRole, memberships, supabaseProfileId: profileRow.id };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  // Mirrors authMode for the auth-state listener (avoids stale closures).
  const authModeRef = useRef<AuthMode | null>(null);

  const applySession = useCallback((session: SessionUser | null, mode: AuthMode | null) => {
    authModeRef.current = session ? mode : null;
    setAuthMode(session ? mode : null);
    setUser(session);
  }, []);

  // Restore whatever was signed in before: a Supabase session wins, then a
  // remembered demo user, otherwise start signed out.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          const authUser = data.session?.user;
          if (authUser) {
            try {
              const session = await buildSupabaseSession(authUser.id);
              if (session) {
                if (!cancelled) applySession(session, 'supabase');
                return;
              }
              // Signed-in auth user with no linked profile: end the session
              // cleanly; the login screen explains what to do next.
              console.warn('[auth] Supabase user has no linked profile; signing out');
              await supabase.auth.signOut();
            } catch (error) {
              // Profile fetch failed (likely offline). Don't destroy the
              // session — start signed out this launch and let the user retry.
              console.warn('[auth] could not restore Supabase session', error);
            }
          }
        }
        const demoUserId = await loadPersisted<string>(
          STORAGE_KEYS.demoUser,
          (d) => typeof d === 'string',
        );
        if (demoUserId && !cancelled) {
          const session = buildMockSession(demoUserId);
          if (session) {
            applySession(session, 'demo');
          } else {
            // Persisted demo user no longer exists in mock data.
            await clearPersisted(STORAGE_KEYS.demoUser);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  // Keep the app in step with Supabase Auth (e.g. session revoked/expired).
  // Sign-ins are handled explicitly in signInWithEmail, so only sign-outs
  // need mirroring here.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && authModeRef.current === 'supabase') {
        applySession(null, null);
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, [applySession]);

  const signInAsTestUser = useCallback(
    (userId: string) => {
      const session = buildMockSession(userId);
      if (!session) return;
      applySession(session, 'demo');
      // Remember the choice so restarts stay signed in (demo id only — no secrets).
      savePersisted(STORAGE_KEYS.demoUser, userId);
    },
    [applySession],
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !password) {
        return 'Please enter your email and password.';
      }

      const supabase = getSupabase();
      if (!supabase) {
        // Demo fallback: any password works for a known mock email.
        const profile = mockUsers.find((u) => u.email.toLowerCase() === trimmed);
        if (!profile) return GENERIC_LOGIN_ERROR;
        signInAsTestUser(profile.id);
        return null;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password,
      });
      if (error) {
        console.warn('[auth] signInWithPassword failed:', error.message);
        return error.message.toLowerCase().includes('fetch') ? OFFLINE_ERROR : GENERIC_LOGIN_ERROR;
      }

      try {
        const session = await buildSupabaseSession(data.user.id);
        if (!session) {
          await supabase.auth.signOut();
          return NO_PROFILE_ERROR;
        }
        applySession(session, 'supabase');
        return null;
      } catch (fetchError) {
        console.warn('[auth] profile lookup failed after sign-in', fetchError);
        await supabase.auth.signOut();
        return OFFLINE_ERROR;
      }
    },
    [applySession, signInAsTestUser],
  );

  const signOut = useCallback(async () => {
    const mode = authModeRef.current;
    applySession(null, null);
    await clearPersisted(STORAGE_KEYS.demoUser);
    if (mode === 'supabase') {
      try {
        await getSupabase()?.auth.signOut();
      } catch (error) {
        // Local state is already cleared; a failed remote sign-out only means
        // the token lives until expiry.
        console.warn('[auth] Supabase sign-out failed', error);
      }
    }
  }, [applySession]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      authMode,
      supabaseEnabled: isSupabaseConfigured,
      signInAsTestUser,
      signInWithEmail,
      signOut,
    }),
    [user, isLoading, authMode, signInAsTestUser, signInWithEmail, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** The signed-in user, for screens that are only reachable when logged in. */
export function useRequiredUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error('This screen requires a signed-in user');
  return user;
}
