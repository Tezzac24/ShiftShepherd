import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, type ThemeColors } from '../../constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/lib/theme/AppearanceContext';
import { AppText } from './AppText';

interface CollectionGuideProps {
  title: string;
  items: readonly { icon: keyof typeof Ionicons.glyphMap; title: string; description: string }[];
}

/** Quiet, useful context after a short collection; never a substitute for its empty/error state. */
export function CollectionGuide({ title, items }: CollectionGuideProps) {
  const colors = useThemeColors();
  const styles = useThemedStyles(createStyles);
  return <View style={styles.panel}>
    <AppText variant="subheading" headingLevel={2}>{title}</AppText>
    {items.map((item) => <View key={item.title} style={styles.item}>
      <View style={styles.icon} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        <Ionicons name={item.icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.copy}>
        <AppText variant="bodyBold">{item.title}</AppText>
        <AppText tone="secondary">{item.description}</AppText>
      </View>
    </View>)}
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  panel: { marginTop: spacing.xl, padding: spacing.lg, gap: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { paddingTop: spacing.xs },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
});
