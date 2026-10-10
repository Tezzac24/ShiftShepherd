import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useGlobalSearchParams, usePathname } from 'expo-router';

import { useAuth } from '../../lib/auth/AuthContext';

type Request = {
  id: number;
  owner: string;
  kind: 'create' | 'switch';
  name: string;
  sourceProfileId: string | null;
  targetProfileId: string | null;
  reachedTarget: boolean;
  status: 'pending' | 'complete' | 'uncertain';
  checking: boolean;
  checked: boolean;
  checkFailed: boolean;
};

export interface AccountContinuationTicket { owner: string | null; generation: number; invitationGeneration: number }
interface AccountContinuationOptions {
  invitationToken?: string | null;
  acceptedProfileId?: string;
  afterSignOut?: boolean;
}

interface EntryPresentation {
  request: Request | null;
  create: (name: string) => void;
  switchTo: (profileId: string, name: string) => void;
  checkAccount: () => void;
  clear: () => void;
  captureAccountContinuation: () => AccountContinuationTicket;
  canContinueAccount: (ticket: AccountContinuationTicket, options?: AccountContinuationOptions) => boolean;
}

const EntryContext = createContext<EntryPresentation | null>(null);

/**
 * Transient presentation only. Auth's intentional setUser(null) remounts the
 * complete data subtree, so an in-flight church request must live above it.
 * No persistence, session repair, service calls or navigation belongs here.
 */
