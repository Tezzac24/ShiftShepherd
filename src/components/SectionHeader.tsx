import React from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../constants/theme';
import { AppText, HeadingLevel } from './AppText';
import { Button } from './Button';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  headingLevel?: HeadingLevel;
}

export function SectionHeader({ title, actionLabel, onAction, headingLevel = 2 }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <AppText variant="subheading" headingLevel={headingLevel} style={styles.title}>{title}</AppText>
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="ghost" onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    columnGap: spacing.md, rowGap: spacing.xs, marginTop: spacing.sm,
  },
  title: { flexGrow: 1, flexShrink: 1, flexBasis: 160 },
  action: { maxWidth: '100%', paddingHorizontal: spacing.sm },
});
