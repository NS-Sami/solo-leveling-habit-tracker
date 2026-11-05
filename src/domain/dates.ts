/**
 * Date helpers. All dates in the app are `YYYY-MM-DD` strings in the hunter's
 * chosen timezone (default Asia/Dhaka). Using UTC (`toISOString`) would put
 * late-night check-ins on the wrong day for anyone in Dhaka (UTC+6).
 */
import type { DateKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a key as a LOCAL date at noon (noon avoids DST edge cases). */
export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/* ---- Explicit user timezone ------------------------------------------------
 * "Today" is decided by the hunter's chosen timezone, not by whichever device
 * they happen to be holding, so a phone and a laptop always agree on the day.
 */
export const DEFAULT_TIMEZONE = 'Asia/Dhaka';

let activeTimezone = DEFAULT_TIMEZONE;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function setActiveTimezone(tz: string | undefined | null) {
  activeTimezone = tz && isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
}

export function getActiveTimezone(): string {
  return activeTimezone;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function zonedParts(now: Date, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatters.set(tz, f);
  }
  const get = (type: string) => f!.formatToParts(now).find((p) => p.type === type)?.value ?? '00';
  return { year: get('year'), month: get('month'), day: get('day'), hour: Number(get('hour')), minute: Number(get('minute')) };
}

export function todayKey(now: Date = new Date(), tz: string = activeTimezone): DateKey {
  const p = zonedParts(now, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Current hour (0-23) in the given timezone. */
export function hourInZone(now: Date = new Date(), tz: string = activeTimezone): number {
  return zonedParts(now, tz).hour;
}

/** Minutes left until midnight in the given timezone. */
export function minutesUntilMidnight(now: Date = new Date(), tz: string = activeTimezone): number {
  const p = zonedParts(now, tz);
  return 24 * 60 - (p.hour * 60 + p.minute);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: DateKey, b: DateKey): number {
  const ms = fromKey(b).getTime() - fromKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(key: DateKey): number {
  return fromKey(key).getDay();
}

export function isValidKey(key: string): key is DateKey {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return toKey(fromKey(key)) === key;
}

/** Most recent Sunday on/before the given date. */
export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, -weekday(key));
}

export function rangeKeys(start: DateKey, count: number): DateKey[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function prettyDate(key: DateKey): string {
  const d = fromKey(key);
  return `${WEEKDAY_SHORT[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
