import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { OrganisationHeader } from '../../../components/OrganisationHeader';
import { useAppData } from '../../../lib/appData/AppDataContext';
import { makeAnnouncement, makeAssignment, makeEntry, makeEvent, makeTeam, makeUser, profile } from '../../../lib/appData/__tests__/presentationFixtures';
import { useAuth, useRequiredUser } from '../../../lib/auth/AuthContext';
import { AccountContext, SessionUser } from '../../../types';
import CalendarScreen from '../../calendar/CalendarScreen';
import HomeScreen from '../HomeScreen';
import { formatFullDate } from '../../../utils/dates';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockParams: Record<string, unknown> = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, setParams: mockSetParams }), useLocalSearchParams: () => mockParams }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn(), useRequiredUser: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

let user: SessionUser;
let data: Pick<ReturnType<typeof useAppData>, 'organisation' | 'teams' | 'archivedTeams' | 'users' | 'rotaEntries' | 'rotaAssignments'
  | 'availabilityResponses' | 'events' | 'categories' | 'announcements' | 'unreadByTeam' | 'teamsLoading' | 'teamsError'
  | 'rotasLoading' | 'rotasError' | 'eventsLoading' | 'eventsError' | 'announcementsLoading' | 'announcementsError'> & {
  getAnnouncementImageUri: jest.Mock; refreshTeams: jest.Mock; refreshRotas: jest.Mock; refreshEvents: jest.Mock;
  refreshAnnouncements: jest.Mock; markTeamChatRead: jest.Mock;
};
let auth: { user: SessionUser; authMode: 'demo' | 'supabase'; accountContext: AccountContext | null;
  accountStatus: 'ready' | 'loading' | 'error'; refreshAccountContext: jest.Mock };

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 8, 21, 12));
  jest.clearAllMocks();
  mockParams = {};
  user = makeUser();
  auth = { user, authMode: 'demo', accountContext: null, accountStatus: 'ready', refreshAccountContext: jest.fn() };
  data = {
    organisation: { id: 'church-a', name: 'Demo church', logo_url: null, primary_colour: '', created_at: '' },
    teams: [makeTeam()], archivedTeams: [], users: [profile], rotaEntries: [makeEntry()], rotaAssignments: [makeAssignment()], availabilityResponses: [],
    events: [makeEvent()], categories: [], announcements: [makeAnnouncement()], unreadByTeam: {},
    teamsLoading: false, teamsError: null, rotasLoading: false, rotasError: null, eventsLoading: false, eventsError: null,
    announcementsLoading: false, announcementsError: null, getAnnouncementImageUri: jest.fn(),
    refreshTeams: jest.fn(), refreshRotas: jest.fn(), refreshEvents: jest.fn(), refreshAnnouncements: jest.fn(), markTeamChatRead: jest.fn(),
  };
  (useRequiredUser as jest.Mock).mockImplementation(() => user);
  (useAuth as jest.Mock).mockImplementation(() => auth);
  (useAppData as jest.Mock).mockImplementation(() => data);
});
afterEach(() => jest.useRealTimers());

