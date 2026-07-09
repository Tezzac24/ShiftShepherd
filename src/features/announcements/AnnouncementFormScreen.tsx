import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import {
  canCreateChurchAnnouncements,
  canCreateTeamAnnouncements,
  canEditAnnouncement,
} from '../../lib/permissions';

const CHURCH_WIDE = 'church';

/**
 * Create/edit announcement. Audience options depend on the user's
 * permissions: church-wide (admins/announcement managers) and/or the
 * specific teams they lead.
 */
export default function AnnouncementFormScreen() {
  const router = useRouter();
  // presetTitle/presetBody prefill the form (e.g. a rehearsal cancellation
  // notice) — nothing is posted until the user taps Post Announcement.
  const { id, teamId: presetTeamId, presetTitle, presetBody } = useLocalSearchParams<{
    id?: string;
    teamId?: string;
    presetTitle?: string;
    presetBody?: string;
  }>();
  const user = useRequiredUser();
  const data = useAppData();

  const existing = id ? data.announcements.find((a) => a.id === id) : undefined;
  const editing = !!existing;

  // Audience choices this user is allowed to post to.
  const audienceOptions = [
    ...(canCreateChurchAnnouncements(user)
      ? [{ label: 'Whole church', value: CHURCH_WIDE, description: 'Everyone will see this' }]
      : []),
    ...data.teams
      .filter((t) => canCreateTeamAnnouncements(user, t.id))
      .map((t) => ({
        label: `${t.name} team`,
        value: t.id,
        description: `Only ${t.name} members will see this`,
      })),
  ];

  const [title, setTitle] = useState(existing?.title ?? presetTitle ?? '');
  const [body, setBody] = useState(existing?.body ?? presetBody ?? '');
  const [audience, setAudience] = useState<string | null>(
    existing ? (existing.team_id ?? CHURCH_WIDE) : (presetTeamId ?? audienceOptions[0]?.value ?? null),
  );
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [linkedEventId, setLinkedEventId] = useState<string | null>(
    existing?.linked_event_id ?? null,
  );
  const [includeImage, setIncludeImage] = useState(!!existing?.image_url);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const allowed = editing ? canEditAnnouncement(user, existing) : audienceOptions.length > 0;
  if (!allowed) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Announcements' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="No permission"
          message="You do not have permission to do that."
        />
      </Screen>
    );
  }

  const handleSave = async () => {
    if (saving) return; // no duplicate submissions
    if (!title.trim() || !body.trim() || !audience) {
      setError('Please add a title, a message, and choose who should see it.');
      return;
    }
    const record = {
      title: title.trim(),
      body: body.trim(),
      team_id: audience === CHURCH_WIDE ? null : audience,
      audience: (audience === CHURCH_WIDE ? 'church' : 'team') as 'church' | 'team',
      pinned,
      image_url: includeImage ? 'placeholder' : null,
      // In live mode the picker lists live events, so this is already a real
      // event UUID (or null); in demo mode it is a local mock event id.
      linked_event_id: linkedEventId,
      created_by: existing?.created_by ?? user.profile.id,
    };
    setError(null);
    setSaving(true);
    try {
      if (existing) {
        await data.updateAnnouncement(existing.id, record);
      } else {
        await data.addAnnouncement(record);
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
      <Stack.Screen options={{ title: editing ? 'Edit Announcement' : 'New Announcement' }} />
      <TextField
        label="Title"
        placeholder="e.g. Sunday Service This Week"
        value={title}
        onChangeText={setTitle}
      />
      <TextField
        label="Message"
        placeholder="Write your announcement here…"
        value={body}
        onChangeText={setBody}
        multiline
      />
      <SelectField
        label="Who should see this?"
        value={audience}
        options={audienceOptions}
        onChange={setAudience}
      />
      {/* Events are live alongside announcements now, so the picker works in
          both modes: live event UUIDs in live mode, mock ids in demo mode. */}
      <SelectField
        label="Linked event (optional)"
        placeholder="No linked event"
        value={linkedEventId ?? 'none'}
        options={[
          { label: 'No linked event', value: 'none' },
          ...data.events.map((e) => ({ label: e.title, value: e.id })),
        ]}
        onChange={(v) => setLinkedEventId(v === 'none' ? null : v)}
      />

      <Card style={styles.toggleCard}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Pin this announcement</AppText>
            <AppText variant="small" tone="secondary">
              Pinned announcements stay at the top of the list.
            </AppText>
          </View>
          <Switch
            value={pinned}
            onValueChange={setPinned}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            accessibilityLabel="Pin this announcement"
          />
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Include an image</AppText>
            <AppText variant="small" tone="secondary">
              Image upload is a placeholder in this demo build.
            </AppText>
          </View>
          <Switch
            value={includeImage}
            onValueChange={setIncludeImage}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            accessibilityLabel="Include an image placeholder"
          />
        </View>
      </Card>

      {error ? (
        <AppText tone="danger" style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Button
          title={editing ? 'Save Changes' : 'Post Announcement'}
          icon="checkmark-outline"
          loading={saving}
          onPress={() => void handleSave()}
        />
        <Button
          title="Cancel"
          variant="secondary"
          disabled={saving}
          onPress={() => router.back()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleCard: { gap: spacing.md },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  error: { textAlign: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
