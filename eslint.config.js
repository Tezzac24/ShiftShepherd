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
  {
    // eslint-plugin-react-hooks v7 (via eslint-config-expo for SDK 57) adds
    // React Compiler rules. The app does not enable the compiler, and these
    // rules flag long-standing patterns (latest-value refs, effect-driven
    // state) in auth/chat/push code; keep them visible as warnings until that
    // code is migrated deliberately. The other compiler rules stay errors.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
]);
