/**
 * Auth abstraction layer.
 *
 * The scaffold simulates login with mock test users. The context API is
 * deliberately shaped like a real auth provider (session user, sign-in,
 * sign-out) so Supabase Auth can be dropped in later without touching
 * screens.
 *
 * TODO: wire to Supabase Auth — replace the mock sign-in functions with
 * supabase.auth.signInWithPassword / signInWithOAuth / signInWithOtp and
 * derive SessionUser from the `profiles`, `organisation_roles`, and
 * `team_memberships` tables.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { SessionUser } from '../../types';
import { mockMemberships, mockOrganisationRoles, mockUsers } from '../mockData';

interface AuthContextValue {
  user: SessionUser | null;
  /** Demo-mode login: sign in directly as a mock test user. */
  signInAsTestUser: (userId: string) => void;
  /**
   * Mock email/password login. Any password works for a known mock email.
   * Returns an error message (plain English) on failure, or null on success.
   */
  signInWithEmail: (email: string, password: string) => string | null;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function buildSession(userId: string): SessionUser | null {
  const profile = mockUsers.find((u) => u.id === userId);
  if (!profile) return null;
  const orgRole =
    mockOrganisationRoles.find((r) => r.user_id === userId)?.role ?? 'general_member';
  const memberships = mockMemberships.filter((m) => m.user_id === userId);
  return { profile, orgRole, memberships };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);

  const signInAsTestUser = useCallback((userId: string) => {
    setUser(buildSession(userId));
  }, []);

  const signInWithEmail = useCallback((email: string, password: string): string | null => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      return 'Please enter your email and password.';
    }
    const profile = mockUsers.find((u) => u.email.toLowerCase() === trimmed);
    if (!profile) {
      return 'We couldn’t log you in. Please check your details and try again.';
    }
    setUser(buildSession(profile.id));
    return null;
  }, []);

  const signOut = useCallback(() => setUser(null), []);

  const value = useMemo(
    () => ({ user, signInAsTestUser, signInWithEmail, signOut }),
    [user, signInAsTestUser, signInWithEmail, signOut],
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
