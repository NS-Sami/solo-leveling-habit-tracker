/**
 * All writes go through here, so every change to account data is queued for
 * upload in the same transaction that saves it. Components never write to `db`.
 */
import { db } from './db';
import { markDirty } from './changes';
import { SEED_QUESTS, defaultSettings } from './seed';
import type { Completion, DateKey, DayMeta, Quest, Settings } from '../domain/types';
import { completionId } from '../domain/completion';
import { startOfWeek, todayKey } from '../domain/dates';
import { DEVICE_ONLY_SETTINGS, SETTINGS_ROW_ID } from '../sync/mapping';

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** Toggle a quest for a date. Returns true if it is now completed. */
export async function toggleCompletion(quest: Quest, date: DateKey): Promise<boolean> {
  const id = completionId(quest.id, date);
  return db.transaction('rw', db.completions, db.outbox, async () => {
    const existing = await db.completions.get(id);
    if (existing) {
      await db.completions.delete(id);
      await markDirty('completions', [id]);
      return false;
    }
    await db.completions.put({
      id,
      questId: quest.id,
      date,
      expAwarded: quest.exp,
      stat: quest.stat,
      category: quest.category,
      completedAt: new Date().toISOString(),
    });
    await markDirty('completions', [id]);
    return true;
  });
}

export async function setRestDay(date: DateKey, restDay: boolean) {
  await db.transaction('rw', db.dayMeta, db.outbox, async () => {
    if (restDay) await db.dayMeta.put({ date, restDay: true });
    else await db.dayMeta.delete(date);
    await markDirty('day_meta', [date]);
  });
}

export async function updateSettings(patch: Partial<Settings>) {
  await db.transaction('rw', db.settings, db.outbox, async () => {
    await db.settings.update('settings', patch);
    const followsAccount = Object.keys(patch).some((k) => !(DEVICE_ONLY_SETTINGS as readonly string[]).includes(k));
    if (followsAccount) await markDirty('user_settings', [SETTINGS_ROW_ID]);
  });
}

export async function saveQuest(input: Omit<Quest, 'id' | 'updatedAt' | 'createdAt' | 'order'> & Partial<Pick<Quest, 'id' | 'createdAt' | 'order'>>) {
  const now = new Date().toISOString();
  return db.transaction('rw', db.quests, db.outbox, async () => {
    if (input.id) {
      await db.quests.update(input.id, { ...input, updatedAt: now });
      await markDirty('quests', [input.id]);
      return input.id;
    }
    const max = await db.quests.orderBy('order').last();
    const id = `q-${uid()}`;
    await db.quests.put({
      ...input,
      id,
      order: (max?.order ?? 0) + 1,
      createdAt: input.createdAt ?? todayKey(),
      archivedAt: null,
      updatedAt: now,
    } as Quest);
    await markDirty('quests', [id]);
    return id;
  });
}

export async function archiveQuest(id: string, archived: boolean) {
  await db.transaction('rw', db.quests, db.outbox, async () => {
    await db.quests.update(id, { archivedAt: archived ? todayKey() : null, updatedAt: new Date().toISOString() });
    await markDirty('quests', [id]);
  });
}

/** Permanently deletes a quest AND its completion history (EXP is removed). */
export async function deleteQuest(id: string) {
  await db.transaction('rw', db.quests, db.completions, db.outbox, async () => {
    const completionIds = await db.completions.where('questId').equals(id).primaryKeys();
    await db.completions.bulkDelete(completionIds);
    await db.quests.delete(id);
    await markDirty('completions', completionIds);
    await markDirty('quests', [id]);
  });
}

export async function moveQuest(id: string, dir: -1 | 1) {
  const all = await db.quests.orderBy('order').toArray();
  const i = all.findIndex((q) => q.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  const a = all[i];
  const b = all[j];
  await db.transaction('rw', db.quests, db.outbox, async () => {
    await db.quests.update(a.id, { order: b.order });
    await db.quests.update(b.id, { order: a.order });
    await markDirty('quests', [a.id, b.id]);
  });
}

/** Adds completions from a Google Sheet import. */
export async function addCompletions(rows: Completion[]) {
  await db.transaction('rw', db.completions, db.outbox, async () => {
    await db.completions.bulkPut(rows);
    await markDirty('completions', rows.map((r) => r.id));
  });
}

export interface FullData {
  quests: Quest[];
  completions: Completion[];
  dayMeta: DayMeta[];
  settings: Settings | null;
}

/**
 * Replaces all quests, completions and rest days. On an account, rows that
 * disappear are uploaded as deletions so other devices follow.
 */
export async function replaceAllData(data: FullData) {
  await db.transaction('rw', [db.quests, db.completions, db.dayMeta, db.settings, db.outbox], async () => {
    const [oldQuests, oldCompletions, oldDays] = await Promise.all([
      db.quests.toCollection().primaryKeys(),
      db.completions.toCollection().primaryKeys(),
      db.dayMeta.toCollection().primaryKeys(),
    ]);
    await Promise.all([db.quests.clear(), db.completions.clear(), db.dayMeta.clear()]);
    await db.quests.bulkPut(data.quests);
    await db.completions.bulkPut(data.completions);
    await db.dayMeta.bulkPut(data.dayMeta);
    await markDirty('quests', [...new Set([...oldQuests, ...data.quests.map((q) => q.id)])]);
    await markDirty('completions', [...new Set([...oldCompletions, ...data.completions.map((c) => c.id)])]);
    await markDirty('day_meta', [...new Set([...oldDays, ...data.dayMeta.map((d) => d.date)])]);
    if (data.settings) {
      const current = await db.settings.get('settings');
      // Uploaded audio only exists on the device that uploaded it.
      await db.settings.put({ ...data.settings, anthemBlobKey: current?.anthemBlobKey ?? null });
      await markDirty('user_settings', [SETTINGS_ROW_ID]);
    }
  });
}

/**
 * "Reset everything". On an account this also clears the online copy, through the
 * normal upload queue. Locally-only data is simply deleted.
 */
export async function resetAllData() {
  if (!db.tracked) {
    await db.delete();
    return;
  }
  const current = await db.settings.get('settings');
  const fresh = defaultSettings(startOfWeek(todayKey()));
  await replaceAllData({
    quests: SEED_QUESTS,
    completions: [],
    dayMeta: [],
    settings: { ...fresh, sfxOn: current?.sfxOn ?? fresh.sfxOn, volume: current?.volume ?? fresh.volume },
  });
}

export async function putBlob(file: File): Promise<string> {
  const key = `blob-${uid()}`;
  await db.blobs.put({ key, blob: file, name: file.name, mime: file.type });
  return key;
}

export async function deleteBlob(key: string) {
  await db.blobs.delete(key);
}

export { uid };
