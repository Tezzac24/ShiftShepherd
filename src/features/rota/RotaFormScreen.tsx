import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { DateField, TimeField } from '../../components/DateTimeFields';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { assignmentsForEntry, teamMembers } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import {
  canManageTeamRota,
  CHOIR_MEMBER_ROLE,
  PRAISE_LEADER_ROLE,
  WORSHIP_LEADER_ROLE,
} from '../../lib/permissions';

/** Suggested roles per team type. Leaders can also type a custom role. */
const roleSuggestions: Record<string, string[]> = {
  choir: [PRAISE_LEADER_ROLE, WORSHIP_LEADER_ROLE, CHOIR_MEMBER_ROLE, 'Backup Vocal'],
  media: ['Sound', 'Camera', 'Slides', 'Livestream'],
  generic: ['Team Member', 'Front Door', 'Welcome Desk', 'Setup', 'Offering'],
};

interface DraftAssignment {
  user_id: string | null;
  role_name: string | null;
}

/** Create/edit rota entry — team leaders only. Supports multiple assignments. */
export default function RotaFormScreen() {
  const router = useRouter();
  const { teamId, entryId } = useLocalSearchParams<{ teamId: string; entryId?: string }>();
  const user = useRequiredUser();
  const data = useAppData();
  const showToast = useToast();

  const team = data.teams.find((t) => t.id === teamId);
  const existing = entryId ? data.rotaEntries.find((e) => e.id === entryId) : undefined;
  const editing = !!existing;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [dateKey, setDateKey] = useState<string | null>(existing?.date ?? null);
  const [time, setTime] = useState<string | null>(existing?.time ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [assignments, setAssignments] = useState<DraftAssignment[]>(
    existing
      ? assignmentsForEntry(existing.id, data.rotaAssignments).map((a) => ({
          user_id: a.user_id,
          role_name: a.role_name,
        }))
      : [{ user_id: null, role_name: null }],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!team || !canManageTeamRota(user, team.id)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Rota' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="You do not have permission to do that."
        />
      </Screen>
    );
  }

  const members = teamMembers(team.id, data.memberships, data.users);
  const roles = roleSuggestions[team.type] ?? roleSuggestions.generic;

  const updateAssignment = (index: number, patch: Partial<DraftAssignment>) => {
    setAssignments((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const removeAssignment = (index: number) => {
    setAssignments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (saving) return;
    if (!title.trim() || !dateKey) {
      setError('Please add a title and choose a date.');
      return;
    }
    const complete = assignments.filter(
      (a): a is { user_id: string; role_name: string } => !!a.user_id && !!a.role_name,
    );
    if (assignments.some((a) => (a.user_id && !a.role_name) || (!a.user_id && a.role_name))) {
      setError('Each assignment needs both a person and a role.');
      return;
    }
    // Choir entries have at most one Praise Leader and one Worship Leader
    // (the same person may hold both roles).
    for (const leaderRole of [PRAISE_LEADER_ROLE, WORSHIP_LEADER_ROLE]) {
      if (complete.filter((a) => a.role_name === leaderRole).length > 1) {
        setError(`Only one person can be the ${leaderRole} for a date.`);
        return;
      }
    }
    if (
      complete.some((a, i) =>
        complete.some(
          (b, j) => j < i && a.user_id === b.user_id && a.role_name === b.role_name,
        ),
      )
    ) {
      setError('Someone has been given the same role twice.');
      return;
    }
    const record = {
      team_id: team.id,
      title: title.trim(),
      date: dateKey,
      time,
      notes: notes.trim() || null,
      created_by: existing?.created_by ?? user.profile.id,
    };
    setError(null);
    setSaving(true);
    try {
      if (existing) {
        await data.updateRotaEntry(existing.id, record, complete);
        showToast('Rota entry updated.');
      } else {
        await data.addRotaEntry(record, complete);
        showToast('Rota entry added.');
      }
      router.back();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Your changes could not be saved. Please try again.',
      );
      setSaving(false);
    }
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: editing ? 'Edit Rota Entry' : 'Add Rota Entry' }} />

      <TextField
        label="Title / service name"
        placeholder="e.g. Sunday Morning Service"
        value={title}
        onChangeText={setTitle}
      />
      <DateField label="Date" value={dateKey} onChange={setDateKey} />
      <TimeField label="Time (optional)" value={time} onChange={setTime} optional />
      <TextField
        label="Notes (optional)"
        placeholder="e.g. Please arrive by 9:15 for warm-up."
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <AppText variant="subheading" style={{ marginTop: spacing.sm }}>
        Assignments
      </AppText>
      <AppText variant="small" tone="secondary">
        {team.type === 'choir'
          ? 'Assign the Praise Leader and Worship Leader for this date (one person can hold both roles). For a rehearsal, add all choir members so everyone can confirm availability.'
          : 'Assign people from your team to roles for this date.'}
      </AppText>

      {assignments.map((a, i) => (
        <Card key={i} style={styles.assignmentCard}>
          <View style={styles.assignmentHeader}>
            <AppText variant="label" tone="primary">
              Assignment {i + 1}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove assignment ${i + 1}`}
              onPress={() => removeAssignment(i)}
              hitSlop={12}
            >
              <Ionicons name="close-circle-outline" size={24} color={colors.danger} />
            </Pressable>
          </View>
          <SelectField
            label="Person"
            placeholder="Choose a team member…"
            value={a.user_id}
            options={members.map(({ profile }) => ({
              label: profile.full_name,
              value: profile.id,
            }))}
            onChange={(v) => updateAssignment(i, { user_id: v })}
          />
          <SelectField
            label="Role"
            placeholder="Choose a role…"
            value={a.role_name}
            options={roles.map((r) => ({ label: r, value: r }))}
            onChange={(v) => updateAssignment(i, { role_name: v })}
          />
        </Card>
      ))}

      <Button
        title="Add Another Person"
        variant="secondary"
        icon="person-add-outline"
        onPress={() => setAssignments((prev) => [...prev, { user_id: null, role_name: null }])}
      />
      {team.type === 'choir' ? (
        <Button
          title="Add All Choir Members"
          variant="secondary"
          icon="people-outline"
          accessibilityHint="Adds everyone in the choir so they can confirm availability, e.g. for a rehearsal"
          onPress={() =>
            setAssignments((prev) => {
              const assignedIds = new Set(prev.map((a) => a.user_id).filter(Boolean));
              const missing = members
                .filter(({ profile }) => !assignedIds.has(profile.id))
                .map(({ profile }) => ({
                  user_id: profile.id,
                  role_name: CHOIR_MEMBER_ROLE,
                }));
              // Drop empty placeholder rows once real people are added.
              const kept = prev.filter((a) => a.user_id || a.role_name);
              return missing.length > 0 ? [...kept, ...missing] : prev;
            })
          }
        />
      ) : null}

      {error ? (
        <AppText tone="danger" style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Button
          title={saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Rota Entry'}
          icon="checkmark-outline"
          loading={saving}
          disabled={saving}
          onPress={() => void handleSave()}
        />
        <Button
          title="Cancel"
          variant="secondary"
          onPress={() => router.back()}
          disabled={saving}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  assignmentCard: { gap: spacing.md },
  assignmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  error: { textAlign: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
