import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { FormErrorSummary } from '../../components/FormErrorSummary';
import { OrganisationHeader } from '../../components/OrganisationHeader';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth } from '../../lib/auth/AuthContext';
import { canManageTeamLifecycle } from '../../lib/permissions';
import { TEAM_LIFECYCLE_CONFLICT_ERROR } from '../../lib/supabase/services/teams';
import { SessionUser } from '../../types';
import { newRequestId } from '../../utils/ids';
import { selectedInitialTeamAdmin, TeamFormErrors, validateTeamForm } from './teamForm';
import { TeamInitialAdminChooser } from './TeamInitialAdminChooser';
import { useTeamAvatarDraft } from './useTeamAvatarDraft';

export default function TeamCreateScreen() {
  const { user, authMode, accountStatus, isLoading } = useAuth();
  const router = useRouter();
  const authorityResolved = !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  if (!user || !canManageTeamLifecycle(user)) {
    return <Screen>
      <Stack.Screen options={{ title: 'New team' }} />
      <StatePanel headingLevel={1} kind={authorityResolved ? 'empty' : 'loading'}
        title={authorityResolved ? 'No permission' : 'Checking team permissions...'}
        icon="lock-closed-outline" message={authorityResolved ? 'Only a church admin can create teams.' : undefined} />
      <Button title="Back to teams" variant="secondary" onPress={() => router.replace('/(tabs)/teams')} />
    </Screen>;
  }
  return <TeamCreateForm key={`${authMode}:${user.profile.organisation_id}:${user.profile.id}`} user={user} authorityResolved={authorityResolved} />;
}

type CreationStep = 'draft' | 'creating' | 'photo-pending' | 'photo-uploading' | 'photo-failed' | 'complete';

