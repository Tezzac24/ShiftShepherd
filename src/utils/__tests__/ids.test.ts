import { uuid } from 'expo-modules-core';

import { makeId, newRequestId, REQUEST_ID_UNAVAILABLE_ERROR } from '../ids';

jest.mock('expo-modules-core', () => ({ uuid: { v4: jest.fn() } }));

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NATIVE_ID = 'a2f7c8d0-3b4e-4f5a-9b6c-7d8e9f0a1b2c';
const mockNativeV4 = uuid.v4 as jest.Mock;

describe('newRequestId', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
    jest.clearAllMocks();
  });

  it('uses the platform randomUUID when the runtime provides it', () => {
    const first = newRequestId();
    const second = newRequestId();
    expect(first).toMatch(UUID_V4);
    expect(second).toMatch(UUID_V4);
    expect(first).not.toBe(second);
    expect(mockNativeV4).not.toHaveBeenCalled();
  });

  it('falls back to the Expo native generator when randomUUID is missing', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: jest.fn() },
      configurable: true,
    });
    mockNativeV4.mockReturnValue(NATIVE_ID);
    expect(newRequestId()).toBe(NATIVE_ID);
    expect(mockNativeV4).toHaveBeenCalledTimes(1);
  });

  it('fails with friendly copy when no generator is available', () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    mockNativeV4.mockImplementation(() => {
      throw new Error("Native UUID version 4 generator implementation wasn't found");
    });
    expect(() => newRequestId()).toThrow(REQUEST_ID_UNAVAILABLE_ERROR);
  });
});

describe('makeId', () => {
  it('produces prefixed unique local ids', () => {
    expect(makeId('team')).not.toBe(makeId('team'));
    expect(makeId('team')).toMatch(/^team-/);
  });
});
