/**
 * Aggregations for the HUD, radar chart, EXP history and leaderboard.
 * All pure functions over persisted facts.
 */
import type { Category, Completion, DateKey, Quest, Stat } from './types';
import { addDays } from './dates';
import { completionId, isScheduled, type CompletionIndex } from './completion';

export const STATS: { id: Stat; label: string; long: string; color: string }[] = [
  { id: 'STR', label: 'STR', long: 'Strength', color: '#00D2FF' },
  { id: 'AGI', label: 'AGI', long: 'Agility', color: '#22D3EE' },
  { id: 'INT', label: 'INT', long: 'Intelligence', color: '#A855F7' },
  { id: 'VIT', label: 'VIT', long: 'Vitality', color: '#F59E0B' },
  { id: 'SEN', label: 'SEN', long: 'Sense / Willpower', color: '#EF4444' },
];

/** Default stat mapping for a category (Physical defaults to STR; cardio-type quests use AGI). */
export const CATEGORY_DEFAULT_STAT: Record<Category, Stat> = {
  Physical: 'STR',
  Intellectual: 'INT',
  Health: 'VIT',
  Spiritual: 'SEN',
  Routine: 'SEN',
};

export const CATEGORIES: Category[] = ['Physical', 'Spiritual', 'Intellectual', 'Health', 'Routine'];

export function totalExp(completions: Completion[]): number {
  return completions.reduce((a, c) => a + c.expAwarded, 0);
}

export function statPoints(completions: Completion[]): Record<Stat, number> {
  const out: Record<Stat, number> = { STR: 0, AGI: 0, INT: 0, VIT: 0, SEN: 0 };
  for (const c of completions) out[c.stat] += c.expAwarded;
  return out;
}

/**
 * Game-style stat value shown in the STATUS window: every hunter starts at 10,
 * +1 per 100 EXP earned in that attribute. (Raw points stay available in Stats.)
 */
export function statLevel(points: number): number {
  return 10 + Math.floor(Math.max(0, points) / 100);
}

export function expByDate(completions: Completion[]): Map<DateKey, number> {
  const m = new Map<DateKey, number>();
  for (const c of completions) m.set(c.date, (m.get(c.date) ?? 0) + c.expAwarded);
  return m;
}

/** Cumulative EXP curve for [from..to] inclusive. Includes EXP earned before `from` as the baseline. */
export function expHistory(completions: Completion[], from: DateKey, to: DateKey) {
  const byDate = expByDate(completions);
  let running = completions.filter((c) => c.date < from).reduce((a, c) => a + c.expAwarded, 0);
  const out: { date: DateKey; exp: number; gained: number }[] = [];
  for (let d = from, i = 0; d <= to && i < 4000; d = addDays(d, 1), i++) {
    const g = byDate.get(d) ?? 0;
    running += g;
    out.push({ date: d, exp: running, gained: g });
  }
  return out;
}

export interface QuestScore {
  quest: Quest;
  scheduled: number;
  done: number;
  rate: number;
}

/** Completion rate per quest over a window of days ending `to` (inclusive). */
export function questLeaderboard(quests: Quest[], idx: CompletionIndex, to: DateKey, windowDays = 28): QuestScore[] {
  const scores: QuestScore[] = [];
  for (const q of quests) {
    if (q.archivedAt) continue;
    let scheduled = 0;
    let done = 0;
    for (let i = 0; i < windowDays; i++) {
      const d = addDays(to, -i);
      if (!isScheduled(q, d)) continue;
      scheduled++;
      if (idx.has(completionId(q.id, d))) done++;
    }
    if (scheduled > 0) scores.push({ quest: q, scheduled, done, rate: done / scheduled });
  }
  return scores.sort((a, b) => b.rate - a.rate || b.done - a.done || b.quest.exp - a.quest.exp);
}

/** Maximum EXP obtainable on a given date (sum of scheduled quest rewards). */
export function maxExpOn(quests: Quest[], date: DateKey): number {
  return quests.filter((q) => isScheduled(q, date)).reduce((a, q) => a + q.exp, 0);
}
