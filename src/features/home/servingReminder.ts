import { ServingSummary } from '../../lib/appData/presentation';
import { parseDateKey, toDateKey } from '../../utils/dates';

const HOUR_MS = 60 * 60 * 1000;
type Serving = Pick<ServingSummary, 'entry' | 'status'>;

/** Rota dates/times use the same local calendar semantics as their display.
 * A date without a time stays actionable throughout that day. */
export function servingResponseWindow(serving: Serving) {
  if (serving.status !== 'not_responded' || serving.entry.status !== 'active') return null;
  const start = parseDateKey(serving.entry.date);
  if (!Number.isFinite(start.getTime()) || toDateKey(start) !== serving.entry.date) return null;
  const time = serving.entry.time;
  const hasTime = time !== null;
  if (time !== null) {
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    start.setHours(Number(match[1]), Number(match[2]), 0, 0);
  }
  const end = new Date(start);
  if (!hasTime) end.setDate(end.getDate() + 1);
  return { warningAt: start.getTime() - 48 * HOUR_MS, startsAt: start.getTime(),
    expiresAt: end.getTime(), hasTime };
}

export function servingResponseReminder(serving: Serving, now: Date): string | null {
  const window = servingResponseWindow(serving);
  const current = now.getTime();
  if (!window || current < window.warningAt || current >= window.expiresAt) return null;
  if (!window.hasTime) return toDateKey(now) === serving.entry.date
    ? 'Response needed · You’re serving today' : 'Response needed · Your serving date is approaching';
  const hours = Math.ceil((window.startsAt - current) / HOUR_MS);
  if (window.startsAt - current < HOUR_MS) return 'Response needed · Starts in less than an hour';
  return `Response needed · Starts in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}
