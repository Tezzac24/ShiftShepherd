import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';

import { Button } from '../../components/Button';
import { PageHeading } from '../../components/PageHeading';
import { Screen } from '../../components/Screen';
import { StatePanel } from '../../components/StatePanel';
import { useAppData } from '../../lib/appData/AppDataContext';
import { userName } from '../../lib/appData/selectors';
import { useRequiredUser } from '../../lib/auth/AuthContext';
import { canCreateAnyAnnouncement, canCreateTeamAnnouncements } from '../../lib/permissions';
import { useCurrentTime } from '../../utils/useCurrentTime';
import { HomeNotice } from '../home/HomeNotice';
import { accessibleAnnouncements, announcementTeam } from './announcementPresentation';

export default function AnnouncementsListScreen() {
  const router = useRouter();
  const { teamId } = useLocalSearchParams<{ teamId?: string | string[] }>();
  const user = useRequiredUser();
  const data = useAppData();
  useCurrentTime();
  const filtered = teamId !== undefined;
  const team = announcementTeam(user, data.teams, teamId);
  const announcements = accessibleAnnouncements(user, data.announcements, data.archivedTeams)
    .filter((notice) => !filtered || (!!team && notice.team_id === team.id));
  const canCreate = team ? canCreateTeamAnnouncements(user, team.id) : !filtered && canCreateAnyAnnouncement(user);

  return <Screen>
    <Stack.Screen options={{ title: 'Announcements' }} />
    <PageHeading title={filtered || !canCreate ? (filtered ? 'Team announcements' : 'Announcements') : undefined} eyebrow={team?.name}
      description={filtered ? undefined : 'Updates from your church and teams.'}
      centerAction={!filtered && canCreate}
      action={canCreate ? <Button title="New announcement" icon="add-outline" onPress={() => router.push({ pathname: '/announcements/edit', params: team ? { teamId: team.id } : {} })} /> : undefined} />
    {filtered ? <Button title="All announcements" variant="secondary" icon="megaphone-outline" onPress={() => router.replace('/announcements')} /> : null}
    {filtered && !team ? data.teamsLoading ? <StatePanel kind="loading" title="Loading this team…" />
      : data.teamsError ? <StatePanel kind="error" title="Couldn't load this team" message={data.teamsError}
        action={{ label: 'Retry team', onPress: () => void data.refreshTeams() }} />
        : <StatePanel title="Team announcements unavailable" message="This team is not available in your current church." icon="people-outline" />
      : <>
        {data.announcementsError ? <StatePanel compact kind="error" title="Couldn't refresh announcements" message={data.announcementsError}
          action={{ label: 'Retry announcements', onPress: () => void data.refreshAnnouncements() }} /> : null}
        {announcements.length ? announcements.map((notice) => <HomeNotice key={notice.id} announcement={notice} authorName={userName(data.users, notice.created_by)}
          teamName={notice.team_id ? data.teams.find((candidate) => candidate.id === notice.team_id)?.name : undefined}
          imageUri={data.getAnnouncementImageUri(notice)}
          onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: notice.id } })} />)
          : data.announcementsLoading ? <StatePanel kind="loading" title="Loading announcements…" />
            : !data.announcementsError ? <StatePanel icon="megaphone-outline" title={team ? 'No team announcements yet' : 'No announcements yet'}
              message={team ? `Updates for ${team.name} will appear here.` : 'Updates from your church and teams will appear here.'} /> : null}
      </>}
  </Screen>;
}
