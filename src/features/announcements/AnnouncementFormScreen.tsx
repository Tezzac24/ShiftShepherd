import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AnnouncementImage } from '../../components/AnnouncementImage';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { FormErrorSummary } from '../../components/FormErrorSummary';
import { ListGroup } from '../../components/ListGroup';
import { ListRow, SwitchRow } from '../../components/ListRow';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SelectField } from '../../components/SelectField';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth } from '../../lib/auth/AuthContext';
import { canCreateAnyAnnouncement, canCreateChurchAnnouncements, canEditAnnouncement } from '../../lib/permissions';
import { isAnnouncementImagePath } from '../../lib/supabase/services/announcementImages';
import { Announcement, SessionUser } from '../../types';
import { accessibleAnnouncements, announcementAudienceOptions, announcementAuthorityKey, announcementEventOptions, CHURCH_AUDIENCE } from './announcementPresentation';
import { AnnouncementImageDraft, useAnnouncementImageDraft } from './useAnnouncementImageDraft';

type Params = { id?: string | string[]; teamId?: string | string[]; presetTitle?: string | string[]; presetBody?: string | string[] };
type Draft = { title: string; body: string; audience: string | null; pinned: boolean; linkedEventId: string | null };
type Field = 'title' | 'body' | 'audience';
type Step = 'draft' | 'saving' | 'image-pending' | 'image-saving' | 'image-failed' | 'complete';

export default function AnnouncementFormScreen() {
  const params = useLocalSearchParams<Params>();
  const { user, authMode, accountStatus, isLoading } = useAuth();
  const router = useRouter();
  const authorityResolved = !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  if (!user || !canCreateAnyAnnouncement(user)) return <Screen>
    <Stack.Screen options={{ title: 'Announcement' }} />
    <StatePanel headingLevel={1} kind={authorityResolved ? 'empty' : 'loading'} icon="lock-closed-outline"
      title={authorityResolved ? 'No permission' : 'Checking announcement permissions…'}
      message={authorityResolved ? 'You do not have permission to create or edit announcements.' : undefined} />
    <Button title="All announcements" variant="secondary" onPress={() => router.replace('/announcements')} />
  </Screen>;
  const draftRoute = params.id === undefined ? `new:${JSON.stringify([params.teamId, params.presetTitle, params.presetBody])}` : `edit:${String(params.id)}`;
  return <AnnouncementForm key={`${authMode}:${user.profile.organisation_id}:${user.profile.id}:${draftRoute}:${announcementAuthorityKey(user)}`}
    params={params} user={user} authorityResolved={authorityResolved} />;
}

