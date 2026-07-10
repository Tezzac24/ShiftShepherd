import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, touchTarget, type } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { MessageBubble } from '../../components/MessageBubble';
import { Screen } from '../../components/Screen';
import { useAppData } from '../../lib/appData/AppDataContext';
import { messagesForTeam, userName } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canViewTeamChat } from '../../lib/permissions';
import { useTeamChatRealtime } from './useTeamChatRealtime';

/**
 * Simple WhatsApp-style team chat. Live Supabase messages for linked Supabase
 * sessions, local demo data otherwise. In live mode the open chat streams new
 * messages over Supabase Realtime (see useTeamChatRealtime) and refetches on
 * focus/foreground/reconnect; the manual "check for new messages" bar only
 * appears as a fallback while realtime is unhealthy. Demo chat is unchanged.
 */
export default function TeamChatScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  // Whether the reader is at (or near) the newest message — arrivals only
  // auto-scroll then, so realtime can't yank someone reading older messages.
  const nearBottomRef = useRef(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const team = data.teams.find((t) => t.id === teamId);
  const teamKey = team?.id;
  const chatLive = data.chatLive;
  const canView = !!team && canViewTeamChat(user, team.id);

  // Live mode: while this screen is focused, stream this team's new messages
  // and catch up from the database on focus/foreground/reconnect. Demo mode
  // stays 'idle' — no realtime UI at all.
  const connection = useTeamChatRealtime(canView ? teamKey : undefined);

  // A briefly-connecting socket shouldn't flash UI at people; only mention it
  // when connecting drags on.
  const [showConnecting, setShowConnecting] = useState(false);
  useEffect(() => {
    if (connection !== 'connecting') {
      setShowConnecting(false);
      return;
    }
    const timer = setTimeout(() => setShowConnecting(true), 1200);
    return () => clearTimeout(timer);
  }, [connection]);

  // Opening the chat clears the simulated unread badge (demo mode only —
  // live refreshes are handled by useTeamChatRealtime).
  const markTeamChatRead = data.markTeamChatRead;
  useEffect(() => {
    if (teamKey) markTeamChatRead(teamKey);
  }, [teamKey, markTeamChatRead]);

  if (!team || !canView) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Chat' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="You do not have permission to view this chat."
        />
      </Screen>
    );
  }

  const messages = messagesForTeam(team.id, data.chatMessages);
  const showLoading = chatLive && data.chatLoading && messages.length === 0;
  const showLoadError = chatLive && !!data.chatError && messages.length === 0 && !data.chatLoading;

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await data.sendChatMessage(team.id, user.profile.id, body);
      setDraft('');
      // Senders always jump to their own message, wherever they'd scrolled.
      nearBottomRef.current = true;
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (error) {
      // The draft stays in the box so nothing is lost — fix and try again.
      setSendError(
        error instanceof Error
          ? error.message
          : "We couldn't send that. Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  };

  const handleAttachment = () => {
    const message =
      'Attachments are coming soon. In the full app you will be able to share photos and files here.';
    if (Platform.OS === 'web') {
      alert(message);
    } else {
      Alert.alert('Coming soon', message);
    }
  };

  return (
    <Screen scroll={false} keyboard>
      <Stack.Screen options={{ title: `${team.name} Chat` }} />

      {chatLive && !showLoading && !showLoadError ? (
        connection === 'reconnecting' || connection === 'disconnected' ? (
          // Realtime is unhealthy — fall back to an obvious, labelled manual
          // check until the channel recovers (it retries by itself).
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Check for new messages"
            onPress={() => void data.refreshChat()}
            disabled={data.chatLoading}
            style={styles.statusBar}
          >
            {data.chatLoading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="refresh-outline" size={18} color={colors.accent} />
            )}
            <AppText variant="label" style={styles.statusBarAction}>
              {data.chatLoading
                ? 'Checking…'
                : connection === 'reconnecting'
                  ? 'Connection is slow. Tap to check for new messages.'
                  : 'Live updates are paused. Tap to check for new messages.'}
            </AppText>
          </Pressable>
        ) : connection === 'connecting' && showConnecting ? (
          <View style={styles.statusBar}>
            <ActivityIndicator size="small" color={colors.textMuted} />
            <AppText variant="label" tone="muted">
              Connecting…
            </AppText>
          </View>
        ) : null
      ) : null}

      {showLoading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Loading messages…</AppText>
        </View>
      ) : showLoadError ? (
        <View style={styles.centerWrap}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn’t load messages"
            message={data.chatError ?? ''}
          />
          <Button
            title="Try Again"
            variant="secondary"
            icon="refresh-outline"
            onPress={() => void data.refreshChat()}
          />
        </View>
      ) : messages.length > 0 ? (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
            nearBottomRef.current =
              contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            // Keep readers pinned to the newest message unless they've
            // deliberately scrolled up into history.
            if (nearBottomRef.current) listRef.current?.scrollToEnd({ animated: false });
          }}
          renderItem={({ item }) => (
            <MessageBubble
              body={item.body}
              senderName={userName(data.users, item.sender_id)}
              createdAt={item.created_at}
              isMine={item.sender_id === user.profile.id}
            />
          )}
        />
      ) : (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="chatbubbles-outline"
            title="No messages yet"
            message="Send the first message to your team."
          />
        </View>
      )}

      {sendError ? (
        <View style={styles.sendErrorBar}>
          <Ionicons name="alert-circle" size={20} color={colors.danger} />
          <AppText variant="small" style={styles.sendErrorText}>
            {sendError}
          </AppText>
        </View>
      ) : null}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add attachment (coming soon)"
          onPress={handleAttachment}
          style={styles.attachButton}
        >
          <Ionicons name="add-circle-outline" size={28} color={colors.primary} />
        </Pressable>
        <TextInput
          accessibilityLabel="Message"
          placeholder="Type a message…"
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            if (sendError) setSendError(null);
          }}
          multiline
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sending ? 'Sending message' : 'Send message'}
          onPress={() => void handleSend()}
          disabled={!draft.trim() || sending}
          style={[styles.sendButton, (!draft.trim() || sending) && { opacity: 0.4 }]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="send" size={22} color={colors.white} />
          )}
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  centerWrap: { flex: 1, justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  statusBar: {
    minHeight: touchTarget - 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusBarAction: { color: colors.accent, flexShrink: 1, textAlign: 'center' },
  sendErrorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dangerSoft,
  },
  sendErrorText: { color: colors.danger, flex: 1 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attachButton: {
    height: touchTarget - 6,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  input: {
    flex: 1,
    minHeight: touchTarget - 6,
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    fontSize: type.body.fontSize,
    backgroundColor: colors.background,
  },
  sendButton: {
    width: touchTarget - 6,
    height: touchTarget - 6,
    borderRadius: (touchTarget - 6) / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
