/**
 * Runs a callback whenever the app returns to the foreground
 * (background/inactive → active). Used for "catch up on what changed while
 * the app was away" refetches; on web this follows document visibility.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export function useOnAppForeground(onForeground: () => void): void {
  // Ref so the listener always calls the latest callback without
  // resubscribing on every render.
  const callbackRef = useRef(onForeground);
  callbackRef.current = onForeground;

  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && previous !== 'active') callbackRef.current();
      previous = next;
    });
    return () => subscription.remove();
  }, []);
}