export function ChurchEntryPresentationProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const pathname = usePathname();
  const routeParams = useGlobalSearchParams<{ token?: string | string[] }>();
  const openedToken = Array.isArray(routeParams.token) ? routeParams.token[0] : routeParams.token;
  const owner = auth.authMode === 'supabase' && auth.isAuthenticated && auth.authIdentity
    ? `${auth.authMode}:${auth.authIdentity.id}` : null;
  const profileId = auth.user?.profile.id ?? null;
  const latest = useRef({ auth, owner, profileId, pathname });
  const invitationGeneration = useRef(0);
  if (auth.pendingInvitationToken && auth.pendingInvitationToken !== latest.current.auth.pendingInvitationToken) {
    invitationGeneration.current += 1;
  }
  latest.current = { auth, owner, profileId, pathname };
  useEffect(() => {
    // A newly opened link owns its explanation even when adoption and terminal
    // clearing batch into one Auth update. Clearing params does not increment.
    if (pathname === '/invite/accept' && openedToken !== undefined) invitationGeneration.current += 1;
  }, [pathname, openedToken]);
  // This live identity survives the profile-keyed subtree. No token/session is
  // retained here; callers supply their invitation hint when checking an exit.
  const continuationOwner = auth.authMode === 'demo' && auth.isAuthenticated && auth.user
    ? `demo:${auth.user.profile.id}` : owner;
  const continuation = useRef({ owner: continuationOwner, generation: 0 });
  if (continuation.current.owner !== continuationOwner) {
    continuation.current = { owner: continuationOwner, generation: continuation.current.generation + 1 };
  }
  const [request, setRequest] = useState<Request | null>(null);
  const owned = useRef<Request | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);

  const valid = (candidate: Request | null): candidate is Request => {
    if (!candidate || candidate.owner !== latest.current.owner) return false;
    const currentId = latest.current.profileId;
    if (!currentId) return true; // Expected teardown or a same-account readiness check.
    if (candidate.targetProfileId === currentId) return true;
    if (!candidate.reachedTarget && candidate.sourceProfileId === currentId) return true;
    // createOrganisation returns void: the first resolved profile is allowed
    // through the expected remount, never inferred from a church-name match.
    return candidate.kind === 'create' && !candidate.targetProfileId;
  };
  const publish = (next: Request | null) => { owned.current = next; setRequest(next); };
  const current = (id: number) => mounted.current && owned.current?.id === id && valid(owned.current);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; owned.current = null; }; }, []);
  useEffect(() => {
    const candidate = owned.current;
    if (!candidate) return;
    if (!valid(candidate)) { publish(null); return; }
    if (profileId && profileId !== candidate.sourceProfileId && !candidate.reachedTarget) {
      publish({ ...candidate, targetProfileId: profileId, reachedTarget: true });
    }
  // Account and actual profile transitions fence results; readiness alone does not.
  }, [owner, profileId]);

  const begin = (kind: Request['kind'], name: string, targetProfileId: string | null) => {
    const { auth: latestAuth, owner: accountOwner, profileId: sourceProfileId } = latest.current;
    if (!accountOwner || accountOwner !== owner || sourceProfileId !== profileId || (owned.current && valid(owned.current)
      && (owned.current.status === 'pending' || owned.current.checking))) return;
    const account = latestAuth.accountContext;
    if (latestAuth.accountStatus !== 'ready' || !account || account.account.auth_user_id !== latestAuth.authIdentity?.id) return;
    if (kind === 'create' && (sourceProfileId || account.organisations.length > 0
      || !account.account.global_display_name || !account.account.name_confirmed_at
      || !latestAuth.authIdentity?.emailVerified)) return;
    if (kind === 'switch' && !account.organisations.some((entry) => entry.profile.id === targetProfileId)) return;
    const id = ++sequence.current;
    publish({ id, owner: accountOwner, kind, name, sourceProfileId, targetProfileId, reachedTarget: false,
      status: 'pending', checking: false, checked: false, checkFailed: false });
    void (async () => {
      try {
        if (kind === 'create') await latestAuth.createOrganisation(name);
        else await latestAuth.switchOrganisation(targetProfileId!);
        if (current(id)) publish({ ...owned.current!, status: 'complete' });
      } catch {
        // Either the write or its following account read may have failed.
        if (current(id)) publish({ ...owned.current!, status: 'uncertain' });
      }
    })();
  };
  const checkAccount = () => {
    const candidate = owned.current;
    if (owner !== latest.current.owner || !candidate || !current(candidate.id) || candidate.status === 'pending' || candidate.checking) return;
    const id = candidate.id;
    publish({ ...candidate, checking: true, checked: false, checkFailed: false });
    void latest.current.auth.refreshAccountContext().then(() => {
      if (current(id)) publish({ ...owned.current!, checking: false, checked: true });
    }).catch(() => {
      if (current(id)) publish({ ...owned.current!, checking: false, checkFailed: true });
    });
  };

  const canContinueAccount = (ticket: AccountContinuationTicket, options?: AccountContinuationOptions) => {
    if (!mounted.current || !ticket.owner) return false;
    const currentAuth = latest.current.auth;
    if (options?.invitationToken && latest.current.pathname !== '/invite/accept') return false;
    // A newer pending link owns the routing hub and its form. An older screen
    // must not replace it, even after a same-account profile remount.
    if (options?.invitationToken && currentAuth.pendingInvitationToken
      && currentAuth.pendingInvitationToken !== options.invitationToken) return false;
    if (options?.invitationToken && invitationGeneration.current !== ticket.invitationGeneration) return false;
    if (options?.afterSignOut) return continuation.current.owner === null && !currentAuth.isAuthenticated
      && continuation.current.generation === ticket.generation + 1;
    return continuation.current.owner === ticket.owner && continuation.current.generation === ticket.generation
      && currentAuth.isAuthenticated && currentAuth.accountStatus === 'ready'
      && (!options?.acceptedProfileId || (currentAuth.user?.profile.id === options.acceptedProfileId
        && currentAuth.accountContext?.account.active_profile_id === options.acceptedProfileId));
  };

  return <EntryContext.Provider value={{
    request: valid(request) ? request : null,
    create: (name) => begin('create', name, null),
    switchTo: (target, name) => begin('switch', name, target),
    checkAccount,
    clear: () => { if (owner === latest.current.owner && request?.id === owned.current?.id) publish(null); },
    captureAccountContinuation: () => ({ ...continuation.current, invitationGeneration: invitationGeneration.current }),
    canContinueAccount,
  }}>{children}</EntryContext.Provider>;
}

export function useChurchEntryPresentation() {
  const value = useContext(EntryContext);
  if (!value) throw new Error('Church entry presentation requires its provider.');
  return value;
}
