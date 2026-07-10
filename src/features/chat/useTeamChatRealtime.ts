/**
 * Realtime companion for the open team chat screen.
 *
 * While the screen is focused (and the session is a linked Supabase one),
 * this hook fetches the latest messages, subscribes to that team's
 * new-message inserts, and merges arrivals into app state without
 * duplicates. The database stays the source of truth: a fresh fetch runs on
 * focus, when the channel (re)connects, and when the app returns to the
 * foreground, so anything the socket missed is always caught up. The channel
 * is torn down on blur/leave, team switch, sign-out, and user switch.
 *
 * Demo/local chat never subscribes — the connection stays 'idle' and the
 * screen shows no realtime UI at all.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useAppData } from '../../lib/appData/AppDataContext';
import { subscribeToTeamChatMessages } from '../../lib/supabase/services/chat';
import { useOnAppForeground } from '../../utils/useAppForeground';

/** 'idle' = realtime not applicable (demo mode, no team, or screen blurred). */
export type TeamChatConnection =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

// Focus, foreground, and reconnect catch-ups can coincide (e.g. resuming the
// app both foregrounds it and re-joins the channel); collapse the burst into
// one fetch.
const REFETCH_THROTTLE_MS = 1000;

export function useTeamChatRealtime(teamId: string | undefined): TeamChatConnection {
  const { chatLive, applyLiveChatMessage, refreshChat } = useAppData();
  const [connection, setConnection] = useState<TeamChatConnection>('idle');
  // Mirrors `connection` for callbacks (avoids stale closures) and lets the
  // status handler see the previous state when deciding to catch up.
  const connectionRef = useRef<TeamChatConnection>('idle');
  const focusedRef = useRef(false);
  const lastFetchAtRef = useRef(0);

  const fetchLatest = useCallback(
    (options?: { force?: boolean }) => {
      const nowMs = Date.now();
      if (!options?.force && nowMs - lastFetchAtRef.current < REFETCH_THROTTLE_MS) return;
      lastFetchAtRef.current = nowMs;
      void refreshChat();
    },
    [refreshChat],
  );

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (!chatLive || !teamId) {
        connectionRef.current = 'idle';
        setConnection('idle');
        return () => {
          focusedRef.current = false;
        };
      }

      // Focus catch-up: show the latest messages without waiting for the
      // socket to join.
      fetchLatest();

      connectionRef.current = 'connecting';
      setConnection('connecting');
      const unsubscribe = subscribeToTeamChatMessages(teamId, {
        onMessage: applyLiveChatMessage,
        onResyncNeeded: () => fetchLatest({ force: true }),
        onStatus: (status) => {
          const previous = connectionRef.current;
          connectionRef.current = status;
          setConnection(status);
          // Realtime has no replay: whenever the channel lands in 'connected'
          // (first join or recovery from a drop), refetch to fill the window
          // the socket wasn't listening through.
          if (status === 'connected' && previous !== 'connected') {
            fetchLatest({ force: true });
          }
        },
      });

      return () => {
        focusedRef.current = false;
        unsubscribe();
        connectionRef.current = 'idle';
        setConnection('idle');
      };
    }, [chatLive, teamId, applyLiveChatMessage, fetchLatest]),
  );

  // Foreground catch-up: the OS freezes sockets in the background, so refetch
  // on return (the channel re-joins by itself and triggers its own catch-up).
  useOnAppForeground(
    useCallback(() => {
      if (focusedRef.current && chatLive && teamId) fetchLatest();
    }, [chatLive, teamId, fetchLatest]),
  );

  return connection;
}
