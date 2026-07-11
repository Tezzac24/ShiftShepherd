/**
 * One session-scoped chat messaging lifecycle for a linked live profile.
 *
 * Owns the single chat Realtime channel (accessible message INSERTs + the
 * caller's own read-state changes), the coalescing unread-summary
 * reconciliation scheduler, and the app-foreground catch-up. It exists only
 * while an authenticated live session with a linked profile is present; it is
 * never created in demo mode, while logged out, or without a linked profile,
 * and it is fully torn down on logout/account switch so no stale callback,
 * timer, or channel survives into the next session.
 *
 * Reconciliation runs on: session start, channel subscribe, genuine reconnect,
 * app foreground, a read-state event (this or another device), and any
 * explicit refresh — always coalesced to one in-flight request with at most one
 * queued follow-up.
 */
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { ChatMessage } from '../../types';
import {
  ChatRealtimeStatus,
  SessionChatHandlers,
  subscribeToSessionChatMessages,
} from '../supabase/services/chat';
import { shouldCatchUpOnAppStateChange } from './liveInvalidation';
import { SingleFlightScheduler } from './singleFlightScheduler';

export interface SessionChatMessagingParams {
  enabled: boolean;
  profileId: string | null;
  /** A complete accessible message arrived on the session channel. */
  onIncomingMessage: (message: ChatMessage) => void;
  /** Fetch the authoritative unread summary and apply it (the scheduler's run). */
  reconcile: () => Promise<void>;
  /** Channel health, for the open chat's status UI. */
  onStatus?: (status: ChatRealtimeStatus) => void;
}

export interface SessionChatMessaging {
  /** Ask for a coalesced authoritative unread reconciliation. */
  reconcileNow: () => void;
}

export function useSessionChatMessaging(
  params: SessionChatMessagingParams,
): SessionChatMessaging {
  const { enabled, profileId } = params;
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const schedulerRef = useRef<SingleFlightScheduler | null>(null);

  const reconcileNow = useCallback(() => {
    schedulerRef.current?.schedule();
  }, []);

  useEffect(() => {
    if (!enabled || !profileId) {
      schedulerRef.current = null;
      return;
    }

    const scheduler = new SingleFlightScheduler(async () => {
      // Effect cleanup disposes pending work; the reconcile loader also checks
      // its captured profile id before applying a response, so a late request
      // can never update a newer account.
      await paramsRef.current.reconcile();
    });
    schedulerRef.current = scheduler;

    const handlers: SessionChatHandlers = {
      onMessage: (message) => paramsRef.current.onIncomingMessage(message),
      onReadStateChanged: () => scheduler.schedule(),
      onReconnect: () => scheduler.schedule(),
      onStatus: (status) => paramsRef.current.onStatus?.(status),
    };
    const unsubscribe = subscribeToSessionChatMessages(profileId, handlers);

    let previousAppState = AppState.currentState;
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (shouldCatchUpOnAppStateChange(previousAppState, next)) {
        scheduler.schedule();
      }
      previousAppState = next;
    });

    // Authoritative initial load for this session (deduped with the channel's
    // own subscribe-time reconcile by the scheduler's coalescing).
    scheduler.schedule();

    return () => {
      appStateSubscription.remove();
      unsubscribe();
      scheduler.cleanup();
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
    };
  }, [enabled, profileId]);

  return { reconcileNow };
}
