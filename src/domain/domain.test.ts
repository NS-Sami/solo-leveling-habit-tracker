import { describe, expect, it } from 'vitest';
import { addDays, diffDays, fromKey, isValidKey, toKey, weekday } from './dates';
import { getLevelInfo, levelForExp, levelStartExp, rankForLevel } from './leveling';
import { completionId, dayStats, indexCompletions, isScheduled } from './completion';
import { bestStreak, currentStreak } from './streak';
import { cycleAt, cycleFor, dayOfCycle } from './cycle';
import { expHistory, questLeaderboard, statLevel, statPoints, totalExp } from './stats';
import type { Completion, DayMeta, Quest } from './types';
import { SEED_QUESTS } from '../data/seed';

const ALL = [0, 1, 2, 3, 4, 5, 6];
const q = (id: string, over: Partial<Quest> = {}): Quest => ({
  id,
  name: id,
  category: 'Physical',
  stat: 'STR',
  exp: 10,
  difficulty: 'Easy',
  scheduleDays: ALL,
  order: 0,
  createdAt: '2000-01-01',
  updatedAt: '',
  ...over,
});
const done = (questId: string, date: string, exp = 10): Completion => ({
  id: completionId(questId, date),
  questId,
  date,
  expAwarded: exp,
  stat: 'STR',
  category: 'Physical',
  completedAt: '',
});

describe('dates', () => {
  it('round-trips local keys', () => {
    expect(toKey(fromKey('2026-11-03'))).toBe('2026-11-03');
    expect(isValidKey('2026-02-30')).toBe(false);
  });
  it('adds days across month & year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(diffDays('2026-10-11', '2026-11-07')).toBe(27);
  });
  it('knows weekdays (3 Nov 2026 is a Tuesday)', () => {
    expect(weekday('2026-11-03')).toBe(2);
  });
});

describe('leveling', () => {
  it('maps rank boundaries exactly as the spec', () => {
    expect(rankForLevel(levelForExp(0)).id).toBe('E');
    expect(rankForLevel(levelForExp(500)).id).toBe('E');
    expect(rankForLevel(levelForExp(501)).id).toBe('D');
    expect(rankForLevel(levelForExp(1500)).id).toBe('D');
    expect(rankForLevel(levelForExp(1501)).id).toBe('C');
    expect(rankForLevel(levelForExp(3501)).id).toBe('B');
    expect(rankForLevel(levelForExp(7000)).id).toBe('B');
    expect(rankForLevel(levelForExp(7001)).id).toBe('A');
    expect(rankForLevel(levelForExp(12000)).id).toBe('A');
    expect(rankForLevel(levelForExp(12001)).id).toBe('S');
  });
  it('levels inside a band', () => {
    expect(levelForExp(0)).toBe(1);
    expect(levelForExp(99)).toBe(1);
    expect(levelForExp(100)).toBe(2);
    expect(levelForExp(500)).toBe(5);
    expect(levelForExp(501)).toBe(6);
    expect(levelForExp(4935)).toBe(18); // the old sheet's EXP → B-Rank Lv 18
    expect(levelForExp(12001)).toBe(26);
    expect(levelForExp(13501)).toBe(27);
    expect(levelStartExp(26)).toBe(12001);
  });
  it('computes progress toward next level', () => {
    const info = getLevelInfo(150);
    expect(info.level).toBe(2);
    expect(info.levelProgress).toBeCloseTo(0.5);
    expect(info.nextRank?.id).toBe('D');
  });
});

describe('completion %', () => {
  const quests = [q('a'), q('b'), q('train', { scheduleDays: [1, 3, 5] })]; // Mon/Wed/Fri only
  it('only counts scheduled quests in the denominator', () => {
    const idx = indexCompletions([done('a', '2026-11-03')]); // Tuesday
    const s = dayStats('2026-11-03', quests, idx);
    expect(s.scheduled).toBe(2);
    expect(s.ratio).toBe(0.5);
    const mon = dayStats('2026-11-02', quests, idx);
    expect(mon.scheduled).toBe(3);
  });
  it('respects createdAt and archivedAt', () => {
    const fresh = q('new', { createdAt: '2026-11-03' });
    const old = q('old', { archivedAt: '2026-11-01' });
    expect(isScheduled(fresh, '2026-11-02')).toBe(false);
    expect(isScheduled(fresh, '2026-11-03')).toBe(true);
    expect(isScheduled(old, '2026-10-31')).toBe(true);
    expect(isScheduled(old, '2026-11-01')).toBe(false);
  });
});

