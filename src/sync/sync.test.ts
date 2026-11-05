/**
 * Two simulated devices sync through REAL Postgres running the real migration.
 * Only the Supabase HTTP layer is replaced (by direct SQL under the same RLS rules).
 */
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, as, createTestDb } from '../../supabase/testdb';
import { LEGACY_DB_NAME, SystemDB, switchDatabase } from '../data/db';
import { SEED_QUESTS, defaultSettings } from '../data/seed';
import { deleteQuest, saveQuest, setRestDay, toggleCompletion, updateSettings } from '../data/actions';
import { SyncEngine, type SyncStatus } from './engine';
import { NetworkError, type RemoteStore } from './remote';
import { accountIsEmpty, importLocalData, readLocalSummary, seedAccount } from './importLocal';
import type { RemotePatch, RemoteRow, SyncTable } from './mapping';
import { totalExp } from '../domain/stats';

let pg: PGlite;
let counter = 0;

const ident = (c: string) => `"${c}"`;

/** RemoteStore implemented with SQL, executed as the signed-in user. */
function sqlRemote(userId: string): RemoteStore {
  const rows = async (sql: string, params: unknown[] = []) => (await as<{ row: RemoteRow }>(pg, userId, sql, params)).map((r) => r.row);
  return {
    async insertIfAbsent(table, input) {
      const out: RemoteRow[] = [];
      for (const r of input) {
        const row = { ...r, user_id: userId };
        const cols = Object.keys(row);
        const values = cols.map((_, i) => `$${i + 1}`).join(',');
        const params = cols.map((c) => prepare(row[c as keyof typeof row]));
        out.push(...(await rows(`insert into public.${table} (${cols.map(ident).join(',')}) values (${values}) on conflict (user_id, id) do nothing returning to_jsonb(${table}.*) as row`, params)));
      }
      return out;
    },
    async updateIfVersion(table, id, patch, version) {
      const cols = Object.keys(patch);
      const sets = cols.map((c, i) => `${ident(c)} = $${i + 1}`).join(',');
      const params = [...cols.map((c) => prepare(patch[c])), userId, id, version];
      const n = cols.length;
      const res = await rows(`update public.${table} set ${sets} where user_id = $${n + 1} and id = $${n + 2} and version = $${n + 3} returning to_jsonb(${table}.*) as row`, params);
      return res[0] ?? null;
    },
    async get(table, id) {
      return (await rows(`select to_jsonb(t.*) as row from public.${table} t where user_id = $1 and id = $2`, [userId, id]))[0] ?? null;
    },
    listSince(table, since, offset, limit) {
      return rows(`select to_jsonb(t.*) as row from public.${table} t where user_id = $1 and ($2::timestamptz is null or updated_at >= $2) order by updated_at, id limit $3 offset $4`, [userId, since, limit, offset]);
    },
  };
}

/** jsonb goes in as text; Postgres arrays go in as JS arrays. */
function prepare(v: unknown) {
  return v && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v;
}

function device(userId: string, remote: RemoteStore = sqlRemote(userId)) {
  const name = `device-${++counter}`;
  const statuses: SyncStatus[] = [];
  const open = () => switchDatabase(name, true);
  const engine = () => new SyncEngine(open(), remote, (s) => statuses.push(s));
  return {
    name,
    statuses,
    db: open,
    sync: () => engine().sync(),
    /** Runs an action on this device (actions always use the active database). */
    act: async <T,>(fn: () => Promise<T>) => {
      open();
      return fn();
    },
    last: () => statuses[statuses.length - 1],
  };
}

/** A fresh account with default quests, signed in on two devices. */
async function twoDevices() {
  const user = crypto.randomUUID();
  await addUser(pg, user);
  await seedAccount(sqlRemote(user));
  const a = device(user);
  const b = device(user);
  await a.sync();
  await b.sync();
  return { user, a, b };
}

const walk = SEED_QUESTS.find((q) => q.id === 'phy-walk')!;
const DATE = '2026-11-05';

beforeAll(async () => {
  pg = await createTestDb();
}, 60_000);

