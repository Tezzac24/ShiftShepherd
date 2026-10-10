import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, TextInput, TextInputProps, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing, touchTarget, type, type ThemeColors } from '../../../constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { ChatAttachmentImage } from '../../components/ChatAttachmentImage';
import { MessageBubble } from '../../components/MessageBubble';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { useAppData } from '../../lib/appData/AppDataContext';
import { userName } from '../../lib/appData/selectors';
import { useAuth } from '../../lib/auth/AuthContext';
import { canViewTeamChat } from '../../lib/permissions';
import { SessionUser } from '../../types';
import { useCurrentTime } from '../../utils/useCurrentTime';
import { chatTimeline } from './chatPresentation';
import { useChatImageDraft } from './useChatImageDraft';
import { useTeamChatRealtime } from './useTeamChatRealtime';

export default function TeamChatScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { user, authMode, accountStatus, isLoading } = useAuth();
  const router = useRouter();
  const authorityResolved = !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  if (!user) return <Screen>
    <Stack.Screen options={{ title: 'Team chat' }} />
    <StatePanel headingLevel={1} title="Chat unavailable" message="Choose your church to open a team conversation."
      action={{ label: 'Continue', onPress: () => router.replace('/') }} />
  </Screen>;

  // Only a real identity/team change discards a draft. Readiness and shared
  // directory refreshes must not remount the image hook or composer state.
  return <TeamChatContent key={`${authMode}:${user.profile.organisation_id}:${user.profile.id}:${teamId}`}
    teamId={teamId} user={user} authorityResolved={authorityResolved} accountError={accountStatus === 'error'} />;
}

