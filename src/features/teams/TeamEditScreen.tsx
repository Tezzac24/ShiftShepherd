import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useConfirm } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth } from '../../lib/auth/AuthContext';
import { canManageTeamLifecycle } from '../../lib/permissions';
import { Team } from '../../types';
import { validateTeamForm } from './teamForm';
import { useTeamAvatar } from './useTeamAvatar';

function TeamPhotoEditor({ team }: { team: Team }) {
  const avatar = useTeamAvatar(team);
  if (!avatar.canManage) return null;
  return (
    <Card style={styles.photoCard}>
      <View style={styles.photoRow}>
        <Avatar name={team.name} uri={avatar.avatarUri} size={64} />
        <View style={styles.flexText}>
          <AppText variant="bodyBold">Team photo</AppText>
          <AppText variant="small" tone="secondary">
            This photo appears in active team lists and the team space.
          </AppText>
        </View>
      </View>
      <Button
        title={avatar.hasPhoto ? 'Change photo' : 'Add photo'}
        variant="secondary"
        icon="image-outline"
        loading={avatar.busy === 'uploading'}
        disabled={avatar.busy !== null}
        onPress={avatar.changePhoto}
      />
      {avatar.hasPhoto ? (
        <Button
          title="Remove photo"
          variant="ghost"
          loading={avatar.busy === 'removing'}
          disabled={avatar.busy !== null}
          onPress={avatar.removePhoto}
        />
      ) : null}
    </Card>
  );
}

export default function TeamEditScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const { user, authMode, accountStatus, isLoading } = useAuth();
  const data = useAppData();
  const team = data.teams.find((candidate) => candidate.id === teamId);
  const archivedTeam = data.archivedTeams.find((candidate) => candidate.id === teamId);
  const [loadedTeamId, setLoadedTeamId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof validateTeamForm>['errors']>(
    {},
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const archiveGuardRef = useRef(false);

  useEffect(() => {
    if (team && loadedTeamId !== team.id) {
      setLoadedTeamId(team.id);
      setName(team.name);
      setDescription(team.description);
      setFieldErrors({});
      setActionError(null);
    }
  }, [loadedTeamId, team]);

  const authorityResolved =
    !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  const allowed = !!user && authorityResolved && canManageTeamLifecycle(user);

  const save = async () => {
    if (!team || saving || archiving) return;
    const validated = validateTeamForm(name, description);
    setFieldErrors(validated.errors);
    if (!validated.value) return;
    setSaving(true);
    setActionError(null);
    try {
      await data.updateTeam({ teamId: team.id, ...validated.value });
      showToast('Team details updated.');
      router.back();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "We couldn't update this team right now. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!team || saving || archiving || confirmingArchive || archiveGuardRef.current) return;
    archiveGuardRef.current = true;
    setConfirmingArchive(true);
    try {
      const approved = await confirm({
        title: 'Archive this team?',
        message:
          'The team will be hidden from active team lists. Its members, chat, rota, songs, and history will be preserved, and a church admin can restore it later.',
        confirmLabel: 'Archive team',
      });
      setConfirmingArchive(false);
      if (!approved) return;
      setArchiving(true);
      setActionError(null);
      try {
        await data.archiveTeam(team.id);
        showToast(`${team.name} was archived.`);
        router.replace('/teams/archived');
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "We couldn't archive this team right now. Please try again.",
        );
      } finally {
        setArchiving(false);
      }
    } finally {
      setConfirmingArchive(false);
      archiveGuardRef.current = false;
    }
  };

  if (!authorityResolved) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Edit team' }} />
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
        <Stack.Screen options={{ title: 'Edit team' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="Only a church admin can edit or archive teams."
        />
      </Screen>
    );
  }

  if (archivedTeam) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Edit team' }} />
        <EmptyState
          icon="archive-outline"
          title="Team is archived"
          message="Restore this team before changing its details or photo."
        />
        <Button
          title="View archived teams"
          variant="secondary"
          onPress={() => router.replace('/teams/archived')}
        />
      </Screen>
    );
  }

  if (!team) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Edit team' }} />
        {data.teamsLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <AppText tone="secondary">Loading this team...</AppText>
          </View>
        ) : (
          <EmptyState
            icon={data.teamsError ? 'cloud-offline-outline' : 'people-outline'}
            title={data.teamsError ? "Couldn't load this team" : 'Team not found'}
            message={data.teamsError ?? 'This team may no longer be available.'}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: 'Edit team' }} />
      <View style={styles.heading}>
        <AppText variant="heading">Team details</AppText>
        <AppText tone="secondary">
          Update how this team appears across the church app.
        </AppText>
      </View>
      <TextField
        label="Team name"
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (fieldErrors.name) setFieldErrors((current) => ({ ...current, name: undefined }));
        }}
        error={fieldErrors.name}
        editable={!saving && !archiving}
      />
      <TextField
        label="Description (optional)"
        value={description}
        onChangeText={(value) => {
          setDescription(value);
          if (fieldErrors.description) {
            setFieldErrors((current) => ({ ...current, description: undefined }));
          }
        }}
        error={fieldErrors.description}
        editable={!saving && !archiving}
        multiline
      />
      <Button
        title="Save changes"
        icon="checkmark-circle-outline"
        loading={saving}
        disabled={saving || archiving}
        onPress={() => void save()}
      />

      <TeamPhotoEditor team={team} />

      <Card style={styles.archiveCard}>
        <View style={styles.heading}>
          <AppText variant="subheading">Archive team</AppText>
          <AppText tone="secondary">
            Hide this team from active areas while preserving all of its members and history.
          </AppText>
        </View>
        <Button
          title="Archive team"
          variant="destructive"
          icon="archive-outline"
          loading={archiving}
          disabled={saving || archiving || confirmingArchive}
          onPress={() => void archive()}
        />
      </Card>

      {actionError ? (
        <Card style={styles.errorCard}>
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle-outline" size={21} color={colors.danger} />
            <AppText tone="danger" style={styles.flexText} accessibilityLiveRegion="polite">
              {actionError}
            </AppText>
          </View>
        </Card>
      ) : null}

      <AppText variant="small" tone="muted" style={styles.footer}>
        Team roles are managed separately. Archiving never deletes team data.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  heading: { gap: spacing.xs },
  photoCard: { gap: spacing.md },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  archiveCard: { gap: spacing.md, marginTop: spacing.md },
  errorCard: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flexText: { flex: 1 },
  footer: { textAlign: 'center' },
});