describe('streak', () => {
  const quests = [q('a'), q('b')];
  const make = (completions: Completion[], rest: string[] = []) => {
    const idx = indexCompletions(completions);
    const meta = new Map<string, DayMeta>(rest.map((d) => [d, { date: d, restDay: true }]));
    return (d: string) => dayStats(d, quests, idx, meta);
  };
  it('counts consecutive qualifying days and today does not break it', () => {
    const get = make([done('a', '2026-11-01'), done('a', '2026-11-02')]);
    expect(currentStreak('2026-11-03', get, 0.5, '2026-10-01')).toBe(2);
  });
  it('includes today once it qualifies', () => {
    const get = make([done('a', '2026-11-02'), done('a', '2026-11-03')]);
    expect(currentStreak('2026-11-03', get, 0.5, '2026-10-01')).toBe(2);
  });
  it('rest days neither break nor extend', () => {
    const get = make([done('a', '2026-10-31'), done('a', '2026-11-02')], ['2026-11-01']);
    expect(currentStreak('2026-11-03', get, 0.5, '2026-10-01')).toBe(2);
  });
  it('a missed day breaks it', () => {
    const get = make([done('a', '2026-10-31'), done('a', '2026-11-02')]);
    expect(currentStreak('2026-11-03', get, 0.5, '2026-10-01')).toBe(1);
  });
  it('best streak', () => {
    const get = make([done('a', '2026-10-01'), done('a', '2026-10-02'), done('a', '2026-10-03'), done('a', '2026-10-05')]);
    expect(bestStreak('2026-10-01', '2026-10-06', get, 0.5)).toBe(3);
  });
});

describe('cycles', () => {
  const anchor = '2026-10-11';
  it('matches the original sheet (11 Oct → 7 Nov)', () => {
    const c = cycleFor('2026-11-03', anchor);
    expect(c.start).toBe('2026-10-11');
    expect(c.end).toBe('2026-11-07');
    expect(c.weeks[3][2]).toBe('2026-11-03');
    expect(dayOfCycle('2026-11-03', anchor)).toBe(24);
  });
  it('rolls into the next cycle and supports dates before the anchor', () => {
    expect(cycleFor('2026-11-08', anchor).start).toBe('2026-11-08');
    expect(cycleAt(-1, anchor).start).toBe('2026-09-13');
    expect(dayOfCycle('2026-10-10', anchor)).toBe(28);
  });
});

describe('stats', () => {
  it('converts attribute points into game-style stat values (base 10, +1 per 100)', () => {
    expect(statLevel(0)).toBe(10);
    expect(statLevel(99)).toBe(10);
    expect(statLevel(6660)).toBe(76);
  });
  it('sums EXP snapshots, not current rewards', () => {
    const cs = [done('a', '2026-11-01', 20), done('a', '2026-11-02', 50)];
    expect(totalExp(cs)).toBe(70);
    expect(statPoints(cs).STR).toBe(70);
  });
  it('builds a cumulative curve with baseline', () => {
    const cs = [done('a', '2026-10-01', 10), done('a', '2026-11-02', 20)];
    const h = expHistory(cs, '2026-11-01', '2026-11-03');
    expect(h.map((x) => x.exp)).toEqual([10, 30, 30]);
  });
  it('ranks quests by completion rate', () => {
    const quests = [q('a'), q('b')];
    const idx = indexCompletions([done('b', '2026-11-03'), done('b', '2026-11-02'), done('a', '2026-11-03')]);
    const lb = questLeaderboard(quests, idx, '2026-11-03', 7);
    expect(lb[0].quest.id).toBe('b');
  });
});

describe('seed data', () => {
  it('contains all 27 quests from the master database', () => {
    expect(SEED_QUESTS).toHaveLength(27);
    const max = SEED_QUESTS.reduce((a, x) => a + x.exp, 0);
    expect(max).toBe(650);
    expect(new Set(SEED_QUESTS.map((x) => x.id)).size).toBe(27);
  });
});
