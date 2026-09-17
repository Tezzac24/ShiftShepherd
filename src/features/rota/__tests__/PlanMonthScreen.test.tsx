/**
 * Plan the Month is one logical rota save: every planned date goes through a
 * single ordered batch action (so live mode sends one rota push request for
 * the whole plan), and a batch that stops early still tells the leader how
 * many dates were created.
 */
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useRequiredUser } from '../../../lib/auth/AuthContext';
import { Team, TeamMembership, UserProfile } from '../../../types';
import { parseDateKey } from '../../../utils/dates';
import PlanMonthScreen from '../PlanMonthScreen';

const TEAM_ID = '30000000-0000-4000-a000-000000000001';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ teamId: '30000000-0000-4000-a000-000000000001' }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useRequiredUser: jest.fn() }));
const mockConfirm = jest.fn();
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: () => mockConfirm }));
const mockToast = jest.fn();
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAppData = useAppData as jest.Mock;
const mockUseRequiredUser = useRequiredUser as jest.Mock;

const LEADER: UserProfile = {
  id: '20000000-0000-4000-a000-000000000001',
  auth_user_id: '90000000-0000-4000-a000-000000000001',
  organisation_id: '10000000-0000-4000-a000-000000000001',
  full_name: 'Choir Leader',
  email: 'leader@example.church',
  phone: null,
  avatar_url: null,
  access_status: 'active',
  access_removed_at: null,
  access_removed_by: null,
  access_removal_reason: null,
  created_at: '',
};
const SINGER: UserProfile = {
  ...LEADER,
  id: '20000000-0000-4000-a000-000000000002',
  auth_user_id: '90000000-0000-4000-a000-000000000002',
  full_name: 'Choir Singer',
  email: 'singer@example.church',
};
const CHOIR: Team = {
  id: TEAM_ID,
  organisation_id: LEADER.organisation_id,
  name: 'Choir',
  description: '',
  type: 'choir',
  avatar_url: null,
  archived_at: null,
  archived_by: null,
  created_at: '2026-07-15T00:45:13.000Z',
};
const MEMBERSHIPS: TeamMembership[] = [
  {
    id: '40000000-0000-4000-a000-000000000001',
    team_id: TEAM_ID,
    user_id: LEADER.id,
    role: 'team_leader',
    created_at: '2026-07-15T00:45:13.000Z',
  },
  {
    id: '40000000-0000-4000-a000-000000000002',
    team_id: TEAM_ID,
    user_id: SINGER.id,
    role: 'member',
    created_at: '2026-07-15T00:45:14.000Z',
  },
];

type BatchItem = {
  input: {
    team_id: string;
    title: string;
    date: string;
    time: string | null;
    notes: string | null;
    created_by: string;
  };
  assignments: { user_id: string; role_name: string }[];
};

function renderScreen(addRotaEntries: jest.Mock) {
  const addRotaEntry = jest.fn();
  mockUseAppData.mockReturnValue({
    teams: [CHOIR],
    memberships: MEMBERSHIPS,
    users: [LEADER, SINGER],
    rotaEntries: [],
    addRotaEntries,
    addRotaEntry,
  });
  return { screen: render(<PlanMonthScreen />), addRotaEntry };
}

function createButton(screen: ReturnType<typeof render>) {
  return screen.getByLabelText(/^Create \d+ Rota Entr(y|ies)$/);
}

function plannedCount(screen: ReturnType<typeof render>): number {
  const label = createButton(screen).props.accessibilityLabel as string;
  return Number(/\d+/.exec(label)?.[0]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRequiredUser.mockReturnValue({
    profile: LEADER,
    orgRole: 'church_admin',
    memberships: MEMBERSHIPS,
  });
  mockConfirm.mockResolvedValue(true);
});

