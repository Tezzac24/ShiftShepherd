import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Refresh current-time presentation at local hour/day boundaries and when the
 * app returns. This clock never changes data or a person's chosen form date. */
export function useCurrentTime(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let active = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
    const refresh = () => {
      clear();
      const current = new Date();
      setNow(current);
      if (active) {
        const nextHour = new Date(current);
        nextHour.setHours(current.getHours() + 1, 0, 0, 0);
        timer = setTimeout(refresh, Math.max(1, nextHour.getTime() - current.getTime()));
      }
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      active = state === 'active';
      if (active) refresh(); else clear();
    });
    return () => { clear(); subscription.remove(); };
  }, []);

  return now;
}
