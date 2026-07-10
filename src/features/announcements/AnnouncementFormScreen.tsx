import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AnnouncementImage } from '../../components/AnnouncementImage';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { currentAndUpcomingEvents } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import {
  canCreateChurchAnnouncements,
  canCreateTeamAnnouncements,
  canEditAnnouncement,
} from '../../lib/permissions';
import { isAnnouncementImagePath } from '../../lib/supabase/services/announcementImages';
import { useAnnouncementImageDraft } from './useAnnouncementImageDraft';

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
  const showToast = useToast();

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // One optional image per announcement — a live-Supabase Storage feature.
  // Picks/removals are held as a draft and applied after the announcement
  // itself saves; demo mode shows no image controls and never calls Storage.
  const imagesEnabled = data.announcementsLive;
  const { draft: imageDraft, picking, pickImage, markRemoved } = useAnnouncementImageDraft();
  const existingHasImage = isAnnouncementImagePath(existing?.image_url ?? null);
  const showsImage =
    imageDraft.kind === 'replace' || (imageDraft.kind === 'unchanged' && existingHasImage);
  const displayImageUri =
    imageDraft.kind === 'replace'
      ? imageDraft.previewUri
      : imageDraft.kind === 'unchanged'
        ? data.getAnnouncementImageUri(existing)
        : undefined;

  // Only events that haven't finished are offered for linking. An existing
  // link to a now-past event stays choosable so editing never silently
  // drops a valid link.
  const linkableEvents = currentAndUpcomingEvents(data.events);
  const linkedPastEvent =
    linkedEventId && !linkableEvents.some((e) => e.id === linkedEventId)
      ? data.events.find((e) => e.id === linkedEventId)
      : undefined;

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
    // No image_url here: on create it starts null (the image uploads after
    // the row exists), and on update the dedicated image actions own it.
    const record = {
      title: title.trim(),
      body: body.trim(),
      team_id: audience === CHURCH_WIDE ? null : audience,
      audience: (audience === CHURCH_WIDE ? 'church' : 'team') as 'church' | 'team',
      pinned,
      // In live mode the picker lists live events, so this is already a real
      // event UUID (or null); in demo mode it is a local mock event id.
      linked_event_id: linkedEventId,
      created_by: existing?.created_by ?? user.profile.id,
    };
    setError(null);
    setSaving(true);
    try {
      let savedId: string;
      if (existing) {
        await data.updateAnnouncement(existing.id, record);
        savedId = existing.id;
      } else {
        const created = await data.addAnnouncement({ ...record, image_url: null });
        savedId = created.id;
      }

      // Apply the pending image change now the announcement row exists. The
      // text is already saved, so an image failure never rolls it back — the
      // person hears what happened and can retry from Edit Announcement.
      const wantsImageChange =
        imagesEnabled &&
        (imageDraft.kind === 'replace' || (imageDraft.kind === 'remove' && existingHasImage));
      if (wantsImageChange) {
        try {
          if (imageDraft.kind === 'replace') {
            await data.setAnnouncementImage(savedId, imageDraft.file);
          } else {
            await data.removeAnnouncementImage(savedId);
          }
        } catch (imageError) {
          const reason = imageError instanceof Error ? imageError.message : '';
          showToast(
            (editing
              ? `Your changes were saved, but the image change didn’t go through. ${reason}`
              : `Your announcement was posted, but the image wasn’t added. ${reason}`
            ).trim(),
            'error',
          );
          router.back();
          return;
        }
      }

      showToast(editing ? 'Announcement updated.' : 'Announcement posted.');
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
          ...(linkedPastEvent
            ? [{ label: `${linkedPastEvent.title} (finished)`, value: linkedPastEvent.id }]
            : []),
          ...linkableEvents.map((e) => ({ label: e.title, value: e.id })),
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
      </Card>

      {imagesEnabled ? (
        <Card>
          <View>
            <AppText variant="bodyBold">Image (optional)</AppText>
            <AppText variant="small" tone="secondary">
              Add a photo to show with this announcement.
            </AppText>
          </View>
          <AnnouncementImage uri={displayImageUri} height={160} />
          <View style={styles.imageActions}>
            <Button
              title={showsImage ? 'Change image' : 'Add image'}
              variant="secondary"
              icon="image-outline"
              onPress={() => void pickImage()}
              loading={picking}
              disabled={saving}
              accessibilityHint="Choose an image from your photos"
            />
            {showsImage ? (
              <Button
                title="Remove image"
                variant="ghost"
                icon="trash-outline"
                onPress={markRemoved}
                disabled={saving || picking}
                accessibilityHint="The announcement will show no image after saving"
              />
            ) : null}
          </View>
        </Card>
      ) : null}

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
  imageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { textAlign: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
