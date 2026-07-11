import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { teamMembers } from '../../lib/appData/selectors';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageTeamMemberships } from '../../lib/permissions';
import { Team, TeamMembership, UserProfile } from '../../types';

export function TeamMemberRow({
  profile,
  membership,
  avatarUri,
  isCurrentUser,
  removing,
  disabled,
  onRemove,
}: {
  profile: UserProfile;
  membership: TeamMembership;
  avatarUri?: string;
  isCurrentUser: boolean;
  removing: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const protectedMembership = membership.role === 'team_leader' || isCurrentUser;

  return (
    <Card style={styles.memberCard}>
      <View style={styles.memberRow}>
        <Avatar name={profile.full_name} uri={avatarUri} size={48} />
        <View style={styles.memberCopy}>
          <View style={styles.nameRow}>
            <AppText variant="bodyBold" style={styles.flexText}>
              {profile.full_name}
            </AppText>
            {isCurrentUser ? <Badge label="You" tone="primary" /> : null}
          </View>
          <AppText variant="small" tone="secondary" numberOfLines={1}>
            {profile.email}
          </AppText>
          {membership.role === 'team_leader' ? (
            <AppText variant="small" tone="muted">
              Team leader · leadership is managed separately
            </AppText>
          ) : null}
        </View>
        {!protectedMembership ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${profile.full_name} from team`}
            accessibilityHint="Opens a confirmation before removing this membership"
            accessibilityState={{ disabled: disabled || removing, busy: removing }}
            disabled={disabled || removing}
            onPress={onRemove}
            style={({ pressed }) => [
              styles.removeAction,
              pressed && styles.removeActionPressed,
              (disabled || removing) && styles.actionDisabled,
            ]}
          >
            {removing ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Ionicons name="person-remove-outline" size={19} color={colors.danger} />
            )}
            <AppText variant="label" tone="danger">
              Remove
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

function LockedState({ team, isDemo }: { team: Team; isDemo: boolean }) {
  return (
    <EmptyState
      icon={isDemo ? 'information-circle-outline' : 'lock-closed-outline'}
      title={isDemo ? 'Member management is read-only in demo mode' : 'No permission'}
      message={
        isDemo
          ? 'Sign in with your linked church account to add or remove team members.'
          : `Only ${team.name} leaders and church admins can manage this member list.`
      }
    />
  );
}

export default function TeamMembersScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const showToast = useToast();
  const { authMode } = useAuth();
  const user = useRequiredUser();
  const data = useAppData();
  const [removingProfileId, setRemovingProfileId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const team = data.teams.find((candidate) => candidate.id === teamId);

  const members = useMemo(
    () => (team ? teamMembers(team.id, data.memberships, data.users) : []),
    [team, data.memberships, data.users],
  );

  if (!team && data.teamsLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Manage Members' }} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Loading the member list…</AppText>
        </View>
      </Screen>
    );
  }

  if (!team) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Manage Members' }} />
        <EmptyState
          icon={data.teamsError ? 'cloud-offline-outline' : 'people-outline'}
          title={data.teamsError ? "Couldn't load this team" : 'Team not found'}
          message={data.teamsError ?? 'This team may have been removed.'}
        />
        {data.teamsError ? (
          <Button
            title="Try Again"
            variant="secondary"
            icon="refresh-outline"
            onPress={() => void data.refreshTeams()}
          />
        ) : null}
      </Screen>
    );
  }

  const isDemo = authMode !== 'supabase' || !data.teamsLive;
  const canManage = !isDemo && canManageTeamMemberships(user, team.id);

  const requestRemove = async (profile: UserProfile) => {
    if (!canManage || removingProfileId) return;
    const approved = await confirm({
      title: `Remove ${profile.full_name}?`,
      message: `${profile.full_name} will be removed from ${team.name} and will no longer have member access to this team’s chat, rota and updates. Their church profile and account will stay in place.`,
      confirmLabel: 'Remove member',
    });
    if (!approved) return;
    setRemovingProfileId(profile.id);
    setActionError(null);
    try {
      await data.removeTeamMember(team.id, profile.id);
      showToast(`${profile.full_name} was removed from ${team.name}.`);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "We couldn't remove this person right now. Please try again.",
      );
    } finally {
      setRemovingProfileId(null);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Manage Members' }} />
      <View style={styles.identityHeader}>
        <Avatar name={team.name} uri={data.getTeamAvatarUri(team)} size={56} />
        <View style={styles.memberCopy}>
          <AppText variant="heading">{team.name}</AppText>
          <AppText tone="secondary">
            {members.length} current {members.length === 1 ? 'member' : 'members'}
          </AppText>
        </View>
      </View>

      {!canManage ? (
        <LockedState team={team} isDemo={isDemo} />
      ) : (
        <>
          <SectionHeader
            title="Current Members"
            actionLabel="Add member"
            onAction={() =>
              router.push({
                pathname: '/teams/[teamId]/settings/members/add',
                params: { teamId: team.id },
              })
            }
          />
          <AppText tone="secondary">
            Add people who already have a linked account for your church. Removing someone does
            not delete their church profile.
          </AppText>

          {actionError ? (
            <Card style={styles.errorCard}>
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={21} color={colors.danger} />
                <AppText tone="danger" style={styles.flexText} accessibilityLiveRegion="polite">
                  {actionError}
                </AppText>
              </View>
            </Card>
          ) : null}

          {members.length > 0 ? (
            members.map(({ profile, membership }) => (
              <TeamMemberRow
                key={profile.id}
                profile={profile}
                membership={membership}
                avatarUri={data.getAvatarUri(profile)}
                isCurrentUser={profile.id === user.profile.id}
                removing={removingProfileId === profile.id}
                disabled={removingProfileId !== null}
                onRemove={() => void requestRemove(profile)}
              />
            ))
          ) : (
            <EmptyState
              icon="people-outline"
              title="No members yet"
              message="Add the first linked church profile to this team."
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  identityHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberCard: { padding: spacing.md },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  memberCopy: { flex: 1, gap: 2, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flexText: { flex: 1 },
  removeAction: {
    minHeight: touchTarget,
    minWidth: 76,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  removeActionPressed: { backgroundColor: colors.dangerSoft },
  actionDisabled: { opacity: 0.45 },
  errorCard: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
