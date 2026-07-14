/**
 * Device-side Expo push-token acquisition.
 *
 * This module owns every expo-notifications / expo-device / expo-constants
 * call so screens and services never touch those APIs directly. It obtains
 * an Expo push token for this device; persisting it belongs to
 * src/lib/supabase/services/pushTokens.ts. Delivery remains the separate,
 * existing chat-push server flow; this module has no notification handler,
 * listeners, scheduling, or Expo Push API call.
 *
 * Ground rules:
 *  - Permission is only requested from an explicit user action (the
 *    "Enable device notifications" button) — never on app launch and never
 *    just because the settings screen opened. `getDevicePushSupport()` is
 *    synchronous and touches no permission API, so it is safe on render.
 *  - Expo Go cannot receive remote pushes since SDK 53 — a development
 *    build is required, and we report that instead of failing weirdly.
 *  - `getExpoPushTokenAsync` requires the EAS project id, read from the
 *    final app config via expo-constants (never import app.json directly).
 *  - Push tokens are sensitive-ish device identifiers: never log one.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type DevicePushSupport =
  /** Supported iOS runtime or physical Android device in a build that can register. */
  | 'supported'
  /** Web or Android emulator; supported iOS simulators may attempt registration. */
  | 'unsupportedDevice'
  /** Running inside Expo Go, which cannot receive remote pushes since SDK 53. */
  | 'needsDevelopmentBuild'
  /** The app config carries no EAS project id, so no token can be issued. */
  | 'missingProjectId';

export type ObtainExpoPushTokenResult =
  | { status: 'obtained'; token: string; platform: 'ios' | 'android' }
  | { status: Exclude<DevicePushSupport, 'supported'> }
  | { status: 'permissionDenied' }
  | { status: 'tokenFailed' };

function getEasProjectId(): string | null {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof projectId === 'string' && projectId.length > 0 ? projectId : null;
}

/**
 * Whether this device/build can register for push notifications at all.
 * Synchronous, side-effect free, and never triggers a permission prompt —
 * safe to call on every render of the settings screen.
 */
export function getDevicePushSupport(): DevicePushSupport {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'unsupportedDevice';
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'needsDevelopmentBuild';
  }
  // Expo supports push notifications in iOS Simulator on supported Xcode/macOS/iOS
  // versions. Do not use Device.isDevice as a blanket gate: it is false in the
  // simulator and would prevent Expo from attempting token registration.
  // Keep Android emulator handling conservative for now.
  if (Platform.OS === 'android' && !Device.isDevice) return 'unsupportedDevice';
  if (!getEasProjectId()) return 'missingProjectId';
  return 'supported';
}

/**
 * Read permission and fetch the current Expo token. `requestPermission` must
 * only be true from the explicit registration control.
 */
async function readExpoPushToken(
  requestPermission: boolean,
): Promise<ObtainExpoPushTokenResult> {
  const support = getDevicePushSupport();
  if (support !== 'supported') return { status: support };

  try {
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && requestPermission) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) return { status: 'permissionDenied' };
  } catch (error) {
    console.warn('[notifications] permission check failed', error);
    return { status: 'tokenFailed' };
  }

  const projectId = getEasProjectId();
  if (!projectId) return { status: 'missingProjectId' };

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (typeof data !== 'string' || data.length === 0) {
      return { status: 'tokenFailed' };
    }
    return {
      status: 'obtained',
      token: data,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    };
  } catch (error) {
    // The error may describe connectivity or build problems; it never
    // contains the token (none was issued).
    console.warn('[notifications] could not get an Expo push token', error);
    return { status: 'tokenFailed' };
  }
}

/**
 * Ask for notification permission (only if needed) and obtain the token.
 * This entry point is exclusively for the existing explicit user action.
 */
export async function obtainExpoPushToken(): Promise<ObtainExpoPushTokenResult> {
  // Android needs a channel before the permission prompt/token flow. Failure
  // here is non-fatal and does not change the explicit-consent boundary.
  if (Platform.OS === 'android' && getDevicePushSupport() === 'supported') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Church updates',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    } catch (error) {
      console.warn('[notifications] could not set the Android channel', error);
    }
  }
  return readExpoPushToken(true);
}

/**
 * Inspect an already-authorised registration without ever requesting
 * permission. Used only to hydrate/rebind an existing persisted opt-in.
 */
export function getExistingExpoPushToken(): Promise<ObtainExpoPushTokenResult> {
  return readExpoPushToken(false);
}
