import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useConfirm } from '../../components/ConfirmDialog';
import { ListRow } from '../../components/ListRow';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import {
  buildProfileUpdatePayload,
  PROFILE_NAME_REQUIRED,
  PROFILE_NAME_TOO_LONG,
} from '../../lib/supabase/services/profiles';
import { useProfileAvatar } from './useProfileAvatar';

const orgRoleLabels: Record<string, string> = {
  church_admin: 'Church Admin',
  announcement_manager: 'Announcement Manager',
  event_manager: 'Event Manager',
  general_member: 'Church Member',
};

export default function ProfileScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const {
    signOut,
    authMode,
    accountContext,
    setProfileDisplayNames,
  } = useAuth();
  const data = useAppData();
  const confirm = useConfirm();
  const showToast = useToast();
  const { canManagePhoto, hasPhoto, avatarUri, busy, changePhoto, removePhoto } =
    useProfileAvatar();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [fullName, setFullName] = useState(
    accountContext?.account.global_display_name ?? user.profile.full_name,
  );
  const [organisationName, setOrganisationName] = useState(
    user.profile.display_name_override ?? '',
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canEditProfile = authMode === 'supabase' && !!user.supabaseProfileId;
  const currentMemberships = data.memberships.filter(
    (membership) => membership.user_id === user.profile.id,
  );
  const myTeams = data.teams.filter((team) =>
    currentMemberships.some((membership) => membership.team_id === team.id),
  );

  const beginEditing = () => {
    setFullName(accountContext?.account.global_display_name ?? user.profile.full_name);
    setOrganisationName(user.profile.display_name_override ?? '');
    setFieldError(null);
    setSaveError(null);
    setIsEditingProfile(true);
  };

  const cancelEditing = () => {
    setFullName(accountContext?.account.global_display_name ?? user.profile.full_name);
    setOrganisationName(user.profile.display_name_override ?? '');
    setFieldError(null);
    setSaveError(null);
    setIsEditingProfile(false);
  };

  const saveProfile = async () => {
    if (saving || busy) return;
    setFieldError(null);
    setSaveError(null);
    try {
      const payload = buildProfileUpdatePayload({ full_name: fullName });
      setSaving(true);
      await setProfileDisplayNames(payload.p_full_name, organisationName.trim() || null);
      setIsEditingProfile(false);
      showToast('Profile updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't save your profile.";
      if ([PROFILE_NAME_REQUIRED, PROFILE_NAME_TOO_LONG].includes(message)) {
        setFieldError(message);
      } else {
        setSaveError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleHelp = () => {
    const message =
      'Help and support will live here. For now, please speak to your team leader or church admin.';
    if (Platform.OS === 'web') alert(message);
    else Alert.alert('Help & Support', message);
  };

  const handleResetDemoData = async () => {
    const ok = await confirm({
      title: 'Reset demo data',
      message:
        'This puts all announcements, events, rotas, songs and messages back to the original demo examples. Any changes you made will be removed.',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    await data.resetDemoData();
    const message = 'All demo data has been restored to the original examples.';
    if (Platform.OS === 'web') alert(message);
    else Alert.alert('Demo data reset', message);
  };

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Log out',
      message: 'Are you sure you want to log out?',
      confirmLabel: 'Log out',
    });
    if (ok) {
      await signOut();
      router.replace('/login');
    }
  };

  return (
    <Screen safeTop keyboard={isEditingProfile}>
      <AppText variant="title">Profile</AppText>

      <Card style={styles.profileCard}>
        {canEditProfile && !isEditingProfile ? (
          <View style={styles.editActionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
              accessibilityHint="Change your name or profile photo"
              onPress={beginEditing}
              style={({ pressed }) => [styles.editAction, pressed && styles.editActionPressed]}
              testID="edit-profile-action"
            >
              <Ionicons name="create-outline" size={18} color={colors.primary} />
              <AppText variant="label" tone="primary">
                Edit profile
              </AppText>
            </Pressable>
          </View>
        ) : null}

        <Avatar name={user.profile.full_name} uri={avatarUri} size={76} />

        {isEditingProfile ? (
          <View style={styles.editForm} testID="profile-edit-form">
            {canManagePhoto ? (
              <View style={styles.photoActions}>
                <Button
                  title={hasPhoto ? 'Change photo' : 'Add photo'}
                  variant="secondary"
                  icon="image-outline"
                  onPress={changePhoto}
                  loading={busy === 'uploading'}
                  disabled={busy !== null || saving}
                  accessibilityHint="Choose a profile photo from your photos"
                />
                {hasPhoto ? (
                  <Button
                    title="Remove photo"
                    variant="destructive"
                    icon="trash-outline"
                    onPress={removePhoto}
                    loading={busy === 'removing'}
                    disabled={busy !== null || saving}
                    accessibilityHint="Remove your profile photo and show your initials"
                  />
                ) : null}
              </View>
            ) : null}

            <TextField
              label="Default name"
              value={fullName}
              onChangeText={(value) => {
                setFullName(value);
                setFieldError(null);
              }}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
              maxLength={100}
              error={fieldError ?? undefined}
              testID="profile-full-name-input"
            />
            <TextField
              label="Name in this organisation (optional)"
              helper="Leave blank to use your default name. This changes only the current organisation."
              value={organisationName}
              onChangeText={setOrganisationName}
              autoCapitalize="words"
              autoComplete="name"
              maxLength={100}
              testID="profile-organisation-name-input"
            />
            <View style={styles.readOnlyField} testID="profile-contact-details">
              <View style={styles.readOnlyRow}>
                <AppText variant="label">Email</AppText>
                <AppText tone="secondary">{user.profile.email}</AppText>
              </View>
              <View style={styles.readOnlyRow}>
                <AppText variant="label">Phone</AppText>
                <AppText tone="secondary">{user.profile.phone ?? 'Not added'}</AppText>
              </View>
              <AppText variant="small" tone="muted">
                Contact details are managed separately. Phone number changes will be available
                through a verified account flow.
              </AppText>
            </View>
            {saveError ? (
              <View style={styles.errorBar} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
                <AppText variant="small" tone="danger" style={styles.errorText}>
                  {saveError}
                </AppText>
              </View>
            ) : null}
            <View style={styles.formActions}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={cancelEditing}
                disabled={saving || busy !== null}
                style={styles.formButton}
              />
              <Button
                title="Save"
                icon="checkmark-outline"
                onPress={() => void saveProfile()}
                loading={saving}
                disabled={busy !== null}
                style={styles.formButton}
              />
            </View>
          </View>
        ) : (
          <>
            <AppText variant="heading" style={styles.centerText}>
              {user.profile.full_name}
            </AppText>
            <AppText tone="secondary" style={styles.centerText}>
              {user.profile.email}
            </AppText>
            {user.profile.phone ? (
              <AppText tone="secondary" style={styles.centerText}>
                {user.profile.phone}
              </AppText>
            ) : null}
          </>
        )}

        <View style={styles.badgeRow}>
          <Badge label={orgRoleLabels[user.orgRole]} tone="primary" />
          {currentMemberships
            .filter((membership) => membership.role === 'team_leader')
            .map((membership) => {
              const team = data.teams.find((candidate) => candidate.id === membership.team_id);
              return team ? (
                <Badge key={membership.id} label={`${team.name} Leader`} tone="accent" />
              ) : null;
            })}
        </View>
      </Card>

      <SectionHeader title="Your Teams" />
      {myTeams.length > 0 ? (
        <View style={styles.rows}>
          {myTeams.map((team) => (
            <ListRow
              key={team.id}
              icon="people-outline"
              title={team.name}
              subtitle={
                currentMemberships.find((membership) => membership.team_id === team.id)?.role ===
                'team_leader'
                  ? 'Team Leader'
                  : 'Member'
              }
              onPress={() =>
                router.push({ pathname: '/teams/[teamId]', params: { teamId: team.id } })
              }
            />
          ))}
        </View>
      ) : (
        <AppText tone="secondary">You are not part of any team yet.</AppText>
      )}

      <SectionHeader title="Settings" />
      <View style={styles.rows}>
        {(accountContext?.organisations.length ?? 0) > 1 ? (
          <ListRow
            icon="swap-horizontal-outline"
            title="Switch organisation"
            subtitle={`${accountContext?.organisations.length} organisations available`}
            onPress={() => router.push('/organisations/select')}
          />
        ) : null}
        {user.orgRole === 'church_admin' && authMode === 'supabase' ? (
          <ListRow
            icon="mail-outline"
            title="Organisation invitations"
            subtitle="Invite, resend or revoke"
            onPress={() => router.push('/organisations/invitations')}
          />
        ) : null}
        <ListRow
          icon="notifications-outline"
          title="Notification Settings"
          subtitle="Choose what you want to be notified about"
          onPress={() => router.push('/settings/notifications')}
        />
        <ListRow
          icon="refresh-outline"
          title="Reset Demo Data"
          subtitle="Put all example data back to how it started"
          onPress={handleResetDemoData}
        />
        <ListRow
          icon="help-circle-outline"
          title="Help & Support"
          subtitle="Coming soon"
          onPress={handleHelp}
        />
      </View>

      <View style={styles.logoutWrap}>
        <Button title="Log Out" variant="destructive" icon="log-out-outline" onPress={handleLogout} />
        <AppText variant="small" tone="muted" style={styles.footer}>
          {authMode === 'supabase'
            ? 'Shift Shepherd · Signed in with your church account'
            : 'Shift Shepherd · Demo account with example data'}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  editActionRow: { alignItems: 'flex-end', width: '100%', marginBottom: -spacing.xs },
  editAction: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  editActionPressed: { backgroundColor: colors.primarySoft },
  editForm: { gap: spacing.md, width: '100%', marginTop: spacing.sm },
  photoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  readOnlyField: {
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  readOnlyRow: { gap: 2 },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { flex: 1 },
  formActions: { flexDirection: 'row', gap: spacing.sm },
  formButton: { flex: 1 },
  centerText: { textAlign: 'center' },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  rows: { gap: spacing.sm },
  logoutWrap: { gap: spacing.md, marginTop: spacing.lg },
  footer: { textAlign: 'center' },
});
