/**
 * Streak = consecutive days whose completion ratio >= threshold (default 50%).
 *
 * Forgiveness rules (research: streak anxiety is the top reason people quit):
 *  - TODAY never breaks the streak while it is still in progress. It only adds once it qualifies.
 *  - REST DAYS (and days with nothing scheduled) are skipped: they neither break nor extend.
 */
import type { DateKey } from './types';
import { addDays } from './dates';
import type { DayStats } from './completion';

export type DayStatsFn = (date: DateKey) => DayStats;

const MAX_LOOKBACK = 3650;

export function currentStreak(today: DateKey, getDay: DayStatsFn, threshold: number, earliest: DateKey): number {
  let streak = 0;
  const t = getDay(today);
  if (!t.restDay && t.scheduled > 0 && t.ratio >= threshold) streak++;

  let cursor = addDays(today, -1);
  for (let i = 0; i < MAX_LOOKBACK && cursor >= earliest; i++) {
    const d = getDay(cursor);
    if (d.restDay || d.scheduled === 0) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (d.ratio >= threshold) streak++;
    else break;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function bestStreak(from: DateKey, to: DateKey, getDay: DayStatsFn, threshold: number): number {
  let best = 0;
  let run = 0;
  let cursor = from;
  for (let i = 0; i < MAX_LOOKBACK && cursor <= to; i++) {
    const d = getDay(cursor);
    if (d.restDay || d.scheduled === 0) {
      // skip
    } else if (d.ratio >= threshold) {
      run++;
      best = Math.max(best, run);
    } else if (cursor !== to) {
      // today (cursor === to) in progress doesn't break the run
      run = 0;
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}
