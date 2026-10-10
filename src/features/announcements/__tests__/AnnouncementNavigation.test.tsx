import { router, Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import React from 'react';
import { Pressable, Text } from 'react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import AnnouncementDetailScreen from '../AnnouncementDetailScreen';
import AnnouncementsListScreen from '../AnnouncementsListScreen';
import { makeAuth, makeData, NOTICE, TEAM } from './noticeTestData';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: () => jest.fn() }));
jest.mock('../../../components/Toast', () => ({ useToast: () => jest.fn() }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn(), useRequiredUser: jest.fn() }));

function EntryScreen() {
  return <>
    <Text>Original screen</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Open team notice"
      onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: 'team-notice' } })}>
      <Text>Open team notice</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Open notice"
      onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: NOTICE.id } })}>
      <Text>Open notice</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Open team notices"
      onPress={() => router.push({ pathname: '/announcements', params: { teamId: TEAM.id } })}>
      <Text>Open team notices</Text>
    </Pressable>
  </>;
}

beforeEach(() => {
  const auth = makeAuth();
  const data = makeData();
  data.announcements.push({ ...NOTICE, id: 'second-notice', title: 'Another notice' },
    { ...NOTICE, id: 'team-notice', title: 'Team notice', team_id: TEAM.id, audience: 'team' });
  (useAuth as jest.Mock).mockReturnValue(auth);
  (useRequiredUser as jest.Mock).mockReturnValue(auth.user);
  (useAppData as jest.Mock).mockReturnValue(data);
});

function renderNavigation(initialUrl: string) {
  return renderRouter({
    _layout: () => <Stack screenOptions={{ headerShown: false }} />,
    home: EntryScreen,
    'teams/index': EntryScreen,
    'teams/[teamId]/index': EntryScreen,
    'announcements/index': AnnouncementsListScreen,
    'announcements/[id]': AnnouncementDetailScreen,
  }, { initialUrl });
}

test.each(['/home', '/teams/team-1'])('repeated announcement browsing returns to %s in one Back', async (origin) => {
  const navigation = renderNavigation(origin);
  fireEvent.press(screen.getByRole('button', { name: 'Open notice' }));
  await waitFor(() => expect(navigation.getPathname()).toBe(`/announcements/${NOTICE.id}`));
  fireEvent.press(screen.getByRole('button', { name: /^All announcements/ }));
  await waitFor(() => expect(navigation.getPathname()).toBe('/announcements'));
  for (let cycle = 0; cycle < 4; cycle++) {
    fireEvent.press(screen.getByRole('button', { name: /^Announcement: Another notice/ }));
    await waitFor(() => expect(navigation.getPathname()).toBe('/announcements/second-notice'));
    fireEvent.press(screen.getByRole('button', { name: /^All announcements/ }));
    await waitFor(() => expect(navigation.getPathname()).toBe('/announcements'));
  }
  act(() => router.back());
  await waitFor(() => expect(navigation.getPathname()).toBe(origin));
});

test('returning from a team notice reuses the list and clears its team filter', async () => {
  const navigation = renderNavigation('/teams/team-1');
  fireEvent.press(screen.getByRole('button', { name: 'Open team notices' }));
  await waitFor(() => expect(navigation.getSearchParams()).toEqual({ teamId: TEAM.id }));
  fireEvent.press(screen.getByRole('button', { name: /^Announcement: Team notice/ }));
  await waitFor(() => expect(navigation.getPathname()).toBe('/announcements/team-notice'));
  fireEvent.press(screen.getByRole('button', { name: /^All announcements/ }));
  await waitFor(() => expect(navigation.getPathname()).toBe('/announcements'));
  expect(navigation.getSearchParams()).toEqual({});
  expect(screen.getByRole('button', { name: /^Announcement: Another notice/ })).toBeTruthy();
  act(() => router.back());
  await waitFor(() => expect(navigation.getPathname()).toBe('/teams/team-1'));
});

test.each([NOTICE.id, 'missing-notice'])('a direct link to %s replaces the notice when no list exists', async (id) => {
  const navigation = renderNavigation(`/announcements/${id}`);
  fireEvent.press(screen.getByRole('button', { name: /^All announcements/ }));
  await waitFor(() => expect(navigation.getPathname()).toBe('/announcements'));
  expect(navigation.getRouterState()?.routes).toHaveLength(1);
});

test('repeated team → announcement → View team keeps Back pointed at Teams', async () => {
  const navigation = renderNavigation('/teams');
  act(() => router.push({ pathname: '/teams/[teamId]', params: { teamId: TEAM.id } }));
  await waitFor(() => expect(navigation.getPathname()).toBe(`/teams/${TEAM.id}`));
  for (let cycle = 0; cycle < 4; cycle++) {
    fireEvent.press(screen.getByRole('button', { name: 'Open team notice' }));
    await waitFor(() => expect(navigation.getPathname()).toBe('/announcements/team-notice'));
    fireEvent.press(screen.getByRole('button', { name: /^View team/ }));
    await waitFor(() => expect(navigation.getPathname()).toBe(`/teams/${TEAM.id}`));
  }
  act(() => router.back());
  await waitFor(() => expect(navigation.getPathname()).toBe('/teams'));
});

test('a first visit to a team keeps the announcement as the Back destination', async () => {
  const navigation = renderNavigation('/announcements/team-notice');
  fireEvent.press(screen.getByRole('button', { name: /^View team/ }));
  await waitFor(() => expect(navigation.getPathname()).toBe(`/teams/${TEAM.id}`));
  act(() => router.back());
  await waitFor(() => expect(navigation.getPathname()).toBe('/announcements/team-notice'));
});

test('View team returns to the matching team rather than reusing another team page', async () => {
  const navigation = renderNavigation('/home');
  act(() => router.push({ pathname: '/teams/[teamId]', params: { teamId: TEAM.id } }));
  await waitFor(() => expect(navigation.getPathname()).toBe(`/teams/${TEAM.id}`));
  act(() => router.push({ pathname: '/teams/[teamId]', params: { teamId: 'another-team' } }));
  await waitFor(() => expect(navigation.getPathname()).toBe('/teams/another-team'));
  fireEvent.press(screen.getByRole('button', { name: 'Open team notice' }));
  await waitFor(() => expect(navigation.getPathname()).toBe('/announcements/team-notice'));
  fireEvent.press(screen.getByRole('button', { name: /^View team/ }));
  await waitFor(() => expect(navigation.getPathname()).toBe(`/teams/${TEAM.id}`));
  act(() => router.back());
  await waitFor(() => expect(navigation.getPathname()).toBe('/home'));
});
