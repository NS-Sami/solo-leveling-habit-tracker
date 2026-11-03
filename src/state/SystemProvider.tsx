/**
 * SystemProvider — loads persisted facts (live from IndexedDB) and derives
 * everything the UI needs in one place: EXP, level, rank, streak, day stats.
 *
 * It also emits the "System" events: level-up / rank-up modal and the
 * Daily Quest Complete fanfare.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { toggleCompletion } from '../data/actions';
import type { Completion, DateKey, DayMeta, Quest, Settings } from '../domain/types';
import { dayStats, indexCompletions, type CompletionIndex, type DayStats } from '../domain/completion';
import { getLevelInfo, type LevelInfo } from '../domain/leveling';
import { bestStreak, currentStreak } from '../domain/streak';
import { totalExp } from '../domain/stats';
import { addDays, todayKey } from '../domain/dates';
import { cycleFor, type CycleInfo } from '../domain/cycle';
import { configureSfx, sfx } from '../lib/sfx';
import { useUI } from './ui';

export interface SystemValue {
  quests: Quest[]; // all, ordered
  activeQuests: Quest[]; // not archived
  completions: Completion[];
  idx: CompletionIndex;
  meta: Map<DateKey, DayMeta>;
  settings: Settings;
  today: DateKey;
  now: Date;
  getDay: (d: DateKey) => DayStats;
  todayStats: DayStats;
  exp: number;
  level: LevelInfo;
  streak: number;
  best: number;
  currentCycle: CycleInfo;
  earliest: DateKey;
  toggle: (q: Quest, d: DateKey) => Promise<void>;
}

const Ctx = createContext<SystemValue | null>(null);

export function useSystem(): SystemValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSystem must be used inside <SystemProvider>');
  return v;
}

/** Re-render every 30s so "today", the emergency banner and the clock stay correct past midnight. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    const onVis = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs]);
  return now;
}

export function SystemProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const quests = useLiveQuery(() => db.quests.orderBy('order').toArray(), []);
  const completions = useLiveQuery(() => db.completions.toArray(), []);
  const metaRows = useLiveQuery(() => db.dayMeta.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const now = useNow();
  const today = todayKey(now);
  const pushToast = useUI((s) => s.pushToast);
  const setLevelUp = useUI((s) => s.setLevelUp);

  useEffect(() => {
    if (settings) configureSfx(settings.sfxOn, settings.volume);
  }, [settings?.sfxOn, settings?.volume]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = !!quests && !!completions && !!metaRows && !!settings;

  const derived = useMemo(() => {
    if (!ready) return null;
    const idx = indexCompletions(completions!);
    const meta = new Map(metaRows!.map((m) => [m.date, m]));
    const cache = new Map<DateKey, DayStats>();
    const getDay = (d: DateKey) => {
      let s = cache.get(d);
      if (!s) {
        s = dayStats(d, quests!, idx, meta);
        cache.set(d, s);
      }
      return s;
    };
    const exp = totalExp(completions!);
    // Streak lookback starts at the first completion (or the cycle anchor) — not the year 2000.
    const firstCompletion = completions!.reduce<DateKey | null>((m, c) => (!m || c.date < m ? c.date : m), null);
    const earliest = [firstCompletion, settings!.cycleAnchor].filter(Boolean).sort()[0] as DateKey;
    return {
      idx,
      meta,
      getDay,
      exp,
      level: getLevelInfo(exp),
      todayStats: getDay(today),
      streak: currentStreak(today, getDay, settings!.streakThreshold, earliest),
      best: bestStreak(earliest, today, getDay, settings!.streakThreshold),
      currentCycle: cycleFor(today, settings!.cycleAnchor),
      earliest: earliest > today ? addDays(today, -1) : earliest,
    };
  }, [ready, quests, completions, metaRows, settings, today]);

  /* ---- System events: level up & daily complete (skip the first load) ---- */
  const prevLevel = useRef<number | null>(null);
  const prevRank = useRef<string | null>(null);
  const prevTodayDone = useRef<{ date: string; full: boolean } | null>(null);

  useEffect(() => {
    if (!derived) return;
    const { level } = derived;
    if (prevLevel.current !== null && level.level > prevLevel.current) {
      const rankUp = prevRank.current !== level.rank.id;
      setLevelUp({
        level: level.level,
        rankLabel: level.rank.label,
        rankColor: level.rank.color,
        rankUp,
        title: level.title,
      });
      sfx.levelUp();
    }
    prevLevel.current = level.level;
    prevRank.current = level.rank.id;
  }, [derived?.level.level]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!derived) return;
    const t = derived.todayStats;
    const full = t.scheduled > 0 && t.done === t.scheduled;
    const prev = prevTodayDone.current;
    if (prev && prev.date === t.date && !prev.full && full) {
      setTimeout(() => sfx.dayComplete(), 250);
      pushToast({ title: 'You have completed the Daily Quest.', body: 'All rewards have been granted.', tone: 'gold' });
    }
    prevTodayDone.current = { date: t.date, full };
  }, [derived?.todayStats.done, derived?.todayStats.scheduled, derived?.todayStats.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(
    async (q: Quest, d: DateKey) => {
      const nowDone = await toggleCompletion(q, d);
      if (nowDone) {
        sfx.check();
        pushToast({ title: `Quest cleared. +${q.exp} EXP`, body: `${q.name} · ${q.stat} +${q.exp}`, tone: 'system' });
      } else {
        sfx.uncheck();
      }
    },
    [pushToast],
  );

  if (!ready || !derived) return <>{fallback}</>;

  const value: SystemValue = {
    quests: quests!,
    activeQuests: quests!.filter((q) => !q.archivedAt),
    completions: completions!,
    settings: settings!,
    today,
    now,
    toggle,
    ...derived,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
