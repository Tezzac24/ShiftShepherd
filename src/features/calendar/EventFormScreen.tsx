import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { DateField, TimeField } from '../../components/DateTimeFields';
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
import { canManageEvents } from '../../lib/permissions';
import { Event, SessionUser } from '../../types';
import { parseDateKey } from '../../utils/dates';
import { ORDINAL_OPTIONS, REPEAT_TYPE_OPTIONS, WEEKDAY_OPTIONS, RecurrenceOrdinal, RepeatType, WeekdayCode,
  recurrenceLabelForRule, recurrenceRuleFromForm, recurrenceWeekdayPatternForDate } from '../../utils/recurrence';
import { buildEventTime, EventDraft, eventDraft, EventErrors, EventField, eventTimeErrors, validateEventDraft } from './eventPresentation';
import { fullScheduleDate } from './ScheduleRows';

export default function EventFormScreen() {
  const { id, occurrenceStart } = useLocalSearchParams<{ id?: string | string[]; occurrenceStart?: string | string[] }>();
  const { user, authMode, accountStatus, isLoading } = useAuth();
  const router = useRouter();
  const authorityResolved = !isLoading && (authMode !== 'supabase' || accountStatus === 'ready');
  if (!user || !canManageEvents(user)) return <Screen>
    <Stack.Screen options={{ title: 'Event' }} />
    <StatePanel headingLevel={1} kind={authorityResolved ? 'empty' : 'loading'} icon="lock-closed-outline"
      title={authorityResolved ? 'No permission' : 'Checking event permissions…'}
      message={authorityResolved ? 'Only a church admin or event manager can create and edit church events.' : undefined} />
    <Button title="Back to schedule" variant="secondary" onPress={() => router.replace('/(tabs)/calendar')} />
  </Screen>;
  return <EventForm key={`${authMode}:${user.profile.organisation_id}:${user.profile.id}:${id === undefined ? 'new' : `edit:${String(id)}`}:${user.orgRole}`}
    id={typeof id === 'string' ? id : null} editing={id !== undefined}
    occurrenceStart={typeof occurrenceStart === 'string' ? occurrenceStart : undefined} user={user} authorityResolved={authorityResolved} />;
}

