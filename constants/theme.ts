/**
 * Shift Shepherd design tokens.
 *
 * Direction: calm, clean, friendly, trustworthy — designed for older and
 * less technical users. Blue for primary actions, purple as a secondary
 * accent, red only for destructive actions and warnings.
 */

export const colors = {
  // Brand
  primary: '#2F5FC4',
  primaryDark: '#24499A',
  primarySoft: '#EAF0FB',
  accent: '#6D5BC7',
  accentSoft: '#F0EDFA',
  danger: '#C0392B',
  dangerSoft: '#FAECEA',

  // Semantic status (availability etc.)
  success: '#2E7D52',
  successSoft: '#E9F4EE',
  warning: '#9A6B15',
  warningSoft: '#FAF3E3',

  // Neutrals
  background: '#F5F6FA',
  card: '#FFFFFF',
  text: '#1D2433',
  textSecondary: '#535C6E',
  textMuted: '#7A8294',
  border: '#E4E7EE',
  borderStrong: '#CDD3DE',
  overlay: 'rgba(29, 36, 51, 0.45)',
  white: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  pill: 999,
};

/** Large, readable typography for mixed-confidence users. */
export const type = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  subheading: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 17, lineHeight: 24, fontWeight: '400' as const },
  bodyBold: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
  small: { fontSize: 14, lineHeight: 19, fontWeight: '400' as const },
};

/** Minimum comfortable touch target. */
export const touchTarget = 52;

export const shadow = {
  card: {
    shadowColor: '#1D2433',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};

/** Colours for event category badges (calm blue/purple family). */
export const categoryColors: Record<string, { bg: string; fg: string }> = {
  'Service': { bg: '#EAF0FB', fg: '#2F5FC4' },
  'Rehearsal': { bg: '#F0EDFA', fg: '#6D5BC7' },
  'Prayer Meeting': { bg: '#E9F4EE', fg: '#2E7D52' },
  'Bible Study': { bg: '#FAF3E3', fg: '#9A6B15' },
  'Team Meeting': { bg: '#EAF0FB', fg: '#24499A' },
  'Youth Event': { bg: '#F0EDFA', fg: '#8A4FB0' },
  "Children's Ministry": { bg: '#FAF3E3', fg: '#B05D2A' },
  'Outreach': { bg: '#E9F4EE', fg: '#1F6B5C' },
  'Special Event': { bg: '#F0EDFA', fg: '#6D5BC7' },
  'Conference': { bg: '#EAF0FB', fg: '#2F5FC4' },
  'Social Event': { bg: '#E9F4EE', fg: '#2E7D52' },
  'Other': { bg: '#EEF0F5', fg: '#535C6E' },
};