describe('Home overview', () => {
  it('updates the date, greeting and next serving at midnight without changing saved data', () => {
    jest.setSystemTime(new Date(2026, 8, 21, 23, 59, 59));
    data.rotaEntries = [makeEntry({ date: '2026-09-21', title: 'Today serving' }), makeEntry({ id: 'tomorrow', date: '2026-09-22', title: 'Next day serving' })];
    data.rotaAssignments = [makeAssignment(), makeAssignment({ id: 'tomorrow-assignment', rota_entry_id: 'tomorrow' })];
    const savedEntries = data.rotaEntries;
    const savedAssignments = data.rotaAssignments;
    const screen = render(<HomeScreen />);
    expect(screen.getByText('Today serving')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: /Good evening/ })).toBeOnTheScreen();
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByText('Today serving')).toBeNull();
    expect(screen.getByText('Next day serving')).toBeOnTheScreen();
    expect(screen.getByText(formatFullDate(new Date(2026, 8, 22)))).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: /Good morning/ })).toBeOnTheScreen();
    expect(data.rotaEntries).toBe(savedEntries);
    expect(data.rotaAssignments).toBe(savedAssignments);
    expect(data.refreshRotas).not.toHaveBeenCalled();
    expect(data.availabilityResponses).toEqual([]);
  });

  it('leads with all next-duty roles and a single response action, with a permanent My serving route', () => {
    data.rotaAssignments.push(makeAssignment({ id: 'worship', role_name: 'Worship Leader' }));
    const screen = render(<HomeScreen />);
    expect(screen.getByText(/Praise Leader & Worship Leader/)).toBeOnTheScreen();
    expect(screen.getAllByRole('header')[1]).toHaveTextContent('Next serving');
    fireEvent.press(screen.getByRole('button', { name: 'Confirm availability' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: 'team-a', entryId: 'date-a' } });
    fireEvent.press(screen.getByRole('button', { name: 'My serving' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/calendar', params: { view: 'serving' } });
    expect(screen.queryByText('Your Teams')).toBeNull();
  });

  it('focuses the next event when no duty exists, without repeating that occurrence below', () => {
    data.rotaAssignments = [];
    data.events.push(makeEvent({ id: 'event-b', title: 'Community lunch', start_time: new Date(2026, 8, 24, 10).toISOString(), end_time: new Date(2026, 8, 24, 12).toISOString() }));
    const screen = render(<HomeScreen />);
    expect(screen.getByText('No upcoming serving duties.')).toBeOnTheScreen();
    expect(screen.getAllByText('Church gathering')).toHaveLength(1);
    expect(screen.getAllByText('Community lunch')).toHaveLength(1);
    fireEvent.press(screen.getByRole('button', { name: 'View event' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/events/[id]', params: { id: 'event-a', occurrenceStart: data.events[0].start_time } });
    fireEvent.press(screen.getByRole('button', { name: 'All events' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/(tabs)/calendar', params: { view: 'events' } });
  });

  it('shows an unread cue only for accessible conversations and never marks them read', () => {
    data.unreadByTeam = { 'team-a': 3, hidden: 99 };
    const screen = render(<HomeScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Messages, 3 unread' }));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/messages');
    expect(data.markTeamChatRead).not.toHaveBeenCalled();
    data.unreadByTeam = {};
    screen.rerender(<HomeScreen />);
    expect(screen.queryByRole('button', { name: /Messages, .* unread/ })).toBeNull();
  });

  it('offers the latest announcement and the full list without announcement unread claims', () => {
    data.announcements.push(makeAnnouncement({ id: 'old-pinned', title: 'Older pinned notice', pinned: true, created_at: '2026-09-19T10:00:00Z' }));
    const screen = render(<HomeScreen />);
    expect(screen.queryByText('Older pinned notice')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /^Announcement: Our community meal/ }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/announcements/[id]', params: { id: 'notice-a' } });
    fireEvent.press(screen.getByRole('button', { name: 'View all announcements' }));
    expect(mockPush).toHaveBeenLastCalledWith('/announcements');
    expect(screen.queryByText(/unread/i)).toBeNull();
  });

  it.each([true, false])('excludes a cached newest team notice after archive (another notice: %s)', (hasNextNotice) => {
    user = makeUser({ orgRole: 'church_admin', memberships: [] });
    const archivedNotice = makeAnnouncement({ id: 'archived-notice', team_id: 'team-a', audience: 'team',
      title: 'Newest team update', pinned: true, created_at: '2026-09-21T10:00:00Z' });
    data.announcements = hasNextNotice ? [makeAnnouncement(), archivedNotice] : [archivedNotice];
    const cachedNotices = data.announcements;
    const screen = render(<HomeScreen />);
    expect(screen.getByText('Newest team update')).toBeOnTheScreen();

    data.archivedTeams = [makeTeam({ archived_at: '2026-09-21T11:00:00Z', archived_by: profile.id })];
    data.teams = [];
    screen.rerender(<HomeScreen />);

    expect(data.announcements).toBe(cachedNotices);
    expect(screen.queryByText('Newest team update')).toBeNull();
    if (hasNextNotice) {
      fireEvent.press(screen.getByRole('button', { name: /^Announcement: Our community meal/ }));
      expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/announcements/[id]', params: { id: 'notice-a' } });
      expect(screen.queryByText(/No announcements yet/)).toBeNull();
    } else {
      expect(screen.getByText('No announcements yet. Updates from your church will appear here.')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /^Announcement:/ })).toBeNull();
    }
  });

  it('keeps organisation and team-audience restrictions when choosing the latest notice', () => {
    data.announcements.push(
      makeAnnouncement({ id: 'foreign', organisation_id: 'church-b', title: 'Another church', created_at: '2026-09-22T10:00:00Z' }),
      makeAnnouncement({ id: 'non-member', team_id: 'team-b', audience: 'team', title: 'Another team', created_at: '2026-09-21T10:00:00Z' }),
    );
    const screen = render(<HomeScreen />);
    expect(screen.getByText('Our community meal')).toBeOnTheScreen();
    expect(screen.queryByText('Another church')).toBeNull();
    expect(screen.queryByText('Another team')).toBeNull();
    user = makeUser({ memberships: [...user.memberships, { id: 'membership-b', team_id: 'team-b', user_id: profile.id, role: 'member', created_at: '' }] });
    screen.rerender(<HomeScreen />);
    expect(screen.getByText('Another team')).toBeOnTheScreen();
    expect(screen.queryByText('Another church')).toBeNull();
  });

  it('keeps announcement, event and serving load states independent', () => {
    data.rotaAssignments = [];
    data.rotasLoading = true;
    data.events = [];
    data.eventsError = 'Events are temporarily unavailable.';
    const screen = render(<HomeScreen />);
    expect(screen.getByRole('progressbar', { name: 'Loading your serving dates…' })).toBeOnTheScreen();
    expect(screen.getByText('Our community meal')).toBeOnTheScreen();
    expect(screen.queryByText('No upcoming serving duties.')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Retry events' }));
    expect(data.refreshEvents).toHaveBeenCalledTimes(1);
    expect(data.refreshRotas).not.toHaveBeenCalled();
  });

  it('shows a single actionable event failure when there are no serving duties or loaded events', () => {
    data.rotaAssignments = [];
    data.events = [];
    data.eventsError = 'Events are temporarily unavailable.';
    const screen = render(<HomeScreen />);
    expect(screen.getAllByRole('button', { name: 'Retry events' })).toHaveLength(1);
    expect(screen.queryByText('No upcoming church events')).toBeNull();
    expect(screen.getByText('No upcoming serving duties.')).toBeOnTheScreen();
    expect(screen.getByText('Our community meal')).toBeOnTheScreen();
  });

  it('offers independent retries for failed teams, serving and announcements without false empties', () => {
    data.rotaAssignments = [];
    data.announcements = [];
    data.teamsError = 'Teams unavailable.';
    data.rotasError = 'Serving unavailable.';
    data.announcementsError = 'Announcements unavailable.';
    const screen = render(<HomeScreen />);
    for (const label of ['Retry teams', 'Retry serving', 'Retry announcements']) fireEvent.press(screen.getByRole('button', { name: label }));
    expect(data.refreshTeams).toHaveBeenCalledTimes(1);
    expect(data.refreshRotas).toHaveBeenCalledTimes(1);
    expect(data.refreshAnnouncements).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('No upcoming serving duties.')).toBeNull();
    expect(screen.queryByText(/No announcements yet/)).toBeNull();
  });
});

describe('Schedule views', () => {
  it('defaults to church events, selects serving through route state and supports later route changes', () => {
    const screen = render(<CalendarScreen />);
    expect(screen.getByRole('tab', { name: 'Church events' })).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
    fireEvent.press(screen.getByRole('tab', { name: 'My serving' }));
    expect(mockSetParams).toHaveBeenCalledWith({ view: 'serving' });
    mockParams = { view: 'serving', profileId: 'someone-else', organisationId: 'church-b' };
    screen.rerender(<CalendarScreen />);
    expect(screen.getByRole('tab', { name: 'My serving' })).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
    expect(screen.getByText('Sunday serving')).toBeOnTheScreen();
    expect(screen.queryByText('Church gathering')).toBeNull();
    mockParams = { view: 'unsupported' };
    screen.rerender(<CalendarScreen />);
    expect(screen.getByRole('tab', { name: 'Church events' })).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
  });

  it('routes a grouped multi-role serving date without changing an availability response', () => {
    mockParams = { view: 'serving' };
    data.rotaAssignments.push(makeAssignment({ id: 'worship', role_name: 'Worship Leader' }));
    const screen = render(<CalendarScreen />);
    const row = screen.getByRole('button', { name: /Sunday serving.*Praise Leader & Worship Leader.*Response needed/ });
    expect(screen.getByText(/Open a date to confirm or update your availability/)).toBeOnTheScreen();
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/teams/[teamId]/rota/[entryId]', params: { teamId: 'team-a', entryId: 'date-a' } });
    expect(data.availabilityResponses).toEqual([]);
  });

  it.each(['church_admin', 'event_manager'] as const)('keeps event creation available to %s', (orgRole) => {
    user = makeUser({ orgRole });
    const screen = render(<CalendarScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'New event' }));
    expect(mockPush).toHaveBeenCalledWith('/events/edit');
    mockParams = { view: 'serving' };
    screen.rerender(<CalendarScreen />);
    expect(screen.queryByRole('button', { name: 'New event' })).toBeNull();
  });

  it.each(['general_member', 'announcement_manager'] as const)('does not grant event creation to a %s team leader', (orgRole) => {
    user = makeUser({ orgRole, memberships: [{ ...user.memberships[0], role: 'team_leader' }] });
    const screen = render(<CalendarScreen />);
    expect(screen.queryByRole('button', { name: 'New event' })).toBeNull();
  });

  it('expands recurring events and sends the selected occurrence to the existing detail route', () => {
    data.events = [makeEvent({ is_recurring: true, recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1', recurrence_label: 'Every week' })];
    const screen = render(<CalendarScreen />);
    const occurrences = screen.getAllByRole('button', { name: /^Church gathering\./ });
    expect(occurrences.length).toBeGreaterThan(1);
    fireEvent.press(occurrences[1]);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/[id]', params: { id: 'event-a', occurrenceStart: new Date(2026, 8, 30, 10).toISOString() } });
  });

  it('keeps finished base events available behind the past-events disclosure', () => {
    const past = makeEvent({ id: 'past', title: 'Last month’s gathering', start_time: new Date(2026, 7, 10, 10).toISOString(), end_time: new Date(2026, 7, 10, 12).toISOString() });
    data.events.push(past);
    const screen = render(<CalendarScreen />);
    const expandedAliases = () => {
      const toggles: { props: Record<string, unknown> }[] = screen.UNSAFE_root.findAll((node: { props: Record<string, unknown> }) =>
        node.props.accessibilityLabel === 'Past events, 1' && node.props['aria-expanded'] !== undefined);
      return toggles.map((toggle) => toggle.props['aria-expanded']);
    };
    expect(screen.queryByText(past.title)).toBeNull();
    expect(expandedAliases()).toEqual([false]);
    expect(screen.getByRole('button', { name: 'Past events, 1' })).toHaveProp('accessibilityState', expect.objectContaining({ expanded: false }));
    fireEvent.press(screen.getByRole('button', { name: 'Past events, 1' }));
    expect(expandedAliases()).toEqual([true]);
    expect(screen.getByRole('button', { name: 'Past events, 1' })).toHaveProp('accessibilityState', expect.objectContaining({ expanded: true }));
    fireEvent.press(screen.getByRole('button', { name: /^Last month’s gathering\./ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/events/[id]', params: { id: 'past', occurrenceStart: past.start_time } });
  });

  it('does not let a rota failure obscure church events or an event failure obscure serving', () => {
    data.rotasError = 'Serving unavailable.';
    const screen = render(<CalendarScreen />);
    expect(screen.getByText('Church gathering')).toBeOnTheScreen();
    expect(screen.queryByText('Serving unavailable.')).toBeNull();
    data.rotasError = null;
    data.eventsError = 'Events unavailable.';
    mockParams = { view: 'serving' };
    screen.rerender(<CalendarScreen />);
    expect(screen.getByText('Sunday serving')).toBeOnTheScreen();
    expect(screen.queryByText('Events unavailable.')).toBeNull();
  });

  it('distinguishes serving load, directory failure and resolved empty states', () => {
    mockParams = { view: 'serving' };
    data.rotaAssignments = [];
    data.teamsLoading = true;
    const screen = render(<CalendarScreen />);
    expect(screen.getByRole('progressbar', { name: 'Loading your serving dates…' })).toBeOnTheScreen();
    expect(screen.queryByText('No upcoming serving duties')).toBeNull();
    expect(screen.queryByText(/Open a date to confirm or update your availability/)).toBeNull();
    data.teamsLoading = false;
    data.teamsError = 'Teams unavailable.';
    screen.rerender(<CalendarScreen />);
    expect(screen.queryByText('No upcoming serving duties')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Retry teams' }));
    expect(data.refreshTeams).toHaveBeenCalledTimes(1);
    data.teamsError = null;
    screen.rerender(<CalendarScreen />);
    expect(screen.getByText('No upcoming serving duties')).toBeOnTheScreen();
    expect(screen.getByText('Serving dates appear here when you’re scheduled. Choose Church events to see what’s happening at church.')).toBeOnTheScreen();
    expect(screen.queryByText(/Open a date to confirm or update your availability/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'View church events' }));
    expect(mockSetParams).toHaveBeenCalledWith({ view: 'events' });
    mockParams = { view: 'events' };
    screen.rerender(<CalendarScreen />);
    expect(screen.getByText('Church gathering')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Church events' })).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
  });

  it('distinguishes church-event load, failure and empty states', () => {
    data.events = [];
    data.eventsLoading = true;
    const screen = render(<CalendarScreen />);
    expect(screen.getByRole('progressbar', { name: 'Loading church events…' })).toBeOnTheScreen();
    expect(screen.queryByText('No upcoming events')).toBeNull();
    data.eventsLoading = false;
    data.eventsError = 'Events unavailable.';
    screen.rerender(<CalendarScreen />);
    expect(screen.queryByText('No upcoming events')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Retry events' }));
    expect(data.refreshEvents).toHaveBeenCalledTimes(1);
    data.eventsError = null;
    screen.rerender(<CalendarScreen />);
    expect(screen.getByText('No upcoming events')).toBeOnTheScreen();
  });
});

describe('resolved church header', () => {
  function liveContext() {
    auth.authMode = 'supabase';
    auth.accountContext = {
      account: { auth_user_id: profile.auth_user_id, active_profile_id: profile.id, global_display_name: profile.full_name, name_confirmed_at: '' },
      organisations: [{ profile, organisation: { id: profile.organisation_id, name: 'Actual church' } }],
    };
  }

  it('uses the resolved account church while AppData still contains demo metadata', () => {
    liveContext();
    const screen = render(<OrganisationHeader />);
    expect(screen.getByText('Actual church')).toBeOnTheScreen();
    expect(screen.queryByText('Demo church')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Switch church' })).toBeNull();
  });

  it('opens the established organisation selector only for multiple resolved live choices', () => {
    liveContext();
    auth.accountContext!.organisations.push({ profile: { ...profile, id: 'second-profile', organisation_id: 'church-b' }, organisation: { id: 'church-b', name: 'Second church' } });
    const screen = render(<OrganisationHeader />);
    fireEvent.press(screen.getByRole('button', { name: 'Switch church' }));
    expect(mockPush).toHaveBeenCalledWith('/organisations/select');
    auth.authMode = 'demo';
    screen.rerender(<OrganisationHeader />);
    expect(screen.queryByRole('button', { name: 'Switch church' })).toBeNull();
  });

  it('keeps an unresolved or mismatched live profile from naming a demo or other church', () => {
    auth.authMode = 'supabase';
    auth.accountStatus = 'loading';
    const screen = render(<OrganisationHeader />);
    expect(screen.getByText('Loading church…')).toBeOnTheScreen();
    expect(screen.queryByText('Demo church')).toBeNull();
    liveContext();
    auth.accountContext!.account.active_profile_id = 'second-profile';
    screen.rerender(<OrganisationHeader />);
    expect(screen.getByText('Loading church…')).toBeOnTheScreen();
    expect(screen.queryByText('Actual church')).toBeNull();
  });

  it('offers the existing account refresh after a context error', () => {
    auth.authMode = 'supabase';
    auth.accountStatus = 'error';
    const screen = render(<OrganisationHeader />);
    expect(screen.getByText('Church unavailable')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Retry church details' }));
    expect(auth.refreshAccountContext).toHaveBeenCalledTimes(1);
  });
});