describe('progress follows the account across devices', () => {
  it('a brand-new account gets the 27 default quests on both devices', async () => {
    const { a, b } = await twoDevices();
    expect(await a.db().quests.count()).toBe(27);
    expect(await b.db().quests.count()).toBe(27);
    expect((await a.db().settings.get('settings'))?.timezone).toBe('Asia/Dhaka');
  });

  it('a completion on one device appears on the other with the same EXP', async () => {
    const { a, b } = await twoDevices();
    await a.act(() => toggleCompletion(walk, DATE));
    await a.sync();
    await b.sync();
    const comps = await b.db().completions.toArray();
    expect(comps.map((c) => c.id)).toEqual([`phy-walk|${DATE}`]);
    expect(totalExp(comps)).toBe(20);
  });

  it('unchecking and deleting also reach the other device', async () => {
    const { a, b } = await twoDevices();
    await a.act(() => toggleCompletion(walk, DATE));
    await a.sync();
    await b.sync();
    await b.act(() => toggleCompletion(walk, DATE));
    await b.sync();
    await a.sync();
    expect(await a.db().completions.count()).toBe(0);

    await a.act(() => toggleCompletion(walk, DATE));
    await a.sync();
    await a.act(() => deleteQuest('phy-walk'));
    await a.sync();
    await b.sync();
    expect(await b.db().quests.get('phy-walk')).toBeUndefined();
    expect(await b.db().completions.count()).toBe(0);
  });

  it('new quests, edits, rest days and settings all sync', async () => {
    const { a, b } = await twoDevices();
    const id = await a.act(() => saveQuest({ name: '<b>Pushups</b>', category: 'Physical', stat: 'STR', exp: 30, difficulty: 'Hard', scheduleDays: [1, 3], archivedAt: null }));
    await a.act(() => setRestDay(DATE, true));
    await a.act(() => updateSettings({ hunterName: 'Sung', timezone: 'Europe/London' }));
    await a.sync();
    await b.sync();
    const q = await b.db().quests.get(id);
    expect(q?.name).toBe('<b>Pushups</b>');
    expect(q?.scheduleDays).toEqual([1, 3]);
    expect((await b.db().dayMeta.get(DATE))?.restDay).toBe(true);
    const s = await b.db().settings.get('settings');
    expect(s?.hunterName).toBe('Sung');
    expect(s?.timezone).toBe('Europe/London');
  });

  it('device preferences such as volume stay on their device', async () => {
    const { user, a, b } = await twoDevices();
    await b.act(() => updateSettings({ volume: 0.2 }));
    await a.act(() => updateSettings({ volume: 0.9, hunterName: 'Sung' }));
    await a.sync();
    await b.sync();
    expect((await b.db().settings.get('settings'))?.volume).toBe(0.2);
    const [row] = await as<{ data: Record<string, unknown> }>(pg, user, 'select data from public.user_settings');
    expect(row.data).not.toHaveProperty('volume');
    expect(row.data).toHaveProperty('hunterName', 'Sung');
  });

  it('fetches more than one page of history', async () => {
    const { user, a, b } = await twoDevices();
    await pg.transaction(async (tx) => {
      await tx.query(
        `insert into public.completions (user_id, id, quest_id, date, exp_awarded, stat, category)
         select $1, 'bulk|' || d::date, 'bulk', d::date, 10, 'STR', 'Physical'
         from generate_series('2020-01-01'::date, '2020-01-01'::date + 1204, interval '1 day') d`,
        [user],
      );
    });
    await a.sync();
    await b.sync();
    expect(await a.db().completions.count()).toBe(1205);
    expect(await b.db().completions.count()).toBe(1205);
  });
});

