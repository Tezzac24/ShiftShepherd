import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { CountBadge } from '../../components/Badge';
import { OrganisationHeader } from '../../components/OrganisationHeader';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageTeamLifecycle } from '../../lib/permissions';
import { useOnAppForeground } from '../../utils/useAppForeground';
import { chatConversations, conversationPreview, conversationTimestamp } from './chatPresentation';

export default function MessagesScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const data = useAppData();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  // List visits refresh previews and authoritative counts but never mark read.
  const focusedRef = useRef(false);
  const { chatLive, refreshChat, refreshUnreadSummary } = data;
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (chatLive) {
        void refreshChat();
        refreshUnreadSummary();
      }
      return () => { focusedRef.current = false; };
    }, [chatLive, refreshChat, refreshUnreadSummary]),
  );
  useOnAppForeground(
    useCallback(() => {
      if (focusedRef.current && chatLive) {
        void refreshChat();
        refreshUnreadSummary();
      }
    }, [chatLive, refreshChat, refreshUnreadSummary]),
  );

  const conversations = chatConversations(user, data.teams, data.chatMessages);
  const query = search.trim().toLocaleLowerCase();
  const filtered = conversations.filter(({ team }) => team.name.toLocaleLowerCase().includes(query));
  const showSearch = conversations.length > 5 || search.length > 0;
  const showLoading = data.teamsLoading && conversations.length === 0;
  const canManageTeams = canManageTeamLifecycle(user);

  return (
    <Screen safeTop scroll={false}>
      <FlatList
        data={filtered}
        keyExtractor={({ team }) => team.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl * 2 + insets.bottom }]}
        ListHeaderComponent={<View style={styles.header}>
          <OrganisationHeader />
          <PageHeading title="Messages" description="Keep in touch with your teams." />
          {showSearch ? <TextField label="Search conversations" value={search} onChangeText={setSearch}
            placeholder="Team name" autoCapitalize="none" returnKeyType="search" /> : null}
          {data.teamsError ? <StatePanel compact kind="error" title="Couldn't load your teams"
            message={data.teamsError} action={{ label: 'Retry teams', onPress: () => void data.refreshTeams() }} /> : null}
          {chatLive && data.chatError && conversations.length > 0 ? <StatePanel compact kind="error"
            title="Couldn't refresh messages" message="Message previews may be out of date. Your conversations are still here."
            action={{ label: 'Retry messages', onPress: () => void refreshChat() }} /> : null}
          {query ? <AppText variant="small" tone="secondary" accessibilityLiveRegion="polite">
            {filtered.length} of {conversations.length} conversations
          </AppText> : null}
        </View>}
        renderItem={({ item: { team, lastMessage } }) => {
          const unread = data.unreadByTeam[team.id] ?? 0;
          const preview = lastMessage ? conversationPreview(lastMessage, data.users, user.profile.id)
            : data.chatLoading ? 'Loading messages…' : data.chatError ? 'Messages unavailable' : 'No messages yet';
          const timestamp = lastMessage ? conversationTimestamp(lastMessage.created_at) : null;
          return <Pressable accessibilityRole="button"
            accessibilityLabel={`${team.name}${unread ? `, ${unread} unread ${unread === 1 ? 'message' : 'messages'}` : ''}. ${preview}${timestamp ? `. ${timestamp}` : ''}`}
            accessibilityHint="Opens the team conversation"
            onPress={() => router.push({ pathname: '/teams/[teamId]/chat', params: { teamId: team.id } })}
            style={({ pressed }) => [styles.conversation, pressed && styles.pressed]}>
            <Avatar name={team.name} uri={data.getTeamAvatarUri(team)} size={48} decorative />
            <View style={styles.copy}>
              <AppText variant="subheading">{team.name}</AppText>
              <AppText tone="secondary" numberOfLines={2}>{preview}</AppText>
              {timestamp ? <AppText variant="small" tone="muted">{timestamp}</AppText> : null}
            </View>
            {unread > 0 ? <View style={styles.unread} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
              <CountBadge count={unread} />
            </View> : null}
          </Pressable>;
        }}
        ListEmptyComponent={showLoading ? <StatePanel kind="loading" title="Loading your teams…"/>
          : data.teamsError ? null : query ? <StatePanel title="No matching conversations" message="Try a different team name." />
            : <StatePanel icon="chatbubbles-outline" title="No team chats yet"
              message={canManageTeams
                ? data.archivedTeams.length > 0 ? 'Create a team or restore an archived team in Teams.'
                  : 'Create a team in Teams to start a conversation.'
                : 'Ask a team admin or church admin to add you to a team.'}
              action={canManageTeams ? { label: 'Open Teams', onPress: () => router.push('/(tabs)/teams') } : undefined} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.gutter },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  conversation: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
  unread: { alignSelf: 'center' },
  pressed: { backgroundColor: colors.primarySoft },
});
