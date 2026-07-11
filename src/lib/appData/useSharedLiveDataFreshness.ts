import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { subscribeToSharedDataChanges } from '../supabase/services/sharedRealtime';
import {
  DomainInvalidationScheduler,
  SHARED_REFRESH_DOMAINS,
  SharedRefreshDomain,
  shouldCatchUpOnAppStateChange,
} from './liveInvalidation';

type SharedRefreshers = Record<SharedRefreshDomain, () => Promise<void>>;

export function useSharedLiveDataFreshness({
  enabled,
  profileId,
  refreshers,
}: {
  enabled: boolean;
  profileId: string | null;
  refreshers: SharedRefreshers;
}): (domains: Iterable<SharedRefreshDomain>) => void {
  const refreshersRef = useRef(refreshers);
  refreshersRef.current = refreshers;
  const schedulerRef = useRef<DomainInvalidationScheduler | null>(null);

  const invalidate = useCallback((domains: Iterable<SharedRefreshDomain>) => {
    schedulerRef.current?.invalidate(domains);
  }, []);

  useEffect(() => {
    if (!enabled || !profileId) {
      schedulerRef.current = null;
      return;
    }

    const scheduler = new DomainInvalidationScheduler(async (domain) => {
      // Effect cleanup disposes pending work. A request already in flight may
      // finish, so each AppData loader also checks its captured profile id
      // before applying a response.
      await refreshersRef.current[domain]();
    });
    schedulerRef.current = scheduler;

    const unsubscribeRealtime = subscribeToSharedDataChanges(profileId, {
      onInvalidate: (domains) => scheduler.invalidate(domains),
      onReconnect: () => scheduler.invalidate(SHARED_REFRESH_DOMAINS),
    });

    let previousAppState = AppState.currentState;
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (shouldCatchUpOnAppStateChange(previousAppState, next)) {
        scheduler.invalidate(SHARED_REFRESH_DOMAINS);
      }
      previousAppState = next;
    });

    return () => {
      appStateSubscription.remove();
      unsubscribeRealtime();
      scheduler.cleanup();
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
    };
  }, [enabled, profileId]);

  return invalidate;
}
