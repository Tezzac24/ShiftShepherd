import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors as lightColors, darkColors, radius, spacing, touchTarget, type ThemeColors } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { ListGroupContext } from '../../components/ListGroup';
import { SwitchRow } from '../../components/ListRow';
import { Screen } from '../../components/Screen';
import { useAppearance, useThemedStyles, type DisplayScheme } from '../../lib/theme/AppearanceContext';

/** A small sample of the app's own surfaces, rather than an external brand. */
function AppearancePreview({ scheme }: { scheme: DisplayScheme }) {
  const colors = scheme === 'dark' ? darkColors : lightColors;
  return <View style={[previewStyles.phone, { backgroundColor: colors.background, borderColor: colors.borderStrong }]}
    accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
    <View style={[previewStyles.header, { backgroundColor: colors.surface }]}>
      <View style={[previewStyles.icon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
      </View>
      <View style={[previewStyles.line, { backgroundColor: colors.borderStrong }]} />
      <View style={[previewStyles.shortLine, { backgroundColor: colors.border }]} />
    </View>
    <View style={previewStyles.tiles}>
      {([colors.primarySoft, colors.warningSoft, colors.accentSoft, colors.successSoft, colors.surfaceRaised, colors.dangerSoft]).map((backgroundColor, index) =>
        <View key={index} style={[previewStyles.tile, { backgroundColor, borderColor: colors.background }]} />)}
    </View>
  </View>;
}

export default function DisplaySettingsScreen() {
  const { preference, scheme, colors, saving, hydrated, error, setPreference } = useAppearance();
  const styles = useThemedStyles(createStyles);
  const busy = saving || !hydrated;
  return <Screen contentStyle={styles.content}>
    <Stack.Screen options={{ title: 'Display', headerTitleAlign: 'center' }} />
    <AppText variant="subheading" tone="secondary" headingLevel={1}>Appearance</AppText>
    <View style={styles.panel}>
      <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel="Appearance">
        {(['light', 'dark'] as const).map((choice) => {
          const checked = scheme === choice;
          const title = choice === 'light' ? 'Light' : 'Dark';
          return <Pressable key={choice} accessibilityRole="radio" accessibilityLabel={title}
            accessibilityHint="Applies this appearance and turns off Use device settings"
            accessibilityState={{ checked, disabled: busy }} aria-checked={checked} aria-disabled={busy}
            disabled={busy} onPress={() => { if (!busy) void setPreference(choice); }}
            style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
            <AppearancePreview scheme={choice} />
            <AppText variant="subheading" style={styles.choiceLabel}>{title}</AppText>
            <Ionicons name={checked ? 'radio-button-on' : 'radio-button-off'} size={28}
              color={checked ? colors.primary : colors.borderStrong}
              accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden />
          </Pressable>;
        })}
      </View>
      <ListGroupContext.Provider value>
        <SwitchRow title="Use device settings" value={preference === 'system'} disabled={busy} busy={saving}
          onValueChange={(enabled) => { if (!busy) void setPreference(enabled ? 'system' : scheme); }} />
      </ListGroupContext.Provider>
      <AppText tone="secondary" style={styles.explanation}>
        Match appearance to your device’s Display &amp; Brightness settings.
      </AppText>
    </View>
    <AppText variant="small" tone="secondary">Changes save automatically on this device.</AppText>
    {error ? <AppText tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</AppText> : null}
  </Screen>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { paddingTop: spacing.xl, gap: spacing.md },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', paddingTop: spacing.lg, paddingBottom: spacing.xl },
  choices: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  choice: { flex: 1, minHeight: touchTarget, alignItems: 'center', paddingVertical: spacing.md, gap: spacing.lg, borderRadius: radius.md },
  choiceLabel: { textAlign: 'center' },
  pressed: { backgroundColor: colors.surfaceRaised },
  explanation: { paddingHorizontal: spacing.lg },
});

const previewStyles = StyleSheet.create({
  phone: { width: 76, height: 140, borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  header: { height: 78, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  icon: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  line: { width: 38, height: 3, borderRadius: radius.sm },
  shortLine: { width: 24, height: 3, borderRadius: radius.sm },
  tiles: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  tile: { width: '33.333%', height: '50%', borderWidth: 0.5 },
});
