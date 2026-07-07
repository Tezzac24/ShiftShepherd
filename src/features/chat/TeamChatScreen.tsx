import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
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
import { EmptyState } from '../../components/EmptyState';
import { MessageBubble } from '../../components/MessageBubble';
import { Screen } from '../../components/Screen';
import { useAppData } from '../../lib/appData/AppDataContext';
import { messagesForTeam, userName } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canViewTeamChat } from '../../lib/permissions';

/** Simple WhatsApp-style team chat, backed by local state. */
export default function TeamChatScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const [draft, setDraft] = useState('');

  const team = data.teams.find((t) => t.id === teamId);

  // Opening the chat clears the simulated unread badge.
  useEffect(() => {
    if (team) data.markTeamChatRead(team.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id]);

  if (!team || !canViewTeamChat(user, team.id)) {
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

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    data.sendChatMessage(team.id, user.profile.id, body);
    setDraft('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
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

      {messages.length > 0 ? (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
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
            message="No messages yet. Start the conversation with your team."
          />
        </View>
      )}

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
          onChangeText={setDraft}
          multiline
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          onPress={handleSend}
          disabled={!draft.trim()}
          style={[styles.sendButton, !draft.trim() && { opacity: 0.4 }]}
        >
          <Ionicons name="send" size={22} color={colors.white} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  emptyWrap: { flex: 1, justifyContent: 'center' },
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
