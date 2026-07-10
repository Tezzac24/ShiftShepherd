/**
 * Session-only state machine for Device Push Registration V1.
 *
 * Drives the "Device notifications" card on the notification settings
 * screen in live mode. Registration is strictly manual: nothing here runs
 * until the person taps the button, and the OS permission prompt only ever
 * follows that tap. The resulting status lives in component state — it is
 * never persisted, so it naturally clears on sign-out/user switch (and is
 * additionally reset if the linked profile changes while mounted).
 *
 * Demo mode never reaches this hook's actions: the screen hides the card,
 * and `register` refuses to run without a live profile id.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getDevicePushSupport,
  obtainExpoPushToken,
} from '../../lib/notifications';
import { registerPushToken } from '../../lib/supabase/services/pushTokens';

export type DevicePushRegistrationState =
  /** Supported device, nothing registered in this session yet. */
  | { kind: 'notSetUp' }
  | { kind: 'working' }
  | { kind: 'registered'; registeredAt: string }
  | { kind: 'permissionDenied' }
  | { kind: 'unsupportedDevice' }
  | { kind: 'needsDevelopmentBuild' }
  | { kind: 'missingProjectId' }
  | { kind: 'failed'; message: string };

function initialState(): DevicePushRegistrationState {
  const support = getDevicePushSupport();
  return support === 'supported' ? { kind: 'notSetUp' } : { kind: support };
}

export function useDevicePushRegistration(liveProfileId: string | null): {
  state: DevicePushRegistrationState;
  register: () => void;
} {
  const [state, setState] = useState<DevicePushRegistrationState>(initialState);
  const workingRef = useRef(false);

  // A different signed-in profile must never inherit the previous person's
  // visible registration state.
  useEffect(() => {
    setState(initialState());
  }, [liveProfileId]);

  const register = useCallback(() => {
    if (!liveProfileId || workingRef.current) return;
    workingRef.current = true;
    setState({ kind: 'working' });
    void (async () => {
      try {
        const device = await obtainExpoPushToken();
        if (device.status !== 'obtained') {
          setState(
            device.status === 'tokenFailed'
              ? {
                  kind: 'failed',
                  message:
                    "We couldn't set up notifications on this device. Check your connection and try again.",
                }
              : { kind: device.status },
          );
          return;
        }
        const registeredAt = await registerPushToken(
          liveProfileId,
          device.token,
          device.platform,
        );
        setState({ kind: 'registered', registeredAt });
      } catch (error) {
        setState({
          kind: 'failed',
          message:
            error instanceof Error
              ? error.message
              : "We couldn't register this device for notifications. Please try again.",
        });
      } finally {
        workingRef.current = false;
      }
    })();
  }, [liveProfileId]);

  return { state, register };
}
