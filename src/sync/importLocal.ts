/**
 * Moves progress saved before accounts existed into the signed-in account.
 *
 * Safe by design:
 *  - The old local database is only read. It is never changed or deleted here.
 *  - Rows are inserted with "skip if it already exists", so retrying after a
 *    failure cannot duplicate anything or overwrite newer online data.
 *  - Success is only reported after reading back every id from the server.
 */
import Dexie from 'dexie';
import { LEGACY_DB_NAME, SystemDB } from '../data/db';
import { SEED_QUESTS, defaultSettings } from '../data/seed';
import { startOfWeek, todayKey } from '../domain/dates';
import { SETTINGS_ROW_ID, SYNC_TABLES, toRemote, type LocalRecord, type RemotePatch, type SyncTable } from './mapping';
import type { RemoteStore } from './remote';

const CHUNK = 500;
const PAGE = 1000;

export interface LocalSummary {
  quests: number;
  completions: number;
  restDays: number;
  exp: number;
}

/** What is stored in the pre-account database, or null if there is nothing to import. */
export async function readLocalSummary(name = LEGACY_DB_NAME): Promise<LocalSummary | null> {
  if (!(await Dexie.exists(name))) return null;
  const source = new SystemDB(name);
  try {
    const [quests, completions, restDays] = await Promise.all([source.quests.toArray(), source.completions.toArray(), source.dayMeta.count()]);
    const seedIds = new Set(SEED_QUESTS.map((q) => q.id));
    const customised = quests.length !== SEED_QUESTS.length || quests.some((q) => !seedIds.has(q.id));
    if (completions.length === 0 && restDays === 0 && !customised) return null;
    return { quests: quests.length, completions: completions.length, restDays, exp: completions.reduce((a, c) => a + c.expAwarded, 0) };
  } finally {
    source.close();
  }
}

async function upload(remote: RemoteStore, table: SyncTable, records: LocalRecord[], onProgress: (done: number) => void) {
  const stamp = new Date().toISOString();
  const rows: RemotePatch[] = records.map((r) => ({ ...toRemote(table, r), deleted_at: null, client_updated_at: stamp }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await remote.insertIfAbsent(table, chunk);
    onProgress(chunk.length);
  }
  return rows.map((r) => r.id as string);
}

async function serverIds(remote: RemoteStore, table: SyncTable): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const page = await remote.listSince(table, null, offset, PAGE);
    page.forEach((r) => ids.add(r.id));
    if (page.length < PAGE) return ids;
  }
}

/** Uploads everything, then confirms each row is on the server. Throws if anything is missing. */
export async function importLocalData(remote: RemoteStore, onProgress: (done: number, total: number) => void = () => {}, name = LEGACY_DB_NAME) {
  const source = new SystemDB(name);
  try {
    const [quests, completions, dayMeta, settings] = await Promise.all([
      source.quests.toArray(),
      source.completions.toArray(),
      source.dayMeta.toArray(),
      source.settings.get('settings'),
    ]);
    const total = quests.length + completions.length + dayMeta.length + (settings ? 1 : 0);
    let done = 0;
    const tick = (n: number) => onProgress((done += n), total);

    const expected: [SyncTable, string[]][] = [
      ['quests', await upload(remote, 'quests', quests, tick)],
      ['completions', await upload(remote, 'completions', completions, tick)],
      ['day_meta', await upload(remote, 'day_meta', dayMeta, tick)],
    ];
    if (settings) expected.push(['user_settings', await upload(remote, 'user_settings', [settings], tick)]);

    for (const [table, ids] of expected) {
      const online = await serverIds(remote, table);
      const missing = ids.filter((id) => !online.has(id)).length;
      if (missing > 0) throw new Error(`${missing} ${table} rows were not saved online. Your local copy is untouched, so it is safe to try again.`);
    }
    return { quests: quests.length, completions: completions.length, restDays: dayMeta.length };
  } finally {
    source.close();
  }
}

/** Has this account ever saved anything? Deleted rows count, so resets are respected. */
export async function accountIsEmpty(remote: RemoteStore): Promise<boolean> {
  for (const table of SYNC_TABLES) {
    if ((await remote.listSince(table, null, 0, 1)).length > 0) return false;
  }
  return true;
}

/** Gives a brand-new account the default quests. Two devices doing this at once is harmless. */
export async function seedAccount(remote: RemoteStore) {
  const stamp = new Date().toISOString();
  await remote.insertIfAbsent(
    'quests',
    SEED_QUESTS.map((q) => ({ ...toRemote('quests', q), deleted_at: null, client_updated_at: stamp })),
  );
  const settings = defaultSettings(startOfWeek(todayKey()));
  await remote.insertIfAbsent('user_settings', [{ ...toRemote('user_settings', settings), id: SETTINGS_ROW_ID, deleted_at: null, client_updated_at: stamp }]);
}
