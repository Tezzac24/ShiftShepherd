/**
 * Invitation links end to end through the real router: Expo Router with the
 * root layout's route guards, the real AuthProvider, and the real pending
 * invitation storage (SecureStore is the in-memory jest.setup mock). Only the
 * network edges are faked: the Supabase client, the account service, and the
 * invitation Edge Function calls.
 *
 * These cover what screen-level tests cannot: navigating to a guarded route
 * that is not registered does nothing, the whole stack remounts when the
 * active organisation changes, and storage decides the next launch.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Slot, Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import React from 'react';
import { Pressable, Text } from 'react-native';

import AuthGateScreen from '../../auth/AuthGateScreen';
import { AuthProvider, useAuth } from '../../../lib/auth/AuthContext';
import {
  clearPendingInvitation,
  loadPendingInvitation,
  savePendingInvitation,
} from '../../../lib/invitations/pendingInvitation';
import {
  acceptOrganisationInvitation,
  previewOrganisationInvitation,
} from '../../../lib/supabase/services/invitations';
import InvitationAcceptScreen from '../InvitationAcceptScreen';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../lib/supabase/services/invitations', () => ({
  previewOrganisationInvitation: jest.fn(),
  acceptOrganisationInvitation: jest.fn(),
}));
jest.mock('../../../lib/supabase/services/pushTokens', () => ({
  unregisterPushToken: jest.fn(async () => true),
}));

const TOKEN = 'q3_Zr-8vK1mN0pQ2sT4uW6xY8zA0bC2dE4fG6hJ8kL0';
const mockInvited = { id: 'auth-invited', email: 'invited@example.com', email_confirmed_at: 'now' };
const mockOther = { id: 'auth-other', email: 'other@example.com', email_confirmed_at: 'now' };

type AuthUser = typeof mockInvited;
/** Who is signed in, and the organisations (and active one) of the invited account. */
let mockSignedIn: AuthUser | null = null;
let mockInvitedOrganisations: string[] = [];
let mockInvitedActive: string | null = null;

const mockSupabase = {
  auth: {
    getSession: jest.fn(async () => ({
      data: { session: mockSignedIn ? { user: mockSignedIn } : null },
    })),
    getUser: jest.fn(async () => ({ data: { user: mockSignedIn }, error: null })),
    signInWithPassword: jest.fn(async ({ email }: { email: string }) => {
      mockSignedIn = email === mockInvited.email ? mockInvited : mockOther;
      return { data: { user: mockSignedIn, session: {} }, error: null };
    }),
    signOut: jest.fn(async () => {
      mockSignedIn = null;
      return { error: null };
    }),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({ data: { role: 'general_member' }, error: null })),
        order: jest.fn(async () => ({ data: [], error: null })),
      })),
    })),
  })),
};
jest.mock('../../../lib/supabase/client', () => ({
  getSupabase: () => mockSupabase,
  isSupabaseConfigured: true,
}));

jest.mock('../../../lib/supabase/services/accounts', () => ({
  fetchAccountContext: jest.fn(async () => {
    const other = mockSignedIn?.id === mockOther.id;
    const names = other ? ['alpha'] : mockInvitedOrganisations;
    const owner = other ? 'other' : 'invited';
    return {
      account: {
        auth_user_id: mockSignedIn?.id,
        global_display_name: other ? 'Other Person' : 'Invited Person',
        name_confirmed_at: 'now',
        active_profile_id: other ? 'profile-other-alpha' : mockInvitedActive,
      },
      organisations: names.map((name) => ({
        profile: { id: `profile-${owner}-${name}`, full_name: `${owner} person`, email: `${owner}@example.com` },
        organisation: { id: `org-${name}`, name: `QA Organisation ${name}` },
      })),
    };
  }),
  switchActiveProfile: jest.fn(),
  setGlobalDisplayName: jest.fn(),
  setOrganisationDisplayNameOverride: jest.fn(),
  setProfileDisplayNames: jest.fn(),
  createOrganisation: jest.fn(),
}));

const mockPreview = previewOrganisationInvitation as jest.Mock;
const mockAccept = acceptOrganisationInvitation as jest.Mock;

function previewAs(status: string) {
  mockPreview.mockImplementation(async () => ({
    organisationName: 'QA Organisation gamma',
    maskedEmail: 'i******@example.com',
    status,
    authenticationRequired: true,
    accountMatches: mockSignedIn ? mockSignedIn.id === mockInvited.id : null,
    verifiedEmailPresent: mockSignedIn ? true : null,
    suggestedDisplayName: null,
  }));
}

