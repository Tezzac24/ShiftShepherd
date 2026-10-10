/**
 * Shift Shepherd design tokens.
 *
 * Mobile design authority: docs/mobile-redesign/design-brief.md.
 * Deep teal, warm neutrals and readable green ink. Existing names remain
 * compatible while screens progressively adopt the shared foundation.
 */

export const colors = {
  // Brand
  primary: '#155C52',
  primaryDark: '#10483F',
  primarySoft: '#E5F0EB',
  onPrimary: '#FFFFFF',
  accent: '#825238',
  accentSoft: '#F5EDE5',
  danger: '#AF2935',
  dangerSoft: '#FFF0F0',

  // Semantic status (availability etc.)
  success: '#216347',
  successSoft: '#E7F3EB',
  warning: '#815510',
  warningSoft: '#FFF3DA',

  // Neutrals
  background: '#F7F8F5',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  surfaceRaised: '#EDF2EE',
  text: '#182F2A',
  textSecondary: '#465D55',
  textMuted: '#596B63',
  border: '#DCE4DD',
  borderStrong: '#789082',
  overlay: 'rgba(24, 47, 42, 0.45)',
  white: '#FFFFFF',
};

export type ThemeColors = typeof colors;

/** Night-time surfaces with readable teal actions and semantic status colours. */
export const darkColors: ThemeColors = {
  primary: '#8CD5C4', primaryDark: '#B0E9DC', primarySoft: '#1B3932', onPrimary: '#102F27',
  accent: '#E0B99E', accentSoft: '#392A23',
  danger: '#FFABB1', dangerSoft: '#442328',
  success: '#9CD8B3', successSoft: '#20382A',
  warning: '#EAC579', warningSoft: '#3C311F',
  background: '#101613', surface: '#1C2420', card: '#1C2420', surfaceRaised: '#29332D',
  text: '#EEF4EF', textSecondary: '#C3CEC6', textMuted: '#ACBBB0',
  border: '#3B4940', borderStrong: '#82988A', overlay: 'rgba(0, 0, 0, 0.65)', white: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  gutter: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
};

/** Large, readable typography for mixed-confidence users. */
export const type = {
  display: { fontSize: 32, lineHeight: 39, fontWeight: '700' as const },
  title: { fontSize: 28, lineHeight: 35, fontWeight: '700' as const },
  heading: { fontSize: 22, lineHeight: 29, fontWeight: '700' as const },
  subheading: { fontSize: 19, lineHeight: 26, fontWeight: '600' as const },
  body: { fontSize: 17, lineHeight: 26, fontWeight: '400' as const },
  bodyBold: { fontSize: 17, lineHeight: 26, fontWeight: '600' as const },
  bodyEmphasis: { fontSize: 17, lineHeight: 26, fontWeight: '600' as const },
  label: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  small: { fontSize: 14, lineHeight: 21, fontWeight: '400' as const },
  caption: { fontSize: 14, lineHeight: 21, fontWeight: '400' as const },
  secondary: { fontSize: 14, lineHeight: 21, fontWeight: '400' as const },
  navigation: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
};

/** Minimum comfortable touch target. */
export const touchTarget = 52;
/** Seven columns must fit a phone; date grids are the only 44-point exception. */
export const calendarTouchTarget = 44;

export const shadow = {
  card: {
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};

/** All category labels use the same contrast-checked semantic palette. */
export const categoryColors: Record<string, { bg: string; fg: string }> = {
  'Service': { bg: colors.primarySoft, fg: colors.primary },
  'Rehearsal': { bg: colors.accentSoft, fg: colors.accent },
  'Prayer Meeting': { bg: colors.successSoft, fg: colors.success },
  'Bible Study': { bg: colors.warningSoft, fg: colors.warning },
  'Team Meeting': { bg: colors.primarySoft, fg: colors.primaryDark },
  'Youth Event': { bg: colors.accentSoft, fg: colors.accent },
  "Children's Ministry": { bg: colors.warningSoft, fg: colors.warning },
  'Outreach': { bg: colors.successSoft, fg: colors.success },
  'Special Event': { bg: colors.accentSoft, fg: colors.accent },
  'Conference': { bg: colors.primarySoft, fg: colors.primary },
  'Social Event': { bg: colors.successSoft, fg: colors.success },
  'Other': { bg: colors.surfaceRaised, fg: colors.textSecondary },
};

/** White initials meet text contrast on every fallback colour. */
export const avatarColors = [
  colors.primary, colors.accent, colors.success,
  colors.primaryDark, colors.warning, colors.textSecondary,
];
