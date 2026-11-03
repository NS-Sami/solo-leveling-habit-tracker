/**
 * IndexedDB persistence via Dexie. Offline-first: the app never needs a server.
 *
 * Schema versioning: bump `this.version(n)` and add an `.upgrade()` for any
 * future change so existing users never lose data.
 */
import Dexie, { type Table } from 'dexie';
import type { BlobRecord, Completion, DayMeta, Quest, Settings } from '../domain/types';
import { SEED_QUESTS, defaultSettings } from './seed';
import { addDays, diffDays, startOfWeek, todayKey } from '../domain/dates';
import { completionId } from '../domain/completion';

export class SystemDB extends Dexie {
  quests!: Table<Quest, string>;
  completions!: Table<Completion, string>;
  dayMeta!: Table<DayMeta, string>;
  settings!: Table<Settings, string>;
  blobs!: Table<BlobRecord, string>;

  constructor() {
    super('the-system');
    this.version(1).stores({
      quests: 'id, category, order',
      completions: 'id, questId, date',
      dayMeta: 'date',
      settings: 'id',
      blobs: 'key',
    });
  }
}

export const db = new SystemDB();

/** First run: seed the 27 quests + default settings. Safe to call on every start. */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.quests, db.settings, async () => {
    const s = await db.settings.get('settings');
    if (!s) {
      await db.settings.put(defaultSettings(startOfWeek(todayKey())));
      if ((await db.quests.count()) === 0) await db.quests.bulkPut(SEED_QUESTS);
    }
  });
}

/**
 * Demo mode (`?demo=1`): fills an EMPTY database with ~2 cycles of realistic
 * history so first-time visitors (and screenshots) see a living dashboard.
 * Never touches a database that already has completions.
 */
export async function seedDemoIfRequested(): Promise<void> {
  if (typeof location === 'undefined' || !new URLSearchParams(location.search).has('demo')) return;
  if ((await db.completions.count()) > 0) return;
  const quests = await db.quests.toArray();
  const today = todayKey();
  const start = addDays(startOfWeek(today), -35); // 5 weeks + this week
  let seed = 1337;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: Completion[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const momentum = 0.45 + 0.35 * Math.min(1, diffDays(start, d) / 30); // improving over time
    const dayMood = 0.75 + rand() * 0.5;
    for (const q of quests) {
      const base = q.difficulty === 'Hard' ? 0.75 : q.difficulty === 'Normal' ? 0.95 : 1.1;
      if (d === today && rand() < 0.5) continue; // today partially done
      if (rand() < momentum * base * dayMood) {
        out.push({ id: completionId(q.id, d), questId: q.id, date: d, expAwarded: q.exp, stat: q.stat, category: q.category, completedAt: new Date().toISOString() });
      }
    }
  }
  await db.completions.bulkPut(out);
  await db.settings.update('settings', { cycleAnchor: addDays(startOfWeek(today), -21), hunterName: 'Shadow Hunter', lastBackupAt: new Date().toISOString() });
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}
