import React from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../constants/theme';
import { AppText } from './AppText';

interface PageHeadingProps {
  title?: string;
  eyebrow?: string;
  description?: string;
  /** One primary/context action; wraps below the title on a narrow screen. */
  action?: React.ReactNode;
  /** Center the action when the heading title is omitted. */
  centerAction?: boolean;
}

export function PageHeading({ title, eyebrow, description, action, centerAction = false }: PageHeadingProps) {
  return (
    <View style={styles.wrap}>
      {eyebrow ? <AppText variant="label" tone="primary">{eyebrow}</AppText> : null}
      <View style={[styles.row, !title && centerAction && styles.centeredRow]}>
        {title ? <AppText variant="title" headingLevel={1} style={styles.title}>{title}</AppText> : null}
        {action ? <View style={[styles.action, !title && centerAction && styles.centeredAction]}>{action}</View> : null}
      </View>
      {description ? <AppText tone="secondary">{description}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  centeredRow: { justifyContent: 'center' },
  title: { flexGrow: 1, flexShrink: 1, flexBasis: 180 },
  action: { maxWidth: '100%' },
  centeredAction: { alignItems: 'center' },
});
