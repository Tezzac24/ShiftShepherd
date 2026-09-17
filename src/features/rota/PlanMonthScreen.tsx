import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useConfirm } from '../../components/ConfirmDialog';
import { TimeField } from '../../components/DateTimeFields';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { SelectField } from '../../components/SelectField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { rotaEntriesForTeam, teamMembers } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import {
  canManageTeamRota,
  CHOIR_MEMBER_ROLE,
  PRAISE_LEADER_ROLE,
  WORSHIP_LEADER_ROLE,
} from '../../lib/permissions';
import { formatFullDate, toDateKey } from '../../utils/dates';

const NONE = 'none';

interface PlannedDate {
  dateKey: string;
  date: Date;
  kind: 'service' | 'rehearsal';
  /** An entry already exists for this team on this date. */
  alreadyPlanned: boolean;
}

interface DateOverride {
  included?: boolean;
  praiseId?: string;
  worshipId?: string;
}

/** All dates in a month falling on `weekday` (0=Sun..6=Sat), today or later. */
function datesInMonthOnWeekday(year: number, month: number, weekday: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result: Date[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    if (d.getDay() === weekday && d >= today) result.push(d);
  }
  return result;
}

const weekdayOptions = [
  { label: 'Monday', value: '1' },
  { label: 'Tuesday', value: '2' },
  { label: 'Wednesday', value: '3' },
  { label: 'Thursday', value: '4' },
  { label: 'Friday', value: '5' },
  { label: 'Saturday', value: '6' },
  { label: 'Sunday', value: '0' },
];

/**
 * Plan a whole month of choir rota entries in one go: Sunday services (with
 * Praise/Worship leaders per date) and an optional weekly rehearsal where
 * every choir member is included so they can confirm availability.
 */