function TeamChatContent({ teamId, user, authorityResolved, accountError }: {
  teamId: string; user: SessionUser; authorityResolved: boolean; accountError: boolean;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const data = useAppData();
  const now = useCurrentTime();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const listRef = useRef<FlatList>(null);
  const nearBottomRef = useRef(true);
  const keepBottomIfNear = useCallback(() => {
    if (nearBottomRef.current) listRef.current?.scrollToEnd({ animated: false });
  }, []);
  const mountedRef = useRef(true);
  const requestPending = useRef(false);
  const ownSendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState('');
  const [inputHeight, setInputHeight] = useState(touchTarget);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const { pendingImage, picking, pickImage, removeImage } = useChatImageDraft();
  const inputPadding = spacing.md * 2 + 3;
  const minimumInputHeight = Math.max(touchTarget, type.body.lineHeight * fontScale + inputPadding);
  const maximumInputHeight = type.body.lineHeight * fontScale * 5 + inputPadding;
  const measureInput = useCallback<NonNullable<TextInputProps['onContentSizeChange']>>(({ nativeEvent }) => {
    // Native content measurements include padding; add only the input border.
    setInputHeight(nativeEvent.contentSize.height + 3);
  }, []);

  const candidate = data.teams.find((item) => item.id === teamId && item.organisation_id === user.profile.organisation_id);
  const archived = candidate?.archived_at != null || data.archivedTeams.some((item) =>
    item.id === teamId && item.organisation_id === user.profile.organisation_id);
  const team = candidate?.archived_at === null && !archived ? candidate : undefined;
  const canView = authorityResolved && !!team && canViewTeamChat(user, team.id);
  const canViewRef = useRef(canView);
  canViewRef.current = canView;
  const teamKey = canView ? team?.id : undefined;
  const chatLive = data.chatLive;
  const timeline = chatTimeline(teamId, user.profile.organisation_id, data.chatMessages, now);
  const lastVisibleMessageId = timeline[timeline.length - 1]?.message.id ?? null;

  // The existing hook owns focused registration and foreground/reconnect
  // catch-up. Missing, archived and inaccessible routes never activate it.
  const connection = useTeamChatRealtime(teamKey);
  const [showConnecting, setShowConnecting] = useState(false);
  useEffect(() => {
    if (connection !== 'connecting') {
      setShowConnecting(false);
      return;
    }
    const timer = setTimeout(() => setShowConnecting(true), 1200);
    return () => clearTimeout(timer);
  }, [connection]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (ownSendTimer.current) clearTimeout(ownSendTimer.current);
    };
  }, []);

  // Preserve the established forward-only cursor behavior: focus and the
  // newest loaded message mark only this team, even when reading history.
  const markTeamChatRead = data.markTeamChatRead;
  const focusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (teamKey) markTeamChatRead(teamKey);
      return () => { focusedRef.current = false; };
    }, [teamKey, markTeamChatRead]),
  );
  useEffect(() => {
    if (focusedRef.current && teamKey) markTeamChatRead(teamKey);
  }, [teamKey, lastVisibleMessageId, markTeamChatRead]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!mountedRef.current || !canViewRef.current || !team || requestPending.current || picking || (!body && !pendingImage)) return;
    requestPending.current = true;
    setSending(true);
    setSendError(null);
    try {
      await data.sendChatMessage(team.id, user.profile.id, body, pendingImage?.file);
      if (!mountedRef.current) return;
      setDraft('');
      removeImage();
      nearBottomRef.current = true;
      ownSendTimer.current = setTimeout(() => {
        if (mountedRef.current && canViewRef.current) listRef.current?.scrollToEnd({ animated: false });
      }, 50);
    } catch (error) {
      if (mountedRef.current) setSendError(error instanceof Error
        ? error.message : "Check your connection and try again.");
    } finally {
      requestPending.current = false;
      if (mountedRef.current) setSending(false);
    }
  };

  const back = { label: 'Back to messages', onPress: () => router.replace('/(tabs)/messages') };
  if (!authorityResolved || !canView || !team) {
    return <Screen>
      <Stack.Screen options={{ title: 'Team chat' }} />
      {!authorityResolved ? <StatePanel headingLevel={1} kind={accountError ? 'error' : 'loading'}
        title={accountError ? "Couldn't check chat access" : 'Checking chat access…'}
        message={accountError ? 'Return to Messages and try again.' : undefined} />
        : archived ? <StatePanel headingLevel={1} title="Team is archived" icon="archive-outline"
          message="This conversation is unavailable while the team is archived." />
          : !team && data.teamsLoading ? <StatePanel headingLevel={1} kind="loading" title="Loading your team…" />
            : !team && data.teamsError ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this team"
              message={data.teamsError} action={{ label: 'Retry team', onPress: () => void data.refreshTeams() }} />
              : !team ? <StatePanel headingLevel={1} title="Team not found" message="This team is not available in your current church." />
                : <StatePanel headingLevel={1} title="No permission" icon="lock-closed-outline"
                  message="You do not have permission to view this chat." />}
      <Button title={back.label} variant="secondary" onPress={back.onPress} />
    </Screen>;
  }

  const showLoading = chatLive && data.chatLoading && timeline.length === 0;
  const showLoadError = chatLive && !!data.chatError && timeline.length === 0 && !data.chatLoading;
  const showHistoryError = chatLive && !!data.chatError && timeline.length > 0;
  const blocked = sending || picking;
  return (
    <Screen scroll={false} keyboard>
      <Stack.Screen options={{ title: 'Team chat' }} />
      <View style={styles.context}>
        <View style={styles.contextIdentity}>
          <Avatar name={team.name} uri={data.getTeamAvatarUri(team)} size={40} decorative />
          <AppText variant="subheading" headingLevel={1} style={styles.contextName}>{team.name}</AppText>
        </View>
        <Button title="View team" variant="ghost" accessibilityHint="Opens team members and tools"
          onPress={() => router.push({ pathname: '/teams/[teamId]', params: { teamId: team.id } })}
          style={styles.viewTeam} />
      </View>

      {chatLive && !showLoading && !showLoadError ? (
        showHistoryError || connection === 'reconnecting' || connection === 'disconnected' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={showHistoryError ? 'Retry messages' : 'Check for new messages'}
            accessibilityHint={showHistoryError ? 'Earlier messages are still shown' : undefined}
            accessibilityState={{ disabled: data.chatLoading, busy: data.chatLoading }}
            aria-disabled={data.chatLoading} aria-busy={data.chatLoading}
            onPress={() => void data.refreshChat()} disabled={data.chatLoading}
            style={({ pressed }) => [styles.statusBar, pressed && styles.pressed]}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
              {data.chatLoading ? <ActivityIndicator size="small" color={colors.primary} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
                : <Ionicons name="refresh-outline" size={22} color={colors.primary} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />}
            </View>
            <View style={styles.statusCopy}>
              <AppText variant={showHistoryError ? 'label' : 'small'} tone={showHistoryError ? 'danger' : 'secondary'}
                accessibilityRole={showHistoryError ? 'alert' : undefined}
                accessibilityLiveRegion={showHistoryError ? 'polite' : undefined}>
                {showHistoryError ? "Couldn't refresh messages"
                  : connection === 'reconnecting' ? 'Connection is slow.' : 'Live updates are paused.'}
              </AppText>
              {showHistoryError ? <AppText variant="small" tone="secondary">Earlier messages are still shown.</AppText> : null}
              <AppText variant="label" tone="primary">
                {data.chatLoading ? 'Checking…' : showHistoryError ? 'Retry messages' : 'Check for new messages'}
              </AppText>
            </View>
          </Pressable>
        ) : connection === 'connecting' && showConnecting ? (
          <View style={styles.statusBar} accessible accessibilityRole="progressbar"
            accessibilityLabel="Connecting to chat" accessibilityState={{ busy: true }} aria-busy>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
              <ActivityIndicator size="small" color={colors.textMuted} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
            </View>
            <AppText variant="small" tone="muted">Connecting…</AppText>
          </View>
        ) : null
      ) : null}

      <FlatList
        ref={listRef}
        data={timeline}
        keyExtractor={({ message }) => message.id}
        style={styles.flex}
        contentContainerStyle={[styles.list, timeline.length === 0 && styles.emptyList]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        ListEmptyComponent={showLoading ? <StatePanel kind="loading" title="Loading messages…" />
          : showLoadError ? <StatePanel kind="error" title="Couldn't load messages" message={data.chatError ?? undefined}
            action={{ label: 'Retry messages', onPress: () => void data.refreshChat() }} />
            : <StatePanel icon="chatbubbles-outline" title="No messages yet" message="Send the first message to your team." />}
        onScroll={({ nativeEvent }) => {
          const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
          nearBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
        }}
        scrollEventThrottle={100}
        onContentSizeChange={keepBottomIfNear}
        onLayout={keepBottomIfNear}
        renderItem={({ item: { message, dayLabel } }) => <View>
          {dayLabel ? <View style={styles.day}>
            <View style={styles.dayRule} />
            <AppText variant="small" tone="secondary" style={styles.dayLabel}>{dayLabel}</AppText>
            <View style={styles.dayRule} />
          </View> : null}
          <MessageBubble body={message.body} senderName={userName(data.users, message.sender_id)}
            createdAt={message.created_at} isMine={message.sender_id === user.profile.id}
            hasImage={!!message.attachment} imageUri={data.getChatAttachmentUri(message)} />
        </View>}
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        {sendError ? <View style={styles.sendError} accessibilityLiveRegion="polite">
          <AppText variant="label" tone="danger" accessibilityRole="alert">Couldn&apos;t send message</AppText>
          <AppText variant="small" tone="secondary">{sendError}</AppText>
          <AppText variant="small" tone="secondary">Your draft is still here. Tap Send to try again.</AppText>
        </View> : null}
        {pendingImage ? <View style={styles.pendingImageRow}>
          <ChatAttachmentImage uri={pendingImage.previewUri} width={96} height={72}
            accessibilityLabel="Selected chat photo preview" />
          <View style={styles.pendingImageActions}>
            <AppText variant="label">Photo ready to send</AppText>
            <Button title="Remove photo" variant="ghost" icon="close-circle-outline"
              accessibilityLabel="Remove selected photo" disabled={blocked} onPress={removeImage} style={styles.removePhoto} />
          </View>
        </View> : null}
        <TextInput
          accessibilityLabel={pendingImage ? 'Message caption' : 'Message'}
          accessibilityState={{ disabled: sending }}
          aria-disabled={sending}
          placeholder={pendingImage ? 'Add a caption (optional)…' : 'Write a message…'}
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={(text) => { setDraft(text); if (sendError) setSendError(null); }}
          onContentSizeChange={measureInput}
          multiline
          editable={!sending}
          style={[styles.input, { height: draft ? Math.min(maximumInputHeight, Math.max(minimumInputHeight, inputHeight))
            : minimumInputHeight }]}
        />
        <View style={styles.actions}>
          {chatLive ? <Button title={pendingImage ? 'Change photo' : 'Add photo'} variant="ghost" icon="image-outline"
            accessibilityLabel={picking ? 'Opening photos' : pendingImage ? 'Change photo' : 'Add photo'}
            loading={picking} disabled={sending} onPress={() => void pickImage()} style={styles.photoAction} /> : null}
          <Button title="Send" accessibilityLabel={sending ? 'Sending message' : 'Send message'}
            loading={sending} disabled={picking || (!draft.trim() && !pendingImage)}
            onPress={() => void handleSend()} style={styles.sendButton} />
        </View>
      </View>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  context: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  contextIdentity: { flex: 1, flexBasis: 180, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  contextName: { flex: 1, minWidth: 0 },
  viewTeam: { marginLeft: 'auto', paddingHorizontal: spacing.sm, flexShrink: 1 },
  list: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.lg },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  day: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  dayRule: { flex: 1, height: 1, backgroundColor: colors.border },
  dayLabel: { flexShrink: 1, textAlign: 'center' },
  statusBar: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.gutter, paddingVertical: spacing.sm, backgroundColor: colors.surfaceRaised },
  statusCopy: { flex: 1, gap: spacing.xs },
  pressed: { backgroundColor: colors.primarySoft },
  composer: { gap: spacing.sm, paddingHorizontal: spacing.gutter, paddingTop: spacing.md,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  sendError: { gap: spacing.xs, padding: spacing.md, backgroundColor: colors.dangerSoft, borderRadius: radius.sm },
  pendingImageRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  pendingImageActions: { flex: 1, minWidth: 120, gap: spacing.xs },
  removePhoto: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  input: { minHeight: touchTarget, borderWidth: 1.5, borderColor: colors.borderStrong,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    color: colors.text, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight,
    textAlignVertical: 'top', backgroundColor: colors.background },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  photoAction: { flexShrink: 1, paddingHorizontal: spacing.sm },
  sendButton: { minWidth: 96, marginLeft: 'auto' },
});
