import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/Toast';
import { useAppData } from '../../lib/appData/AppDataContext';
import { eligibleTeamProfiles } from '../../lib/appData/selectors';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { canManageTeamMemberships } from '../../lib/permissions';
import { Team, UserProfile } from '../../types';

export function TeamProfileCandidateRow({
  profile,
  avatarUri,
  adding,
  disabled,
  onAdd,
}: {
  profile: UserProfile;
  avatarUri?: string;
  adding: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <Card style={styles.personCard}>
      <View style={styles.personRow}>
        <Avatar name={profile.full_name} uri={avatarUri} size={48} />
        <View style={styles.personCopy}>
          <AppText variant="bodyBold">{profile.full_name}</AppText>
          <AppText variant="small" tone="secondary" numberOfLines={1}>
            {profile.email}
          </AppText>
        </View>
        <Button
          title="Add"
          variant="secondary"
          icon="person-add-outline"
          onPress={onAdd}
          loading={adding}
          disabled={disabled}
          style={styles.addButton}
          accessibilityHint={`Add ${profile.full_name} to this team`}
        />
      </View>
    </Card>
  );
}

function LockedState({ team, isDemo }: { team: Team; isDemo: boolean }) {
  return (
    <EmptyState
      icon={isDemo ? 'information-circle-outline' : 'lock-closed-outline'}
      title={isDemo ? 'Adding members is unavailable in demo mode' : 'No permission'}
      message={
        isDemo
          ? 'Sign in with your linked church account to manage live team memberships.'
          : `Only ${team.name} leaders and church admins can add members.`
      }
    />
  );
}

export default function TeamAddMemberScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { authMode } = useAuth();
  const user = useRequiredUser();
  const data = useAppData();
  const showToast = useToast();
  const [query, setQuery] = useState('');
  const [addingProfileId, setAddingProfileId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const team = data.teams.find((candidate) => candidate.id === teamId);

  const allEligible = useMemo(
    () => (team ? eligibleTeamProfiles(team, data.memberships, data.users) : []),
    [team, data.memberships, data.users],
  );
  const candidates = useMemo(
    () => (team ? eligibleTeamProfiles(team, data.memberships, data.users, query) : []),
    [team, data.memberships, data.users, query],
  );

  if (!team && data.teamsLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Add Member' }} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText tone="secondary">Loading your church directory…</AppText>
        </View>
      </Screen>
    );
  }

  if (!team) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Add Member' }} />
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

  const addProfile = async (profile: UserProfile) => {
    if (!canManage || addingProfileId) return;
    setAddingProfileId(profile.id);
    setActionError(null);
    try {
      await data.addTeamMember(team.id, profile.id);
      showToast(`${profile.full_name} was added to ${team.name}.`);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "We couldn't add this person right now. Please try again.",
      );
    } finally {
      setAddingProfileId(null);
    }
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: 'Add Member' }} />
      <View style={styles.headingBlock}>
        <AppText variant="heading">Add someone to {team.name}</AppText>
        <AppText tone="secondary">
          Choose a person who already has a linked account for {data.organisation.name}.
        </AppText>
      </View>

      {!canManage ? (
        <LockedState team={team} isDemo={isDemo} />
      ) : (
        <>
          <TextField
            label="Search people"
            placeholder="Name or email"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityHint="Filters people who can be added to this team"
          />

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

          <View style={styles.sectionTitleRow}>
            <AppText variant="subheading">People You Can Add</AppText>
            {candidates.length > 0 ? (
              <AppText variant="small" tone="muted">
                {candidates.length}
              </AppText>
            ) : null}
          </View>
          {candidates.length > 0 ? (
            candidates.map((profile) => (
              <TeamProfileCandidateRow
                key={profile.id}
                profile={profile}
                avatarUri={data.getAvatarUri(profile)}
                adding={addingProfileId === profile.id}
                disabled={addingProfileId !== null}
                onAdd={() => void addProfile(profile)}
              />
            ))
          ) : query.trim() ? (
            <EmptyState
              icon="search-outline"
              title="No matching people"
              message="Try a different name or email address."
            />
          ) : allEligible.length === 0 ? (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Everyone is already added"
              message="Every linked church profile available to this team is already a member."
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  headingBlock: { gap: spacing.xs },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  personCard: { padding: spacing.md },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  personCopy: { flex: 1, gap: 2, minWidth: 0 },
  addButton: { minWidth: 92 },
  errorCard: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flexText: { flex: 1 },
});
