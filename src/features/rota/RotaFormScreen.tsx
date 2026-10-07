import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { DateField, TimeField } from '../../components/DateTimeFields';
import { FormErrorSummary } from '../../components/FormErrorSummary';
import { ListGroup } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { SelectField } from '../../components/SelectField';
import { StatePanel } from '../../components/StatePanel';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { teamMembers, userName } from '../../lib/appData/selectors';
import { CHOIR_MEMBER_ROLE } from '../../lib/permissions';
import { RotaEntry } from '../../types';
import { RotaAccessState, RotaScope, RotaScopeValue } from './RotaScope';
import { completeAssignments, DraftAssignment, matchingRotaEntry, RotaDraft, rotaDraft, RotaErrors, RotaField, rotaRoles, validateRotaDraft } from './rotaPresentation';

export default function RotaFormScreen() {
  const { teamId, entryId } = useLocalSearchParams<{ teamId: string | string[]; entryId?: string | string[] }>();
  return <RotaScope teamId={typeof teamId === 'string' ? teamId : null} routeKey={entryId === undefined ? 'new' : `edit:${String(entryId)}`} management>
    {(scope) => <RotaForm scope={scope} entryId={typeof entryId === 'string' ? entryId : null} editing={entryId !== undefined} />}
  </RotaScope>;
}

