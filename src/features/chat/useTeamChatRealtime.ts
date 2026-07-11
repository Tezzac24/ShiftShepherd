/**
 * Active-conversation companion for the open team chat screen.
 *
 * Message delivery is owned by the single session-scoped chat channel in
 * AppDataContext (see useSessionChatMessaging), so this hook no longer opens
 * its own subscription. While the screen is focused it:
 *   - registers the team as the actively-viewed conversation, so an incoming
 *     message for it is marked read instead of counted as unread;
 *   - catches up from the database on focus and on app foreground (the session
 *     channel handles live arrivals and its own reconnect catch-up).
 * On blur/leave/team-switch it unregisters the active conversation.
 *
 * The returned status mirrors the session channel's health for the screen's
 * connection UI. Demo/local chat stays 'idle' — no realtime UI at all.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { useAppData } from '../../lib/appData/AppDataContext';
import { useOnAppForeground } from '../../utils/useAppForeground';

export type TeamChatConnection =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export function useTeamChatRealtime(teamId: string | undefined): TeamChatConnection {
  const {
    chatLive,
    refreshChat,
    registerActiveTeamChat,
    unregisterActiveTeamChat,
    chatRealtimeStatus,
  } = useAppData();
  const focusedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (!chatLive || !teamId) {
        return () => {
          focusedRef.current = false;
        };
      }

      // Mark this conversation active before catching up, so a message that
      // arrives during the fetch is treated as read, not unread.
      registerActiveTeamChat(teamId);
      // Focus catch-up: show the latest messages (and any attachments) without
      // waiting on the socket.
      void refreshChat();

      return () => {
        focusedRef.current = false;
        unregisterActiveTeamChat(teamId);
      };
    }, [chatLive, teamId, refreshChat, registerActiveTeamChat, unregisterActiveTeamChat]),
  );

  // Foreground catch-up: the OS freezes sockets in the background, so refetch on
  // return while this chat is the focused screen.
  useOnAppForeground(
    useCallback(() => {
      if (focusedRef.current && chatLive && teamId) void refreshChat();
    }, [chatLive, teamId, refreshChat]),
  );

  if (!chatLive || !teamId) return 'idle';
  return chatRealtimeStatus === 'idle' ? 'connecting' : chatRealtimeStatus;
}