/** Mirrors the guards of app/_layout.tsx; the first test keeps the two in step. */
function RootLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <Text>Starting</Text>;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="invite/accept" />
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated && !user}>
        <Stack.Screen name="no-organisations" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
    </Stack>
  );
}

/**
 * app/_layout.tsx keys the organisation data provider by the active profile,
 * which remounts the whole stack when acceptance switches organisations.
 */
function AccountScope({ children }: { children: React.ReactNode }) {
  const { authMode, user } = useAuth();
  const key = authMode === 'supabase' ? `live:${user?.supabaseProfileId ?? 'none'}` : 'signed-out';
  return <React.Fragment key={key}>{children}</React.Fragment>;
}

function LoginStub() {
  const { signInWithEmail } = useAuth();
  return (
    <>
      <Text>Login screen</Text>
      <Pressable onPress={() => void signInWithEmail(mockInvited.email, 'password')}>
        <Text>Sign in as the invited account</Text>
      </Pressable>
    </>
  );
}

function HomeStub() {
  const { user } = useAuth();
  return <Text>{`Home for ${user?.supabaseProfileId}`}</Text>;
}

function routes() {
  return {
    _layout: () => (
      <AuthProvider>
        <AccountScope>
          <RootLayout />
        </AccountScope>
      </AuthProvider>
    ),
    index: AuthGateScreen,
    'invite/accept': InvitationAcceptScreen,
    login: LoginStub,
    'no-organisations': () => <Text>No organisations screen</Text>,
    '(tabs)/_layout': () => <Slot />,
    '(tabs)/home': HomeStub,
  };
}

async function settle() {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(async () => {
  mockSignedIn = null;
  mockInvitedOrganisations = [];
  mockInvitedActive = null;
  mockAccept.mockReset().mockImplementation(async () => {
    // The server links the invited account to Gamma and makes it active.
    mockInvitedOrganisations = [...new Set([...mockInvitedOrganisations, 'gamma'])];
    mockInvitedActive = 'profile-invited-gamma';
    return { organisationId: 'org-gamma', alreadyAccepted: false };
  });
  previewAs('pending');
  await clearPendingInvitation();
});

afterEach(() => {
  jest.useRealTimers();
});

it('mirrors the route guards of the root layout', () => {
  const layout = readFileSync(join(process.cwd(), 'app/_layout.tsx'), 'utf8');
  const firstGuard = layout.indexOf('<Stack.Protected');
  const invite = layout.indexOf('<Stack.Screen name="invite/accept"');
  expect(invite).toBeGreaterThan(-1);
  expect(invite).toBeLessThan(firstGuard);
  expect(layout).toMatch(
    /<Stack\.Protected guard=\{!isAuthenticated\}>\s*<Stack\.Screen name="login"[^>]*\/>\s*<\/Stack\.Protected>/,
  );
  expect(layout).toMatch(
    /<Stack\.Protected guard=\{isAuthenticated && !user\}>\s*<Stack\.Screen name="no-organisations"[^>]*\/>\s*<\/Stack\.Protected>/,
  );
  expect(layout).toMatch(/<Stack\.Protected guard=\{!!user\}>\s*<Stack\.Screen name="\(tabs\)"/);
  expect(layout).toContain('`live:${user?.supabaseProfileId ?? \'no-organisation\'}`');
});

it('joins a first organisation from a link and leaves nothing pending for the next launch', async () => {
  mockSignedIn = mockInvited;
  const router = renderRouter(routes(), { initialUrl: `/invite/accept?token=${TOKEN}` });
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  await waitFor(async () => expect(await loadPendingInvitation()).toBe(TOKEN));
  expect(router.getSearchParams().token).toBeUndefined();

  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(screen.getByText('Home for profile-invited-gamma')).toBeTruthy());
  await settle();

  expect(router.getPathname()).toBe('/home');
  expect(mockAccept).toHaveBeenCalledTimes(1);
  await expect(loadPendingInvitation()).resolves.toBeNull();
});

it('moves an existing member into the organisation they just joined', async () => {
  mockSignedIn = mockInvited;
  mockInvitedOrganisations = ['alpha'];
  mockInvitedActive = 'profile-invited-alpha';
  const router = renderRouter(routes(), { initialUrl: `/invite/accept?token=${TOKEN}` });
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());

  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(screen.getByText('Home for profile-invited-gamma')).toBeTruthy());
  await settle();

  expect(router.getPathname()).toBe('/home');
  await expect(loadPendingInvitation()).resolves.toBeNull();
});

