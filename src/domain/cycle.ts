/**
 * 28-day cycles (4 weeks × 7 days).
 *
 * A cycle is NOT a calendar month: it starts on `cycleAnchor` and repeats every
 * 28 days. This matches the original Google Sheet (e.g. 11 Oct → 7 Nov).
 */
import type { DateKey } from './types';
import { addDays, diffDays, rangeKeys } from './dates';

export const CYCLE_LENGTH = 28;
export const WEEK_COLORS = ['#00D2FF', '#A855F7', '#F59E0B', '#EF4444'] as const;

export interface CycleInfo {
  index: number; // 0 = the anchor cycle, negative = before anchor
  start: DateKey;
  end: DateKey;
  days: DateKey[]; // 28
  weeks: DateKey[][]; // 4 × 7
}

export function cycleIndexFor(date: DateKey, anchor: DateKey): number {
  return Math.floor(diffDays(anchor, date) / CYCLE_LENGTH);
}

export function cycleAt(index: number, anchor: DateKey): CycleInfo {
  const start = addDays(anchor, index * CYCLE_LENGTH);
  const days = rangeKeys(start, CYCLE_LENGTH);
  return {
    index,
    start,
    end: days[days.length - 1],
    days,
    weeks: [0, 1, 2, 3].map((w) => days.slice(w * 7, w * 7 + 7)),
  };
}

export function cycleFor(date: DateKey, anchor: DateKey): CycleInfo {
  return cycleAt(cycleIndexFor(date, anchor), anchor);
}

/** 1-based day number within its cycle (1..28). */
export function dayOfCycle(date: DateKey, anchor: DateKey): number {
  const d = diffDays(anchor, date) % CYCLE_LENGTH;
  return (d < 0 ? d + CYCLE_LENGTH : d) + 1;
}
