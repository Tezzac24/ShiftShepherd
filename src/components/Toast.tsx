/**
 * Lightweight toast feedback for completed actions ("Event created.").
 *
 * A small self-dismissing banner near the bottom of the screen — calm and
 * non-blocking, so it never interrupts navigation or requires a tap. Screens
 * show successes here and keep failures as inline messages next to the
 * action, where the context is. Works on iOS, Android, AND web (no Alert).
 */
import { Ionicons } from '@expo/vector-icons';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadow, spacing } from '../../constants/theme';
import { AppText } from './AppText';

type ToastTone = 'success' | 'error';

type ShowToastFn = (message: string, tone?: ToastTone) => void;

interface ToastState {
  /** Restarts the timer/animation when the same message is shown twice. */
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<ShowToastFn | undefined>(undefined);

const SHOW_MS = 3200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  const showToast = useCallback<ShowToastFn>((message, tone = 'success') => {
    nextId.current += 1;
    setToast({ id: nextId.current, message, tone });
  }, []);

  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setToast(null);
      },
    );
  }, [opacity]);

  // Animate in and schedule auto-dismiss whenever a (new) toast appears.
  useEffect(() => {
    if (!toast) return;
    opacity.setValue(0);
    translateY.setValue(12);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
    hideTimer.current = setTimeout(dismiss, SHOW_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [toast, opacity, translateY, dismiss]);

  const tone = toast?.tone ?? 'success';

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast ? (
        // box-none: the wrapper never blocks touches on the screen below.
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              styles.holder,
              // Sits above the tab bar (and the home indicator) on every screen.
              { bottom: insets.bottom + 76 },
              { opacity, transform: [{ translateY }] },
            ]}
          >
            <Pressable
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              accessibilityLabel={toast.message}
              accessibilityHint="Dismisses this message"
              onPress={dismiss}
              style={[styles.toast, tone === 'error' ? styles.error : styles.success]}
            >
              <Ionicons
                name={tone === 'error' ? 'alert-circle' : 'checkmark-circle'}
                size={22}
                color={tone === 'error' ? colors.danger : colors.success}
              />
              <AppText
                variant="bodyBold"
                style={{ color: tone === 'error' ? colors.danger : colors.success, flexShrink: 1 }}
              >
                {toast.message}
              </AppText>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  holder: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    maxWidth: 480,
    ...shadow.card,
  },
  success: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  error: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
});
