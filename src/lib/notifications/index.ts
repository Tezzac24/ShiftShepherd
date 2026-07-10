/**
 * Device-side push notification registration (V1: register only).
 *
 * This module owns every expo-notifications / expo-device / expo-constants
 * call so screens and services never touch those APIs directly. It obtains
 * an Expo push token for this device; persisting it belongs to
 * src/lib/supabase/services/pushTokens.ts, and nothing is ever *delivered*
 * yet — there is deliberately no notification handler, no listeners, no
 * scheduling, and no Expo Push API call in this build.
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
  /** Physical iOS/Android device in a build that can register. */
  | 'supported'
  /** Web, or an iOS simulator / Android emulator — no push token exists. */
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
 * Ask for notification permission (OS prompt only if not yet granted) and
 * fetch this device's Expo push token. Call this exclusively from a
 * user-initiated action. The caller persists the token; it is never logged.
 */
export async function obtainExpoPushToken(): Promise<ObtainExpoPushTokenResult> {
  const support = getDevicePushSupport();
  if (support !== 'supported') return { status: support };

  // Android needs a channel before the permission prompt / token can behave
  // sensibly (Android 8+). Failure here shouldn't block registration.
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Church updates',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    } catch (error) {
      console.warn('[notifications] could not set the Android channel', error);
    }
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted) {
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
