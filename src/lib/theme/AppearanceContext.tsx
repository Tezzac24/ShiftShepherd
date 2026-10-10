import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';

import { colors, darkColors, type ThemeColors } from '../../../constants/theme';

export type DisplayPreference = 'light' | 'dark' | 'system';
export type DisplayScheme = 'light' | 'dark';
export const DISPLAY_STORAGE_KEY = '@shift-shepherd/display-v1';

export function parseDisplayPreference(value: string | null): DisplayPreference {
  return value === 'dark' || value === 'system' ? value : 'light';
}

export function resolveDisplayScheme(preference: DisplayPreference, deviceScheme: string | null | undefined): DisplayScheme {
  return preference === 'system' ? deviceScheme === 'dark' ? 'dark' : 'light' : preference;
}

interface AppearanceValue {
  preference: DisplayPreference;
  scheme: DisplayScheme;
  colors: ThemeColors;
  hydrated: boolean;
  saving: boolean;
  error: string | null;
  setPreference: (preference: DisplayPreference) => Promise<void>;
}

// Stand-alone components/tests retain the established light palette.
const AppearanceContext = createContext<AppearanceValue>({
  preference: 'light', scheme: 'light', colors, hydrated: true, saving: false, error: null,
  setPreference: async () => {},
});

/** Device-local presentation survives sign-out and organisation-provider remounts. */
export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const deviceScheme = useColorScheme();
  const [preference, setStoredPreference] = useState<DisplayPreference>('light');
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(DISPLAY_STORAGE_KEY).then((value) => {
      if (active) setStoredPreference(parseDisplayPreference(value));
    }).catch(() => {
      if (active) setError('Couldn’t load your display preference. Choose an appearance to save it again.');
    }).finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, []);

  const setPreference = useCallback(async (next: DisplayPreference) => {
    if (!hydrated || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    const previous = preference;
    setStoredPreference(next);
    try {
      await AsyncStorage.setItem(DISPLAY_STORAGE_KEY, next);
    } catch {
      setStoredPreference(previous);
      setError('Couldn’t save your display preference. Your previous appearance has been restored. Please try again.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }, [hydrated, preference]);

  const scheme = resolveDisplayScheme(preference, deviceScheme);
  const value = useMemo(() => ({ preference, scheme, colors: scheme === 'dark' ? darkColors : colors,
    hydrated, saving, error, setPreference }), [preference, scheme, hydrated, saving, error, setPreference]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() { return useContext(AppearanceContext); }
export function useThemeColors() { return useAppearance().colors; }

/** Cache each palette's styles/maps once while subscribing to appearance changes. */
const themedValues = new WeakMap<(colors: ThemeColors) => unknown, WeakMap<ThemeColors, unknown>>();
export function useThemedStyles<T>(create: (colors: ThemeColors) => T): T {
  const palette = useThemeColors();
  let cache = themedValues.get(create);
  if (!cache) { cache = new WeakMap(); themedValues.set(create, cache); }
  if (!cache.has(palette)) cache.set(palette, create(palette));
  return cache.get(palette) as T;
}
