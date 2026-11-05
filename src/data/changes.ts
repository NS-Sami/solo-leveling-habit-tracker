/**
 * Records which rows changed locally, so the sync engine can upload them.
 * Runs inside the same IndexedDB transaction as the write itself: a change can
 * never be saved without also being queued. No-op for local-only databases.
 */
import { db, type OutboxItem } from './db';
import { outboxKey, type SyncTable } from '../sync/mapping';

let lastRev = 0;
let listener: (() => void) | null = null;

function nextRev(): number {
  lastRev = Math.max(lastRev + 1, Date.now() * 1000);
  return lastRev;
}

/** The sync engine registers here to hear about new local changes. */
export function onLocalChange(fn: (() => void) | null) {
  listener = fn;
}

export async function markDirty(table: SyncTable, rowIds: string[]): Promise<void> {
  if (!db.tracked || rowIds.length === 0) return;
  const dirtiedAt = new Date().toISOString();
  const items: OutboxItem[] = rowIds.map((rowId) => ({ key: outboxKey(table, rowId), table, rowId, rev: nextRev(), dirtiedAt }));
  await db.outbox.bulkPut(items);
  listener?.();
}
