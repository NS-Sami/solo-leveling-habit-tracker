/**
 * Hunter Level & Rank curve.
 *
 * Ranks follow the spec. Each rank band is split evenly across its 5 levels:
 *   E  Lv 1–5    0 – 500       → 100 EXP / level
 *   D  Lv 6–10   501 – 1,500   → 200 EXP / level
 *   C  Lv 11–15  1,501 – 3,500 → 400 EXP / level
 *   B  Lv 16–20  3,501 – 7,000 → 700 EXP / level
 *   A  Lv 21–25  7,001 – 12,000 → 1,000 EXP / level
 *   S  Lv 26+    12,001+       → 1,500 EXP / level (no cap)
 * S-Rank Lv 36+ earns the "National Level" title.
 *
 * Change the curve here — nothing else in the app hard-codes thresholds.
 */

export type RankId = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export interface RankBand {
  id: RankId;
  label: string;
  minLevel: number;
  maxLevel: number; // Infinity for S
  minExp: number;
  /** Inclusive upper EXP bound of the band (Infinity for S). */
  maxExp: number;
  perLevel: number;
  color: string;
}

export const RANKS: RankBand[] = [
  { id: 'E', label: 'E-Rank', minLevel: 1, maxLevel: 5, minExp: 0, maxExp: 500, perLevel: 100, color: '#94A3B8' },
  { id: 'D', label: 'D-Rank', minLevel: 6, maxLevel: 10, minExp: 501, maxExp: 1500, perLevel: 200, color: '#22C55E' },
  { id: 'C', label: 'C-Rank', minLevel: 11, maxLevel: 15, minExp: 1501, maxExp: 3500, perLevel: 400, color: '#3B9EFF' },
  { id: 'B', label: 'B-Rank', minLevel: 16, maxLevel: 20, minExp: 3501, maxExp: 7000, perLevel: 700, color: '#A855F7' },
  { id: 'A', label: 'A-Rank', minLevel: 21, maxLevel: 25, minExp: 7001, maxExp: 12000, perLevel: 1000, color: '#EF4444' },
  { id: 'S', label: 'S-Rank', minLevel: 26, maxLevel: Infinity, minExp: 12001, maxExp: Infinity, perLevel: 1500, color: '#FBBF24' },
];

export const NATIONAL_LEVEL = 36;

/** EXP required to *reach* a given level. */
export function levelStartExp(level: number): number {
  if (level <= 1) return 0;
  const band = RANKS.find((r) => level >= r.minLevel && level <= r.maxLevel) ?? RANKS[RANKS.length - 1];
  return band.minExp + (level - band.minLevel) * band.perLevel;
}

export function rankForLevel(level: number): RankBand {
  return RANKS.find((r) => level >= r.minLevel && level <= r.maxLevel) ?? RANKS[RANKS.length - 1];
}

export function levelForExp(exp: number): number {
  const e = Math.max(0, Math.floor(exp));
  const band = [...RANKS].reverse().find((r) => e >= r.minExp)!;
  const inBand = Math.floor((e - band.minExp) / band.perLevel);
  const level = band.minLevel + inBand;
  return Math.min(level, band.maxLevel);
}

export interface LevelInfo {
  exp: number;
  level: number;
  rank: RankBand;
  title: string;
  levelStart: number;
  nextLevelAt: number;
  /** 0..1 progress toward next level. */
  levelProgress: number;
  /** 0..1 progress through the current rank band (S-Rank: progress to National Level, then 1). */
  rankProgress: number;
  nextRank: RankBand | null;
}

export function getLevelInfo(exp: number): LevelInfo {
  const level = levelForExp(exp);
  const rank = rankForLevel(level);
  const levelStart = levelStartExp(level);
  const nextLevelAt = levelStartExp(level + 1);
  const levelProgress = clamp01((exp - levelStart) / (nextLevelAt - levelStart));
  const idx = RANKS.indexOf(rank);
  const nextRank = idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
  const rankProgress = nextRank
    ? clamp01((exp - rank.minExp) / (nextRank.minExp - rank.minExp))
    : clamp01((exp - rank.minExp) / (levelStartExp(NATIONAL_LEVEL) - rank.minExp));
  const title = level >= NATIONAL_LEVEL ? 'National Level Hunter' : `${rank.label} Hunter`;
  return { exp, level, rank, title, levelStart, nextLevelAt, levelProgress, rankProgress, nextRank };
}

function clamp01(n: number) {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