it('clears an expired link for good and lets a signed-in account continue', async () => {
  mockSignedIn = mockOther;
  previewAs('expired');
  const router = renderRouter(routes(), { initialUrl: `/invite/accept?token=${TOKEN}` });
  await waitFor(() => expect(screen.getByText('Invitation unavailable')).toBeTruthy());
  await settle();
  await expect(loadPendingInvitation()).resolves.toBeNull();

  fireEvent.press(screen.getByText('Continue'));
  await waitFor(() => expect(screen.getByText('Home for profile-other-alpha')).toBeTruthy());
  await settle();
  expect(router.getPathname()).toBe('/home');
  await expect(loadPendingInvitation()).resolves.toBeNull();
});

it('explains an expired invitation restored on launch instead of calling it missing', async () => {
  mockSignedIn = mockOther;
  previewAs('expired');
  await savePendingInvitation(TOKEN);
  const router = renderRouter(routes(), { initialUrl: '/' });
  await waitFor(() => expect(router.getPathname()).toBe('/invite/accept'));
  await waitFor(() => expect(screen.getByText('Invitation unavailable')).toBeTruthy());
  await settle();

  expect(screen.queryByText('Invitation not found')).toBeNull();
  await expect(loadPendingInvitation()).resolves.toBeNull();
});

it('never traps an account whose acceptance is refused, now or on the next launch', async () => {
  mockSignedIn = mockInvited;
  previewAs('accepted');
  mockAccept.mockReset().mockRejectedValue(
    new Error('We couldn’t update that invitation right now. Please try again.'),
  );
  const first = renderRouter(routes(), { initialUrl: `/invite/accept?token=${TOKEN}` });
  await waitFor(() => expect(screen.getByText('Open organisation')).toBeTruthy());
  fireEvent.press(screen.getByText('Open organisation'));
  await waitFor(() => expect(screen.getByText(/Please try again/)).toBeTruthy());

  fireEvent.press(screen.getByText('Not now'));
  await waitFor(() => expect(first.getPathname()).toBe('/no-organisations'));
  await settle();
  await expect(loadPendingInvitation()).resolves.toBeNull();
  first.unmount();

  const nextLaunch = renderRouter(routes(), { initialUrl: '/' });
  await waitFor(() => expect(nextLaunch.getPathname()).toBe('/no-organisations'));
  expect(mockPreview).toHaveBeenCalledTimes(1);
});

it('resumes an invitation opened while signed out once the invited account signs in', async () => {
  const router = renderRouter(routes(), { initialUrl: `/invite/accept?token=${TOKEN}` });
  await waitFor(() => expect(screen.getByText('Sign in or create your account')).toBeTruthy());
  fireEvent.press(screen.getByText('Continue'));
  await waitFor(() => expect(router.getPathname()).toBe('/login'));

  fireEvent.press(screen.getByText('Sign in as the invited account'));
  await waitFor(() => expect(router.getPathname()).toBe('/invite/accept'));
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());

  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(screen.getByText('Home for profile-invited-gamma')).toBeTruthy());
  await settle();
  await expect(loadPendingInvitation()).resolves.toBeNull();
});

it('keeps the invitation through a wrong-account switch and accepts it with the invited account', async () => {
  mockSignedIn = mockOther;
  const router = renderRouter(routes(), { initialUrl: `/invite/accept?token=${TOKEN}` });
  await waitFor(() =>
    expect(screen.getByText('This invitation is for a different account')).toBeTruthy(),
  );
  expect(screen.queryByText('Accept invitation')).toBeNull();

  fireEvent.press(screen.getByText('Switch account'));
  await waitFor(() => expect(router.getPathname()).toBe('/login'));
  await expect(loadPendingInvitation()).resolves.toBe(TOKEN);
  expect(mockAccept).not.toHaveBeenCalled();

  fireEvent.press(screen.getByText('Sign in as the invited account'));
  await waitFor(() => expect(router.getPathname()).toBe('/invite/accept'));
  await waitFor(() => expect(screen.getByText('Accept invitation')).toBeTruthy());
  fireEvent.press(screen.getByText('Accept invitation'));
  await waitFor(() => expect(screen.getByText('Home for profile-invited-gamma')).toBeTruthy());
  await settle();
  expect(mockAccept).toHaveBeenCalledTimes(1);
  await expect(loadPendingInvitation()).resolves.toBeNull();
});
