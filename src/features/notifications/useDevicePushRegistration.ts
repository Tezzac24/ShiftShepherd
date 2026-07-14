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

import { useAuth } from '../../lib/auth/AuthContext';
import {
  getDevicePushSupport,
  getExistingExpoPushToken,
  obtainExpoPushToken,
  ObtainExpoPushTokenResult,
} from '../../lib/notifications';
import {
  clearDurablePushRegistration,
  getDurablePushRegistrationSnapshot,
  invalidateDurablePushRegistration,
  isPushRegistrationScopeCurrent,
  persistDurablePushRegistration,
  PushRegistrationScope,
  rememberDurablePushRegistration,
  runPushRegistrationOperation,
  synchronizePushRegistrationScope,
} from '../../lib/notifications/pushRegistrationOperations';
import {
  clearPushRegistration,
  loadPushRegistration,
  PersistedPushRegistration,
} from '../../lib/storage/persistence';
import {
  isPushRegistrationAccessError,
  registerPushToken,
  unregisterPushToken,
} from '../../lib/supabase/services/pushTokens';

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

interface RenderScope {
  authUserId: string | null;
  profileId: string | null;
  generation: number;
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

  // Account replacement is fenced during render. An unresolved same-account
  // profile keeps its previous generation until the authoritative profile
  // arrives; local scope matching still prevents old work from publishing.
  const lifecycleScope = synchronizePushRegistrationScope(
    authUserId,
    authUserId && accountStatus !== 'ready' ? undefined : profileId,
  );
  const renderScope: RenderScope = {
    authUserId,
    profileId,
    generation: lifecycleScope?.generation ?? 0,
  };

  const [state, setState] = useState<DevicePushRegistrationState>({ kind: 'hydrating' });
  const [foregroundSequence, setForegroundSequence] = useState(0);
  const scopeRef = useRef<RenderScope>(renderScope);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queueGenerationRef = useRef(renderScope.generation);
  const explicitSequenceRef = useRef(0);
  const explicitWorkingRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  scopeRef.current = renderScope;

  if (queueGenerationRef.current !== renderScope.generation) {
    // A never-settling old scope must not hold the new account/profile queue.
    queueGenerationRef.current = renderScope.generation;
    operationQueueRef.current = Promise.resolve();
    explicitWorkingRef.current = null;
  }

  const currentLifecycleScope = useCallback((): PushRegistrationScope | null => {
    const scope = scopeRef.current;
    if (!scope.authUserId) return null;
    return {
      authUserId: scope.authUserId,
      profileId: scope.profileId,
      generation: scope.generation,
    };
  }, []);

  const scopeMatches = useCallback((scope: PushRegistrationScope) => {
    const current = scopeRef.current;
    return (
      current.authUserId === scope.authUserId &&
      current.profileId === scope.profileId &&
      current.generation === scope.generation &&
      isPushRegistrationScopeCurrent(scope)
    );
  }, []);

