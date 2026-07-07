/**
 * Date helpers. Mock data generates dates relative to "today" so the app
 * always has upcoming events/rotas no matter when it is demoed.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Next occurrence of a weekday (0=Sun..6=Sat), at least `weeksAhead` weeks out. Always in the future. */
export function nextWeekday(weekday: number, weeksAhead = 0): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let diff = (weekday - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7; // always strictly in the future
  d.setDate(d.getDate() + diff + weeksAhead * 7);
  return d;
}

export function daysAgo(days: number, hour = 9, minute = 0): Date {
  const d = new Date(Date.now() - days * DAY_MS);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function at(date: Date, hour: number, minute = 0): Date {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function iso(date: Date): string {
  return date.toISOString();
}

/** YYYY-MM-DD in local time. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Sunday 12 July" */
export function formatFullDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** "Sun 12 Jul" */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "10:00" -> "10:00 AM"-style locale time from an ISO datetime */
export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Formats a "HH:MM" rota time string for display. */
export function formatClockTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Friendly relative label for feeds: "Today", "Yesterday", "3 days ago", else short date. */
export function formatRelative(isoString: string): string {
  const then = new Date(isoString);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const diffDays = Math.round((startToday.getTime() - startThen.getTime()) / DAY_MS);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatShortDate(then);
}

/** Friendly label for upcoming dates: "Today", "Tomorrow", else "Sunday 12 July". */
export function formatUpcoming(date: Date): string {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThen = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startThen.getTime() - startToday.getTime()) / DAY_MS);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return formatFullDate(date);
}

export function isWithinNextDays(date: Date, days: number): boolean {
  const now = new Date();
  const limit = new Date(now.getTime() + days * DAY_MS);
  return date >= now && date <= limit;
}

/** "Good morning" / "Good afternoon" / "Good evening" */
export function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
