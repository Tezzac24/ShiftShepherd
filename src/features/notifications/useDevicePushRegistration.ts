/**
 * Central lifecycle for this installation's one persisted Expo push token.
 *
 * Automatic work only reconciles an existing explicit opt-in. It never asks
 * for notification permission: the permission-requesting path remains the
 * settings card's user-initiated `register` action.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';

import {
  getDevicePushSupport,
  getExistingExpoPushToken,
  obtainExpoPushToken,
  ObtainExpoPushTokenResult,
} from '../../lib/notifications';
import { runPushRegistrationOperation } from '../../lib/notifications/pushRegistrationOperations';
import {
  clearPushRegistration,
  loadPushRegistration,
  PersistedPushRegistration,
  savePushRegistration,
} from '../../lib/storage/persistence';
import {
  isPushRegistrationAccessError,
  registerPushToken,
  unregisterPushToken,
} from '../../lib/supabase/services/pushTokens';
import { useAuth } from '../../lib/auth/AuthContext';

export type DevicePushRegistrationState =
  | { kind: 'hydrating' }
  | { kind: 'notSetUp' }
  | { kind: 'working' }
  | { kind: 'registered'; registeredAt: string }
  | { kind: 'permissionDenied' }
  | { kind: 'unsupportedDevice' }
  | { kind: 'needsDevelopmentBuild' }
  | { kind: 'missingProjectId' }
  | { kind: 'failed'; message: string };

interface DevicePushRegistrationValue {
  state: DevicePushRegistrationState;
  register: () => void;
}

interface Scope {
  authUserId: string | null;
  profileId: string | null;
}

const DevicePushRegistrationContext =
  createContext<DevicePushRegistrationValue | undefined>(undefined);

const TOKEN_FAILURE =
  "We couldn't check notifications on this device. Check your connection and try again.";
const ACCESS_CHANGED =
  'Your organisation access changed. Refresh your account and try again.';
const REGISTER_FAILURE =
  "We couldn't register this device for notifications. Please try again.";

function idleState(): DevicePushRegistrationState {
  const support = getDevicePushSupport();
  return support === 'supported' ? { kind: 'notSetUp' } : { kind: support };
}

function deviceResultState(
  result: Exclude<ObtainExpoPushTokenResult, { status: 'obtained' }>,
): DevicePushRegistrationState {
  return result.status === 'tokenFailed'
    ? { kind: 'failed', message: TOKEN_FAILURE }
    : { kind: result.status };
}

function safeErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? code : undefined;
}

export function PushRegistrationProvider({ children }: { children: React.ReactNode }) {
  const {
    authMode,
    authIdentity,
    accountContext,
    accountStatus,
    isAuthenticated,
    isLoading,
  } = useAuth();
  const authUserId = authMode === 'supabase' ? (authIdentity?.id ?? null) : null;
  const profileId =
    authMode === 'supabase' && accountStatus === 'ready'
      ? (accountContext?.account.active_profile_id ?? null)
      : null;

  const [state, setState] = useState<DevicePushRegistrationState>({ kind: 'hydrating' });
  const [foregroundSequence, setForegroundSequence] = useState(0);
  const scopeRef = useRef<Scope>({ authUserId, profileId });
  const registrationRef = useRef<PersistedPushRegistration | null>(null);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const explicitWorkingRef = useRef(false);
  const mountedRef = useRef(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  scopeRef.current = { authUserId, profileId };

  const scopeMatches = useCallback((scope: Scope) => {
    const current = scopeRef.current;
    return (
      current.authUserId === scope.authUserId && current.profileId === scope.profileId
    );
  }, []);

  const enqueue = useCallback(<T,>(
    operationAuthUserId: string,
    operation: () => Promise<T>,
  ): Promise<T | undefined> => {
    const run = () => runPushRegistrationOperation(operationAuthUserId, operation);
    const next = operationQueueRef.current.then(run, run);
    operationQueueRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);

  const clearLocal = useCallback(async () => {
    registrationRef.current = null;
    await clearPushRegistration();
  }, []);

  const revokeBestEffort = useCallback(async (token: string, reason: string) => {
    try {
      await unregisterPushToken(token);
    } catch (error) {
      console.warn(`[pushRegistration] ${reason} revocation failed`, {
        code: safeErrorCode(error),
      });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      if ((previous === 'background' || previous === 'inactive') && next === 'active') {
        setForegroundSequence((value) => value + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const scope = { authUserId, profileId };

    if (isLoading) {
      setState({ kind: 'hydrating' });
      return () => {
        cancelled = true;
      };
    }

    if (authMode !== 'supabase' || !authUserId) {
      registrationRef.current = null;
      setState(idleState());
      // Cold start with no authenticated account, or an external session
      // expiry, must not leave local state available to a later account.
      if (!isAuthenticated) void clearPushRegistration();
      return () => {
        cancelled = true;
      };
    }

    if (accountStatus !== 'ready') {
      setState({ kind: 'hydrating' });
      return () => {
        cancelled = true;
      };
    }

    setState({ kind: 'hydrating' });
    void (async () => {
      const stored = await loadPushRegistration();
      if (cancelled || scopeRef.current.authUserId !== authUserId) return;
      registrationRef.current = stored;

      if (!stored) {
        setState(idleState());
        return;
      }

      if (stored.authUserId !== authUserId) {
        await clearLocal();
        if (!cancelled && scopeMatches(scope)) setState(idleState());
        return;
      }

      if (!profileId) {
        await enqueue(authUserId, async () => {
          if (!scopeMatches(scope)) return;
          await revokeBestEffort(stored.token, 'missing-profile');
          if (scopeMatches(scope)) await clearLocal();
        });
        if (!cancelled && scopeMatches(scope)) setState(idleState());
        return;
      }

      const device = await getExistingExpoPushToken();
      if (cancelled || !scopeMatches(scope)) return;

      if (device.status === 'permissionDenied') {
        await enqueue(authUserId, async () => {
          if (!scopeMatches(scope)) return;
          await revokeBestEffort(stored.token, 'permission');
          if (scopeMatches(scope)) await clearLocal();
        });
        if (!cancelled && scopeMatches(scope)) setState({ kind: 'notSetUp' });
        return;
      }

      if (device.status !== 'obtained') {
        setState(deviceResultState(device));
        return;
      }

      if (
        stored.profileId === profileId &&
        stored.token === device.token &&
        stored.platform === device.platform
      ) {
        setState({ kind: 'registered', registeredAt: stored.registeredAt });
        return;
      }

      try {
        const registeredAt = await enqueue(authUserId, async () => {
          if (!scopeMatches(scope)) return null;
          const timestamp = await registerPushToken(profileId, device.token, device.platform);
          if (!scopeMatches(scope)) return null;
          const registration: PersistedPushRegistration = {
            authUserId,
            profileId,
            token: device.token,
            platform: device.platform,
            registeredAt: timestamp,
          };
          await savePushRegistration(registration);
          if (!scopeMatches(scope)) return null;
          registrationRef.current = registration;

          // Rotation cleanup is safe only because the stored account matches
          // the current authenticated account, and it happens after the new
          // token is registered so delivery has no avoidable gap.
          if (stored.token !== device.token) {
            await revokeBestEffort(stored.token, 'rotated-token');
          }
          return timestamp;
        });
        if (!cancelled && registeredAt && scopeMatches(scope)) {
          setState({ kind: 'registered', registeredAt });
        }
      } catch (error) {
        if (cancelled || !scopeMatches(scope)) return;
        if (isPushRegistrationAccessError(error)) {
          await clearLocal();
          if (scopeMatches(scope)) setState({ kind: 'failed', message: ACCESS_CHANGED });
          return;
        }
        setState({
          kind: 'failed',
          message: error instanceof Error ? error.message : REGISTER_FAILURE,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accountStatus,
    authMode,
    authUserId,
    clearLocal,
    enqueue,
    foregroundSequence,
    isAuthenticated,
    isLoading,
    profileId,
    revokeBestEffort,
    scopeMatches,
  ]);

  const register = useCallback(() => {
    const scope = { ...scopeRef.current };
    if (
      authMode !== 'supabase' ||
      accountStatus !== 'ready' ||
      !scope.authUserId ||
      !scope.profileId ||
      explicitWorkingRef.current
    ) {
      return;
    }
    const explicitAuthUserId = scope.authUserId;

    explicitWorkingRef.current = true;
    setState({ kind: 'working' });
    void enqueue(explicitAuthUserId, async () => {
      try {
        if (!scopeMatches(scope)) return;
        const device = await obtainExpoPushToken();
        if (scopeRef.current.authUserId !== explicitAuthUserId) return;
        if (device.status !== 'obtained') {
          if (mountedRef.current) {
            setState(
              device.status === 'tokenFailed'
                ? {
                    kind: 'failed',
                    message:
                      "We couldn't set up notifications on this device. Check your connection and try again.",
                  }
                : { kind: device.status },
            );
          }
          return;
        }

        const previous = registrationRef.current;
        let targetProfileId = scopeRef.current.profileId;

        // Permission was granted by this explicit action. If the same account
        // changes active profile while an RPC or storage write is in flight,
        // keep registering the token until the newest settled profile owns it.
        // A different Auth user never inherits this opt-in.
        while (scopeRef.current.authUserId === explicitAuthUserId && targetProfileId) {
          const registeredAt = await registerPushToken(
            targetProfileId,
            device.token,
            device.platform,
          );
          const afterRegistration = { ...scopeRef.current };
          if (afterRegistration.authUserId !== explicitAuthUserId) return;
          if (!afterRegistration.profileId) return;
          if (afterRegistration.profileId !== targetProfileId) {
            targetProfileId = afterRegistration.profileId;
            continue;
          }

          const registration: PersistedPushRegistration = {
            authUserId: explicitAuthUserId,
            profileId: targetProfileId,
            token: device.token,
            platform: device.platform,
            registeredAt,
          };
          await savePushRegistration(registration);

          const afterPersistence = { ...scopeRef.current };
          if (afterPersistence.authUserId !== explicitAuthUserId) {
            registrationRef.current = null;
            await clearPushRegistration();
            return;
          }
          if (!afterPersistence.profileId) {
            await clearLocal();
            return;
          }
          if (afterPersistence.profileId !== targetProfileId) {
            targetProfileId = afterPersistence.profileId;
            continue;
          }

          registrationRef.current = registration;
          if (mountedRef.current) setState({ kind: 'registered', registeredAt });

          if (
            previous?.authUserId === explicitAuthUserId &&
            previous.token !== device.token
          ) {
            await revokeBestEffort(previous.token, 'rotated-token');
          }
          return;
        }
      } catch (error) {
        if (scopeRef.current.authUserId !== explicitAuthUserId) return;
        if (isPushRegistrationAccessError(error)) {
          await clearLocal();
          if (
            mountedRef.current &&
            scopeRef.current.authUserId === explicitAuthUserId
          ) {
            setState({ kind: 'failed', message: ACCESS_CHANGED });
          }
          return;
        }
        if (mountedRef.current) {
          setState({
            kind: 'failed',
            message: error instanceof Error ? error.message : REGISTER_FAILURE,
          });
        }
      } finally {
        explicitWorkingRef.current = false;
      }
    });
  }, [
    accountStatus,
    authMode,
    clearLocal,
    enqueue,
    revokeBestEffort,
    scopeMatches,
  ]);

  return React.createElement(
    DevicePushRegistrationContext.Provider,
    { value: { state, register } },
    children,
  );
}

export function useDevicePushRegistration(): DevicePushRegistrationValue {
  const context = useContext(DevicePushRegistrationContext);
  if (!context) {
    throw new Error('useDevicePushRegistration must be used within PushRegistrationProvider');
  }
  return context;
}
