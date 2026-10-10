import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, touchTarget } from '../../../constants/theme';
import { AppText } from '../../components/AppText';
import { useThemeColors } from '../../lib/theme/AppearanceContext';

/** Optional fields reveal inline and keep their draft when collapsed. */
export function AnnouncementOptions({ summary, disabled, children }: {
  summary: string; disabled: boolean; children: React.ReactNode;
}) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [retained, setRetained] = useState(false);
  const [height, setHeight] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [progress] = useState(() => new Animated.Value(0));
  const measured = height > 0;

  useEffect(() => {
    let active = true;
    let changed = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active && !changed) setReducedMotion(enabled);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      changed = true;
      setReducedMotion(enabled);
    });
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    // Wait for the fields' natural height before starting the first reveal.
    if (open && !measured) return;
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: reducedMotion ? 0 : open ? 220 : 180,
      easing: open ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !open) setRetained(false);
    });
    return () => animation.stop();
    // Remeasuring fields must not restart an in-flight close on every frame.
  }, [open, measured, progress, reducedMotion]);

  return <View>
    <Pressable disabled={disabled} onPress={() => { setRetained(true); setOpen((value) => !value); }}
      accessibilityRole="button" accessibilityLabel={`More options. ${summary}`}
      accessibilityState={{ expanded: open, disabled }} aria-expanded={open} aria-disabled={disabled}
      style={({ pressed }) => [styles.trigger, pressed && { backgroundColor: colors.primarySoft }, disabled && styles.disabled]}>
      <View style={styles.label}>
        <AppText tone="secondary">More options</AppText>
        {summary ? <AppText variant="small" tone="secondary">{summary}</AppText> : null}
      </View>
      <Animated.View style={{ transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} accessible={false} />
      </Animated.View>
    </Pressable>
    {open || retained ? <Animated.View testID="announcement-options-panel"
      pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} aria-hidden={!open}
      style={[styles.clip, { height: Animated.multiply(progress, height) }]}>
      <Animated.View onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        style={[styles.content, { opacity: reducedMotion ? 1 : progress,
          transform: [{ translateY: reducedMotion ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [-spacing.md, 0] }) }] }]}>
        {children}
      </Animated.View>
    </Animated.View> : null}
  </View>;
}

const styles = StyleSheet.create({
  trigger: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, borderRadius: radius.sm },
  label: { flex: 1, gap: spacing.xs },
  disabled: { opacity: 0.5 },
  clip: { overflow: 'hidden' },
  // Measure the natural content, independently of the animated clipping height.
  content: { position: 'absolute', top: 0, left: 0, right: 0, gap: spacing.md, paddingTop: spacing.md },
});
