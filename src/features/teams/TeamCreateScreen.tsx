import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { eligibleInitialTeamAdmins } from '../../lib/appData/selectors';
import { useAuth } from '../../lib/auth/AuthContext';
import { canManageTeamLifecycle } from '../../lib/permissions';
import { TEAM_LIFECYCLE_CONFLICT_ERROR } from '../../lib/supabase/services/teams';
import { UserProfile } from '../../types';
import { newRequestId } from '../../utils/ids';
import { validateTeamForm } from './teamForm';
import { useTeamAvatarDraft } from './useTeamAvatarDraft';

function AdminOption({
  profile,
  selected,
  isCurrentUser,
  avatarUri,
  disabled,
  onPress,
}: {
  profile: UserProfile;
  selected: boolean;
  isCurrentUser: boolean;
  avatarUri?: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${profile.full_name}${isCurrentUser ? ', you' : ''}`}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && styles.optionPressed,
      ]}
    >
      <Avatar name={profile.full_name} uri={avatarUri} size={42} />
      <View style={styles.optionCopy}>
        <AppText variant="bodyBold">
          {profile.full_name}
          {isCurrentUser ? ' (You)' : ''}
        </AppText>
        <AppText variant="small" tone="secondary" numberOfLines={1}>
          {profile.email}
        </AppText>
      </View>
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={24}
        color={selected ? colors.primary : colors.textMuted}
      />
    </Pressable>
  );
}

export default function TeamCreateScreen() {
  const router = useRouter();
  const { user, authMode, accountStatus, isLoading } = useAuth();
  const data = useAppData();
  const showToast = useToast();
  const avatar = useTeamAvatarDraft();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [initialAdminProfileId, setInitialAdminProfileId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof validateTeamForm>['errors']>(
    {},
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdTeamId, setCreatedTeamId] = useState<string | null>(null);
  const [createdTeamName, setCreatedTeamName] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [retryingAvatar, setRetryingAvatar] = useState(false);
  const saveGuardRef = useRef(false);
  const avatarRetryGuardRef = useRef(false);
  // One request key per logical submission. Retrying the same draft after a
  // failure reuses it so the server can return the team it may already have
  // created; editing the draft, or a server conflict, starts a new request.
  const requestKeyRef = useRef<{ id: string; draft: string } | null>(null);

  const candidates = useMemo(
    () =>
      eligibleInitialTeamAdmins(
        user?.profile.organisation_id ?? '',
        data.users,
        memberQuery,
      ),
    [data.users, memberQuery, user?.profile.organisation_id],
  );
  const allCandidates = useMemo(
    () =>
      eligibleInitialTeamAdmins(
        user?.profile.organisation_id ?? '',
        data.users,
      ),
    [data.users, user?.profile.organisation_id],
  );

  const authorityResolved =
    !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  const allowed = !!user && authorityResolved && canManageTeamLifecycle(user);

  const goToTeam = (teamId: string) =>
    router.replace({ pathname: '/teams/[teamId]', params: { teamId } });

  const retryAvatar = async () => {
    if (
      !createdTeamId ||
      !avatar.draft ||
      retryingAvatar ||
      avatarRetryGuardRef.current
    ) {
      return;
    }
    avatarRetryGuardRef.current = true;
    setRetryingAvatar(true);
    setAvatarError(null);
    try {
      await data.setTeamAvatar(createdTeamId, avatar.draft.file);
      showToast('Team photo added.');
      goToTeam(createdTeamId);
    } catch (error) {
      setAvatarError(
        error instanceof Error
          ? error.message
          : "The team is ready, but we couldn't add its photo. Please try again.",
      );
    } finally {
      setRetryingAvatar(false);
      avatarRetryGuardRef.current = false;
    }
  };

  const save = async () => {
    if (!user || saving || createdTeamId || saveGuardRef.current) return;
    const validated = validateTeamForm(name, description);
    setFieldErrors(validated.errors);
    if (!validated.value) return;
    if (
      initialAdminProfileId &&
      !allCandidates.some((profile) => profile.id === initialAdminProfileId)
    ) {
      setActionError(
        'That person is no longer available. Choose someone else or create the team without an initial team admin.',
      );
      return;
    }

    saveGuardRef.current = true;
    setSaving(true);
    setActionError(null);
    try {
      const draftKey = JSON.stringify([
        validated.value.name,
        validated.value.description,
        initialAdminProfileId,
      ]);
      if (!requestKeyRef.current || requestKeyRef.current.draft !== draftKey) {
        requestKeyRef.current = { id: newRequestId(), draft: draftKey };
      }
      const result = await data.createTeam({
        ...validated.value,
        initialAdminProfileId,
        requestId: requestKeyRef.current.id,
      });
      // The database team is now canonical. Any photo work below is a separate
      // retryable step and must never call createTeam again.
      requestKeyRef.current = null;
      setCreatedTeamId(result.team.id);
      setCreatedTeamName(result.team.name);
      if (avatar.draft && data.teamsLive) {
        try {
          await data.setTeamAvatar(result.team.id, avatar.draft.file);
        } catch (error) {
          setAvatarError(
            error instanceof Error
              ? error.message
              : "The team is ready, but we couldn't add its photo. Please try again.",
          );
          return;
        }
      }
      showToast(`${result.team.name} was created.`);
      goToTeam(result.team.id);
    } catch (error) {
      saveGuardRef.current = false;
      // A conflict means the server created nothing for this key, or the key
      // is bound to different content; the next submission is a new request.
      // Every other failure (offline, timeout, unreadable response) may have
      // committed, so the same key must be replayed.
      if (error instanceof Error && error.message === TEAM_LIFECYCLE_CONFLICT_ERROR) {
        requestKeyRef.current = null;
      }
      setActionError(
        error instanceof Error
          ? error.message
          : "We couldn't create this team right now. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!authorityResolved) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'New team' }} />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Checking team permissions...</AppText>
        </View>
      </Screen>
    );
  }

  if (!allowed) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'New team' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="Only a church admin can create teams."
        />
      </Screen>
    );
  }

  if (data.teamsLive && data.teamsLoading && data.users.length === 0) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'New team' }} />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Loading your church directory...</AppText>
        </View>
      </Screen>
    );
  }

  if (data.teamsLive && data.teamsError && data.users.length === 0) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'New team' }} />
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load your church directory"
          message={data.teamsError}
        />
        <Button
          title="Try Again"
          variant="secondary"
          icon="refresh-outline"
          onPress={() => void data.refreshTeams()}
        />
      </Screen>
    );
  }

  if (createdTeamId && avatarError) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Team created' }} />
        <EmptyState
          icon="checkmark-circle-outline"
          title={`${createdTeamName ?? 'Your team'} is ready`}
          message="The team was created successfully. Only the photo still needs attention."
        />
        <Card style={styles.errorCard}>
          <AppText variant="bodyBold" tone="danger">
            {"Team photo wasn't added"}
          </AppText>
          <AppText tone="secondary" accessibilityLiveRegion="polite">
            {avatarError}
          </AppText>
        </Card>
        <Button
          title="Try photo again"
          icon="image-outline"
          loading={retryingAvatar}
          disabled={retryingAvatar || !avatar.draft}
          onPress={() => void retryAvatar()}
        />
        <Button
          title="Continue without photo"
          variant="secondary"
          disabled={retryingAvatar}
          onPress={() => goToTeam(createdTeamId)}
        />
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: 'New team' }} />
      <View style={styles.heading}>
        <AppText variant="heading">Create a team</AppText>
        <AppText tone="secondary">
          Start with the team details. Members, rotas, songs and chat can be added afterward.
        </AppText>
      </View>

      <TextField
        label="Team name"
        placeholder="e.g. Welcome Team"
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (fieldErrors.name) setFieldErrors((current) => ({ ...current, name: undefined }));
        }}
        error={fieldErrors.name}
        editable={!saving}
        returnKeyType="next"
      />
      <TextField
        label="Description (optional)"
        placeholder="What does this team do?"
        value={description}
        onChangeText={(value) => {
          setDescription(value);
          if (fieldErrors.description) {
            setFieldErrors((current) => ({ ...current, description: undefined }));
          }
        }}
        error={fieldErrors.description}
        editable={!saving}
        multiline
      />

      <View style={styles.sectionHeading}>
        <AppText variant="subheading">Initial team admin</AppText>
        <AppText variant="small" tone="secondary">
          Optional. You can create the team without a team admin and assign one later.
        </AppText>
      </View>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel="No initial team admin"
        accessibilityState={{ checked: initialAdminProfileId === null, disabled: saving }}
        disabled={saving}
        onPress={() => setInitialAdminProfileId(null)}
        style={({ pressed }) => [
          styles.option,
          initialAdminProfileId === null && styles.optionSelected,
          pressed && styles.optionPressed,
        ]}
      >
        <Ionicons name="person-outline" size={24} color={colors.textSecondary} />
        <View style={styles.optionCopy}>
          <AppText variant="bodyBold">No initial team admin</AppText>
          <AppText variant="small" tone="secondary">
            The creator will not be added automatically.
          </AppText>
        </View>
        <Ionicons
          name={initialAdminProfileId === null ? 'radio-button-on' : 'radio-button-off'}
          size={24}
          color={initialAdminProfileId === null ? colors.primary : colors.textMuted}
        />
      </Pressable>

      <TextField
        label="Search active members"
        placeholder="Name or email"
        value={memberQuery}
        onChangeText={setMemberQuery}
        editable={!saving}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      {candidates.length > 0 ? (
        candidates.map((profile) => (
          <AdminOption
            key={profile.id}
            profile={profile}
            selected={initialAdminProfileId === profile.id}
            isCurrentUser={profile.id === user.profile.id}
            avatarUri={data.getAvatarUri(profile)}
            disabled={saving}
            onPress={() => setInitialAdminProfileId(profile.id)}
          />
        ))
      ) : (
        <AppText variant="small" tone="muted">
          {memberQuery.trim()
            ? 'No active members match that search.'
            : 'No active linked members are available yet.'}
        </AppText>
      )}

      {data.teamsLive ? (
        <Card style={styles.avatarCard}>
          <View style={styles.avatarRow}>
            <Avatar name={name.trim() || 'New team'} uri={avatar.draft?.previewUri} size={64} />
            <View style={styles.optionCopy}>
              <AppText variant="bodyBold">Team photo (optional)</AppText>
              <AppText variant="small" tone="secondary">
                The team is created first, then its photo is uploaded securely.
              </AppText>
            </View>
          </View>
          <Button
            title={avatar.draft ? 'Change photo' : 'Choose photo'}
            variant="secondary"
            icon="image-outline"
            loading={avatar.picking}
            disabled={saving}
            onPress={() => void avatar.pick()}
          />
          {avatar.draft ? (
            <Button
              title="Remove selected photo"
              variant="ghost"
              disabled={saving}
              onPress={avatar.clear}
            />
          ) : null}
        </Card>
      ) : null}

      {actionError ? (
        <Card style={styles.errorCard}>
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={21} color={colors.danger} />
            <AppText tone="danger" style={styles.optionCopy} accessibilityLiveRegion="polite">
              {actionError}
            </AppText>
          </View>
        </Card>
      ) : null}

      <Button
        title="Create team"
        icon="add-circle-outline"
        loading={saving}
        disabled={saving}
        onPress={() => void save()}
        accessibilityHint="Creates the team before uploading any selected photo"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  heading: { gap: spacing.xs },
  sectionHeading: { gap: spacing.xs, marginTop: spacing.sm },
  option: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionPressed: { opacity: 0.75 },
  optionCopy: { flex: 1, minWidth: 0, gap: 2 },
  avatarCard: { gap: spacing.md },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  errorCard: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
});
