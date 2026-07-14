/**
 * Device push registration logic (Push Token Registration V1).
 *
 * Everything expo-notifications/expo-device/expo-constants is mocked — no
 * test ever prompts for permission or generates a real Expo push token.
 * Guards the friendly support states and the iOS-simulator regression
 * (Device.isDevice must not gate iOS registration).
 */
import {
  getDevicePushSupport,
  getExistingExpoPushToken,
  obtainExpoPushToken,
} from '../index';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('expo-constants', () => {
  const constants = {
    executionEnvironment: 'bare',
    expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
    easConfig: null,
  };
  return {
    __esModule: true,
    default: constants,
    ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
  };
});

// __esModule keeps `import * as Device` pointing at this exact object, so
// tests can flip isDevice and the module under test sees it.
jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

const platform = jest.requireMock('react-native').Platform as { OS: string };
const constants = jest.requireMock('expo-constants').default as {
  executionEnvironment: string;
  expoConfig: { extra?: { eas?: { projectId?: string } } } | null;
  easConfig: { projectId?: string } | null;
};
const device = jest.requireMock('expo-device') as { isDevice: boolean };
const notifications = jest.requireMock('expo-notifications') as {
  setNotificationChannelAsync: jest.Mock;
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock;
};

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  // Baseline: physical iOS device, dev/production build, project id present.
  platform.OS = 'ios';
  constants.executionEnvironment = 'bare';
  constants.expoConfig = { extra: { eas: { projectId: 'test-project-id' } } };
  constants.easConfig = null;
  device.isDevice = true;
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('getDevicePushSupport', () => {
  it('reports web as an unsupported device', () => {
    platform.OS = 'web';
    expect(getDevicePushSupport()).toBe('unsupportedDevice');
  });

  it('reports Expo Go as needing a development build', () => {
    constants.executionEnvironment = 'storeClient';
    expect(getDevicePushSupport()).toBe('needsDevelopmentBuild');
  });

  it('reports a missing EAS project id as its own setup state', () => {
    constants.expoConfig = { extra: {} };
    expect(getDevicePushSupport()).toBe('missingProjectId');
  });

  it('still allows the iOS Simulator to attempt registration (isDevice must not gate iOS)', () => {
    device.isDevice = false;
    expect(getDevicePushSupport()).toBe('supported');
  });

  it('keeps the Android emulator unsupported', () => {
    platform.OS = 'android';
    device.isDevice = false;
    expect(getDevicePushSupport()).toBe('unsupportedDevice');
  });
});

describe('obtainExpoPushToken', () => {
  it('short-circuits on unsupported platforms without touching permission APIs', async () => {
    platform.OS = 'web';
    await expect(obtainExpoPushToken()).resolves.toEqual({ status: 'unsupportedDevice' });
    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('maps a denied permission to permissionDenied and never asks for a token', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ granted: false });
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(obtainExpoPushToken()).resolves.toEqual({ status: 'permissionDenied' });
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('returns the token and platform when permission is granted', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
    notifications.getExpoPushTokenAsync.mockResolvedValue({
      data: 'ExponentPushToken[test-token]',
    });
    await expect(obtainExpoPushToken()).resolves.toEqual({
      status: 'obtained',
      token: 'ExponentPushToken[test-token]',
      platform: 'ios',
    });
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'test-project-id',
    });
    // Permission was already granted, so no prompt was triggered.
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('maps a token fetch failure to the retryable tokenFailed state', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
    notifications.getExpoPushTokenAsync.mockRejectedValue(new Error('simulator flake'));
    await expect(obtainExpoPushToken()).resolves.toEqual({ status: 'tokenFailed' });
  });

  it('treats an empty token response as a failure, not a success', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
    notifications.getExpoPushTokenAsync.mockResolvedValue({ data: '' });
    await expect(obtainExpoPushToken()).resolves.toEqual({ status: 'tokenFailed' });
  });
});

describe('getExistingExpoPushToken', () => {
  it('never requests permission during lifecycle hydration', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(getExistingExpoPushToken()).resolves.toEqual({
      status: 'permissionDenied',
    });
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('returns the current token when permission is already granted', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
    notifications.getExpoPushTokenAsync.mockResolvedValue({
      data: 'ExponentPushToken[existing-test-token]',
    });
    await expect(getExistingExpoPushToken()).resolves.toEqual({
      status: 'obtained',
      token: 'ExponentPushToken[existing-test-token]',
      platform: 'ios',
    });
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
