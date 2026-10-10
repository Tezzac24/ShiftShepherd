import { Platform } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

import { colors as lightColors, darkColors, radius, type } from '@/constants/theme';

const fontFamily = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' });
const paperType = (variant: keyof typeof type) => ({
  ...MD3LightTheme.fonts.bodyLarge,
  ...type[variant],
  fontFamily,
  letterSpacing: 0,
});

export function createPaperTheme(scheme: 'light' | 'dark'): MD3Theme {
  const base = scheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
  const colors = scheme === 'dark' ? darkColors : lightColors;
  return {
    ...base,
    dark: scheme === 'dark',
    roundness: radius.md,
    fonts: {
      displayLarge: paperType('display'),
      displayMedium: paperType('display'),
      displaySmall: paperType('title'),
      headlineLarge: paperType('title'),
      headlineMedium: paperType('heading'),
      headlineSmall: paperType('subheading'),
      titleLarge: paperType('heading'),
      titleMedium: paperType('subheading'),
      titleSmall: paperType('label'),
      bodyLarge: paperType('body'),
      bodyMedium: paperType('body'),
      bodySmall: paperType('small'),
      labelLarge: paperType('label'),
      labelMedium: paperType('label'),
      labelSmall: paperType('navigation'),
      default: { fontFamily, fontWeight: '400', letterSpacing: 0 },
    },
    colors: {
      ...base.colors,
      primary: colors.primary,
      primaryContainer: colors.primarySoft,
      secondary: colors.accent,
      secondaryContainer: colors.accentSoft,
      tertiary: colors.success,
      tertiaryContainer: colors.successSoft,
      surface: colors.surface,
      surfaceVariant: colors.surfaceRaised,
      surfaceDisabled: colors.surfaceRaised,
      background: colors.background,
      error: colors.danger,
      errorContainer: colors.dangerSoft,
      onPrimary: colors.onPrimary,
      onPrimaryContainer: colors.primaryDark,
      onSecondary: scheme === 'dark' ? colors.background : colors.white,
      onSecondaryContainer: colors.accent,
      onTertiary: scheme === 'dark' ? colors.background : colors.white,
      onTertiaryContainer: colors.success,
      onSurface: colors.text,
      onSurfaceVariant: colors.textSecondary,
      onSurfaceDisabled: colors.textMuted,
      onError: scheme === 'dark' ? colors.background : colors.white,
      onErrorContainer: colors.danger,
      onBackground: colors.text,
      outline: colors.borderStrong,
      outlineVariant: colors.border,
      inverseSurface: colors.text,
      inverseOnSurface: colors.background,
      inversePrimary: colors.primarySoft,
      shadow: colors.text,
      scrim: colors.text,
      backdrop: colors.overlay,
      elevation: {
        ...base.colors.elevation,
        level0: 'transparent',
        level1: colors.surface,
        level2: colors.surface,
        level3: colors.surface,
        level4: colors.surface,
        level5: colors.surface,
      },
    },
  };
}

export const paperTheme = createPaperTheme('light');