describe('no duplicate EXP', () => {
  it('both devices completing the same quest on the same day counts once', async () => {
    const { user, a, b } = await twoDevices();
    await a.act(() => toggleCompletion(walk, DATE));
    await b.act(() => toggleCompletion(walk, DATE));
    await a.sync();
    await b.sync();
    await a.sync();
    const rows = await as(pg, user, 'select * from public.completions where deleted_at is null');
    expect(rows).toHaveLength(1);
    expect(totalExp(await a.db().completions.toArray())).toBe(20);
    expect(totalExp(await b.db().completions.toArray())).toBe(20);
    expect(await b.db().outbox.count()).toBe(0);
  });

  it('a retry after a lost reply does not duplicate or clash', async () => {
    const user = crypto.randomUUID();
    await addUser(pg, user);
    await seedAccount(sqlRemote(user));
    const real = sqlRemote(user);
    let loseReply = false;
    const flaky: RemoteStore = {
      ...real,
      async insertIfAbsent(table, rows) {
        const res = await real.insertIfAbsent(table, rows);
        if (loseReply) {
          loseReply = false;
          throw new NetworkError('Failed to fetch');
        }
        return res;
      },
      async updateIfVersion(table, id, patch, version) {
        const res = await real.updateIfVersion(table, id, patch, version);
        if (loseReply) {
          loseReply = false;
          throw new NetworkError('Failed to fetch');
        }
        return res;
      },
    };
    const a = device(user, flaky);
    await a.sync();

    await a.act(() => toggleCompletion(walk, DATE));
    loseReply = true;
    await a.sync();
    expect(a.last().phase).toBe('offline');
    expect(await a.db().outbox.count()).toBe(1);

    await a.sync();
    expect(a.last().phase).toBe('saved');
    expect(await a.db().conflicts.count()).toBe(0);
    expect(await as(pg, user, 'select * from public.completions')).toHaveLength(1);

    await a.act(() => saveQuest({ ...SEED_QUESTS[0], name: 'Edited', archivedAt: null }));
    loseReply = true;
    await a.sync();
    await a.sync();
    expect(a.last().phase).toBe('saved');
    expect(await a.db().conflicts.count()).toBe(0);
  });

  it('an edit made while an upload is in flight is not lost', async () => {
    const user = crypto.randomUUID();
    await addUser(pg, user);
    await seedAccount(sqlRemote(user));
    const real = sqlRemote(user);
    let during: (() => Promise<unknown>) | null = null;
    const slow: RemoteStore = {
      ...real,
      async insertIfAbsent(table, rows) {
        const res = await real.insertIfAbsent(table, rows);
        const edit = during;
        during = null;
        if (edit) await edit(); // the user taps again before the reply arrives
        return res;
      },
    };
    const a = device(user, slow);
    await a.sync();
    await a.act(() => toggleCompletion(walk, DATE));
    during = () => toggleCompletion(walk, DATE);
    await a.sync();
    expect(await a.db().outbox.count()).toBe(1);
    await a.sync();
    expect(await a.db().outbox.count()).toBe(0);
    const rows = await as<{ deleted_at: string | null }>(pg, user, 'select deleted_at from public.completions');
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('rapid check, uncheck, check leaves exactly one completion', async () => {
    const { user, a } = await twoDevices();
    await a.act(() => toggleCompletion(walk, DATE));
    await a.act(() => toggleCompletion(walk, DATE));
    await a.act(() => toggleCompletion(walk, DATE));
    await a.sync();
    expect(await as(pg, user, 'select * from public.completions where deleted_at is null')).toHaveLength(1);
  });
});

describe('network failures', () => {
  const offline = (real: RemoteStore, state: { down: boolean }): RemoteStore => {
    const guard = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => async (...args: A) => {
      if (state.down) throw new NetworkError('Failed to fetch');
      return fn(...args);
    };
    return {
      insertIfAbsent: guard(real.insertIfAbsent),
      updateIfVersion: guard(real.updateIfVersion),
      get: guard(real.get),
      listSince: guard(real.listSince),
    };
  };

  it('keeps changes, never reports saved while offline, and uploads on reconnect', async () => {
    const user = crypto.randomUUID();
    await addUser(pg, user);
    await seedAccount(sqlRemote(user));
    const net = { down: false };
    const a = device(user, offline(sqlRemote(user), net));
    await a.sync();

    net.down = true;
    await a.act(() => toggleCompletion(walk, DATE));
    a.statuses.length = 0;
    await a.sync();
    expect(a.statuses.some((s) => s.phase === 'saved')).toBe(false);
    expect(a.last().phase).toBe('offline');
    expect(a.last().pending).toBe(1);
    expect(await a.db().completions.count()).toBe(1);
    expect(await as(pg, user, 'select * from public.completions')).toHaveLength(0);

    net.down = false;
    await a.sync();
    expect(a.last().phase).toBe('saved');
    expect(a.last().pending).toBe(0);
    expect(await as(pg, user, 'select * from public.completions')).toHaveLength(1);
  });

  it('reports a server rejection as an error and keeps the change queued', async () => {
    const { a } = await twoDevices();
    await a.act(() => saveQuest({ ...SEED_QUESTS[0], exp: -5, archivedAt: null }));
    await a.sync();
    expect(a.last().phase).toBe('error');
    expect(a.last().pending).toBe(1);
  });
});

describe('two devices editing the same thing', () => {
  it('an old device cannot silently overwrite a newer quest edit', async () => {
    const { user, a, b } = await twoDevices();
    await a.act(() => saveQuest({ ...SEED_QUESTS[0], name: 'Newer edit', archivedAt: null }));
    await a.sync();
    await b.act(() => saveQuest({ ...SEED_QUESTS[0], name: 'Stale edit', archivedAt: null }));
    await b.sync();

    const [row] = await as<{ name: string }>(pg, user, `select name from public.quests where id = $1`, [SEED_QUESTS[0].id]);
    expect(row.name).toBe('Newer edit');
    expect(b.last().phase).toBe('conflict');
    expect(b.last().conflicts).toBe(1);
    expect((await b.db().quests.get(SEED_QUESTS[0].id))?.name).toBe('Stale edit');
  });

  it('the user can keep the other device', async () => {
    const { a, b } = await twoDevices();
    await a.act(() => saveQuest({ ...SEED_QUESTS[0], name: 'Newer edit', archivedAt: null }));
    await a.sync();
    await b.act(() => saveQuest({ ...SEED_QUESTS[0], name: 'Stale edit', archivedAt: null }));
    await b.sync();
    const engine = new SyncEngine(b.db(), sqlRemote((await b.db().conflicts.toArray())[0].serverRow.user_id as string), () => {});
    await engine.keepOtherDevice(`quests|${SEED_QUESTS[0].id}`);
    expect((await b.db().quests.get(SEED_QUESTS[0].id))?.name).toBe('Newer edit');
    expect(await b.db().conflicts.count()).toBe(0);
    expect(await b.db().outbox.count()).toBe(0);
  });

  it('the user can keep this device', async () => {
    const { user, a, b } = await twoDevices();
    await a.act(() => saveQuest({ ...SEED_QUESTS[0], name: 'Newer edit', archivedAt: null }));
    await a.sync();
    await b.act(() => saveQuest({ ...SEED_QUESTS[0], name: 'Chosen edit', archivedAt: null }));
    await b.sync();
    await new SyncEngine(b.db(), sqlRemote(user), () => {}).keepThisDevice(`quests|${SEED_QUESTS[0].id}`);
    await a.sync();
    expect((await a.db().quests.get(SEED_QUESTS[0].id))?.name).toBe('Chosen edit');
  });

  it('a pull never erases an unsent local edit', async () => {
    const { user, a, b } = await twoDevices();
    await a.act(() => saveQuest({ ...SEED_QUESTS[0], name: 'Online', archivedAt: null }));
    await a.sync();
    await b.act(() => saveQuest({ ...SEED_QUESTS[0], name: 'Unsent', archivedAt: null }));
    await new SyncEngine(b.db(), sqlRemote(user), () => {}).pull();
    expect((await b.db().quests.get(SEED_QUESTS[0].id))?.name).toBe('Unsent');
    expect(await b.db().outbox.count()).toBe(1);
  });

  it('a pull does bring in other rows while an edit is unsent', async () => {
    const { user, a, b } = await twoDevices();
    await a.act(() => saveQuest({ ...SEED_QUESTS[1], name: 'Online', archivedAt: null }));
    await a.sync();
    await b.act(() => saveQuest({ ...SEED_QUESTS[0], name: 'Unsent', archivedAt: null }));
    await new SyncEngine(b.db(), sqlRemote(user), () => {}).pull();
    expect((await b.db().quests.get(SEED_QUESTS[1].id))?.name).toBe('Online');
  });

  it('for a completion, a later edit on the other device beats an older unsent one', async () => {
    const { user, a, b } = await twoDevices();
    await a.act(() => toggleCompletion(walk, DATE));
    await a.sync();
    await b.sync();

    await b.act(() => toggleCompletion(walk, DATE)); // older: unchecked, not sent yet
    await new Promise((r) => setTimeout(r, 10));
    await a.act(() => toggleCompletion(walk, DATE)); // newer: unchecked...
    await a.sync();
    await a.act(() => toggleCompletion(walk, DATE)); // ...and checked again
    await a.sync();

    await b.sync();
    await a.sync();
    const rows = await as<{ deleted_at: string | null }>(pg, user, 'select deleted_at from public.completions');
    expect(rows[0].deleted_at).toBeNull();
    expect(await b.db().completions.count()).toBe(1);
    expect(await b.db().outbox.count()).toBe(0);
    expect(await b.db().conflicts.count()).toBe(0);
  });

  it('for a completion, a later edit sent last still wins', async () => {
    const { user, a, b } = await twoDevices();
    await a.act(() => toggleCompletion(walk, DATE));
    await a.sync();
    await b.sync();

    await a.act(() => toggleCompletion(walk, DATE)); // uncheck, sent first
    await a.sync();
    await new Promise((r) => setTimeout(r, 10));
    await b.act(() => toggleCompletion(walk, DATE)); // b still saw it checked, so this unchecks too
    await b.act(() => toggleCompletion(walk, DATE)); // then checks it again, later than a
    await b.sync();
    await a.sync();

    const rows = await as<{ deleted_at: string | null }>(pg, user, 'select deleted_at from public.completions');
    expect(rows[0].deleted_at).toBeNull();
    expect(await a.db().completions.count()).toBe(1);
  });
});

describe('accounts are separate', () => {
  it('one account cannot see or change another through sync', async () => {
    const { user, a } = await twoDevices();
    await a.act(() => toggleCompletion(walk, DATE));
    await a.sync();

    const other = crypto.randomUUID();
    await addUser(pg, other);
    const stranger = sqlRemote(other);
    expect(await stranger.get('completions' as SyncTable, `phy-walk|${DATE}`)).toBeNull();
    expect(await stranger.listSince('completions', null, 0, 100)).toEqual([]);
    const patch: RemotePatch = { deleted_at: new Date().toISOString() };
    const stolen = await as(pg, other, `update public.completions set deleted_at = $1 where user_id = $2 returning *`, [patch.deleted_at, user]);
    expect(stolen).toEqual([]);
    expect(await accountIsEmpty(stranger)).toBe(true);
  });
});

describe('importing progress saved before accounts', () => {
  async function legacyDb(name: string) {
    const legacy = new SystemDB(name);
    await legacy.quests.bulkPut(SEED_QUESTS);
    await legacy.settings.put({ ...defaultSettings('2026-10-11'), hunterName: 'Local Hunter' });
    await legacy.completions.bulkPut(
      Array.from({ length: 30 }, (_, i) => ({
        id: `phy-walk|2026-10-${String(i + 1).padStart(2, '0')}`,
        questId: 'phy-walk',
        date: `2026-10-${String(i + 1).padStart(2, '0')}`,
        expAwarded: 20,
        stat: 'AGI' as const,
        category: 'Physical' as const,
        completedAt: '2026-10-01T00:00:00.000Z',
      })),
    );
    legacy.close();
  }

  it('imports, verifies, and leaves the local copy untouched', async () => {
    const user = crypto.randomUUID();
    await addUser(pg, user);
    const name = `legacy-${++counter}`;
    await legacyDb(name);
    expect(await readLocalSummary(name)).toMatchObject({ completions: 30, exp: 600 });

    await importLocalData(sqlRemote(user), () => {}, name);
    const a = device(user);
    await a.sync();
    expect(totalExp(await a.db().completions.toArray())).toBe(600);
    expect((await a.db().settings.get('settings'))?.hunterName).toBe('Local Hunter');

    const still = new SystemDB(name);
    expect(await still.completions.count()).toBe(30);
    still.close();
  });

  it('a retry after failing halfway creates no duplicates', async () => {
    const user = crypto.randomUUID();
    await addUser(pg, user);
    const name = `legacy-${++counter}`;
    await legacyDb(name);
    const real = sqlRemote(user);
    let calls = 0;
    const failing: RemoteStore = {
      ...real,
      insertIfAbsent(table, rows) {
        if (++calls === 2) throw new NetworkError('Failed to fetch');
        return real.insertIfAbsent(table, rows);
      },
    };
    await expect(importLocalData(failing, () => {}, name)).rejects.toThrow();
    await importLocalData(real, () => {}, name);
    await importLocalData(real, () => {}, name);
    expect(await as(pg, user, 'select * from public.completions')).toHaveLength(30);
    expect(await as(pg, user, 'select * from public.quests')).toHaveLength(27);
  });

  it('never overwrites newer data already online', async () => {
    const { user, a } = await twoDevices();
    await a.act(() => saveQuest({ ...SEED_QUESTS[0], name: 'Edited online', archivedAt: null }));
    await a.sync();
    const name = `legacy-${++counter}`;
    await legacyDb(name);
    await importLocalData(sqlRemote(user), () => {}, name);
    const [row] = await as<{ name: string }>(pg, user, 'select name from public.quests where id = $1', [SEED_QUESTS[0].id]);
    expect(row.name).toBe('Edited online');
  });

  it('reports nothing to import for an empty browser', async () => {
    expect(await readLocalSummary(`missing-${++counter}`)).toBeNull();
    expect(LEGACY_DB_NAME).toBe('the-system');
  });
});
