import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { resolvedActiveOrganisation } from '../../components/OrganisationHeader';
import { useAuth } from '../../lib/auth/AuthContext';
import { canManageOrganisationMembers } from '../../lib/permissions';
import { SessionUser } from '../../types';

export interface AdministrationTicket { generation: number }

/** Presentation scope only. The existing Auth/provider and RPCs still own access. */
export function useOrganisationAdministration(user: SessionUser) {
  const auth = useAuth();
  const key = organisationAdministrationKey(user, auth.authMode, auth.authIdentity?.id);
  const permitted = auth.authMode === 'supabase' && canManageOrganisationMembers(user);
  const church = resolvedActiveOrganisation({ ...auth, user });
  const ready = permitted && !auth.isLoading && auth.accountStatus === 'ready' && !!church
    && auth.accountContext?.account.auth_user_id === auth.authIdentity?.id;
  const lifecycle = useRef({ key, permitted, ready, generation: 0, mounted: true, focused: true });
  if (lifecycle.current.key !== key || (lifecycle.current.permitted && !permitted)) {
    lifecycle.current.generation += 1;
  }
  Object.assign(lifecycle.current, { key, permitted, ready });

  useEffect(() => {
    const current = lifecycle.current;
    current.mounted = true;
    return () => { current.mounted = false; current.generation += 1; };
  }, []);
  useFocusEffect(useCallback(() => {
    lifecycle.current.focused = true;
    return () => { lifecycle.current.focused = false; lifecycle.current.generation += 1; };
  }, []));

  const capture = useCallback((): AdministrationTicket => ({ generation: lifecycle.current.generation }), []);
  const isCurrent = useCallback((ticket: AdministrationTicket) => {
    const current = lifecycle.current;
    return current.mounted && current.focused && current.permitted && ticket.generation === current.generation;
  }, []);
  const canAct = useCallback(() => {
    const current = lifecycle.current;
    return current.mounted && current.focused && current.ready;
  }, []);
  const close = useCallback(() => {
    lifecycle.current.focused = false;
    lifecycle.current.generation += 1;
  }, []);
  const isPresent = useCallback(() => lifecycle.current.mounted && lifecycle.current.focused, []);

  return { key, permitted, ready, churchName: church?.organisation.name, accountError: auth.accountStatus === 'error',
    retryAccount: auth.refreshAccountContext, capture, isCurrent, canAct, close, isPresent };
}

export function organisationAdministrationKey(user: SessionUser, mode: string | null, identityId?: string) {
  return `${mode}:${identityId ?? user.profile.auth_user_id}:${user.profile.id}:${user.profile.organisation_id}`;
}