describe('PlanMonthScreen', () => {
  it('creates every planned Sunday through one batch action, then closes', async () => {
    const addRotaEntries = jest.fn(async (items: BatchItem[]) => ({
      created: items.map((_, index) => ({ id: `entry-${index}` })),
      error: null,
    }));
    const { screen, addRotaEntry } = renderScreen(addRotaEntries);
    const count = plannedCount(screen);
    expect(count).toBeGreaterThanOrEqual(4);

    fireEvent.press(createButton(screen));

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(addRotaEntries).toHaveBeenCalledTimes(1);
    expect(addRotaEntry).not.toHaveBeenCalled();
    const items = addRotaEntries.mock.calls[0][0];
    expect(items).toHaveLength(count);
    const months = new Set<string>();
    for (const item of items) {
      expect(item).toEqual({
        input: {
          team_id: TEAM_ID,
          title: 'Sunday Morning Service',
          date: expect.any(String),
          time: '09:15',
          notes: null,
          created_by: LEADER.id,
        },
        assignments: [],
      });
      expect(parseDateKey(item.input.date).getDay()).toBe(0);
      months.add(item.input.date.slice(0, 7));
    }
    expect(months.size).toBe(1);
    expect(mockToast).toHaveBeenCalledWith(`${count} rota entries created.`);
  });

  it('includes weekly rehearsals for every choir member in the same batch', async () => {
    const addRotaEntries = jest.fn(async (items: BatchItem[]) => ({
      created: items.map((_, index) => ({ id: `entry-${index}` })),
      error: null,
    }));
    const { screen } = renderScreen(addRotaEntries);
    fireEvent(screen.getByLabelText('Include weekly rehearsals'), 'valueChange', true);

    fireEvent.press(createButton(screen));

    await waitFor(() => expect(addRotaEntries).toHaveBeenCalledTimes(1));
    const items = addRotaEntries.mock.calls[0][0];
    const rehearsals = items.filter((item) => item.input.title === 'Choir Rehearsal');
    expect(rehearsals.length).toBeGreaterThanOrEqual(4);
    for (const rehearsal of rehearsals) {
      expect(rehearsal.input.time).toBe('17:00');
      expect(parseDateKey(rehearsal.input.date).getDay()).toBe(6);
      expect(rehearsal.assignments).toEqual([
        { user_id: LEADER.id, role_name: 'Choir Member' },
        { user_id: SINGER.id, role_name: 'Choir Member' },
      ]);
    }
    expect(items.some((item) => item.input.title === 'Sunday Morning Service')).toBe(true);
  });

  it('says how many dates were created when the batch stops early, and stays open', async () => {
    const addRotaEntries = jest.fn(async () => ({
      created: [{ id: 'entry-0' }, { id: 'entry-1' }],
      error: new Error('Your changes could not be saved. Please try again.'),
    }));
    const { screen } = renderScreen(addRotaEntries);
    const count = plannedCount(screen);

    fireEvent.press(createButton(screen));

    expect(
      await screen.findByText(
        `Your changes could not be saved. Please try again. 2 of ${count} dates were created before the problem — check the rota before trying again.`,
      ),
    ).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    // The button is usable again for a deliberate retry.
    expect(createButton(screen).props.accessibilityState?.disabled).toBeFalsy();
  });

  it('shows the plain message when nothing was created', async () => {
    const addRotaEntries = jest.fn(async () => ({
      created: [],
      error: new Error('We couldn’t reach the server. Please check your connection and try again.'),
    }));
    const { screen } = renderScreen(addRotaEntries);

    fireEvent.press(createButton(screen));

    expect(
      await screen.findByText(
        'We couldn’t reach the server. Please check your connection and try again.',
      ),
    ).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('creates nothing when the leader does not confirm', async () => {
    mockConfirm.mockResolvedValue(false);
    const addRotaEntries = jest.fn();
    const { screen } = renderScreen(addRotaEntries);

    fireEvent.press(createButton(screen));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    expect(addRotaEntries).not.toHaveBeenCalled();
  });
});
