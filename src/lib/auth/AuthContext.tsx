/** Central auth/account abstraction for demo and Supabase modes. */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { User as SupabaseAuthUser } from '@supabase/supabase-js';

import {
  AccountContext,
  OrganisationRoleName,
  SessionUser,
  TeamMembership,
  UserProfile,
} from '../../types';
import {
  clearPendingInvitation as clearStoredInvitation,
  loadPendingInvitation,
  savePendingInvitation,
} from '../invitations';
import { mockMemberships, mockOrganisationRoles, mockUsers } from '../mockData';
import { clearPersisted, loadPersisted, savePersisted, STORAGE_KEYS } from '../storage/persistence';
import { getSupabase, isSupabaseConfigured } from '../supabase/client';
import * as accountsService from '../supabase/services/accounts';
import * as organisationMembershipsService from '../supabase/services/organisationMemberships';

type AuthMode = 'demo' | 'supabase';

/**
 * Lifecycle of the signed-in account's organisation context.
 *
 * This exists so that "we have not looked yet" can never be mistaken for "we
 * looked and the account has no organisations". `accountContext === null` means
 * both, which is why an unresolved context used to route straight to
 * "No organisations yet" on sign-in.
 */
export type AccountStatus = 'idle' | 'loading' | 'ready' | 'error';

interface AuthIdentity {
  id: string;
  email: string | null;
  emailVerified: boolean;
  suggestedName: string | null;
}

export interface SignUpResult {
  error: string | null;
  needsEmailConfirmation: boolean;
}

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authMode: AuthMode | null;
  supabaseEnabled: boolean;
  accountContext: AccountContext | null;
  accountStatus: AccountStatus;
  authIdentity: AuthIdentity | null;
  pendingInvitationToken: string | null;
  signInAsTestUser: (userId: string) => void;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (fullName: string, email: string, password: string) => Promise<SignUpResult>;
  signOut: (options?: { preservePendingInvitation?: boolean }) => Promise<void>;
  refreshAccountContext: (options?: { clearCurrentScope?: boolean }) => Promise<void>;
  savePendingInvitation: (token: string) => Promise<void>;
  clearPendingInvitation: () => Promise<void>;
  setGlobalDisplayName: (name: string) => Promise<void>;
  setOrganisationDisplayNameOverride: (name: string | null) => Promise<void>;
  setProfileDisplayNames: (globalName: string, organisationName: string | null) => Promise<void>;
  switchOrganisation: (profileId: string) => Promise<void>;
  createOrganisation: (name: string) => Promise<void>;
  leaveOrganisation: () => Promise<void>;
  applySessionAvatarUrl: (avatarUrl: string | null) => void;
  applySessionProfile: (
    patch: Partial<Pick<UserProfile, 'full_name' | 'phone' | 'avatar_url' | 'display_name_override'>>,
  ) => void;
  applySessionDirectorySnapshot: (
    profileId: string,
    snapshot: {
      profile?: UserProfile;
      orgRole: OrganisationRoleName;
      memberships: TeamMembership[];
    },
  ) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const GENERIC_LOGIN_ERROR =
  'We couldn’t log you in. Please check your email and password and try again.';
const OFFLINE_ERROR = 'We couldn’t reach the server. Please check your connection and try again.';
export const SIGN_OUT_ERROR =
  'You are signed out on this device, but we couldn’t reach the server to end the session everywhere. Please check your connection.';

function buildMockSession(userId: string): SessionUser | null {
  const profile = mockUsers.find((candidate) => candidate.id === userId);
  if (!profile) return null;
  return {
    profile,
    orgRole:
      mockOrganisationRoles.find((role) => role.user_id === userId)?.role ?? 'general_member',
    memberships: mockMemberships.filter((membership) => membership.user_id === userId),
  };
}

function suggestedName(user: SupabaseAuthUser): string | null {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  for (const key of ['full_name', 'name', 'display_name']) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim().length >= 2) return value.trim();
  }
  return null;
}

function identityFromAuthUser(user: SupabaseAuthUser): AuthIdentity {
  return {
    id: user.id,
    email: user.email?.trim().toLowerCase() ?? null,
    emailVerified: !!user.email_confirmed_at,
    suggestedName: suggestedName(user),
  };
}

export function applyDirectorySnapshotToSession(
  current: SessionUser | null,
  profileId: string,
  snapshot: {
    profile?: UserProfile;
    orgRole: OrganisationRoleName;
    memberships: TeamMembership[];
  },
): SessionUser | null {
  if (!current || current.supabaseProfileId !== profileId) return current;
  return {
    ...current,
    profile: snapshot.profile ?? current.profile,
    orgRole: snapshot.orgRole,
    memberships: snapshot.memberships,
  };
}

