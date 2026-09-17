import { uuid } from 'expo-modules-core';

/** Simple unique id generator for locally created mock records. */
let counter = 0;

export function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export const REQUEST_ID_UNAVAILABLE_ERROR =
  "We couldn't prepare this request on your device. Please update the app and try again.";

/**
 * One random UUID (v4) for a logical server request. Web and Node runtimes
 * provide `crypto.randomUUID`; native Expo runtimes provide the same
 * generator through expo-modules-core. Nothing here is persisted or logged.
 */
export function newRequestId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  try {
    return uuid.v4();
  } catch {
    throw new Error(REQUEST_ID_UNAVAILABLE_ERROR);
  }
}
