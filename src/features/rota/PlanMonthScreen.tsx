import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { useConfirm } from '../../components/ConfirmDialog';
import { TimeField } from '../../components/DateTimeFields';
import { FormErrorSummary } from '../../components/FormErrorSummary';
import { ListGroup } from '../../components/ListGroup';
import { ListRow, SwitchRow } from '../../components/ListRow';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { SelectField } from '../../components/SelectField';
import { StatePanel } from '../../components/StatePanel';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { teamMembers } from '../../lib/appData/selectors';
import { CHOIR_MEMBER_ROLE, PRAISE_LEADER_ROLE, WORSHIP_LEADER_ROLE } from '../../lib/permissions';
import { RotaEntry } from '../../types';
import { formatClockTime, parseDateKey } from '../../utils/dates';
import { fullScheduleDate, ScheduleDateMarker } from '../calendar/ScheduleRows';
import { RotaAccessState, RotaScope, RotaScopeValue } from './RotaScope';
import { DateOverride, monthDates, NO_LEADER, PlannedDate, plannedDateKey } from './rotaPresentation';

const weekdayOptions = [
  { label: 'Monday', value: '1' }, { label: 'Tuesday', value: '2' }, { label: 'Wednesday', value: '3' },
  { label: 'Thursday', value: '4' }, { label: 'Friday', value: '5' }, { label: 'Saturday', value: '6' }, { label: 'Sunday', value: '0' },
];
interface PlanResult { created: RotaEntry[]; total: number; teamName: string; error: string | null; unknown?: boolean }

export default function PlanMonthScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string | string[] }>();
  return <RotaScope teamId={typeof teamId === 'string' ? teamId : null} routeKey="plan-month" management choirOnly>
    {(scope) => <MonthPlan scope={scope} />}
  </RotaScope>;
}

