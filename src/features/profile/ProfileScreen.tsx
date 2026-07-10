import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useConfirm } from '../../components/ConfirmDialog';
import { ListRow } from '../../components/ListRow';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
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
  const { signOut, authMode } = useAuth();
  const data = useAppData();
  const confirm = useConfirm();
  const { canManagePhoto, hasPhoto, avatarUri, busy, changePhoto, removePhoto } =
    useProfileAvatar();
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const myTeams = data.teams.filter((t) =>
    user.memberships.some((m) => m.team_id === t.id),
  );

  const handleHelp = () => {
    const message =
      'Help and support will live here. For now, please speak to your team leader or church admin.';
    if (Platform.OS === 'web') {
      alert(message);
    } else {
      Alert.alert('Help & Support', message);
    }
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
    if (Platform.OS === 'web') {
      alert(message);
    } else {
      Alert.alert('Demo data reset', message);
    }
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
    <Screen safeTop>
      <AppText variant="title">Profile</AppText>

      <Card style={styles.profileCard}>
        <Avatar name={user.profile.full_name} uri={avatarUri} size={72} />
        {isEditingProfile && canManagePhoto ? (
          <View style={styles.editProfileActions}>
            <AppText variant="small" tone="secondary" style={styles.editProfileHint}>
              You can update your profile photo here.
            </AppText>
            <Button
              title={hasPhoto ? 'Change photo' : 'Add photo'}
              variant="secondary"
              icon="image-outline"
              onPress={changePhoto}
              loading={busy === 'uploading'}
              disabled={busy !== null}
              accessibilityHint="Choose a profile photo from your photos"
            />
            {hasPhoto ? (
              <Button
                title="Remove photo"
                variant="destructive"
                icon="trash-outline"
                onPress={removePhoto}
                loading={busy === 'removing'}
                disabled={busy !== null}
                accessibilityHint="Removes your profile photo and shows your initials"
              />
            ) : null}
            <Button
              title="Done"
              variant="ghost"
              icon="checkmark-outline"
              onPress={() => setIsEditingProfile(false)}
              disabled={busy !== null}
              accessibilityHint="Finish editing your profile"
            />
          </View>
        ) : null}
        <AppText variant="heading">{user.profile.full_name}</AppText>
        <AppText tone="secondary">{user.profile.email}</AppText>
        {user.profile.phone ? <AppText tone="secondary">{user.profile.phone}</AppText> : null}
        <View style={styles.badgeRow}>
          <Badge label={orgRoleLabels[user.orgRole]} tone="primary" />
          {user.memberships
            .filter((m) => m.role === 'team_leader')
            .map((m) => {
              const team = data.teams.find((t) => t.id === m.team_id);
              return team ? (
                <Badge key={m.id} label={`${team.name} Leader`} tone="accent" />
              ) : null;
            })}
        </View>
        {canManagePhoto && !isEditingProfile ? (
          <Button
            title="Edit profile"
            variant="ghost"
            icon="create-outline"
            onPress={() => setIsEditingProfile(true)}
            style={styles.editProfileButton}
            accessibilityHint="Change your profile photo"
          />
        ) : null}
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
                user.memberships.find((m) => m.team_id === team.id)?.role === 'team_leader'
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
  profileCard: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  editProfileActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  editProfileHint: { textAlign: 'center', width: '100%' },
  editProfileButton: { marginTop: spacing.sm },
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