async function buildSessionForContext(context: AccountContext): Promise<SessionUser | null> {
  const activeId = context.account.active_profile_id;
  if (!activeId) return null;
  const active = context.organisations.find((entry) => entry.profile.id === activeId);
  if (!active) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const [roleResult, membershipResult] = await Promise.all([
    supabase.from('organisation_roles').select('role').eq('user_id', activeId).maybeSingle(),
    supabase
      .from('team_memberships')
      .select('id, team_id, user_id, role, created_at')
      .eq('user_id', activeId)
      .order('created_at', { ascending: true }),
  ]);
  if (roleResult.error) throw roleResult.error;
  if (membershipResult.error) throw membershipResult.error;
  return {
    profile: active.profile,
    orgRole: (roleResult.data?.role ?? 'general_member') as OrganisationRoleName,
    memberships: (membershipResult.data ?? []) as TeamMembership[],
    supabaseProfileId: activeId,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [accountContext, setAccountContext] = useState<AccountContext | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('idle');
  const [authIdentity, setAuthIdentity] = useState<AuthIdentity | null>(null);
  const [pendingInvitationToken, setPendingInvitationToken] = useState<string | null>(null);
  const authModeRef = useRef<AuthMode | null>(null);
  const authUserIdRef = useRef<string | null>(null);
  const bootstrapSequenceRef = useRef(0);

  const applyDemoSession = useCallback((session: SessionUser | null) => {
    authModeRef.current = session ? 'demo' : null;
    authUserIdRef.current = null;
    setAuthMode(session ? 'demo' : null);
    setAuthIdentity(null);
    setAccountContext(null);
    setAccountStatus('idle');
    setUser(session);
  }, []);

  const clearLiveState = useCallback(() => {
    bootstrapSequenceRef.current += 1;
    authUserIdRef.current = null;
    authModeRef.current = null;
    setAuthMode(null);
    setAuthIdentity(null);
    setAccountContext(null);
    setAccountStatus('idle');
    setUser(null);
  }, []);

  const bootstrapLiveUser = useCallback(async (authUser: SupabaseAuthUser) => {
    const sequence = ++bootstrapSequenceRef.current;
    const previousAuthUserId = authUserIdRef.current;
    authModeRef.current = 'supabase';
    authUserIdRef.current = authUser.id;
    setAuthMode('supabase');
    setAuthIdentity(identityFromAuthUser(authUser));

    // A different account must never inherit the previous one's organisation
    // view, not even for the frame before its own context resolves.
    if (previousAuthUserId !== authUser.id) {
      setUser(null);
      setAccountContext(null);
    }
    // Authenticated but unresolved. Routing waits on this instead of reading the
    // still-null context as "this account has no organisations".
    setAccountStatus('loading');

    try {
      const context = await accountsService.fetchAccountContext();
      if (sequence !== bootstrapSequenceRef.current || authUserIdRef.current !== authUser.id) return;

      // One linked organisation with a missing active pointer is unambiguous and
      // repaired only through the secure ownership-validating RPC.
      if (!context.account.active_profile_id && context.organisations.length === 1) {
        await accountsService.switchActiveProfile(context.organisations[0].profile.id);
        if (sequence !== bootstrapSequenceRef.current) return;
        return await bootstrapLiveUser(authUser);
      }

      const session = await buildSessionForContext(context);
      if (sequence !== bootstrapSequenceRef.current || authUserIdRef.current !== authUser.id) return;
      setAccountContext(context);
      setUser(session);
      setAccountStatus('ready');
    } catch (error) {
      // A failed lookup is a failure, not an empty account. Only the newest
      // bootstrap for the current user may publish it.
      if (sequence === bootstrapSequenceRef.current && authUserIdRef.current === authUser.id) {
        setAccountStatus('error');
      }
      throw error;
    }
  }, []);

  const refreshAccountContext = useCallback(async (options?: { clearCurrentScope?: boolean }) => {
    const supabase = getSupabase();
    if (!supabase || authModeRef.current !== 'supabase') return;
    if (options?.clearCurrentScope) {
      // Used after server-observed access loss. Clear before the network lookup
      // so revoked organisation data and channels cannot remain visible if the
      // account-context refresh is slow or temporarily fails.
      setUser(null);
      setAccountContext(null);
      setAccountStatus('loading');
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      if (options?.clearCurrentScope) setAccountStatus('error');
      throw new Error(OFFLINE_ERROR);
    }
    await bootstrapLiveUser(data.user);
  }, [bootstrapLiveUser]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pending = await loadPendingInvitation();
        if (!cancelled) setPendingInvitationToken(pending);
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (data.session?.user) {
            try {
              await bootstrapLiveUser(data.session.user);
              return;
            } catch (error) {
              console.warn('[auth] account restore failed', {
                code: (error as { code?: string })?.code,
              });
            }
          }
        }
        const demoUserId = await loadPersisted<string>(
          STORAGE_KEYS.demoUser,
          (value) => typeof value === 'string',
        );
        if (!cancelled && demoUserId) {
          const session = buildMockSession(demoUserId);
          if (session) applyDemoSession(session);
          else await clearPersisted(STORAGE_KEYS.demoUser);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyDemoSession, bootstrapLiveUser]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && authModeRef.current === 'supabase') {
        clearLiveState();
      } else if (
        (event === 'SIGNED_IN' || event === 'USER_UPDATED') &&
        session?.user &&
        authModeRef.current !== 'demo' &&
        session.user.id !== authUserIdRef.current
      ) {
        void bootstrapLiveUser(session.user).catch((error) =>
          console.warn('[auth] auth-state bootstrap failed', {
            code: (error as { code?: string })?.code,
          }),
        );
      }
    });
    return () => data.subscription.unsubscribe();
  }, [bootstrapLiveUser, clearLiveState]);

  const signInAsTestUser = useCallback(
    (userId: string) => {
      const session = buildMockSession(userId);
      if (!session) return;
      applyDemoSession(session);
      void savePersisted(STORAGE_KEYS.demoUser, userId);
    },
    [applyDemoSession],
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const normalized = email.trim().toLowerCase();
      if (!normalized || !password) return 'Please enter your email and password.';
      const supabase = getSupabase();
      if (!supabase) {
        const profile = mockUsers.find((candidate) => candidate.email.toLowerCase() === normalized);
        if (!profile) return GENERIC_LOGIN_ERROR;
        signInAsTestUser(profile.id);
        return null;
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      });
      if (error) return /fetch/i.test(error.message) ? OFFLINE_ERROR : GENERIC_LOGIN_ERROR;
      try {
        await bootstrapLiveUser(data.user);
        return null;
      } catch (bootstrapError) {
        console.warn('[auth] account load failed after sign-in', {
          code: (bootstrapError as { code?: string })?.code,
        });
        return OFFLINE_ERROR;
      }
    },
    [bootstrapLiveUser, signInAsTestUser],
  );

  const signUpWithEmail = useCallback(
    async (fullName: string, email: string, password: string): Promise<SignUpResult> => {
      const name = fullName.trim();
      const normalized = email.trim().toLowerCase();
      if (name.length < 2) return { error: 'Please enter your full name.', needsEmailConfirmation: false };
      if (name.length > 100) {
        return { error: 'Please keep your name to 100 characters or fewer.', needsEmailConfirmation: false };
      }
      if (!normalized || password.length < 6) {
        return {
          error: 'Enter a valid email and a password with at least 6 characters.',
          needsEmailConfirmation: false,
        };
      }
      const supabase = getSupabase();
      if (!supabase) {
        return { error: 'Account creation is available when Shift Shepherd is connected.', needsEmailConfirmation: false };
      }
      const { data, error } = await supabase.auth.signUp({
        email: normalized,
        password,
        options: { data: { full_name: name } },
      });
      if (error) {
        return {
          error: /fetch/i.test(error.message)
            ? OFFLINE_ERROR
            : 'We couldn’t create your account. Please check the details and try again.',
          needsEmailConfirmation: false,
        };
      }
      if (!data.session) return { error: null, needsEmailConfirmation: true };
      try {
        await accountsService.setGlobalDisplayName(name);
        await bootstrapLiveUser(data.user!);
        return { error: null, needsEmailConfirmation: false };
      } catch {
        return { error: OFFLINE_ERROR, needsEmailConfirmation: false };
      }
    },
    [bootstrapLiveUser],
  );

  const savePending = useCallback(async (token: string) => {
    await savePendingInvitation(token);
    setPendingInvitationToken(token);
  }, []);

  // Dropping the stored token is local cleanup: a keychain failure must not turn
  // into a user-facing error or an unhandled rejection in a screen effect.
  const clearPending = useCallback(async () => {
    await clearStoredInvitation().catch(() => undefined);
    setPendingInvitationToken(null);
  }, []);

  const setGlobalDisplayName = useCallback(
    async (name: string) => {
      await accountsService.setGlobalDisplayName(name);
      await refreshAccountContext();
    },
    [refreshAccountContext],
  );

  const setOrganisationDisplayNameOverride = useCallback(
    async (name: string | null) => {
      await accountsService.setOrganisationDisplayNameOverride(name);
      await refreshAccountContext();
    },
    [refreshAccountContext],
  );

  const setProfileDisplayNames = useCallback(
    async (globalName: string, organisationName: string | null) => {
      await accountsService.setProfileDisplayNames(globalName, organisationName);
      await refreshAccountContext();
    },
    [refreshAccountContext],
  );

  const switchOrganisation = useCallback(
    async (profileId: string) => {
      setUser(null); // immediately tears down every old org-scoped data/channel lifecycle
      await accountsService.switchActiveProfile(profileId);
      await refreshAccountContext();
    },
    [refreshAccountContext],
  );

  const createOrganisation = useCallback(
    async (name: string) => {
      setUser(null);
      await accountsService.createOrganisation(name);
      await refreshAccountContext();
    },
    [refreshAccountContext],
  );

  const leaveOrganisation = useCallback(async () => {
    await organisationMembershipsService.leaveOrganisation();
    // The server has atomically removed the old scope and repaired the active
    // profile. Drop every old organisation row/channel before bootstrapping the
    // resulting Home, selector, or no-organisations state.
    setUser(null);
    setAccountContext(null);
    setAccountStatus('loading');
    await refreshAccountContext().catch((error) => {
      // The membership mutation already committed. bootstrapLiveUser publishes
      // the retryable account error state; do not misreport the leave as failed.
      console.warn('[auth] account refresh failed after leaving organisation', {
        code: (error as { code?: string })?.code,
      });
    });
  }, [refreshAccountContext]);

  const applySessionProfile = useCallback(
    (
      patch: Partial<
        Pick<UserProfile, 'full_name' | 'phone' | 'avatar_url' | 'display_name_override'>
      >,
    ) => {
      setUser((previous) =>
        previous ? { ...previous, profile: { ...previous.profile, ...patch } } : previous,
      );
      setAccountContext((previous) =>
        previous
          ? {
              ...previous,
              organisations: previous.organisations.map((entry) =>
                entry.profile.id === previous.account.active_profile_id
                  ? { ...entry, profile: { ...entry.profile, ...patch } }
                  : entry,
              ),
            }
          : previous,
      );
    },
    [],
  );

  const applySessionAvatarUrl = useCallback(
    (avatarUrl: string | null) => applySessionProfile({ avatar_url: avatarUrl }),
    [applySessionProfile],
  );

  const applySessionDirectorySnapshot = useCallback(
    (
      profileId: string,
      snapshot: {
        profile?: UserProfile;
        orgRole: OrganisationRoleName;
        memberships: TeamMembership[];
      },
    ) => setUser((previous) => applyDirectorySnapshotToSession(previous, profileId, snapshot)),
    [],
  );

  const signOut = useCallback(
    async (options?: { preservePendingInvitation?: boolean }) => {
      // Read the mode before clearing state so a second tap becomes a no-op
      // rather than a second Supabase call.
      const mode = authModeRef.current;
      const supabase = mode === 'supabase' ? getSupabase() : null;
      const preserveInvitation = !!options?.preservePendingInvitation;

      // The UI leaves immediately; the session removal below decides whether the
      // user is *actually* signed out.
      if (mode === 'demo') applyDemoSession(null);
      else clearLiveState();

      // Ancillary cleanup is best-effort. It runs alongside the sign-out and its
      // failure must never be able to leave a live session on the device — that
      // is what previously kept the user signed in after a restart.
      const cleanup = Promise.allSettled([
        clearPersisted(STORAGE_KEYS.demoUser),
        preserveInvitation ? Promise.resolve() : clearStoredInvitation(),
      ]);

      let authFailure: Error | null = null;
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) {
          // Revoking the refresh token server-side failed (typically offline).
          // Drop the device session anyway so a restart cannot restore it, then
          // report the failure instead of pretending sign-out fully succeeded.
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
          authFailure = new Error(SIGN_OUT_ERROR);
        }
      }

      await cleanup;
      if (!preserveInvitation) setPendingInvitationToken(null);
      if (authFailure) throw authFailure;
    },
    [applyDemoSession, clearLiveState],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: authMode === 'demo' ? !!user : authMode === 'supabase' && !!authIdentity,
      authMode,
      supabaseEnabled: isSupabaseConfigured,
      accountContext,
      accountStatus,
      authIdentity,
      pendingInvitationToken,
      signInAsTestUser,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      refreshAccountContext,
      savePendingInvitation: savePending,
      clearPendingInvitation: clearPending,
      setGlobalDisplayName,
      setOrganisationDisplayNameOverride,
      setProfileDisplayNames,
      switchOrganisation,
      createOrganisation,
      leaveOrganisation,
      applySessionAvatarUrl,
      applySessionProfile,
      applySessionDirectorySnapshot,
    }),
    [
      user,
      isLoading,
      authMode,
      accountContext,
      accountStatus,
      authIdentity,
      pendingInvitationToken,
      signInAsTestUser,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      refreshAccountContext,
      savePending,
      clearPending,
      setGlobalDisplayName,
      setOrganisationDisplayNameOverride,
      setProfileDisplayNames,
      switchOrganisation,
      createOrganisation,
      leaveOrganisation,
      applySessionAvatarUrl,
      applySessionProfile,
      applySessionDirectorySnapshot,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export function useRequiredUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error('This screen requires a signed-in organisation profile');
  return user;
}