function MonthPlan({ scope }: { scope: RotaScopeValue }) {
  const { user, team } = scope;
  const router = useRouter();
  const data = useAppData();
  const confirm = useConfirm();
  const showToast = useToast();
  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 4 }, (_, offset) => {
      const month = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      return { value: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
        label: month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
    });
  }, []);
  const [monthKey, setMonthKey] = useState(monthOptions[1].value);
  const [includeSundays, setIncludeSundays] = useState(true);
  const [serviceTime, setServiceTime] = useState<string | null>('09:15');
  const [includeRehearsals, setIncludeRehearsals] = useState(false);
  const [rehearsalDay, setRehearsalDay] = useState('6');
  const [rehearsalTime, setRehearsalTime] = useState<string | null>('17:00');
  const [defaultPraiseId, setDefaultPraiseId] = useState(NO_LEADER);
  const [defaultWorshipId, setDefaultWorshipId] = useState(NO_LEADER);
  const [overrides, setOverrides] = useState<Record<string, DateOverride>>({});
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationField, setValidationField] = useState<'people' | 'dates' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const active = useRef(true);
  const closed = useRef(false);
  const requestPending = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const datesPosition = useRef(0);
  const defaultsPosition = useRef(0);
  const validationPosition = useRef(0);
  const monthLabel = monthOptions.find((option) => option.value === monthKey)?.label ?? monthKey;
  const members = team ? teamMembers(team.id, data.memberships, data.users).filter(({ profile }) => profile.organisation_id === user.profile.organisation_id) : [];
  const existingDates = new Set(data.rotaEntries.filter((entry) => entry.team_id === team?.id && entry.organisation_id === user.profile.organisation_id).map((entry) => entry.date));
  const plannedDates = monthDates(monthKey, includeSundays, includeRehearsals, rehearsalDay, existingDates);
  const isIncluded = (date: PlannedDate) => overrides[plannedDateKey(date)]?.included ?? !date.alreadyPlanned;
  const praiseFor = (date: PlannedDate) => overrides[plannedDateKey(date)]?.praiseId ?? defaultPraiseId;
  const worshipFor = (date: PlannedDate) => overrides[plannedDateKey(date)]?.worshipId ?? defaultWorshipId;
  const includedDates = plannedDates.filter(isIncluded);
  const snapshotKey = JSON.stringify([monthKey, serviceTime, rehearsalTime, includedDates.map((date) => [plannedDateKey(date), praiseFor(date), worshipFor(date)]),
    members.map(({ profile }) => profile.id).sort(), [...existingDates].sort()]);
  const current = useRef({ ready: scope.ready, snapshotKey });
  current.current = { ready: scope.ready, snapshotKey };

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!result || result.error || result.unknown || !scope.ready || !team || closed.current) return;
    closed.current = true;
    showToast(`${result.created.length} ${result.created.length === 1 ? 'date' : 'dates'} created.`);
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } });
  }, [result, scope.ready, team, router, showToast]);
  useEffect(() => { if (saveError) scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [saveError]);

  const close = () => {
    closed.current = true;
    if (router.canGoBack()) router.back();
    else if (team) router.replace({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } });
    else router.replace('/(tabs)/teams');
  };
  const viewRota = () => {
    if (!scope.ready || !team) return;
    closed.current = true;
    router.replace({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } });
  };
  const setOverride = (date: PlannedDate, patch: DateOverride) => {
    if (requestPending.current || closed.current) return;
    setOverrides((previous) => ({ ...previous, [plannedDateKey(date)]: { ...previous[plannedDateKey(date)], ...patch } }));
    setValidationError(null);
  };
  const revealValidation = () => scrollRef.current?.scrollTo({ y: Math.max(0, validationPosition.current - spacing.md), animated: false });
  const create = async () => {
    if (!active.current || closed.current || !current.current.ready || !team || requestPending.current || result) return;
    setSaveError(null); setValidationError(null);
    if (!includedDates.length) {
      validationPosition.current = datesPosition.current;
      setValidationField('dates');
      setValidationError('Include at least one date. Turn on Sunday services or rehearsals, then check the dates below.');
      requestAnimationFrame(() => { if (active.current) revealValidation(); });
      return;
    }
    const memberIds = new Set(members.map(({ profile }) => profile.id));
    if (includedDates.some((date) => date.kind === 'service' && [praiseFor(date), worshipFor(date)].some((id) => id !== NO_LEADER && !memberIds.has(id)))) {
      validationPosition.current = defaultsPosition.current;
      setValidationField('people');
      setValidationError('A chosen leader is no longer in this team. Choose a current member or Decide later, including any individual date changes.');
      requestAnimationFrame(() => { if (active.current) revealValidation(); });
      return;
    }
    requestPending.current = true; setCreating(true);
    const confirmedSnapshot = snapshotKey;
    const duplicates = includedDates.filter((date) => date.alreadyPlanned).length;
    try {
      const ok = await confirm({ title: `Create ${includedDates.length} ${includedDates.length === 1 ? 'date' : 'dates'}?`,
        message: `This will add ${includedDates.length} ${includedDates.length === 1 ? 'date' : 'dates'} to the ${team.name} rota for ${monthLabel}. You can edit or cancel individual dates afterwards.${duplicates ? ` You have deliberately included ${duplicates} ${duplicates === 1 ? 'date already' : 'dates already'} on the rota; another entry will be created for each.` : ''}`,
        confirmLabel: includedDates.length === 1 ? 'Create date' : 'Create dates', destructive: false });
      if (!ok || !active.current || closed.current) return;
      if (!current.current.ready || current.current.snapshotKey !== confirmedSnapshot) {
        setSaveError('The team or dates changed while you were reviewing. Check the plan before creating it.');
        return;
      }
      // One ordered existing AppData action; its successful prefix is authoritative.
      const saved = await data.addRotaEntries(includedDates.map((date) => ({
        input: { team_id: team.id, title: date.kind === 'service' ? 'Sunday Morning Service' : 'Choir Rehearsal',
          date: date.dateKey, time: date.kind === 'service' ? serviceTime : rehearsalTime, notes: null, created_by: user.profile.id },
        assignments: date.kind === 'service'
          ? [...(praiseFor(date) !== NO_LEADER ? [{ user_id: praiseFor(date), role_name: PRAISE_LEADER_ROLE }] : []),
            ...(worshipFor(date) !== NO_LEADER ? [{ user_id: worshipFor(date), role_name: WORSHIP_LEADER_ROLE }] : [])]
          : members.map(({ profile }) => ({ user_id: profile.id, role_name: CHOIR_MEMBER_ROLE })),
      })));
      if (!active.current || closed.current) return;
      const error = saved.error === null ? null : saved.error instanceof Error ? saved.error.message : 'The remaining dates could not be saved. Please try again after checking the rota.';
      if (saved.created.length > 0 || error === null) setResult({ created: saved.created, total: includedDates.length, teamName: team.name, error });
      else setSaveError(error);
    } catch {
      // A broken action contract gives no trustworthy count. Do not call this a
      // zero-save failure or expose a retry that might recreate saved dates.
      if (active.current && !closed.current) setResult({ created: [], total: includedDates.length, teamName: team.name, error: 'Creation was interrupted. Check the rota to see which dates were saved before starting another plan.', unknown: true });
    } finally { requestPending.current = false; if (active.current) setCreating(false); }
  };

  if (result) return <Screen footer={<View style={styles.actions}>
    <Button title="Close" variant="secondary" onPress={close} style={styles.cancel} />
    {result.error ? <Button title="View rota" disabled={!scope.ready} onPress={viewRota} style={styles.save} /> : null}
  </View>}>
    <Stack.Screen options={{ title: 'Plan the month' }} />
    <PageHeading eyebrow={result.teamName}
      title={result.unknown ? 'Check the rota' : result.error ? `${result.created.length} of ${result.total} ${result.total === 1 ? 'date' : 'dates'} created` : `${result.created.length} ${result.created.length === 1 ? 'date' : 'dates'} created`}
      description={result.error && !result.unknown
        ? `${result.created.length === 1 ? 'The saved date is' : 'The saved dates are'} already on the rota. Check ${result.created.length === 1 ? 'it' : 'them'} before creating the remaining ${result.total - result.created.length === 1 ? 'date' : 'dates'}.`
        : !result.error ? `Your ${result.created.length === 1 ? 'date is' : 'dates are'} saved on the team rota.` : undefined} />
    {result.error ? <StatePanel compact kind="error" title={result.unknown ? 'Could not confirm the result' : 'The plan stopped here'} message={result.error} /> : null}
    {!scope.ready ? <StatePanel compact kind="loading" title="Checking your access…" message="Your result is kept here. You can close this screen or wait to view the rota." /> : null}
    {result.created.length ? <><SectionHeader title={result.created.length === 1 ? 'Date created' : 'Dates created'} /><ListGroup>{result.created.map((entry) => <ListRow key={entry.id} title={entry.title}
      subtitle={fullScheduleDate(parseDateKey(entry.date))} leading={<ScheduleDateMarker date={parseDateKey(entry.date)} label={fullScheduleDate(parseDateKey(entry.date))} />} />)}</ListGroup></> : null}
  </Screen>;
  if (!scope.ready || !team) return <RotaAccessState scope={scope} title="Plan the month" onExit={close} exitLabel="Cancel" />;
  // Creating a plan needs the existing-date read so duplicates are deliberate.
  if (data.rotasLoading && data.rotaEntries.length === 0) return <Screen><Stack.Screen options={{ title: 'Plan the month' }} />
    <StatePanel headingLevel={1} kind="loading" title="Checking existing dates…" /><Button title="Cancel" variant="secondary" onPress={close} />
  </Screen>;
  if (data.rotasError && data.rotaEntries.length === 0) return <Screen><Stack.Screen options={{ title: 'Plan the month' }} />
    <StatePanel headingLevel={1} kind="error" title="Couldn't check existing dates" message={data.rotasError}
      action={{ label: 'Retry rota', onPress: () => void data.refreshRotas() }} /><Button title="Cancel" variant="secondary" onPress={close} />
  </Screen>;

  const leaderOptions = [{ label: 'Decide later', value: NO_LEADER }, ...members.map(({ profile }) => ({ label: profile.full_name, value: profile.id }))];
  const optionsFor = (id: string) => leaderOptions.some((option) => option.value === id) ? leaderOptions
    : [{ label: 'Selected person (no longer in this team)', value: id }, ...leaderOptions];
  const nameFor = (id: string) => leaderOptions.find((option) => option.value === id)?.label ?? 'Selected person is no longer in this team';
  return <Screen keyboard scrollRef={scrollRef} footer={<View style={styles.actions}>
    <Button title="Cancel" variant="secondary" disabled={creating} onPress={close} style={styles.cancel} />
    <Button title={includedDates.length ? `Create ${includedDates.length} ${includedDates.length === 1 ? 'date' : 'dates'}` : 'Create dates'} loading={creating} onPress={() => void create()} style={styles.save} />
  </View>}>
    <Stack.Screen options={{ title: 'Plan the month' }} />
    <PageHeading eyebrow={team.name} title="Plan the month" description="Set the pattern, choose the usual people, then review each date." />
    {saveError ? <StatePanel compact kind="error" title="Couldn't create the plan" message={saveError} /> : null}
    {data.rotasError ? <StatePanel compact kind="error" title="Couldn't refresh existing dates" message="The dates below use the last rota loaded. Check for updates before creating."
      action={{ label: 'Retry rota', onPress: () => void data.refreshRotas() }} /> : null}
    {data.teamsError ? <StatePanel compact kind="error" title="Couldn't refresh people" message="Your choices are kept. Try again for the latest team members."
      action={{ label: 'Retry team', onPress: () => void data.refreshTeams() }} /> : null}
    <FormErrorSummary errors={validationError ? [{ key: 'plan', message: validationError, onPress: revealValidation }] : []} />
    <SelectField label="Month" value={monthKey} options={monthOptions} onChange={(value) => { setMonthKey(value); setValidationError(null); }} disabled={creating} />

    <SectionHeader title="1. Pattern and times" />
    <ListGroup>
      <SwitchRow title="Sunday services" subtitle="Include the remaining Sundays in this month." value={includeSundays} onValueChange={setIncludeSundays} disabled={creating} />
    </ListGroup>
    {includeSundays ? <TimeField label="Service arrival time" value={serviceTime} onChange={setServiceTime} disabled={creating} /> : null}
    <ListGroup>
      <SwitchRow title="Weekly rehearsal" subtitle="Add every choir member so each person can confirm availability." value={includeRehearsals} onValueChange={setIncludeRehearsals} disabled={creating} />
    </ListGroup>
    {includeRehearsals ? <>
      <SelectField label="Rehearsal day" value={rehearsalDay} options={weekdayOptions} onChange={setRehearsalDay} disabled={creating} />
      <TimeField label="Rehearsal time" value={rehearsalTime} onChange={setRehearsalTime} disabled={creating} />
    </> : null}

    {includeSundays ? <View style={styles.section} onLayout={(event) => { defaultsPosition.current = event.nativeEvent.layout.y; }}>
      <SectionHeader title="2. Usual people" />
      {validationError && validationField === 'people' ? <AppText tone="danger" accessibilityRole="alert">{validationError}</AppText> : null}
      <AppText tone="secondary">Use these leaders for each Sunday. One person can lead both sections, and you can change individual dates below.</AppText>
      <SelectField label="Usual praise leader" value={defaultPraiseId} options={optionsFor(defaultPraiseId)} searchable searchPlaceholder="Search names"
        onChange={setDefaultPraiseId} disabled={creating} />
      <SelectField label="Usual worship leader" value={defaultWorshipId} options={optionsFor(defaultWorshipId)} searchable searchPlaceholder="Search names"
        onChange={setDefaultWorshipId} disabled={creating} />
    </View> : null}

    <View style={styles.section} onLayout={(event) => { datesPosition.current = event.nativeEvent.layout.y; }}>
      <SectionHeader title={includeSundays ? '3. Review dates' : '2. Review dates'} />
      {validationError && validationField === 'dates' ? <AppText tone="danger" accessibilityRole="alert">{validationError}</AppText> : null}
      <AppText tone="secondary">{monthLabel} · {includedDates.length} included</AppText>
      {!plannedDates.length ? <StatePanel compact title="No dates to include" message={includeSundays || includeRehearsals
        ? 'There are no remaining dates for this pattern in the selected month. Choose another month or pattern.'
        : 'Turn on Sunday services or a weekly rehearsal to see the dates.'} /> : plannedDates.map((date) => {
        const key = plannedDateKey(date);
        const included = isIncluded(date);
        const custom = overrides[key]?.praiseId !== undefined || overrides[key]?.worshipId !== undefined;
        const title = date.kind === 'service' ? 'Sunday service' : 'Rehearsal';
        const time = date.kind === 'service' ? serviceTime : rehearsalTime;
        return <ListGroup key={key}>
          <SwitchRow title={fullScheduleDate(date.date)} subtitle={`${title}${time ? ` · ${formatClockTime(time)}` : ''}`}
            value={included} onValueChange={(value) => setOverride(date, { included: value })} disabled={creating} />
          {date.alreadyPlanned ? <View style={styles.dateContent}>
            <Badge label="Already on the rota" tone="warning" />
            <AppText tone="secondary">{included ? 'Another entry will be created for this date.' : 'Excluded to avoid a duplicate. Include it only if you want another entry.'}</AppText>
          </View> : null}
          {included && date.kind === 'service' ? <View>
            <View style={styles.dateContent}><AppText tone="secondary">Praise: {nameFor(praiseFor(date))}{'\n'}Worship: {nameFor(worshipFor(date))}</AppText></View>
            <ListRow title={custom ? 'People changed for this date' : 'Change people for this date'} showChevron={false}
              icon={openDates[key] ? 'remove-outline' : 'add-outline'} accessibilityLabel={`Change people for ${fullScheduleDate(date.date)}`}
              accessibilityState={{ expanded: !!openDates[key] }} disabled={creating}
              onPress={() => setOpenDates((previous) => ({ ...previous, [key]: !previous[key] }))} />
            {openDates[key] ? <View style={styles.override}>
              <SelectField label={`Praise leader · ${fullScheduleDate(date.date)}`} value={praiseFor(date)} options={optionsFor(praiseFor(date))}
                searchable searchPlaceholder="Search names" onChange={(value) => setOverride(date, { praiseId: value })} disabled={creating} />
              <SelectField label={`Worship leader · ${fullScheduleDate(date.date)}`} value={worshipFor(date)} options={optionsFor(worshipFor(date))}
                searchable searchPlaceholder="Search names" onChange={(value) => setOverride(date, { worshipId: value })} disabled={creating} />
              {custom ? <Button title="Use usual people" variant="ghost" disabled={creating} onPress={() => {
                setOverrides((previous) => ({ ...previous, [key]: { included: previous[key]?.included } }));
              }} /> : null}
            </View> : null}
          </View> : included ? <View style={styles.dateContent}><AppText tone="secondary">{members.length === 1 ? '1 choir member' : `All ${members.length} choir members`} will be included.</AppText></View> : null}
        </ListGroup>;
      })}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.md, marginTop: spacing.md },
  dateContent: { padding: spacing.lg, gap: spacing.sm },
  override: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cancel: { flexGrow: 1, flexBasis: 90 },
  save: { flexGrow: 2, flexBasis: 160 },
});
