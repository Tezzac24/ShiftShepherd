import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { spacing, type ThemeColors } from '../../../constants/theme';
import { useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useConfirm } from '../../components/ConfirmDialog';
import { FormErrorSummary } from '../../components/FormErrorSummary';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useDiscardChanges } from '../../components/useDiscardChanges';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth } from '../../lib/auth/AuthContext';
import { canManageTeamLifecycle } from '../../lib/permissions';
import { Team } from '../../types';
import { TeamFormErrors, validateTeamForm } from './teamForm';
import { useTeamAvatar } from './useTeamAvatar';

function TeamPhotoEditor({ team, disabled }: { team: Team; disabled: boolean }) {
  const styles = useThemedStyles(createStyles);
  const avatar = useTeamAvatar(team);
  if (!avatar.canManage) return null;
  return <View style={styles.section}>
    <SectionHeader title="Team photo" />
    <AppText variant="small" tone="secondary">Photo changes are saved when you make them.</AppText>
    <Card>
      <View style={styles.photoRow}>
        <Avatar name={team.name} uri={avatar.avatarUri} size={56} />
        <AppText tone="secondary" style={styles.flexText}>Help people recognise this team.</AppText>
      </View>
      <Button title={avatar.hasPhoto ? 'Change photo' : 'Add photo'} variant="secondary" icon="image-outline"
        loading={avatar.busy === 'uploading'} disabled={disabled || avatar.busy !== null} onPress={avatar.changePhoto} />
      {avatar.hasPhoto ? <Button title="Remove photo" variant="destructive" loading={avatar.busy === 'removing'}
        disabled={disabled || avatar.busy !== null} onPress={avatar.removePhoto} /> : null}
    </Card>
  </View>;
}

export default function TeamEditScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { user, authMode, accountStatus, isLoading } = useAuth();
  const router = useRouter();
  const authorityResolved = !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  if (!user || !canManageTeamLifecycle(user)) return <Screen>
    <Stack.Screen options={{ title: 'Edit team' }} />
    <StatePanel headingLevel={1} kind={authorityResolved ? 'empty' : 'loading'} icon="lock-closed-outline"
      title={authorityResolved ? 'No permission' : 'Checking team permissions...'}
      message={authorityResolved ? 'Only a church admin can edit or archive teams.' : undefined} />
    <Button title="Back to teams" variant="secondary" onPress={() => router.replace('/(tabs)/teams')} />
  </Screen>;
  return <TeamEditContent key={`${authMode}:${user.profile.organisation_id}:${user.profile.id}:${teamId}`}
    teamId={teamId} organisationId={user.profile.organisation_id} authorityResolved={authorityResolved} />;
}

