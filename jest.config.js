// Jest runs the automated regression suite (unit tests over pure helpers,
// services, and hooks). jest-expo supplies the Babel transform and React
// Native environment for Expo SDK 57. Tests are deterministic: no network,
// no real Supabase credentials, no device APIs (see jest.setup.ts).
module.exports = {
  preset: 'jest-expo',
  // App tests live in src/**/__tests__. supabase/functions is Deno code and
  // must never be picked up by the app's Jest run; keeping roots to src (and
  // the standard ignore patterns) guarantees that.
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.@(ts|tsx)'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.expo/', '/coverage/'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // Mirrors the "@/*" path alias in tsconfig.json.
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Every test gets fresh mocks — no cross-test call-count leakage.
  clearMocks: true,
};
