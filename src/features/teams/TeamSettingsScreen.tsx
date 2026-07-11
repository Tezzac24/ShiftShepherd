import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ListRow } from '../../components/ListRow';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { useAppData } from '../../lib/appData/AppDataContext';
import { teamMembers } from '../../lib/appData/selectors';
import { Team } from '../../types';
import { useTeamAvatar } from './useTeamAvatar';

/**
 * Team settings for authorised leaders/admins. Photo and membership management
 * start here; detailed flows stay on dedicated screens rather than the team hub.
 */
function TeamSettingsContent({
  team,
  memberCount,
  onManageMembers,
}: {
  team: Team;
  memberCount: number;
  onManageMembers: () => void;
}) {
  const { canManage, hasPhoto, avatarUri, busy, changePhoto, removePhoto } = useTeamAvatar(team);

  if (!canManage) {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="No permission"
        message="Only team leaders and church admins can change team settings."
      />
    );
  }

  return (
    <>
      <View style={styles.identityHeader}>
        <Avatar name={team.name} uri={avatarUri} size={72} />
        <View style={styles.identityCopy}>
          <AppText variant="heading">{team.name}</AppText>
          <AppText tone="secondary">{team.description}</AppText>
        </View>
      </View>

      <SectionHeader title="Team Photo" />
      <Card style={styles.photoCard}>
        <AppText tone="secondary">
          {hasPhoto
            ? 'This photo appears wherever the team is shown.'
            : 'Add a photo so the team is easy to recognise. Until then, the team shows its initials.'}
        </AppText>
        <View style={styles.photoActions} testID="team-avatar-management-controls">
          <Button
            title={hasPhoto ? 'Change photo' : 'Add photo'}
            variant="secondary"
            icon="image-outline"
            onPress={changePhoto}
            loading={busy === 'uploading'}
            disabled={busy !== null}
            accessibilityHint={`Choose a photo for ${team.name}`}
          />
          {hasPhoto ? (
            <Button
              title="Remove photo"
              variant="destructive"
              icon="trash-outline"
              onPress={removePhoto}
              loading={busy === 'removing'}
              disabled={busy !== null}
              accessibilityHint={`Remove the photo for ${team.name}`}
            />
          ) : null}
        </View>
      </Card>

      <SectionHeader title="Members" />
      <ListRow
        icon="people-outline"
        title="Manage members"
        subtitle={`${memberCount} current ${memberCount === 1 ? 'member' : 'members'}`}
        onPress={onManageMembers}
      />

      <AppText variant="small" tone="muted" style={styles.footerNote}>
        Team name and leadership roles are managed by your church admin.
      </AppText>
    </>
  );
}

export default function TeamSettingsScreen() {
  const router = useRouter();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const data = useAppData();
  const team = data.teams.find((t) => t.id === teamId);
  const memberCount = team
    ? teamMembers(team.id, data.memberships ?? [], data.users ?? []).length
    : 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Team Settings' }} />
      {team ? (
        <TeamSettingsContent
          team={team}
          memberCount={memberCount}
          onManageMembers={() =>
            router.push({
              pathname: '/teams/[teamId]/settings/members',
              params: { teamId: team.id },
            })
          }
        />
      ) : data.teamsLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Loading your team…</AppText>
        </View>
      ) : (
        <EmptyState
          icon="lock-closed-outline"
          title="Team not found"
          message="This team may have been removed."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  identityHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityCopy: { flex: 1, gap: spacing.xs },
  photoCard: { gap: spacing.md },
  photoActions: { gap: spacing.sm },
  footerNote: { textAlign: 'center', marginTop: spacing.sm },
});
