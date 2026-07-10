// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions is Deno code (Deno globals, npm: specifiers) —
    // checked by Deno tooling, not the app's ESLint/tsc.
    ignores: ['dist/*', 'supabase/functions/*'],
  },
]);
