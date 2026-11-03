/**
 * Daily completion math.
 *
 * Key rule (fixes the #1 complaint about Habitica): a quest only counts toward a
 * day's denominator if it is SCHEDULED that day — "training day only" quests
 * don't drag down rest days.
 */
import type { Completion, DateKey, DayMeta, Quest } from './types';
import { weekday } from './dates';

export const completionId = (questId: string, date: DateKey) => `${questId}|${date}`;

export type CompletionIndex = Set<string>;

export function indexCompletions(completions: Completion[]): CompletionIndex {
  return new Set(completions.map((c) => c.id));
}

/** Is this quest active (exists, not archived) on this date? */
export function isActiveOn(q: Quest, date: DateKey): boolean {
  if (date < q.createdAt) return false;
  if (q.archivedAt && date >= q.archivedAt) return false;
  return true;
}

/** Is this quest scheduled (active + correct weekday) on this date? */
export function isScheduled(q: Quest, date: DateKey): boolean {
  return isActiveOn(q, date) && q.scheduleDays.includes(weekday(date));
}

export interface DayStats {
  date: DateKey;
  scheduled: number;
  done: number;
  /** done / scheduled, 0..1. 0 when nothing scheduled. */
  ratio: number;
  restDay: boolean;
}

export function dayStats(
  date: DateKey,
  quests: Quest[],
  idx: CompletionIndex,
  meta?: Map<DateKey, DayMeta>,
): DayStats {
  let scheduled = 0;
  let done = 0;
  for (const q of quests) {
    if (!isScheduled(q, date)) continue;
    scheduled++;
    if (idx.has(completionId(q.id, date))) done++;
  }
  return {
    date,
    scheduled,
    done,
    ratio: scheduled ? done / scheduled : 0,
    restDay: meta?.get(date)?.restDay ?? false,
  };
}

/** Aggregate ratio across several days (sum of done / sum of scheduled). */
export function aggregateRatio(days: DayStats[]): number {
  const s = days.reduce((a, d) => a + d.scheduled, 0);
  const d = days.reduce((a, x) => a + x.done, 0);
  return s ? d / s : 0;
}
