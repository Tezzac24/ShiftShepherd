# Display preferences

Profile → Preferences → Display opens the light/dark appearance chooser and
Use device settings switch. The supplied screenshot guides the layout; app
colours, readable type and shared controls remain consistent with Shift Shepherd.

The preference is stored locally in `@shift-shepherd/display-v1`. Light is the
default for missing/invalid values. Opening the screen never writes. Manual
selection disables device matching; disabling device matching retains the
currently resolved appearance. A failed save restores the previous choice and
shows a retryable message. The provider lives outside account/church remounts,
and first-launch routing waits for preference hydration.

Existing app surfaces, text, controls, navigation, Paper and status-bar content
use the resolved scheme. Expo's `userInterfaceStyle` is now `automatic`, as
required for system appearance detection ([Expo colour themes](https://docs.expo.dev/develop/user-interface/color-themes/)).
Existing native binaries need rebuilding to adopt that configuration.

Verification on 10 October 2026:

- Typecheck, lint (warnings remain), all 1,604 tests across 104 suites,
  Android/iOS/web demo-mode export, and diff whitespace checks passed.
- New offline tests cover hydration, corrupt/missing storage, read/save failure,
  retry, save serialization, system changes, manual overrides, content remount,
  restart persistence, shared text/field/button/badge colours, Paper and the
  Profile entry in live/demo presentation.
- Zen's phone-size responsive preview was inspected in Light and Dark at
  393 × 812, with preview choices, full labels, selection states and device
  switch visible. Keyboard activation of device matching was verified.
- The user confirmed the feature works before requesting commit/push.

Native rebuild/system-change, VoiceOver, keyboard appearance and maximum native
text-size QA remain unverified. No hosted data or backend contracts changed.