function TeamCreateForm({ user, authorityResolved }: { user: SessionUser; authorityResolved: boolean }) {
  const router = useRouter();
  const data = useAppData();
  const { setTeamAvatar } = data;
  const showToast = useToast();
  const avatar = useTeamAvatarDraft();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [initialAdminProfileId, setInitialAdminProfileId] = useState<string | null>(null);
  const [choosingAdmin, setChoosingAdmin] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<TeamFormErrors>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [step, setStep] = useState<CreationStep>('draft');
  const [createdTeam, setCreatedTeam] = useState<{ id: string; name: string } | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const saveGuard = useRef(false);
  const avatarRetryGuard = useRef(false);
  const uploadingPhoto = useRef(false);
  const submittedPhoto = useRef<typeof avatar.draft>(null);
  const completionToast = useRef('Team created.');
  const navigated = useRef(false);
  const active = useRef(true);
  const authority = useRef(authorityResolved);
  authority.current = authorityResolved;
  const scrollRef = useRef<ScrollView>(null);
  const nameRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const chooserRef = useRef<View>(null);
  const fieldPositions = useRef({ name: 0, description: 0 });
  // Replay one key for an unchanged logical draft after an ambiguous failure.
  const requestKey = useRef<{ id: string; draft: string } | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const saving = step !== 'draft';
  const retryingAvatar = step === 'photo-pending' || step === 'photo-uploading';

  const selectedAdmin = selectedInitialTeamAdmin(user.profile.organisation_id, data.users, initialAdminProfileId);
  const focusField = (field: keyof TeamFormErrors) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, fieldPositions.current[field] - spacing.md), animated: false });
    (field === 'name' ? nameRef : descriptionRef).current?.focus();
  };

  const cancel = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/teams');
  const reportError = (error: unknown, fallback: string) => {
    if (!active.current) return;
    setActionError(error instanceof Error ? error.message : fallback);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // Keep the successful creation while same-profile permissions refresh. Photo
  // work and navigation resume only after authority resolves; no second create.
  useEffect(() => {
    if (!authorityResolved || !createdTeam) return;
    if (step === 'complete' && !navigated.current) {
      navigated.current = true;
      showToast(completionToast.current);
      router.replace({ pathname: '/teams/[teamId]', params: { teamId: createdTeam.id } });
      return;
    }
    if (step !== 'photo-pending' || uploadingPhoto.current || !submittedPhoto.current) return;
    uploadingPhoto.current = true;
    setStep('photo-uploading');
    void (async () => {
      try {
        await setTeamAvatar(createdTeam.id, submittedPhoto.current!.file);
        if (active.current) { setAvatarError(null); setStep('complete'); }
      } catch (error) {
        if (active.current) {
          setAvatarError(error instanceof Error ? error.message : "The team is ready, but we couldn't add its photo. Please try again.");
          setStep('photo-failed');
        }
      } finally {
        uploadingPhoto.current = false;
        avatarRetryGuard.current = false;
      }
    })();
  }, [authorityResolved, createdTeam, step, setTeamAvatar, router, showToast]);

  const retryAvatar = () => {
    if (!authority.current || !createdTeam || !submittedPhoto.current || step !== 'photo-failed' || avatarRetryGuard.current) return;
    avatarRetryGuard.current = true;
    completionToast.current = 'Team photo added.';
    setStep('photo-pending');
  };

  const save = async () => {
    if (!authority.current || saveGuard.current || createdTeam || avatar.picking) return;
    const validated = validateTeamForm(name, description);
    setFieldErrors(validated.errors);
    setActionError(null);
    if (!validated.value) {
      requestAnimationFrame(() => { if (active.current) focusField(validated.errors.name ? 'name' : 'description'); });
      return;
    }
    if (initialAdminProfileId && !selectedAdmin) {
      reportError(null, 'That person is no longer available. Choose someone else or create the team without an initial team admin.');
      return;
    }
    saveGuard.current = true;
    submittedPhoto.current = data.teamsLive ? avatar.draft : null;
    setStep('creating');
    try {
      const draft = JSON.stringify([validated.value.name, validated.value.description, initialAdminProfileId]);
      if (!requestKey.current || requestKey.current.draft !== draft) requestKey.current = { id: newRequestId(), draft };
      const result = await data.createTeam({ ...validated.value, initialAdminProfileId, requestId: requestKey.current.id });
      if (!active.current) return;
      // The canonical team exists now; photo recovery never calls create again.
      requestKey.current = null;
      setCreatedTeam(result.team);
      setStep(submittedPhoto.current ? 'photo-pending' : 'complete');
    } catch (error) {
      saveGuard.current = false;
      if (error instanceof Error && error.message === TEAM_LIFECYCLE_CONFLICT_ERROR) requestKey.current = null;
      reportError(error, "We couldn't create this team right now. Please try again.");
      if (active.current) setStep('draft');
    }
  };

  if (!authorityResolved) return <Screen>
    <Stack.Screen options={{ title: 'New team' }} />
    <OrganisationHeader />
    <StatePanel headingLevel={1} kind="loading" title="Checking team permissions..." />
    <Button title="Back to teams" variant="secondary" onPress={() => router.replace('/(tabs)/teams')} />
  </Screen>;

  if (createdTeam) return <Screen footer={avatarError ? <>
    <Button title="Try photo again" icon="image-outline" loading={retryingAvatar} disabled={!submittedPhoto.current} onPress={retryAvatar} />
    <Button title="Continue without photo" variant="secondary" disabled={retryingAvatar} onPress={() => { completionToast.current = 'Team created.'; setStep('complete'); }} />
  </> : undefined}>
    <Stack.Screen options={{ title: 'Team created' }} />
    <OrganisationHeader />
    <PageHeading title={`${createdTeam.name} is ready`} description="Your team was created successfully. You can add its photo now or later." />
    {avatarError ? <StatePanel compact kind="error" title="Team photo wasn't added" message={avatarError} />
      : <StatePanel compact kind="loading" title={retryingAvatar ? 'Adding the team photo...' : 'Opening your team...'} />}
  </Screen>;

  if (data.teamsLive && data.users.length === 0 && (data.teamsLoading || data.teamsError)) return <Screen>
    <Stack.Screen options={{ title: 'New team' }} />
    <OrganisationHeader />
    <StatePanel headingLevel={1} kind={data.teamsLoading ? 'loading' : 'error'}
      title={data.teamsLoading ? 'Loading your church directory...' : "Couldn't load your church directory"}
      message={data.teamsLoading ? undefined : data.teamsError ?? undefined}
      action={data.teamsLoading ? undefined : { label: 'Try Again', onPress: () => void data.refreshTeams() }} />
    <Button title="Cancel" variant="secondary" onPress={cancel} />
  </Screen>;

  return <Screen keyboard scrollRef={scrollRef} footer={<View style={styles.actions}>
    <Button title="Cancel" variant="secondary" disabled={saving || avatar.picking} onPress={cancel} style={styles.cancel} />
    <Button title="Create team" loading={saving} disabled={avatar.picking || !!createdTeam} onPress={() => void save()} style={styles.save} />
  </View>}>
    <Stack.Screen options={{ title: 'New team' }} />
    <OrganisationHeader />
    <PageHeading title="New team" />
    {actionError ? <StatePanel compact kind="error" title="Couldn't finish creating the team" message={actionError} /> : null}
    {data.teamsError ? <StatePanel compact kind="error" title="Couldn't refresh the directory" message={data.teamsError}
      action={{ label: 'Retry directory', onPress: () => void data.refreshTeams() }} /> : null}
    <FormErrorSummary errors={Object.entries(fieldErrors).filter(([, message]) => !!message).map(([key, message]) => ({
      key, message: message!, onPress: () => focusField(key as keyof TeamFormErrors),
    }))} />
    <View onLayout={(event) => { fieldPositions.current.name = event.nativeEvent.layout.y; }}>
      <TextField ref={nameRef} label="Team name" placeholder="e.g. Welcome Team" value={name}
        onChangeText={(value) => { setName(value); setFieldErrors((current) => ({ ...current, name: undefined })); }}
        error={fieldErrors.name} editable={!saving} returnKeyType="next" onSubmitEditing={() => descriptionRef.current?.focus()} />
    </View>
    <View onLayout={(event) => { fieldPositions.current.description = event.nativeEvent.layout.y; }}>
      <TextField ref={descriptionRef} label="Description (optional)" placeholder="What does this team do?" value={description}
        onChangeText={(value) => { setDescription(value); setFieldErrors((current) => ({ ...current, description: undefined })); }}
        error={fieldErrors.description} editable={!saving} multiline />
    </View>
    <View style={styles.section}>
      <SectionHeader title="Initial team admin" />
      <AppText variant="small" tone="secondary">Optional. You can create the team without a team admin and assign one later.</AppText>
      <Card>
        <View style={styles.person}>
          {selectedAdmin ? <Avatar name={selectedAdmin.full_name} uri={data.getAvatarUri(selectedAdmin)} size={44} /> : null}
          <View style={styles.copy}>
            <AppText variant="bodyBold">{selectedAdmin?.full_name ?? (initialAdminProfileId ? 'Choose another team admin' : 'No initial team admin')}</AppText>
            <AppText variant="small" tone="secondary">{selectedAdmin?.email ?? (initialAdminProfileId ? 'The selected person is no longer available.' : 'Creating this team won’t add you automatically.')}</AppText>
          </View>
        </View>
        <Button ref={chooserRef} title={initialAdminProfileId ? 'Change initial team admin' : 'Choose initial team admin'} variant="secondary"
          icon="person-outline" disabled={saving} onPress={() => setChoosingAdmin(true)} />
      </Card>
    </View>
    {data.teamsLive ? <View style={styles.section}>
      <SectionHeader title="Team photo (optional)" />
      <Card>
        <View style={styles.person}>
          <Avatar name={name.trim() || 'New team'} uri={avatar.draft?.previewUri} size={56} />
          <AppText tone="secondary" style={styles.copy}>Help people recognise this team.</AppText>
        </View>
        <Button title={avatar.draft ? 'Change photo' : 'Choose photo'} variant="secondary" icon="image-outline" loading={avatar.picking}
          disabled={saving} onPress={() => void avatar.pick()} />
        {avatar.draft ? <Button title="Remove selected photo" variant="ghost" disabled={saving || avatar.picking} onPress={avatar.clear} /> : null}
      </Card>
    </View> : null}
    <TeamInitialAdminChooser visible={choosingAdmin} onClose={() => setChoosingAdmin(false)} opener={chooserRef}
      organisationId={user.profile.organisation_id} currentProfileId={user.profile.id} users={data.users}
      selectedId={initialAdminProfileId} onSelect={(id) => { setInitialAdminProfileId(id); setActionError(null); }} getAvatarUri={data.getAvatarUri} />
  </Screen>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cancel: { flexGrow: 1, flexBasis: 100 },
  save: { flexGrow: 2, flexBasis: 170 },
});
