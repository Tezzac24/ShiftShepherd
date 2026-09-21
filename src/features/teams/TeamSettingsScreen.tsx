import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { ListGroup } from '../../components/ListGroup';
import { ListRow } from '../../components/ListRow';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { SectionHeader } from '../../components/SectionHeader';
import { StatePanel } from '../../components/StatePanel';
import { useAppData } from '../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../lib/auth/AuthContext';
import { Team } from '../../types';
import { TeamAccessBoundary } from './TeamAccessBoundary';
import { teamManagementChoices } from './teamPresentation';
import { useTeamAvatar } from './useTeamAvatar';

/** The retained direct link offers the same team tools as the hub's Manage sheet. */
export default function TeamSettingsScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const user = useRequiredUser();
  return <TeamAccessBoundary teamId={teamId} title="Manage team" management>
    {(team) => <TeamSettingsContent key={`${user.profile.id}:${team.id}`} team={team} />}
  </TeamAccessBoundary>;
}

function TeamSettingsContent({ team }: { team: Team }) {
  const router = useRouter();
  const user = useRequiredUser();
  const { authMode } = useAuth();
  const data = useAppData();
  const { canManage, hasPhoto, avatarUri, busy, changePhoto, removePhoto } = useTeamAvatar(team);
  const liveMembers = authMode === 'supabase' && data.teamsLive;
  const choices = teamManagementChoices(user, team, liveMembers);

  return <Screen>
    <Stack.Screen options={{ title: 'Manage team' }} />
    <PageHeading title="Manage team" eyebrow={team.name} />
    {data.teamsError ? <StatePanel compact kind="error" title="Team details may be out of date" message={data.teamsError}
      action={{ label: 'Retry team', onPress: () => void data.refreshTeams() }} /> : null}
    <ListGroup>{choices.map((choice) => <ListRow key={choice.key} title={choice.label} subtitle={choice.description}
      icon={choice.icon} onPress={() => router.push(choice.destination)} />)}</ListGroup>
    <View style={styles.section}>
      <SectionHeader title="Team photo" />
      <View style={styles.photoSummary}>
        <Avatar name={team.name} uri={avatarUri} size={64} />
        <AppText tone="secondary" style={styles.photoCopy}>
          {hasPhoto ? 'This photo helps people recognise the team.' : 'The team shows its initials until a photo is added.'}
        </AppText>
      </View>
      {canManage ? <View style={styles.photoActions} testID="team-avatar-management-controls">
        <Button title={hasPhoto ? 'Change photo' : 'Add photo'} variant="secondary" icon="image-outline"
          onPress={changePhoto} loading={busy === 'uploading'} disabled={busy !== null} accessibilityHint={`Choose a photo for ${team.name}`} />
        {hasPhoto ? <Button title="Remove photo" variant="destructive" icon="trash-outline"
          onPress={removePhoto} loading={busy === 'removing'} disabled={busy !== null} accessibilityHint={`Remove the photo for ${team.name}`} /> : null}
      </View> : <AppText variant="small" tone="muted">Team photos are read-only in demo mode.</AppText>}
    </View>
    {!liveMembers ? <AppText variant="small" tone="secondary">You can view members here. Membership and team-role changes are unavailable in demo mode.</AppText> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.md, marginTop: spacing.md },
  photoSummary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photoCopy: { flex: 1, minWidth: 0 },
  photoActions: { gap: spacing.sm },
});
