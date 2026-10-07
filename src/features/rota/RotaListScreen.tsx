import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { ActionSheet } from '../../components/ActionSheet';
import { AppText } from '../../components/AppText';
import { availabilityLabels, Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ListRow } from '../../components/ListRow';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { StatePanel } from '../../components/StatePanel';
import { useAppData } from '../../lib/appData/AppDataContext';
import { peopleForEntry, selectionsForEntry } from '../../lib/appData/selectors';
import { canManageTeamRota } from '../../lib/permissions';
import { RotaEntry } from '../../types';
import { formatClockTime, parseDateKey } from '../../utils/dates';
import { useCurrentTime } from '../../utils/useCurrentTime';
import { fullScheduleDate, ScheduleDateMarker } from '../calendar/ScheduleRows';
import { RotaAccessState, RotaScope, RotaScopeValue } from './RotaScope';
import { matchingRotaEntry, teamRotaDates } from './rotaPresentation';

interface RotaSection { key: 'upcoming' | 'past'; data: RotaEntry[] }

export default function RotaListScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string | string[] }>();
  return <RotaScope teamId={typeof teamId === 'string' ? teamId : null} routeKey="list">
    {(scope) => <RotaList scope={scope} />}
  </RotaScope>;
}

function RotaList({ scope }: { scope: RotaScopeValue }) {
  const { user, team } = scope;
  const data = useAppData();
  const now = useCurrentTime();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showPast, setShowPast] = useState(false);
  const [managing, setManaging] = useState(false);
  const [editingDates, setEditingDates] = useState(false);
  const manageRef = useRef<View>(null);
  const active = useRef(true);
  const manager = !!team && canManageTeamRota(user, team.id);
  const current = useRef({ scope, manager, editingDates, entries: data.rotaEntries });
  current.current = { scope, manager, editingDates, entries: data.rotaEntries };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const openManagement = (action: 'add' | 'month' | 'edit') => {
    const latest = current.current;
    if (!active.current || !latest.scope.ready || !latest.manager || !latest.scope.team) return;
    if (action === 'edit') { setEditingDates(true); return; }
    if (action === 'month' && latest.scope.team.type !== 'choir') return;
    router.push({ pathname: action === 'month' ? '/teams/[teamId]/rota/plan-month' : '/teams/[teamId]/rota/edit', params: { teamId: latest.scope.team.id } });
  };
  const openDate = (id: string) => {
    const latest = current.current;
    const latestTeam = latest.scope.team;
    if (!active.current || !latest.scope.ready || !latestTeam || (latest.editingDates && !latest.manager)
      || !matchingRotaEntry(latest.entries, id, latestTeam.id, latest.scope.user.profile.organisation_id)) return;
    router.push({ pathname: latest.editingDates ? '/teams/[teamId]/rota/edit' : '/teams/[teamId]/rota/[entryId]', params: { teamId: latestTeam.id, entryId: id } });
  };
  if (!scope.ready || !team) return <RotaAccessState scope={scope} />;
  const { upcoming, past } = teamRotaDates(data.rotaEntries, team.id, user.profile.organisation_id, now);
  const hasDates = upcoming.length > 0 || past.length > 0;
  const sections: RotaSection[] = !hasDates && (data.rotasLoading || data.rotasError) ? [] : [
    { key: 'upcoming', data: upcoming }, ...(past.length ? [{ key: 'past' as const, data: showPast ? past : [] }] : []),
  ];

  const dateRow = (entry: RotaEntry, index: number, section: RotaSection) => {
    const date = parseDateKey(entry.date);
    const people = peopleForEntry(entry.id, data.rotaAssignments, data.availabilityResponses);
    const me = people.find((person) => person.userId === user.profile.id);
    const cancelled = entry.status === 'cancelled';
    const time = entry.time ? formatClockTime(entry.time) : '';
    const songCount = team.type === 'choir' && !data.songsLoading && !data.songsError
      ? selectionsForEntry(entry.id, data.songSelections).length : undefined;
    const context = [
      [date.toLocaleDateString(undefined, { weekday: 'long' }), time].filter(Boolean).join(' · '),
      cancelled ? null : me ? `You: ${me.roleSummary}` : `${people.length} ${people.length === 1 ? 'person' : 'people'} serving`,
      !cancelled && me ? me.status === 'not_responded' ? 'Response needed' : `Your response: ${availabilityLabels[me.status]}` : null,
      !cancelled && songCount !== undefined ? songCount ? `${songCount} ${songCount === 1 ? 'song' : 'songs'} selected` : 'No songs selected yet' : null,
    ].filter(Boolean).join('\n');
    return <Pressable key={entry.id} accessibilityRole="button"
      accessibilityLabel={`${editingDates ? 'Edit ' : ''}${entry.title}. ${fullScheduleDate(date)}. ${cancelled ? 'Cancelled. ' : ''}${context}`}
      accessibilityHint={editingDates ? 'Opens the form to edit this date' : 'Opens the date, people serving and availability'}
      style={({ pressed }) => [styles.dateRow, index === 0 && styles.firstDate, index === section.data.length - 1 && styles.lastDate, pressed && styles.pressed]}
      onPress={() => openDate(entry.id)}>
      <ScheduleDateMarker date={date} label={fullScheduleDate(date)} />
      <View style={styles.dateText}>
        <AppText variant="bodyBold">{entry.title}</AppText>
        {cancelled ? <Badge label="Cancelled" tone="danger" /> : null}
        <AppText variant="small" tone="secondary">{context}</AppText>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.textMuted} accessible={false} aria-hidden style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
    </Pressable>;
  };

  return <Screen scroll={false} footer={editingDates ? <Button title="Done" variant="secondary" onPress={() => setEditingDates(false)} /> : undefined}>
    <Stack.Screen options={{ title: editingDates ? 'Edit dates' : 'Rota' }} />
    <SectionList<RotaEntry, RotaSection>
      sections={sections} keyExtractor={(entry) => entry.id} stickySectionHeadersEnabled={false}
      contentContainerStyle={[styles.content, { paddingBottom: editingDates ? spacing.xl : spacing.xxl * 2 + insets.bottom }]}
      ListHeaderComponent={<View style={styles.heading}>
        <PageHeading eyebrow={team.name} title={editingDates ? 'Edit dates' : 'Rota'}
          description={editingDates ? 'Choose a date below to edit its details or people. Select Done to return to reading the rota.' : 'Serving dates for your team.'}
          action={!editingDates && manager ? <Button ref={manageRef} title="Manage" accessibilityLabel="Manage rota" variant="ghost" icon="options-outline" onPress={() => {
              if (active.current && current.current.scope.ready && current.current.manager) setManaging(true);
            }} /> : undefined} />
        {data.teamsError ? <StatePanel compact kind="error" title="Couldn't refresh the team" message={data.teamsError}
          action={{ label: 'Retry team', onPress: () => void data.refreshTeams() }} /> : null}
        {data.rotasError && hasDates ? <StatePanel compact kind="error" title="Couldn't refresh the rota" message="These are the last dates loaded. Try again for the latest changes."
          action={{ label: 'Retry rota', onPress: () => void data.refreshRotas() }} /> : null}
        {!hasDates && data.rotasLoading ? <StatePanel headingLevel={2} kind="loading" title="Loading the rota…" />
          : !hasDates && data.rotasError ? <StatePanel headingLevel={2} kind="error" title="Couldn't load the rota" message={data.rotasError}
            action={{ label: 'Retry rota', onPress: () => void data.refreshRotas() }} /> : null}
      </View>}
      renderSectionHeader={({ section }) => section.key === 'upcoming'
        ? <View style={styles.sectionHeading}><SectionHeader title="Upcoming dates" />
          {!upcoming.length ? <StatePanel compact title="No upcoming dates" message={manager ? 'Add a date when your team is ready to plan.' : 'Your team admin will add dates here when they are ready.'}
            action={manager ? { label: 'Add a date', onPress: () => openManagement('add') } : undefined} /> : null}</View>
        : <View style={styles.pastHeading}>
          <ListRow title="Past dates" subtitle={`${past.length} ${past.length === 1 ? 'date' : 'dates'} in team history`} showChevron={false}
            icon={showPast ? 'remove-outline' : 'add-outline'} accessibilityState={{ expanded: showPast }} onPress={() => setShowPast((value) => !value)} />
        </View>}
      renderItem={({ item, index, section }) => dateRow(item, index, section)} />
    {manager ? <ActionSheet visible={managing} title="Manage rota" description={team.name} returnFocusRef={manageRef} onClose={() => setManaging(false)} actions={[
      { key: 'add', label: 'Add a date', icon: 'add-outline', onPress: () => openManagement('add') },
      { key: 'edit', label: 'Edit dates', description: 'Choose dates from this rota to edit.', icon: 'create-outline', disabled: !hasDates, onPress: () => openManagement('edit') },
      ...(team.type === 'choir' ? [{ key: 'month', label: 'Plan the month', description: 'Sunday services and weekly rehearsals', icon: 'calendar-number-outline' as const,
        onPress: () => openManagement('month') }] : []),
    ]} /> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.gutter },
  heading: { gap: spacing.md, marginBottom: spacing.md },
  sectionHeading: { gap: spacing.md, marginBottom: spacing.md },
  pastHeading: { marginTop: spacing.lg, marginBottom: spacing.md },
  dateRow: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface,
    borderColor: colors.border, borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: StyleSheet.hairlineWidth },
  firstDate: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  lastDate: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  dateText: { flex: 1, gap: spacing.xs },
  chevron: { alignSelf: 'center' },
  pressed: { backgroundColor: colors.primarySoft },
});