function EventForm({ id, editing, occurrenceStart, user, authorityResolved }: {
  id: string | null; editing: boolean; occurrenceStart?: string; user: SessionUser; authorityResolved: boolean;
}) {
  const router = useRouter();
  const data = useAppData();
  const showToast = useToast();
  const existing = data.events.find((event) => event.id === id && event.organisation_id === user.profile.organisation_id);
  const activeTeams = data.teams.filter((team) => team.organisation_id === user.profile.organisation_id && team.archived_at === null);
  const archivedTeam = !!existing?.team_id && data.archivedTeams.some((team) => team.id === existing.team_id && team.organisation_id === user.profile.organisation_id);
  const original = useRef<Event | undefined>(undefined);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [errors, setErrors] = useState<EventErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const active = useRef(true);
  const requestPending = useRef(false);
  const navigated = useRef(false);
  const current = useRef({ authorityResolved, archivedTeam, existing });
  current.current = { authorityResolved, archivedTeam, existing };
  const scrollRef = useRef<ScrollView>(null);
  const titleRef = useRef<TextInput>(null);
  const locationRef = useRef<TextInput>(null);
  const positions = useRef<Partial<Record<EventField, number>>>({});
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (draft || !authorityResolved || (editing && !existing)) return;
    original.current = existing;
    setDraft(eventDraft(existing));
  }, [draft, authorityResolved, editing, existing]);
  useEffect(() => {
    // A successful save remains known through a same-profile account refresh.
    if (!savedId || !authorityResolved || archivedTeam || navigated.current) return;
    navigated.current = true;
    showToast(editing ? 'Event updated.' : 'Event created.');
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/events/[id]', params: { id: savedId, ...(occurrenceStart ? { occurrenceStart } : {}) } });
  }, [savedId, authorityResolved, archivedTeam, editing, occurrenceStart, router, showToast]);
  useEffect(() => { if (saveError) scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [saveError]);

  const cancel = () => {
    if (router.canGoBack()) router.back();
    else if (editing && id) router.replace({ pathname: '/events/[id]', params: { id, ...(occurrenceStart ? { occurrenceStart } : {}) } });
    else router.replace('/(tabs)/calendar');
  };
  const focusField = (field: EventField) => {
    if (field === 'teamId') setOptionalOpen(true);
    scrollRef.current?.scrollTo({ y: Math.max(0, (positions.current[field] ?? 0) - spacing.md), animated: false });
    if (field === 'title') titleRef.current?.focus();
    if (field === 'location') locationRef.current?.focus();
  };
  const change = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    setDraft((previous) => previous ? { ...previous, [key]: value } : previous);
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  };
  const save = async () => {
    if (!draft || !current.current.authorityResolved || current.current.archivedTeam || requestPending.current || savedId || (editing && !current.current.existing)) return;
    const validated = validateEventDraft(draft, original.current, activeTeams);
    setErrors(validated);
    setSaveError(null);
    if (Object.keys(validated).length) {
      requestAnimationFrame(() => { if (active.current) focusField(Object.keys(validated)[0] as EventField); });
      return;
    }
    requestPending.current = true;
    setSaving(true);
    const start = buildEventTime(draft.dateKey!, draft.startTime!);
    const end = buildEventTime(draft.dateKey!, draft.endTime!);
    const rule = draft.repeats ? recurrenceRuleFromForm(draft.recurrence) : null;
    const record = { title: draft.title.trim(), description: draft.description.trim(), category_id: draft.categoryId!,
      start_time: start, end_time: end, location: draft.location.trim(), team_id: draft.teamId,
      is_recurring: draft.repeats, recurrence_rule: rule,
      recurrence_label: draft.repeats ? recurrenceLabelForRule(rule, new Date(start)) : null,
      recurrence_end_date: draft.repeats ? original.current?.recurrence_end_date ?? null : null,
      created_by: original.current?.created_by ?? user.profile.id };
    try {
      let resultId: string;
      if (editing && existing) { await data.updateEvent(existing.id, record); resultId = existing.id; }
      else resultId = (await data.addEvent(record)).id;
      if (active.current) setSavedId(resultId);
    } catch (error) {
      if (active.current) setSaveError(error instanceof Error ? error.message : 'Your changes could not be saved. Please try again.');
    } finally { requestPending.current = false; if (active.current) setSaving(false); }
  };

  const title = editing ? 'Edit event' : 'New event';
  if (!authorityResolved) return <Screen><Stack.Screen options={{ title: savedId ? 'Event saved' : title }} />
    {savedId ? <PageHeading title={editing ? 'Changes saved' : 'Event created'} description="Your event is saved." /> : null}
    <StatePanel compact={!!savedId} headingLevel={savedId ? undefined : 1} kind="loading" title="Checking event permissions…"
      message={savedId ? 'You can close this screen or wait to continue.' : undefined} />
    <Button title={savedId ? 'Close' : 'Cancel'} variant="secondary" onPress={() => { if (savedId) navigated.current = true; cancel(); }} />
  </Screen>;
  if (editing && !existing && !savedId) return <Screen><Stack.Screen options={{ title }} />
    {data.eventsLoading ? <StatePanel headingLevel={1} kind="loading" title="Loading event…" />
      : data.eventsError ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this event" message={data.eventsError}
        action={{ label: 'Retry event', onPress: () => void data.refreshEvents() }} />
        : <StatePanel headingLevel={1} title="Event unavailable" message="This event may have been removed or is not available in your current church." />}
    <Button title="Back to schedule" variant="secondary" onPress={() => router.replace('/(tabs)/calendar')} />
  </Screen>;
  if (archivedTeam) return <Screen><Stack.Screen options={{ title }} />
    <StatePanel headingLevel={1} title="Related team is archived" icon="archive-outline"
      message="A church admin must restore the team before this event can be edited or deleted." />
    <Button title="Back to event" variant="secondary" onPress={cancel} />
  </Screen>;
  if (!draft || savedId) return <Screen><Stack.Screen options={{ title }} /><StatePanel headingLevel={1} kind="loading" title={savedId ? 'Finishing up…' : 'Preparing event…'} /></Screen>;

  const busy = saving || savedId !== null;
  const timeErrors = eventTimeErrors(draft, original.current);
  const selectedTeam = activeTeams.find((team) => team.id === draft.teamId);
  const categoryOptions: { label: string; value: string }[] = data.categories.map((category) => ({ label: category.name, value: category.id }));
  if (draft.categoryId && !categoryOptions.some((category) => category.value === draft.categoryId)) categoryOptions.push({ label: 'Current category (details unavailable)', value: draft.categoryId });
  const teamOptions = [{ label: 'No related team', value: 'none' },
    ...(draft.teamId && !selectedTeam ? [{ label: 'Current related team (details unavailable)', value: draft.teamId }] : []),
    ...activeTeams.map((team) => ({ label: team.name, value: team.id }))];
  const repeatLabel = draft.repeats ? recurrenceLabelForRule(recurrenceRuleFromForm(draft.recurrence), draft.dateKey ? parseDateKey(draft.dateKey) : new Date()) : null;
  const updateRepeatType = (repeatType: RepeatType) => change('recurrence', { ...draft.recurrence, repeatType,
    ...(repeatType === 'monthly_weekday' && draft.dateKey ? recurrenceWeekdayPatternForDate(parseDateKey(draft.dateKey)) : {}) });
  const optionalSummary = [repeatLabel, draft.teamId ? selectedTeam?.name ?? 'Related team saved' : null].filter(Boolean).join(' · ');

  return <Screen keyboard scrollRef={scrollRef} footer={<View style={styles.actions}>
    <Button title="Cancel" variant="secondary" disabled={busy} onPress={cancel} style={styles.cancel} />
    <Button title={editing ? 'Save changes' : 'Create event'} loading={saving} disabled={!!savedId} onPress={() => void save()} style={styles.save} />
  </View>}>
    <Stack.Screen options={{ title }} />
    <PageHeading title={title} description="Church events are visible to everyone in your church." />
    {original.current?.is_recurring ? <StatePanel compact kind="info" title="Editing the whole series"
      message="These changes apply to every occurrence. The date below is the series start date." /> : null}
    {saveError ? <StatePanel compact kind="error" title={editing ? 'Couldn’t save changes' : 'Couldn’t create event'} message={saveError} /> : null}
    {data.eventsError && editing ? <StatePanel compact kind="error" title="Couldn't refresh this event" message={data.eventsError}
      action={{ label: 'Retry event', onPress: () => void data.refreshEvents() }} /> : null}
    <FormErrorSummary errors={Object.entries(errors).filter(([, message]) => !!message).map(([key, message]) => ({ key, message: message!, onPress: () => focusField(key as EventField) }))} />
    <View onLayout={(event) => { positions.current.title = event.nativeEvent.layout.y; }}>
      <TextField ref={titleRef} label="Event title" placeholder="e.g. Sunday morning service" value={draft.title} onChangeText={(value) => change('title', value)} error={errors.title} editable={!busy} />
    </View>
    <View onLayout={(event) => { positions.current.categoryId = event.nativeEvent.layout.y; }}>
      <SelectField label="Category" value={draft.categoryId} options={categoryOptions} onChange={(value) => change('categoryId', value)} error={errors.categoryId} disabled={busy} />
    </View>
    <View onLayout={(event) => { positions.current.dateKey = event.nativeEvent.layout.y; }}>
      <DateField label={original.current?.is_recurring ? 'Series start date' : 'Date'} value={draft.dateKey} onChange={(value) => change('dateKey', value)} error={errors.dateKey} disabled={busy} />
    </View>
    <View onLayout={(event) => { positions.current.startTime = event.nativeEvent.layout.y; }}>
      <TimeField label="Start time" value={draft.startTime} onChange={(value) => change('startTime', value)} error={errors.startTime ?? timeErrors.startTime} disabled={busy} />
    </View>
    <View onLayout={(event) => { positions.current.endTime = event.nativeEvent.layout.y; }}>
      <TimeField label="End time" value={draft.endTime} onChange={(value) => change('endTime', value)} error={errors.endTime ?? timeErrors.endTime} disabled={busy} />
    </View>
    <View onLayout={(event) => { positions.current.location = event.nativeEvent.layout.y; }}>
      <TextField ref={locationRef} label="Location" placeholder="e.g. Main hall" value={draft.location} onChangeText={(value) => change('location', value)} error={errors.location} editable={!busy} />
    </View>
    <TextField label="Description (optional)" placeholder="What should people know?" value={draft.description} onChangeText={(value) => change('description', value)} multiline editable={!busy} />
    <View onLayout={(event) => { positions.current.teamId = event.nativeEvent.layout.y; }}>
      <ListRow title="More options" subtitle={optionalSummary || 'Repeat this event or add a related team'} showChevron={false}
        icon={optionalOpen ? 'remove-outline' : 'add-outline'} disabled={busy} accessibilityState={{ expanded: optionalOpen }} onPress={() => setOptionalOpen((value) => !value)} />
    </View>
    {optionalOpen ? <View style={styles.optional}>
      <ListGroup><SwitchRow title="Repeats" subtitle="For regular weekly or monthly events." value={draft.repeats} onValueChange={(value) => change('repeats', value)} disabled={busy} /></ListGroup>
      {draft.repeats ? <>
        <SelectField label="Repeat type" value={draft.recurrence.repeatType} options={REPEAT_TYPE_OPTIONS} onChange={updateRepeatType} disabled={busy} />
        {draft.recurrence.repeatType === 'monthly_weekday' ? <>
          <SelectField label="Week in the month" value={draft.recurrence.ordinal} options={ORDINAL_OPTIONS} disabled={busy}
            onChange={(ordinal: RecurrenceOrdinal) => change('recurrence', { ...draft.recurrence, ordinal })} />
          <SelectField label="Day of the week" value={draft.recurrence.weekday} options={WEEKDAY_OPTIONS} disabled={busy}
            onChange={(weekday: WeekdayCode) => change('recurrence', { ...draft.recurrence, weekday })} />
        </> : null}
        <AppText tone="secondary">{repeatLabel}. Changes to a recurring event apply to the whole series.</AppText>
        {original.current?.recurrence_end_date ? <AppText variant="small" tone="secondary">This series ends on {fullScheduleDate(parseDateKey(original.current.recurrence_end_date))}.</AppText> : null}
      </> : <AppText tone="secondary">This event happens once.</AppText>}
      <SelectField label="Related team (optional)" value={draft.teamId ?? 'none'} options={teamOptions} disabled={busy} searchable searchPlaceholder="Team name"
        helper="This adds context. The event stays visible to the whole church." error={errors.teamId}
        onChange={(value) => change('teamId', value === 'none' ? null : value)} />
      {data.teamsError ? <StatePanel compact kind="error" title="Couldn't refresh team choices" message="A saved related team will be kept unless you change it."
        action={{ label: 'Retry teams', onPress: () => void data.refreshTeams() }} /> : null}
    </View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  optional: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cancel: { flexGrow: 1, flexBasis: 100 },
  save: { flexGrow: 2, flexBasis: 170 },
});
