import React from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../../constants/theme';
import { AppText } from './AppText';

interface PageHeadingProps {
  title: string;
  eyebrow?: string;
  description?: string;
  /** One primary/context action; wraps below the title on a narrow screen. */
  action?: React.ReactNode;
}

export function PageHeading({ title, eyebrow, description, action }: PageHeadingProps) {
  return (
    <View style={styles.wrap}>
      {eyebrow ? <AppText variant="label" tone="primary">{eyebrow}</AppText> : null}
      <View style={styles.row}>
        <AppText variant="title" headingLevel={1} style={styles.title}>{title}</AppText>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
      {description ? <AppText tone="secondary">{description}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  title: { flexGrow: 1, flexShrink: 1, flexBasis: 180 },
  action: { maxWidth: '100%' },
});
