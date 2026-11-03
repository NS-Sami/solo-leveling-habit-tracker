/**
 * All writes go through here. Components never touch `db` directly for writes,
 * which keeps a single seam for a future cloud-sync adapter (see docs/DATA-MODEL.md).
 */
import { db } from './db';
import type { DateKey, Quest, Settings } from '../domain/types';
import { completionId } from '../domain/completion';
import { todayKey } from '../domain/dates';

const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** Toggle a quest for a date. Returns true if it is now completed. */
export async function toggleCompletion(quest: Quest, date: DateKey): Promise<boolean> {
  const id = completionId(quest.id, date);
  return db.transaction('rw', db.completions, async () => {
    const existing = await db.completions.get(id);
    if (existing) {
      await db.completions.delete(id);
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
    return true;
  });
}

export async function setRestDay(date: DateKey, restDay: boolean) {
  if (restDay) await db.dayMeta.put({ date, restDay: true });
  else await db.dayMeta.delete(date);
}

export async function updateSettings(patch: Partial<Settings>) {
  await db.settings.update('settings', patch);
}

export async function saveQuest(input: Omit<Quest, 'id' | 'updatedAt' | 'createdAt' | 'order'> & Partial<Pick<Quest, 'id' | 'createdAt' | 'order'>>) {
  const now = new Date().toISOString();
  if (input.id) {
    await db.quests.update(input.id, { ...input, updatedAt: now });
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
  return id;
}

export async function archiveQuest(id: string, archived: boolean) {
  await db.quests.update(id, { archivedAt: archived ? todayKey() : null, updatedAt: new Date().toISOString() });
}

/** Permanently deletes a quest AND its completion history (EXP is removed). */
export async function deleteQuest(id: string) {
  await db.transaction('rw', db.quests, db.completions, async () => {
    await db.completions.where('questId').equals(id).delete();
    await db.quests.delete(id);
  });
}

export async function moveQuest(id: string, dir: -1 | 1) {
  const all = await db.quests.orderBy('order').toArray();
  const i = all.findIndex((q) => q.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  const a = all[i];
  const b = all[j];
  await db.transaction('rw', db.quests, async () => {
    await db.quests.update(a.id, { order: b.order });
    await db.quests.update(b.id, { order: a.order });
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