function AnnouncementForm({ params, user, authorityResolved }: { params: Params; user: SessionUser; authorityResolved: boolean }) {
  const router = useRouter();
  const data = useAppData();
  const showToast = useToast();
  const editing = params.id !== undefined;
  const existing = accessibleAnnouncements(user, data.announcements, data.archivedTeams).find((notice) => notice.id === params.id);
  const options = announcementAudienceOptions(user, data.teams);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [step, setStep] = useState<Step>('draft');
  const [saved, setSaved] = useState<Announcement | null>(null);
  const image = useAnnouncementImageDraft();
  const submittedImage = useRef<AnnouncementImageDraft>({ kind: 'unchanged' });
  const active = useRef(true);
  const requestPending = useRef(false);
  const imagePending = useRef(false);
  const navigated = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const titleRef = useRef<TextInput>(null);
  const bodyRef = useRef<TextInput>(null);
  const positions = useRef<Record<Field, number>>({ title: 0, body: 0, audience: 0 });
  const target = saved ?? existing;
  const targetAllowed = !target || (canEditAnnouncement(user, target) && options.some((option) => option.value === (target.team_id ?? CHURCH_AUDIENCE)));
  const allowed = targetAllowed && options.length > 0;
  const current = useRef({ authorityResolved, allowed });
  current.current = { authorityResolved, allowed };
  const needsTeam = !!existing?.team_id || params.teamId !== undefined || !canCreateChurchAnnouncements(user);
  const requestedTeam = target?.team_id ?? (typeof params.teamId === 'string' ? params.teamId : null);
  const teamUnresolved = requestedTeam ? !options.some((option) => option.value === requestedTeam)
    : !options.some((option) => option.value !== CHURCH_AUDIENCE);
  const waitingForTeam = needsTeam && teamUnresolved && (data.teamsLoading || !!data.teamsError);
  const existingHasImage = isAnnouncementImagePath(existing?.image_url ?? null);
  const showsImage = image.draft.kind === 'replace' || (image.draft.kind === 'unchanged' && existingHasImage);
  const imageUri = image.draft.kind === 'replace' ? image.draft.previewUri
    : image.draft.kind === 'unchanged' ? data.getAnnouncementImageUri(existing) : undefined;

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    // A cold edit waits for its own row. Later shared-data refreshes keep the draft.
    if (draft || !authorityResolved || waitingForTeam || (editing && !existing)) return;
    setDraft(existing ? { title: existing.title, body: existing.body, audience: existing.team_id ?? CHURCH_AUDIENCE,
      pinned: existing.pinned, linkedEventId: existing.linked_event_id } : {
      title: typeof params.presetTitle === 'string' ? params.presetTitle : '',
      body: typeof params.presetBody === 'string' ? params.presetBody : '',
      audience: params.teamId !== undefined ? options.find((option) => option.value === params.teamId)?.value ?? null : options[0]?.value ?? null,
      pinned: false, linkedEventId: null,
    });
  }, [draft, authorityResolved, waitingForTeam, editing, existing, params, options]);

  const { setAnnouncementImage, removeAnnouncementImage } = data;
  useEffect(() => {
    if (!authorityResolved || !allowed || !saved || navigated.current) return;
    if (step === 'complete' && !navigated.current) {
      navigated.current = true;
      showToast(editing ? 'Announcement updated.' : 'Announcement posted.');
      if (router.canGoBack()) router.back(); else router.replace({ pathname: '/announcements/[id]', params: { id: saved.id } });
      return;
    }
    if (step !== 'image-pending' || imagePending.current) return;
    imagePending.current = true;
    setStep('image-saving');
    void (async () => {
      try {
        const change = submittedImage.current;
        if (change.kind === 'replace') await setAnnouncementImage(saved.id, change.file);
        else if (change.kind === 'remove') await removeAnnouncementImage(saved.id);
        if (active.current) { setImageError(null); setStep('complete'); }
      } catch (error) {
        if (active.current) {
          setImageError(error instanceof Error ? error.message : 'Please try the image change again.');
          setStep('image-failed');
        }
      } finally { imagePending.current = false; }
    })();
  }, [authorityResolved, allowed, saved, step, editing, router, showToast, setAnnouncementImage, removeAnnouncementImage]);
  useEffect(() => { if (saveError || imageError) scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [saveError, imageError]);

  const cancel = () => router.canGoBack() ? router.back() : router.replace('/announcements');
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => previous ? { ...previous, [key]: value } : previous);
  const focusField = (field: Field) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, positions.current[field] - spacing.md), animated: false });
    if (field === 'title') titleRef.current?.focus();
    if (field === 'body') bodyRef.current?.focus();
  };
  const save = async () => {
    if (!draft || !current.current.authorityResolved || !current.current.allowed || requestPending.current || saved || image.picking || (editing && !existing)) return;
    const errors: Partial<Record<Field, string>> = {};
    if (!draft.title.trim()) errors.title = 'Add a title.';
    if (!draft.body.trim()) errors.body = 'Write a message.';
    if (!options.some((option) => option.value === draft.audience)) errors.audience = 'Choose an audience you can post to.';
    setFieldErrors(errors);
    setSaveError(null);
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => { if (active.current) focusField(Object.keys(errors)[0] as Field); });
      return;
    }
    requestPending.current = true;
    submittedImage.current = data.announcementsLive && (image.draft.kind === 'replace' || (image.draft.kind === 'remove' && existingHasImage))
      ? image.draft : { kind: 'unchanged' };
    setStep('saving');
    const record = { title: draft.title.trim(), body: draft.body.trim(), team_id: draft.audience === CHURCH_AUDIENCE ? null : draft.audience,
      audience: (draft.audience === CHURCH_AUDIENCE ? 'church' : 'team') as 'church' | 'team', pinned: draft.pinned,
      linked_event_id: draft.linkedEventId, created_by: existing?.created_by ?? user.profile.id };
    try {
      let result: Announcement;
      if (existing) { await data.updateAnnouncement(existing.id, record); result = { ...existing, ...record }; }
      else result = await data.addAnnouncement({ ...record, image_url: null });
      if (!active.current) return;
      // A successful text write is remembered before any photo work. Image retry
      // never calls add/update again and therefore never repeats the create push.
      setSaved(result);
      setStep(submittedImage.current.kind === 'unchanged' ? 'complete' : 'image-pending');
    } catch (error) {
      if (active.current) { setSaveError(error instanceof Error ? error.message : 'Your announcement could not be saved. Please try again.'); setStep('draft'); }
    } finally { requestPending.current = false; }
  };

  const screenTitle = editing ? 'Edit announcement' : 'New announcement';
  const waitingForAuthority = !authorityResolved || waitingForTeam;
  if (saved && (waitingForAuthority || allowed)) return <Screen scrollRef={scrollRef} footer={waitingForAuthority ?
    <Button title="Close" variant="secondary" onPress={() => { navigated.current = true; cancel(); }} />
    : step === 'image-failed' ? <>
      <Button title="Try image change again" icon="image-outline" onPress={() => { if (current.current.allowed && current.current.authorityResolved) setStep('image-pending'); }} />
      <Button title="View announcement" variant="secondary" onPress={() => router.replace({ pathname: '/announcements/[id]', params: { id: saved.id } })} />
    </> : undefined}>
    <Stack.Screen options={{ title: 'Announcement saved' }} />
    <PageHeading title={editing ? 'Changes saved' : 'Announcement posted'} description="Your title, message and audience are saved." />
    {imageError ? <StatePanel compact kind="error" title={submittedImage.current.kind === 'remove' ? "Image wasn't removed" : "Image wasn't saved"}
      message={`${imageError} ${waitingForAuthority ? 'You can close and change the image later.' : 'You can retry now or view your announcement and change the image later.'}`} /> : null}
    {waitingForAuthority ? <>
      <StatePanel compact kind={!authorityResolved || data.teamsLoading ? 'loading' : 'error'}
        title={!authorityResolved ? 'Checking announcement permissions…' : data.teamsLoading ? 'Loading announcement audiences…' : "Couldn't load announcement audiences"}
        message={authorityResolved && !data.teamsLoading ? data.teamsError ?? undefined : undefined}
        action={authorityResolved && !data.teamsLoading ? { label: 'Retry teams', onPress: () => void data.refreshTeams() } : undefined} />
      <AppText tone="secondary">{step === 'complete' ? 'You can close this screen or wait to continue.'
        : step === 'image-saving' ? 'The image change is still in progress.'
          : step === 'image-failed' ? 'The image change is still unsaved.'
            : 'The image change has not been saved yet. It will continue when this check is complete.'}</AppText>
    </> : !imageError ? <StatePanel compact kind="loading" title={step === 'complete' ? 'Finishing up…' : 'Saving the image change…'} /> : null}
    <AppText variant="heading" headingLevel={2}>{saved.title}</AppText>
    {submittedImage.current.kind === 'replace' ? <AnnouncementImage uri={submittedImage.current.previewUri} height={180} presentation="full" accessibilityLabel="Selected announcement image" /> : null}
  </Screen>;
  if (!authorityResolved) return <Screen><Stack.Screen options={{ title: screenTitle }} />
    <StatePanel headingLevel={1} kind="loading" title="Checking announcement permissions…" />
    <Button title="Cancel" variant="secondary" onPress={cancel} />
  </Screen>;
  if (editing && !existing && !saved) return <Screen><Stack.Screen options={{ title: screenTitle }} />
    {data.announcementsLoading ? <StatePanel headingLevel={1} kind="loading" title="Loading announcement…" />
      : data.announcementsError ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this announcement" message={data.announcementsError}
        action={{ label: 'Retry announcement', onPress: () => void data.refreshAnnouncements() }} />
        : <StatePanel headingLevel={1} title="Announcement unavailable" message="This announcement may have been removed or is not available in your current church." />}
    <Button title="All announcements" variant="secondary" onPress={() => router.replace('/announcements')} />
  </Screen>;
  if (waitingForTeam) return <Screen><Stack.Screen options={{ title: screenTitle }} />
    <StatePanel headingLevel={1} kind={data.teamsLoading ? 'loading' : 'error'} title={data.teamsLoading ? 'Loading announcement audiences…' : "Couldn't load announcement audiences"}
      message={data.teamsLoading ? undefined : data.teamsError ?? undefined}
      action={data.teamsLoading ? undefined : { label: 'Retry teams', onPress: () => void data.refreshTeams() }} />
    <Button title="Cancel" variant="secondary" onPress={cancel} />
  </Screen>;
  if (!allowed) return <Screen><Stack.Screen options={{ title: screenTitle }} />
    <StatePanel headingLevel={1} title="No permission" icon="lock-closed-outline" message="You can no longer manage this announcement or its team is unavailable." />
    <Button title="All announcements" variant="secondary" onPress={() => router.replace('/announcements')} />
  </Screen>;
  if (!draft) return <Screen><Stack.Screen options={{ title: screenTitle }} /><StatePanel headingLevel={1} kind="loading" title="Preparing announcement…" /></Screen>;

  const busy = step !== 'draft';
  const optionalSummary = [draft.pinned ? 'Pinned' : null, draft.linkedEventId ? 'Event linked' : null, showsImage ? 'Image selected' : null].filter(Boolean).join(' · ');
  return <Screen keyboard scrollRef={scrollRef} footer={<View style={styles.actions}>
    <Button title="Cancel" variant="secondary" disabled={busy || image.picking} onPress={cancel} style={styles.cancel} />
    <Button title={editing ? 'Save changes' : 'Post announcement'} loading={busy} disabled={image.picking} onPress={() => void save()} style={styles.save} />
  </View>}>
    <Stack.Screen options={{ title: screenTitle }} />
    <PageHeading title={screenTitle} description={editing ? undefined : 'Share an update with your church or team.'} />
    {saveError ? <StatePanel compact kind="error" title={editing ? 'Couldn’t save changes' : 'Couldn’t post announcement'} message={saveError} /> : null}
    {data.announcementsError && editing ? <StatePanel compact kind="error" title="Couldn't refresh this announcement" message={data.announcementsError}
      action={{ label: 'Retry announcement', onPress: () => void data.refreshAnnouncements() }} /> : null}
    <FormErrorSummary errors={Object.entries(fieldErrors).filter(([, message]) => !!message).map(([key, message]) => ({ key, message: message!, onPress: () => focusField(key as Field) }))} />
    <View onLayout={(event) => { positions.current.title = event.nativeEvent.layout.y; }}>
      <TextField ref={titleRef} label="Title" placeholder="What is the update?" value={draft.title} editable={!busy}
        onChangeText={(value) => { change('title', value); setFieldErrors((errors) => ({ ...errors, title: undefined })); }} error={fieldErrors.title}
        returnKeyType="next" onSubmitEditing={() => bodyRef.current?.focus()} />
    </View>
    <View onLayout={(event) => { positions.current.body = event.nativeEvent.layout.y; }}>
      <TextField ref={bodyRef} label="Message" placeholder="What should people know?" value={draft.body} multiline editable={!busy}
        onChangeText={(value) => { change('body', value); setFieldErrors((errors) => ({ ...errors, body: undefined })); }} error={fieldErrors.body} />
    </View>
    <View onLayout={(event) => { positions.current.audience = event.nativeEvent.layout.y; }}>
      <SelectField label="Who should see this?" value={draft.audience} options={options} disabled={busy} searchable={options.length > 7} searchPlaceholder="Team name"
        onChange={(value) => { change('audience', value); setFieldErrors((errors) => ({ ...errors, audience: undefined })); }} error={fieldErrors.audience}
        helper={params.teamId !== undefined && !draft.audience ? 'The requested team is unavailable. Choose an audience before posting.' : undefined} />
    </View>
    <ListRow title="More options" subtitle={optionalSummary || (data.announcementsLive ? 'Image, linked event and pinning' : 'Linked event and pinning')}
      icon={optionalOpen ? 'remove-outline' : 'add-outline'} showChevron={false} disabled={busy}
      accessibilityState={{ expanded: optionalOpen }} onPress={() => setOptionalOpen((value) => !value)} />
    {optionalOpen ? <View style={styles.optional}>
      <SelectField label="Linked event (optional)" value={draft.linkedEventId ?? 'none'}
        options={announcementEventOptions(data.events, user.profile.organisation_id, draft.linkedEventId)} disabled={busy} searchable searchPlaceholder="Event title"
        onChange={(value) => change('linkedEventId', value === 'none' ? null : value)} />
      {data.eventsError ? <StatePanel compact kind="error" title="Couldn't refresh event choices" message="An existing event link will be kept unless you change it."
        action={{ label: 'Retry events', onPress: () => void data.refreshEvents() }} /> : null}
      <ListGroup><SwitchRow title="Pin this announcement" subtitle="Keep it at the top of announcements." value={draft.pinned}
        disabled={busy} onValueChange={(value) => change('pinned', value)} /></ListGroup>
      {data.announcementsLive ? <View style={styles.optional}>
        <AppText variant="subheading" headingLevel={2}>Image (optional)</AppText>
        <AppText variant="small" tone="secondary">One JPEG, PNG or WebP image, under 5 MB. The image changes when you save.</AppText>
        <AnnouncementImage uri={imageUri} height={180} presentation="full" accessibilityLabel="Announcement image preview" />
        {image.draft.kind === 'remove' && existingHasImage ? <AppText tone="secondary">The current image will be removed when you save.</AppText> : null}
        <Button title={showsImage ? 'Change image' : 'Add image'} variant="secondary" icon="image-outline" loading={image.picking} disabled={busy} onPress={() => void image.pickImage()} />
        {showsImage ? <Button title="Remove image" variant="ghost" icon="trash-outline" disabled={busy || image.picking} onPress={image.markRemoved} /> : null}
      </View> : null}
    </View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  optional: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cancel: { flexGrow: 1, flexBasis: 100 },
  save: { flexGrow: 2, flexBasis: 170 },
});