  const enqueue = useCallback(<T,>(
    scope: PushRegistrationScope,
    operation: () => Promise<T>,
  ): Promise<T | undefined> => {
    const run = () => runPushRegistrationOperation(scope.authUserId, operation);
    const next = operationQueueRef.current.then(run, run);
    operationQueueRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
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

  const clearLocal = useCallback(
    async (scope: PushRegistrationScope, reason: string): Promise<boolean> => {
      try {
        return await clearDurablePushRegistration(scope);
      } catch (error) {
        console.warn(`[pushRegistration] ${reason} local clear failed`, {
          code: safeErrorCode(error),
        });
        return false;
      }
    },
    [],
  );

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
    const scope = currentLifecycleScope();

    if (isLoading) {
      setState({ kind: 'hydrating' });
      return () => {
        cancelled = true;
      };
    }

    if (authMode !== 'supabase' || !authUserId || !scope) {
      setState(idleState());
      // Cold start without Auth, external expiry, and demo mode cannot leave a
      // record available for a later account. Failure is logged but harmless.
      if (!isAuthenticated) {
        void clearPushRegistration().catch((error) =>
          console.warn('[pushRegistration] signed-out local clear failed', {
            code: safeErrorCode(error),
          }),
        );
      }
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
      let stored: PersistedPushRegistration | null;
      try {
        stored = await loadPushRegistration();
      } catch (error) {
        if (!cancelled && scopeMatches(scope)) {
          setState({
            kind: 'failed',
            message: error instanceof Error ? error.message : TOKEN_FAILURE,
          });
        }
        return;
      }
      if (cancelled || !scopeMatches(scope)) return;

      if (!stored) {
        invalidateDurablePushRegistration(scope);
        setState(idleState());
        return;
      }

      if (stored.authUserId !== authUserId) {
        await clearLocal(scope, 'account-replacement');
        if (!cancelled && scopeMatches(scope)) setState(idleState());
        return;
      }

      if (!profileId) {
        await enqueue(scope, async () => {
          if (!scopeMatches(scope)) return;
          await revokeBestEffort(stored.token, 'missing-profile');
          if (scopeMatches(scope)) await clearLocal(scope, 'missing-profile');
        });
        if (!cancelled && scopeMatches(scope)) setState(idleState());
        return;
      }

      rememberDurablePushRegistration(scope, stored);
      const device = await getExistingExpoPushToken();
      if (cancelled || !scopeMatches(scope)) return;

      if (device.status === 'permissionDenied') {
        invalidateDurablePushRegistration(scope);
        await enqueue(scope, async () => {
          if (!scopeMatches(scope)) return;
          await revokeBestEffort(stored.token, 'permission');
          if (scopeMatches(scope)) await clearLocal(scope, 'permission');
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
        const registeredAt = await enqueue(scope, async () => {
          if (!scopeMatches(scope)) return null;
          const timestamp = await registerPushToken(profileId, device.token, device.platform);
          if (!scopeMatches(scope)) {
            const activeScope = currentLifecycleScope();
            if (
              !activeScope ||
              !isPushRegistrationScopeCurrent(activeScope) ||
              activeScope.authUserId !== scope.authUserId
            ) {
              await revokeBestEffort(device.token, 'stale-scope');
            }
            return null;
          }

          const registration: PersistedPushRegistration = {
            authUserId,
            profileId,
            token: device.token,
            platform: device.platform,
            registeredAt: timestamp,
            lifecycleGeneration: scope.generation,
          };
          try {
            const durable = await persistDurablePushRegistration(scope, registration);
            if (!durable) {
              const activeScope = currentLifecycleScope();
              if (
                !activeScope ||
                !isPushRegistrationScopeCurrent(activeScope) ||
                activeScope.authUserId !== scope.authUserId
              ) {
                await revokeBestEffort(device.token, 'stale-scope');
              }
              return null;
            }
          } catch (error) {
            await revokeBestEffort(device.token, 'persistence-rollback');
            throw error;
          }

          // Do not remove the old token until the replacement is durable.
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
          invalidateDurablePushRegistration(scope);
          await clearLocal(scope, 'access-change');
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
    currentLifecycleScope,
    enqueue,
    foregroundSequence,
    isAuthenticated,
    isLoading,
    profileId,
    revokeBestEffort,
    scopeMatches,
  ]);

  const register = useCallback(() => {
    const initialScope = currentLifecycleScope();
    if (
      authMode !== 'supabase' ||
      accountStatus !== 'ready' ||
      !initialScope?.authUserId ||
      !initialScope.profileId ||
      explicitWorkingRef.current !== null
    ) {
      return;
    }

    const explicitAuthUserId = initialScope.authUserId;
    const explicitId = ++explicitSequenceRef.current;
    explicitWorkingRef.current = explicitId;
    setState({ kind: 'working' });

    void enqueue(initialScope, async () => {
      try {
        if (!scopeMatches(initialScope)) return;
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

        const previous = getDurablePushRegistrationSnapshot(initialScope);

        // Explicit permission belongs to this Auth account. Follow quick
        // same-account profile changes, but never carry opt-in to another user.
        while (scopeRef.current.authUserId === explicitAuthUserId) {
          const iterationScope = currentLifecycleScope();
          if (
            !iterationScope?.profileId ||
            !isPushRegistrationScopeCurrent(iterationScope)
          ) {
            return;
          }
          const targetProfileId = iterationScope.profileId;
          const registeredAt = await registerPushToken(
            targetProfileId,
            device.token,
            device.platform,
          );

          const afterRegistration = currentLifecycleScope();
          if (scopeRef.current.authUserId !== explicitAuthUserId) {
            await revokeBestEffort(device.token, 'stale-account');
            return;
          }
          if (
            !afterRegistration?.profileId ||
            !isPushRegistrationScopeCurrent(afterRegistration) ||
            afterRegistration.profileId !== targetProfileId ||
            afterRegistration.generation !== iterationScope.generation
          ) {
            if (
              !afterRegistration ||
              !isPushRegistrationScopeCurrent(afterRegistration) ||
              afterRegistration.authUserId !== explicitAuthUserId
            ) {
              await revokeBestEffort(device.token, 'stale-scope');
              return;
            }
            continue;
          }

          const registration: PersistedPushRegistration = {
            authUserId: explicitAuthUserId,
            profileId: targetProfileId,
            token: device.token,
            platform: device.platform,
            registeredAt,
            lifecycleGeneration: iterationScope.generation,
          };
          let durable: boolean;
          try {
            durable = await persistDurablePushRegistration(iterationScope, registration);
          } catch (error) {
            await revokeBestEffort(device.token, 'persistence-rollback');
            throw error;
          }

          if (!durable) {
            const activeScope = currentLifecycleScope();
            if (
              !activeScope ||
              !isPushRegistrationScopeCurrent(activeScope) ||
              activeScope.authUserId !== explicitAuthUserId
            ) {
              await revokeBestEffort(device.token, 'stale-scope');
              return;
            }
            continue;
          }

          if (mountedRef.current && scopeMatches(iterationScope)) {
            setState({ kind: 'registered', registeredAt });
          }
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
        const scope = currentLifecycleScope();
        if (isPushRegistrationAccessError(error)) {
          if (scope) invalidateDurablePushRegistration(scope);
          if (scope) await clearLocal(scope, 'access-change');
          if (mountedRef.current && scopeRef.current.authUserId === explicitAuthUserId) {
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
        if (explicitWorkingRef.current === explicitId) {
          explicitWorkingRef.current = null;
        }
      }
    });
  }, [
    accountStatus,
    authMode,
    clearLocal,
    currentLifecycleScope,
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
