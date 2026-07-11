/**
 * Device push registration card state machine.
 *
 * The device flow and the Supabase service are both mocked — these tests pin
 * how their results map to the card's friendly states, that demo mode (no
 * live profile id) never touches push APIs, and that the raw Expo token
 * never leaks into UI-facing state.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { obtainExpoPushToken } from '../../../lib/notifications';
import { registerPushToken } from '../../../lib/supabase/services/pushTokens';
import { useDevicePushRegistration } from '../useDevicePushRegistration';

jest.mock('../../../lib/notifications', () => ({
  getDevicePushSupport: jest.fn(() => 'supported'),
  obtainExpoPushToken: jest.fn(),
}));

jest.mock('../../../lib/supabase/services/pushTokens', () => ({
  registerPushToken: jest.fn(),
}));

const mockObtainToken = obtainExpoPushToken as jest.Mock;
const mockRegisterToken = registerPushToken as jest.Mock;

const LIVE_PROFILE_ID = '5f0d8f5e-1111-2222-3333-444455556666';
const TOKEN = 'ExponentPushToken[secret-device-token]';

describe('useDevicePushRegistration', () => {
  it('refuses to run without a live profile id (demo mode never calls push APIs)', () => {
    const { result } = renderHook(() => useDevicePushRegistration(null));
    act(() => result.current.register());
    expect(mockObtainToken).not.toHaveBeenCalled();
    expect(mockRegisterToken).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ kind: 'notSetUp' });
  });

  it('registers the obtained token through the Supabase service and reports the timestamp', async () => {
    mockObtainToken.mockResolvedValue({ status: 'obtained', token: TOKEN, platform: 'ios' });
    mockRegisterToken.mockResolvedValue('2026-07-11T12:00:00+00:00');

    const { result } = renderHook(() => useDevicePushRegistration(LIVE_PROFILE_ID));
    act(() => result.current.register());
    await waitFor(() => expect(result.current.state.kind).toBe('registered'));

    expect(mockRegisterToken).toHaveBeenCalledWith(LIVE_PROFILE_ID, TOKEN, 'ios');
    expect(result.current.state).toEqual({
      kind: 'registered',
      registeredAt: '2026-07-11T12:00:00+00:00',
    });
    // The raw token must never appear in anything a screen could render.
    expect(JSON.stringify(result.current.state)).not.toContain(TOKEN);
  });

  it('maps a denied permission to its friendly state without calling Supabase', async () => {
    mockObtainToken.mockResolvedValue({ status: 'permissionDenied' });

    const { result } = renderHook(() => useDevicePushRegistration(LIVE_PROFILE_ID));
    act(() => result.current.register());
    await waitFor(() => expect(result.current.state.kind).toBe('permissionDenied'));

    expect(mockRegisterToken).not.toHaveBeenCalled();
  });

  it('maps a device token failure to a friendly, retryable failed state', async () => {
    mockObtainToken.mockResolvedValue({ status: 'tokenFailed' });

    const { result } = renderHook(() => useDevicePushRegistration(LIVE_PROFILE_ID));
    act(() => result.current.register());
    await waitFor(() => expect(result.current.state.kind).toBe('failed'));

    expect(result.current.state).toEqual({
      kind: 'failed',
      message:
        "We couldn't set up notifications on this device. Check your connection and try again.",
    });
    expect(mockRegisterToken).not.toHaveBeenCalled();
  });

  it('surfaces the Supabase service’s friendly error copy when registration fails', async () => {
    mockObtainToken.mockResolvedValue({ status: 'obtained', token: TOKEN, platform: 'ios' });
    mockRegisterToken.mockRejectedValue(
      new Error(
        'Device registration is not switched on for your church yet. Please try again after the next update.',
      ),
    );

    const { result } = renderHook(() => useDevicePushRegistration(LIVE_PROFILE_ID));
    act(() => result.current.register());
    await waitFor(() => expect(result.current.state.kind).toBe('failed'));

    expect(result.current.state).toEqual({
      kind: 'failed',
      message:
        'Device registration is not switched on for your church yet. Please try again after the next update.',
    });
    expect(JSON.stringify(result.current.state)).not.toContain(TOKEN);
  });
});
