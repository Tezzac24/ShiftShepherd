import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { mockUsers } from '../../mockData';
import { STORAGE_KEYS } from '../../storage/persistence';
import * as teamMembershipsService from '../../supabase/services/teamMemberships';
import * as teamsService from '../../supabase/services/teams';
import { AppDataProvider, useAppData } from '../AppDataContext';

const ADMIN = mockUsers.find((profile) => profile.id === 'user-daniel')!;
const mockApplyDirectory = jest.fn();
const mockUseAuth = jest.fn(() => ({
  user: { profile: ADMIN, orgRole: 'church_admin' as const, memberships: [] },
  authMode: 'demo' as const,
  applySessionAvatarUrl: jest.fn(),
  applySessionProfile: jest.fn(),
  applySessionDirectorySnapshot: mockApplyDirectory,
  refreshAccountContext: jest.fn(),
}));

jest.mock('../../auth/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../../supabase/services/teams', () => {
  const actual = jest.requireActual('../../supabase/services/teams');
  return { ...actual, createTeam: jest.fn(), updateTeam: jest.fn(), archiveTeam: jest.fn(), restoreTeam: jest.fn() };
});
jest.mock('../../supabase/services/teamMemberships', () => {
  const actual = jest.requireActual('../../supabase/services/teamMemberships');
  return { ...actual, setTeamMemberRole: jest.fn() };
});

function Harness() {
  const data = useAppData();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const firstMembership = data.memberships[0];
  return (
    <>
      <Text testID="hydrated">{String(data.isHydrated)}</Text>
      <Text testID="role-error">{roleError ?? ''}</Text>
      <Text testID="first-membership">
        {firstMembership
          ? `${firstMembership.id}:${firstMembership.user_id}:${firstMembership.role}`
          : ''}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Attempt demo role change"
        onPress={() =>
          firstMembership &&
          void data
            .setTeamMemberRole(
              firstMembership.team_id,
              firstMembership.user_id,
              firstMembership.role === 'team_leader' ? 'member' : 'team_leader',
            )
            .catch((error: Error) => setRoleError(error.message))
        }
      />
      <Text testID="active-teams">{data.teams.map((team) => team.name).join('|')}</Text>
      <Text testID="archived-teams">
        {data.archivedTeams.map((team) => team.name).join('|')}
      </Text>
      <Text testID="created-memberships">
        {createdId
          ? data.memberships.filter((membership) => membership.team_id === createdId).length
          : 0}
      </Text>
      <Text testID="created-id">{createdId ?? ''}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create zero admin demo team"
        onPress={() =>
          void data
            .createTeam({
              name: '  Welcome Team  ',
              description: '  Welcomes people.  ',
              initialAdminProfileId: null,
            })
            .then((result) => setCreatedId(result.team.id))
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create creator admin demo team"
        onPress={() =>
          void data
            .createTeam({
              name: 'Care Team',
              description: null,
              initialAdminProfileId: ADMIN.id,
            })
            .then((result) => setCreatedId(result.team.id))
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Archive created demo team"
        onPress={() => createdId && void data.archiveTeam(createdId)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Restore created demo team"
        onPress={() => createdId && void data.restoreTeam(createdId)}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reset demo teams"
        onPress={() => void data.resetDemoData().then(() => setCreatedId(null))}
      />
    </>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('AppData demo team lifecycle isolation', () => {
  it('keeps create/archive/restore local, preserves membership, and reset restores seeds', async () => {
    let screen = render(
      <AppDataProvider>
        <Harness />
      </AppDataProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));

    fireEvent.press(screen.getByLabelText('Create zero admin demo team'));
    await waitFor(() =>
      expect(screen.getByTestId('active-teams').props.children).toContain('Welcome Team'),
    );
    expect(screen.getByTestId('created-memberships').props.children).toBe(0);
    expect(teamsService.createTeam).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Create creator admin demo team'));
    await waitFor(() => expect(screen.getByTestId('created-memberships').props.children).toBe(1));
    expect(teamsService.createTeam).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Archive created demo team'));
    await waitFor(() =>
      expect(screen.getByTestId('archived-teams').props.children).toContain('Care Team'),
    );
    expect(screen.getByTestId('active-teams').props.children).not.toContain('Care Team');
    expect(screen.getByTestId('created-memberships').props.children).toBe(1);
    expect(teamsService.archiveTeam).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Restore created demo team'));
    await waitFor(() =>
      expect(screen.getByTestId('active-teams').props.children).toContain('Care Team'),
    );
    expect(screen.getByTestId('created-memberships').props.children).toBe(1);
    expect(teamsService.restoreTeam).not.toHaveBeenCalled();

    const careTeamId = screen.getByTestId('created-id').props.children;
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(STORAGE_KEYS.appData)).toContain('Care Team'),
    );
    screen.unmount();
    mockApplyDirectory.mockClear();
    screen = render(
      <AppDataProvider>
        <Harness />
      </AppDataProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
    expect(screen.getByTestId('active-teams').props.children).toContain('Care Team');
    expect(mockApplyDirectory).toHaveBeenCalledWith(
      ADMIN.id,
      expect.objectContaining({
        memberships: expect.arrayContaining([
          expect.objectContaining({ team_id: careTeamId, user_id: ADMIN.id }),
        ]),
      }),
    );

    fireEvent.press(screen.getByLabelText('Reset demo teams'));
    await waitFor(() =>
      expect(screen.getByTestId('active-teams').props.children).not.toContain('Welcome Team'),
    );
    expect(screen.getByTestId('active-teams').props.children).not.toContain('Care Team');
  });

  it('keeps role changes live-only: demo rejects without a service call or state change', async () => {
    const screen = render(
      <AppDataProvider>
        <Harness />
      </AppDataProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('hydrated').props.children).toBe('true'));
    const before = screen.getByTestId('first-membership').props.children;
    expect(before).not.toBe('');

    fireEvent.press(screen.getByLabelText('Attempt demo role change'));
    await waitFor(() =>
      expect(screen.getByTestId('role-error').props.children).toBe(
        teamMembershipsService.TEAM_MEMBERSHIP_DEMO_ERROR,
      ),
    );
    expect(teamMembershipsService.setTeamMemberRole).not.toHaveBeenCalled();
    expect(screen.getByTestId('first-membership').props.children).toBe(before);
  });
});