function TeamEditContent({ teamId, organisationId, authorityResolved }: { teamId: string; organisationId: string; authorityResolved: boolean }) {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const data = useAppData();
  const candidate = data.teams.find((item) => item.id === teamId && item.organisation_id === organisationId);
  const archived = candidate?.archived_at != null || data.archivedTeams.some((item) => item.id === teamId && item.organisation_id === organisationId);
  const team = candidate?.archived_at === null ? candidate : undefined;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [initialDetails, setInitialDetails] = useState<{ name: string; description: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<TeamFormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [completedAction, setCompletedAction] = useState<'save' | 'archive' | null>(null);
  const hydrated = useRef(false);
  const active = useRef(true);
  const requestPending = useRef(false);
  const navigated = useRef(false);
  const authority = useRef(authorityResolved);
  authority.current = authorityResolved;
  const currentTeam = useRef(team);
  currentTeam.current = team;
  const scrollRef = useRef<ScrollView>(null);
  const nameRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const archiveRef = useRef<View>(null);
  const positions = useRef({ name: 0, description: 0, archive: 0 });

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    // Hydrate when this scope's team arrives; a refresh must not overwrite a draft.
    if (!team || hydrated.current) return;
    hydrated.current = true;
    setInitialDetails({ name: team.name, description: team.description });
    setName(team.name);
    setDescription(team.description);
  }, [team]);

  const focusField = (field: keyof TeamFormErrors) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, positions.current[field] - spacing.md), animated: false });
    (field === 'name' ? nameRef : descriptionRef).current?.focus();
  };
  useEffect(() => {
    if (!saveError && !archiveError) return;
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: archiveError ? Math.max(0, positions.current.archive - spacing.md) : 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [saveError, archiveError]);

  const goBack = () => router.canGoBack() ? router.back() : router.replace({ pathname: '/teams/[teamId]', params: { teamId } });
  const { requestExit, exitRef, headerLeft } = useDiscardChanges({
    hasChanges: initialDetails !== null && (name !== initialDetails.name || description !== initialDetails.description),
    blocked: saving || confirmingArchive || archiving, saved: completedAction !== null, uncertain: saveError !== null, onDiscard: goBack,
    message: 'Your team name and description changes will not be saved.',
  });
  useEffect(() => {
    if (!authorityResolved || !completedAction || navigated.current || (completedAction === 'save' && !team)) return;
    navigated.current = true;
    if (completedAction === 'archive') {
      showToast('Team archived.');
      router.replace('/teams/archived');
    } else {
      showToast('Team details updated.');
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/teams/[teamId]', params: { teamId } });
    }
  }, [authorityResolved, completedAction, team, teamId, router, showToast]);

  const save = async () => {
    if (!authority.current || !team || requestPending.current || completedAction) return;
    const validated = validateTeamForm(name, description);
    setFieldErrors(validated.errors);
    setSaveError(null);
    if (!validated.value) {
      requestAnimationFrame(() => { if (active.current) focusField(validated.errors.name ? 'name' : 'description'); });
      return;
    }
    requestPending.current = true;
    setSaving(true);
    try {
      await data.updateTeam({ teamId: team.id, ...validated.value });
      if (active.current) setCompletedAction('save');
    } catch (error) {
      if (active.current) setSaveError(error instanceof Error ? error.message : "We couldn't update this team right now. Please try again.");
    } finally {
      requestPending.current = false;
      if (active.current) setSaving(false);
    }
  };

  const archive = async () => {
    if (!authority.current || !team || requestPending.current || completedAction) return;
    requestPending.current = true;
    setConfirmingArchive(true);
    try {
      const dirty = name.trim() !== team.name || description.trim() !== team.description;
      const approved = await confirm({
        title: `Archive ${team.name}?`,
        message: `This team will be hidden from active team areas. Its members, chat, rota, songs and history will be preserved. A church admin can restore it later.${dirty ? ' Unsaved name or description changes will not be saved.' : ''}`,
        confirmLabel: 'Archive team', destructive: true, returnFocusRef: archiveRef,
      });
      if (!approved || !active.current || !authority.current || !currentTeam.current) return;
      setConfirmingArchive(false);
      setArchiving(true);
      setArchiveError(null);
      await data.archiveTeam(team.id);
      if (active.current) setCompletedAction('archive');
    } catch (error) {
      if (active.current) setArchiveError(error instanceof Error ? error.message : "We couldn't archive this team right now. Please try again.");
    } finally {
      requestPending.current = false;
      if (active.current) { setConfirmingArchive(false); setArchiving(false); }
    }
  };

  if (!authorityResolved) return <Screen>
    <Stack.Screen options={{ headerLeft, title: 'Edit team' }} />
    <StatePanel headingLevel={1} kind="loading" title="Checking team permissions..." />
    <Button title="Back to teams" variant="secondary" onPress={() => requestExit()} />
  </Screen>;

  if (archived || !team) return <Screen>
    <Stack.Screen options={{ headerLeft, title: 'Edit team' }} />
    {archived ? <StatePanel headingLevel={1} title="Team is archived" icon="archive-outline"
      message="Restore this team before changing its details or photo." action={{ label: 'View archived teams', onPress: () => router.replace('/teams/archived') }} />
      : data.teamsLoading ? <StatePanel headingLevel={1} kind="loading" title="Loading this team..." />
        : data.teamsError ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this team" message={data.teamsError}
          action={{ label: 'Try Again', onPress: () => void data.refreshTeams() }} />
          : <StatePanel headingLevel={1} title="Team not found" message="This team is not available in your current church." />}
    <Button title="Back to teams" variant="secondary" onPress={() => router.replace('/(tabs)/teams')} />
  </Screen>;

  const busy = saving || confirmingArchive || archiving || completedAction !== null;
  return <Screen keyboard scrollRef={scrollRef} footer={<View style={styles.actions}>
    <Button ref={exitRef} title="Cancel" variant="secondary" disabled={busy} onPress={() => requestExit()} style={styles.cancel} />
    <Button title="Save changes" loading={saving} disabled={confirmingArchive || archiving || completedAction !== null} onPress={() => void save()} style={styles.save} />
  </View>}>
    <Stack.Screen options={{ headerLeft, title: 'Edit team' }} />
    <PageHeading title="Edit team" eyebrow={team.name} />
    {saveError ? <StatePanel compact kind="error" title="Couldn't finish saving" message={saveError} /> : null}
    {data.teamsError ? <StatePanel compact kind="error" title="Couldn't refresh this team" message={data.teamsError}
      action={{ label: 'Retry team', onPress: () => void data.refreshTeams() }} /> : null}
    <FormErrorSummary errors={Object.entries(fieldErrors).filter(([, message]) => !!message).map(([key, message]) => ({
      key, message: message!, onPress: () => focusField(key as keyof TeamFormErrors),
    }))} />
    <View onLayout={(event) => { positions.current.name = event.nativeEvent.layout.y; }}>
      <TextField ref={nameRef} label="Team name" value={name}
        onChangeText={(value) => { setName(value); setFieldErrors((current) => ({ ...current, name: undefined })); }}
        error={fieldErrors.name} editable={!busy} returnKeyType="next" onSubmitEditing={() => descriptionRef.current?.focus()} />
    </View>
    <View onLayout={(event) => { positions.current.description = event.nativeEvent.layout.y; }}>
      <TextField ref={descriptionRef} label="Description (optional)" value={description}
        onChangeText={(value) => { setDescription(value); setFieldErrors((current) => ({ ...current, description: undefined })); }}
        error={fieldErrors.description} editable={!busy} multiline />
    </View>
    <TeamPhotoEditor team={team} disabled={busy} />
    <View style={styles.archiveSection} onLayout={(event) => { positions.current.archive = event.nativeEvent.layout.y; }}>
      <SectionHeader title="Archive team" />
      <AppText tone="secondary">Take this team out of active areas. Members and history are kept, so a church admin can restore it later.</AppText>
      {archiveError ? <StatePanel compact kind="error" title="Couldn't finish archiving" message={archiveError} /> : null}
      <Button ref={archiveRef} title="Archive team" variant="destructive" icon="archive-outline" loading={archiving}
        disabled={saving || confirmingArchive || completedAction !== null} onPress={() => void archive()} />
    </View>
  </Screen>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.sm },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flexText: { flex: 1, minWidth: 0 },
  archiveSection: { gap: spacing.md, marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cancel: { flexGrow: 1, flexBasis: 100 },
  save: { flexGrow: 2, flexBasis: 170 },
});
