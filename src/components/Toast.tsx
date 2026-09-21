/**
 * Non-blocking feedback for completed actions. Errors that need recovery still
 * belong with their form/action. No motion; every message has a labelled exit.
 */
import { Ionicons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadow, spacing } from '../../constants/theme';
import { AppText } from './AppText';
import { Button } from './Button';

type ToastTone = 'success' | 'error';
type ShowToastFn = (message: string, tone?: ToastTone) => void;
interface ToastState { id: number; message: string; tone: ToastTone }

const ToastContext = createContext<ShowToastFn | undefined>(undefined);
const SHOW_MS = 5000;
const STACK_HEADER_CLEARANCE = 56;
const ROOT_ROUTES_WITHOUT_HEADER = new Set(['(tabs)', 'index', 'login']);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);
  const showToast = useCallback<ShowToastFn>((message, tone = 'success') => {
    nextId.current += 1;
    setToast({ id: nextId.current, message, tone });
  }, []);
  const dismiss = useCallback((id: number) => {
    setToast((current) => current?.id === id ? null : current);
  }, []);

  useEffect(() => {
    if (!toast) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const duration = Math.max(SHOW_MS, Math.min(toast.message.length * 65, 12000));
    const schedule = (milliseconds: number) => {
      if (!cancelled) timer = setTimeout(() => dismiss(toast.id), milliseconds);
    };
    if (Platform.OS === 'android') {
      AccessibilityInfo.getRecommendedTimeoutMillis(duration).then(schedule, () => schedule(duration));
    } else {
      schedule(duration);
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(toast.message);
    }
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [toast, dismiss]);

  const tone = toast?.tone ?? 'success';
  const rootSegment = segments[0];
  const hasVisibleStackHeader = !!rootSegment && !ROOT_ROUTES_WITHOUT_HEADER.has(rootSegment);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View pointerEvents="box-none" style={[
            styles.holder,
            { top: insets.top + spacing.md + (hasVisibleStackHeader ? STACK_HEADER_CLEARANCE : 0) },
          ]}>
            <View style={[styles.toast, tone === 'error' ? styles.error : styles.success]}>
              <View style={styles.message}>
                <Ionicons
                  name={tone === 'error' ? 'alert-circle' : 'checkmark-circle'}
                  size={24} color={tone === 'error' ? colors.danger : colors.success} accessible={false}
                />
                <AppText
                  variant="bodyBold"
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={[styles.text, { color: tone === 'error' ? colors.danger : colors.success }]}
                >
                  {toast.message}
                </AppText>
              </View>
              <Button title="Dismiss" variant="ghost" onPress={() => dismiss(toast.id)} />
            </View>
          </View>
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
  holder: { position: 'absolute', left: spacing.gutter, right: spacing.gutter, alignItems: 'center' },
  toast: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    columnGap: spacing.sm, rowGap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, maxWidth: 480, width: '100%', ...shadow.card,
  },
  message: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexGrow: 1, flexBasis: 180 },
  text: { flex: 1 },
  success: { backgroundColor: colors.successSoft, borderColor: colors.success },
  error: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
});