export default function PlanMonthScreen() {
  const router = useRouter();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const confirm = useConfirm();
  const showToast = useToast();

  const team = data.teams.find((t) => t.id === teamId);

  // Current month + the next three. Default to next month — the rota is
  // usually planned for the month ahead.
  const monthOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 4 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return {
        value: `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`,
        label: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      };
    });
  }, []);

  const [monthKey, setMonthKey] = useState(monthOptions[1]?.value ?? monthOptions[0].value);
  const [includeSundays, setIncludeSundays] = useState(true);
  const [serviceTime, setServiceTime] = useState<string | null>('09:15');
  const [includeRehearsals, setIncludeRehearsals] = useState(false);
  const [rehearsalDay, setRehearsalDay] = useState('6'); // Saturday
  const [rehearsalTime, setRehearsalTime] = useState<string | null>('17:00');
  const [defaultPraiseId, setDefaultPraiseId] = useState<string>(NONE);
  const [defaultWorshipId, setDefaultWorshipId] = useState<string>(NONE);
  const [overrides, setOverrides] = useState<Record<string, DateOverride>>({});
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (!team || team.type !== 'choir' || !canManageTeamRota(user, team.id)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Plan the Month' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="Only the choir team leader or a church admin can plan the monthly rota."
        />
      </Screen>
    );
  }

  const members = teamMembers(team.id, data.memberships, data.users);
  const leaderOptions = [
    { label: 'Decide later', value: NONE },
    ...members.map(({ profile }) => ({ label: profile.full_name, value: profile.id })),
  ];

  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const monthLabel = monthOptions.find((o) => o.value === monthKey)?.label ?? monthKey;

  const existingDates = new Set(
    rotaEntriesForTeam(team.id, data.rotaEntries).map((e) => e.date),
  );

  const plannedDates: PlannedDate[] = [
    ...(includeSundays
      ? datesInMonthOnWeekday(year, month, 0).map((date) => ({
          dateKey: toDateKey(date),
          date,
          kind: 'service' as const,
          alreadyPlanned: existingDates.has(toDateKey(date)),
        }))
      : []),
    ...(includeRehearsals
      ? datesInMonthOnWeekday(year, month, Number(rehearsalDay)).map((date) => ({
          dateKey: toDateKey(date),
          date,
          kind: 'rehearsal' as const,
          alreadyPlanned: existingDates.has(toDateKey(date)),
        }))
      : []),
  ].sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const overrideKey = (d: PlannedDate) => `${d.kind}:${d.dateKey}`;
  const isIncluded = (d: PlannedDate) =>
    overrides[overrideKey(d)]?.included ?? !d.alreadyPlanned;
  const praiseFor = (d: PlannedDate) => overrides[overrideKey(d)]?.praiseId ?? defaultPraiseId;
  const worshipFor = (d: PlannedDate) => overrides[overrideKey(d)]?.worshipId ?? defaultWorshipId;

  const setOverride = (d: PlannedDate, patch: DateOverride) => {
    setOverrides((prev) => ({
      ...prev,
      [overrideKey(d)]: { ...prev[overrideKey(d)], ...patch },
    }));
  };

  const includedDates = plannedDates.filter(isIncluded);

  const handleCreate = async () => {
    if (creating) return;
    if (includedDates.length === 0) {
      setError('There are no dates to create. Turn on Sunday services or rehearsals, or include a date.');
      return;
    }
    setError(null);
    const ok = await confirm({
      title: `Create ${includedDates.length} rota ${includedDates.length === 1 ? 'entry' : 'entries'}?`,
      message: `This will add ${includedDates.length} ${includedDates.length === 1 ? 'date' : 'dates'} to the ${team.name} rota for ${monthLabel}. You can still edit or cancel individual dates afterwards.`,
      confirmLabel: 'Create Entries',
      destructive: false,
    });
    if (!ok) return;

    setCreating(true);
    // The whole month is one plan: entries are saved in order, and the people
    // added hear about it once rather than once per date.
    const { created, error: createError } = await data.addRotaEntries(
      includedDates.map((planned) =>
        planned.kind === 'service'
          ? {
              input: {
                team_id: team.id,
                title: 'Sunday Morning Service',
                date: planned.dateKey,
                time: serviceTime,
                notes: null,
                created_by: user.profile.id,
              },
              assignments: [
                ...(praiseFor(planned) !== NONE
                  ? [{ user_id: praiseFor(planned), role_name: PRAISE_LEADER_ROLE }]
                  : []),
                ...(worshipFor(planned) !== NONE
                  ? [{ user_id: worshipFor(planned), role_name: WORSHIP_LEADER_ROLE }]
                  : []),
              ],
            }
          : {
              input: {
                team_id: team.id,
                title: 'Choir Rehearsal',
                date: planned.dateKey,
                time: rehearsalTime,
                notes: null,
                created_by: user.profile.id,
              },
              // Every choir member is expected at rehearsal, so everyone can
              // confirm their availability.
              assignments: members.map(({ profile }) => ({
                user_id: profile.id,
                role_name: CHOIR_MEMBER_ROLE,
              })),
            },
      ),
    );
    const createdCount = created.length;
    if (createError === null) {
      showToast(
        `${createdCount} rota ${createdCount === 1 ? 'entry' : 'entries'} created.`,
      );
      router.back();
      return;
    }
    const message =
      createError instanceof Error
        ? createError.message
        : 'Your changes could not be saved. Please try again.';
    // Entries created before the failure are on the rota already — say so,
    // so nobody re-creates the whole month and doubles up dates.
    setError(
      createdCount > 0
        ? `${message} ${createdCount} of ${includedDates.length} ${createdCount === 1 ? 'date was' : 'dates were'} created before the problem — check the rota before trying again.`
        : message,
    );
    setCreating(false);
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: 'Plan the Month' }} />

      <AppText tone="secondary">
        Set up the whole month in one go. Pick the pattern, choose the leaders, then check the
        dates below before creating them.
      </AppText>

      <SelectField label="Month" value={monthKey} options={monthOptions} onChange={setMonthKey} />

      <Card style={styles.patternCard}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Sunday services</AppText>
            <AppText variant="small" tone="secondary">
              Add every Sunday in {monthLabel}.
            </AppText>
          </View>
          <Switch
            value={includeSundays}
            onValueChange={setIncludeSundays}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            accessibilityLabel="Include Sunday services"
          />
        </View>
        {includeSundays ? (
          <TimeField label="Service arrival time" value={serviceTime} onChange={setServiceTime} />
        ) : null}
      </Card>

      <Card style={styles.patternCard}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Weekly rehearsal</AppText>
            <AppText variant="small" tone="secondary">
              Everyone in the choir is included, so each member can confirm if they can make it.
            </AppText>
          </View>
          <Switch
            value={includeRehearsals}
            onValueChange={setIncludeRehearsals}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            accessibilityLabel="Include weekly rehearsals"
          />
        </View>
        {includeRehearsals ? (
          <>
            <SelectField
              label="Rehearsal day"
              value={rehearsalDay}
              options={weekdayOptions}
              onChange={setRehearsalDay}
            />
            <TimeField label="Rehearsal time" value={rehearsalTime} onChange={setRehearsalTime} />
          </>
        ) : null}
      </Card>

      {includeSundays ? (
        <>
          <SectionHeader title="Usual Leaders" />
          <AppText variant="small" tone="secondary">
            These are used for every Sunday unless you change a date below. One person can lead
            both.
          </AppText>
          <SelectField
            label="Praise leader"
            value={defaultPraiseId}
            options={leaderOptions}
            onChange={setDefaultPraiseId}
          />
          <SelectField
            label="Worship leader"
            value={defaultWorshipId}
            options={leaderOptions}
            onChange={setDefaultWorshipId}
          />
        </>
      ) : null}

      <SectionHeader title={`Dates in ${monthLabel}`} />
      {plannedDates.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="No dates yet"
          message="Turn on Sunday services or a weekly rehearsal to see the dates for this month."
        />
      ) : (
        plannedDates.map((planned) => {
          const included = isIncluded(planned);
          return (
            <Card key={overrideKey(planned)} style={styles.dateCard}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold">{formatFullDate(planned.date)}</AppText>
                  <View style={styles.dateMetaRow}>
                    <Badge
                      label={planned.kind === 'service' ? 'Sunday Service' : 'Rehearsal'}
                      tone={planned.kind === 'service' ? 'primary' : 'accent'}
                    />
                    {planned.alreadyPlanned ? (
                      <Badge label="Already on the rota" tone="warning" />
                    ) : null}
                  </View>
                </View>
                <Switch
                  value={included}
                  onValueChange={(v) => setOverride(planned, { included: v })}
                  trackColor={{ true: colors.primary, false: colors.borderStrong }}
                  accessibilityLabel={`Include ${formatFullDate(planned.date)}`}
                />
              </View>
              {included && planned.kind === 'service' ? (
                <>
                  <SelectField
                    label="Praise leader"
                    value={praiseFor(planned)}
                    options={leaderOptions}
                    onChange={(v) => setOverride(planned, { praiseId: v })}
                  />
                  <SelectField
                    label="Worship leader"
                    value={worshipFor(planned)}
                    options={leaderOptions}
                    onChange={(v) => setOverride(planned, { worshipId: v })}
                  />
                </>
              ) : null}
              {included && planned.kind === 'rehearsal' ? (
                <AppText variant="small" tone="secondary">
                  All {members.length} choir members will be asked to confirm their availability.
                </AppText>
              ) : null}
            </Card>
          );
        })
      )}

      {error ? (
        <AppText tone="danger" style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Button
          title={
            creating
              ? 'Creating…'
              : includedDates.length > 0
                ? `Create ${includedDates.length} Rota ${includedDates.length === 1 ? 'Entry' : 'Entries'}`
                : 'Create Rota Entries'
          }
          icon="checkmark-outline"
          loading={creating}
          disabled={creating}
          onPress={() => void handleCreate()}
        />
        <Button
          title="Cancel"
          variant="secondary"
          onPress={() => router.back()}
          disabled={creating}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  patternCard: { gap: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateCard: { gap: spacing.md },
  dateMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  error: { textAlign: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