function RotaForm({ scope, entryId, editing }: { scope: RotaScopeValue; entryId: string | null; editing: boolean }) {
  const { user, team } = scope;
  const router = useRouter();
  const data = useAppData();
  const showToast = useToast();
  const existing = matchingRotaEntry(data.rotaEntries, entryId, team?.id ?? null, user.profile.organisation_id);
  const original = useRef<RotaEntry | undefined>(undefined);
  const [draft, setDraft] = useState<RotaDraft | null>(null);
  const [errors, setErrors] = useState<RotaErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [openAssignment, setOpenAssignment] = useState<string | null>(null);
  const nextAssignmentId = useRef(1);
  const assignmentToReveal = useRef<string | null>(null);
  const active = useRef(true);
  const requestPending = useRef(false);
  const closed = useRef(false);
  const current = useRef({ ready: scope.ready, existing });
  current.current = { ready: scope.ready, existing };
  const scrollRef = useRef<ScrollView>(null);
  const titleRef = useRef<TextInput>(null);
  const positions = useRef<Partial<Record<RotaField, number>>>({});
  const heading = editing ? 'Edit date' : 'Add a date';

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (draft || !scope.ready || (editing && !existing)) return;
    original.current = existing;
    const initial = rotaDraft(existing, data.rotaAssignments);
    setDraft(initial);
    setOpenAssignment(initial.assignments.find((assignment) => !assignment.user_id || !assignment.role_name)?.localId ?? null);
  }, [draft, scope.ready, editing, existing, data.rotaAssignments]);
  useEffect(() => {
    if (!savedId || !scope.ready || !team || closed.current) return;
    closed.current = true;
    showToast(editing ? 'Date updated.' : 'Date added.');
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: team.id, entryId: savedId } });
  }, [savedId, scope.ready, team, editing, router, showToast]);
  useEffect(() => { if (saveError) scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [saveError]);

  const close = () => {
    closed.current = true;
    if (router.canGoBack()) router.back();
    else if (team && editing && entryId) router.replace({ pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: team.id, entryId } });
    else if (team) router.replace({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } });
    else router.replace('/(tabs)/teams');
  };
  const focusField = (field: RotaField) => {
    if (field.startsWith('assignment:')) {
      const assignment = draft?.assignments[Number(field.split(':')[1])];
      if (assignment && assignment.localId !== openAssignment) {
        // The opened row's layout will reveal its final position after any
        // editor above it collapses, rather than scrolling to a stale offset.
        assignmentToReveal.current = assignment.localId;
        setOpenAssignment(assignment.localId);
        return;
      }
    }
    scrollRef.current?.scrollTo({ y: Math.max(0, (positions.current[field] ?? 0) - spacing.md), animated: false });
    if (field === 'title') titleRef.current?.focus();
  };
  const change = <K extends keyof RotaDraft>(field: K, value: RotaDraft[K]) => {
    if (requestPending.current || closed.current) return;
    setDraft((previous) => previous ? { ...previous, [field]: value } : previous);
    setErrors((previous) => field === 'assignments'
      ? Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith('assignment:')))
      : { ...previous, [field]: undefined });
  };
  const updateAssignment = (localId: string, patch: Partial<Pick<DraftAssignment, 'user_id' | 'role_name'>>) => {
    if (draft) change('assignments', draft.assignments.map((assignment) => assignment.localId === localId ? { ...assignment, ...patch } : assignment));
  };
  const newAssignment = (user_id: string | null = null, role_name: string | null = null): DraftAssignment => (
    { localId: `new:${nextAssignmentId.current++}`, user_id, role_name }
  );
  const removeAssignment = (localId: string) => {
    if (!draft || requestPending.current || closed.current) return;
    const remaining = draft.assignments.filter((assignment) => assignment.localId !== localId);
    change('assignments', remaining);
    if (openAssignment === localId) {
      const incomplete = remaining.find((assignment) => !assignment.user_id || !assignment.role_name)?.localId ?? null;
      assignmentToReveal.current = incomplete;
      setOpenAssignment(incomplete);
    }
  };
  const save = async () => {
    if (!active.current || closed.current || !draft || !team || !current.current.ready || requestPending.current || savedId || (editing && !current.current.existing)) return;
    const validated = validateRotaDraft(draft);
    setErrors(validated); setSaveError(null);
    if (Object.keys(validated).length) {
      requestAnimationFrame(() => { if (active.current && !closed.current) focusField(Object.keys(validated)[0] as RotaField); });
      return;
    }
    requestPending.current = true; setSaving(true);
    const record = { team_id: team.id, title: draft.title.trim(), date: draft.dateKey!, time: draft.time, notes: draft.notes.trim() || null,
      created_by: original.current?.created_by ?? user.profile.id };
    try {
      let id: string;
      if (editing && existing) { await data.updateRotaEntry(existing.id, record, completeAssignments(draft.assignments)); id = existing.id; }
      else id = (await data.addRotaEntry(record, completeAssignments(draft.assignments))).id;
      if (active.current && !closed.current) setSavedId(id);
    } catch (error) {
      if (active.current && !closed.current) setSaveError(error instanceof Error ? error.message : 'Your changes could not be saved. Please try again.');
    } finally { requestPending.current = false; if (active.current) setSaving(false); }
  };

  if (savedId) return <Screen><Stack.Screen options={{ title: 'Date saved' }} />
    <PageHeading title={editing ? 'Changes saved' : 'Date added'} description="Your date is saved on the team rota." />
    {!scope.ready ? <StatePanel compact kind="loading" title="Checking your access…" message="You can close this screen or wait to continue." /> : null}
    <Button title="Close" variant="secondary" onPress={close} />
  </Screen>;
  if (!scope.ready || !team) return <RotaAccessState scope={scope} title={heading} onExit={close} exitLabel="Cancel" />;
  if (editing && !existing) return <Screen><Stack.Screen options={{ title: heading }} />
    {data.rotasLoading ? <StatePanel headingLevel={1} kind="loading" title="Loading this date…" />
      : data.rotasError ? <StatePanel headingLevel={1} kind="error" title="Couldn't load this date" message={data.rotasError}
        action={{ label: 'Retry rota', onPress: () => void data.refreshRotas() }} />
        : <StatePanel headingLevel={1} title="Date unavailable" message="This date may have been removed or belongs to a different team." />}
    <Button title="Back to rota" variant="secondary" onPress={() => { closed.current = true; router.replace({ pathname: '/teams/[teamId]/rota', params: { teamId: team.id } }); }} />
  </Screen>;
  if (!draft) return <Screen><Stack.Screen options={{ title: heading }} /><StatePanel headingLevel={1} kind="loading" title="Preparing the date…" /></Screen>;

  const members = teamMembers(team.id, data.memberships, data.users).filter(({ profile }) => profile.organisation_id === user.profile.organisation_id);
  const basePeople = members.map(({ profile }) => ({ label: profile.full_name, value: profile.id }));
  const roles = rotaRoles[team.type] ?? rotaRoles.generic;
  return <Screen keyboard scrollRef={scrollRef} footer={<View style={styles.actions}>
    <Button title="Cancel" variant="secondary" disabled={saving} onPress={close} style={styles.cancel} />
    <Button title={editing ? 'Save changes' : 'Save date'} loading={saving} onPress={() => void save()} style={styles.save} />
  </View>}>
    <Stack.Screen options={{ title: heading }} />
    <PageHeading eyebrow={team.name} title={heading} />
    {existing?.status === 'cancelled' ? <StatePanel compact kind="info" title="This date is cancelled" message="Saving changes keeps it cancelled. You can restore it from the date's Manage menu." /> : null}
    {saveError ? <StatePanel compact kind="error" title="Couldn't save the date" message={saveError} /> : null}
    {data.rotasError && editing ? <StatePanel compact kind="error" title="Couldn't refresh this date" message={data.rotasError}
      action={{ label: 'Retry rota', onPress: () => void data.refreshRotas() }} /> : null}
    {data.teamsError ? <StatePanel compact kind="error" title="Couldn't refresh people" message="Your choices are kept. Try again for the latest team members."
      action={{ label: 'Retry team', onPress: () => void data.refreshTeams() }} /> : null}
    <FormErrorSummary errors={Object.entries(errors).filter(([, message]) => !!message).map(([key, message]) => ({ key, message: message!, onPress: () => focusField(key as RotaField) }))} />
    <View onLayout={(event) => { positions.current.title = event.nativeEvent.layout.y; }}>
      <TextField ref={titleRef} label="Title / service name" placeholder="e.g. Sunday morning service" value={draft.title} onChangeText={(value) => change('title', value)} error={errors.title} editable={!saving} />
    </View>
    <View onLayout={(event) => { positions.current.dateKey = event.nativeEvent.layout.y; }}>
      <DateField label="Date" value={draft.dateKey} onChange={(value) => change('dateKey', value)} error={errors.dateKey} disabled={saving} />
    </View>
    <TimeField label="Time (optional)" value={draft.time} onChange={(value) => change('time', value)} optional disabled={saving} />
    <ListRow title="Notes (optional)" subtitle={notesOpen ? undefined : draft.notes.trim() ? 'Notes added' : 'Arrival details or anything the team should know'} icon={notesOpen ? 'remove-outline' : 'add-outline'}
      showChevron={false} accessibilityState={{ expanded: notesOpen }} disabled={saving} onPress={() => setNotesOpen((value) => !value)} />
    {notesOpen ? <TextField label="Notes" placeholder="e.g. Please arrive early for warm-up." value={draft.notes} onChangeText={(value) => change('notes', value)} multiline editable={!saving} /> : null}

    <View style={styles.section}>
      <SectionHeader title="People serving" />
      <AppText tone="secondary">{team.type === 'choir'
        ? 'Choose a person for each role. One person can be both Praise Leader and Worship Leader.'
        : 'Choose a person for each role. Add the same person again if they have another role.'}</AppText>
    </View>
    {draft.assignments.length === 0 ? <AppText tone="secondary">No people yet. You can save this date and add them later.</AppText> : null}
    {draft.assignments.map((assignment, index) => {
      const personOptions = [...basePeople];
      if (assignment.user_id && !personOptions.some((option) => option.value === assignment.user_id)) {
        personOptions.unshift({ value: assignment.user_id, label: `${userName(data.users, assignment.user_id)} (currently assigned)` });
      }
      const roleOptions = [...roles];
      if (assignment.role_name && !roleOptions.includes(assignment.role_name)) roleOptions.unshift(assignment.role_name);
      const error = errors[`assignment:${index}`];
      const open = openAssignment === assignment.localId;
      const name = assignment.user_id ? userName(data.users, assignment.user_id) : `Person ${index + 1}`;
      const role = assignment.role_name ?? 'Choose a role';
      return <View key={assignment.localId} onLayout={(event) => {
        positions.current[`assignment:${index}`] = event.nativeEvent.layout.y;
        if (assignmentToReveal.current === assignment.localId) {
          assignmentToReveal.current = null;
          scrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - spacing.md), animated: false });
        }
      }}>
        <ListGroup>
          <ListRow title={name} subtitle={role} showChevron={false} disabled={saving}
            accessibilityLabel={`${open ? 'Editing' : 'Edit'} person ${index + 1}: ${name}, ${role}`}
            accessibilityState={{ expanded: open }} onPress={() => setOpenAssignment(assignment.localId)}
            right={<AppText variant="label" tone="primary">{open ? 'Editing' : 'Edit'}</AppText>} />
          {open ? <View style={styles.assignment}>
            <SelectField label={`Person ${index + 1}`} placeholder="Choose a team member" value={assignment.user_id}
              options={personOptions} searchable searchPlaceholder="Search names" disabled={saving} error={error && !assignment.user_id ? error : undefined}
              onChange={(value) => updateAssignment(assignment.localId, { user_id: value })} />
            <SelectField label={`Role for person ${index + 1}`} placeholder="Choose a role" value={assignment.role_name}
              options={roleOptions.map((role) => ({ label: role, value: role }))} disabled={saving} error={error && assignment.user_id ? error : undefined}
              onChange={(value) => updateAssignment(assignment.localId, { role_name: value })} />
            <View style={styles.assignmentActions}>
              <Button title="Remove" accessibilityLabel={`Remove person ${index + 1}${assignment.user_id ? `: ${name}` : ''}${assignment.role_name ? `, ${assignment.role_name}` : ''}`}
                variant="ghost" icon="remove-circle-outline" disabled={saving} onPress={() => removeAssignment(assignment.localId)} />
              <Button title="Done" accessibilityLabel={`Done editing person ${index + 1}`} variant="secondary"
                disabled={saving || !assignment.user_id || !assignment.role_name} onPress={() => setOpenAssignment(null)} />
            </View>
          </View> : error ? <AppText tone="danger" accessibilityRole="alert" style={styles.assignmentError}>{error}</AppText> : null}
        </ListGroup>
      </View>;
    })}
    <Button title="Add person or role" variant="secondary" icon="person-add-outline" disabled={saving}
      onPress={() => {
        if (requestPending.current || closed.current) return;
        const assignment = newAssignment();
        change('assignments', [...draft.assignments, assignment]);
        assignmentToReveal.current = assignment.localId;
        setOpenAssignment(assignment.localId);
      }} />
    {team.type === 'choir' ? <Button title="Add all choir members" variant="secondary" icon="people-outline" disabled={saving}
      accessibilityHint="Adds anyone not already on this date as a Choir Member, for example for a rehearsal"
      onPress={() => {
        if (requestPending.current || closed.current) return;
        const assignedIds = new Set(draft.assignments.map((assignment) => assignment.user_id).filter(Boolean));
        const missing = members.filter(({ profile }) => !assignedIds.has(profile.id)).map(({ profile }) => newAssignment(profile.id, CHOIR_MEMBER_ROLE));
        if (missing.length) {
          const updated = [...draft.assignments.filter((assignment) => assignment.user_id || assignment.role_name), ...missing];
          change('assignments', updated);
          if (!updated.some((assignment) => assignment.localId === openAssignment)) {
            setOpenAssignment(updated.find((assignment) => !assignment.user_id || !assignment.role_name)?.localId ?? null);
          }
        }
      }} /> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, marginTop: spacing.md },
  assignment: { gap: spacing.md, padding: spacing.lg },
  assignmentActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  assignmentError: { padding: spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cancel: { flexGrow: 1, flexBasis: 100 },
  save: { flexGrow: 2, flexBasis: 160 },
});
