/**
 * Runs the real migration on real Postgres and attacks it as a second account.
 * This proves the SQL and the policies, not the hosted Supabase project itself.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { addUser, as, createTestDb } from './testdb';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const TABLES = ['quests', 'completions', 'day_meta', 'user_settings'];

let pg: PGlite;

const insertQuest = (user: string | null, owner: string, id = 'q1', exp = 20) =>
  as(pg, user, `insert into public.quests (user_id, id, name, category, stat, exp, difficulty) values ($1, $2, 'Walk', 'Physical', 'AGI', $3, 'Normal') returning *`, [owner, id, exp]);

const insertCompletion = (user: string, id: string, questId: string, date: string) =>
  as(pg, user, `insert into public.completions (user_id, id, quest_id, date, exp_awarded, stat, category) values ($1, $2, $3, $4, 20, 'AGI', 'Physical') returning *`, [user, id, questId, date]);

beforeAll(async () => {
  pg = await createTestDb();
  await addUser(pg, A);
  await addUser(pg, B);
  await insertQuest(A, A);
  await insertCompletion(A, 'q1|2026-11-05', 'q1', '2026-11-05');
  await as(pg, A, `insert into public.day_meta (user_id, id, rest_day) values ($1, '2026-11-05', true)`, [A]);
  await as(pg, A, `insert into public.user_settings (user_id, data) values ($1, '{"hunterName":"A"}')`, [A]);
}, 60_000);

describe('migration', () => {
  it('can be run a second time without errors or data loss', async () => {
    const sql = readFileSync(fileURLToPath(new URL('./migrations/0001_init.sql', import.meta.url)), 'utf8');
    await pg.exec(sql);
    const rows = await as(pg, A, 'select id from public.quests');
    expect(rows).toHaveLength(1);
  });

  it('has RLS enabled with all four policies on every user table', async () => {
    const tables = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    );
    expect(tables.rows.map((t) => t.relname).sort()).toEqual([...TABLES].sort());
    expect(tables.rows.every((t) => t.relrowsecurity)).toBe(true);
    const policies = await pg.query<{ tablename: string; cmd: string }>(`select tablename, cmd from pg_policies where schemaname = 'public'`);
    for (const t of TABLES) {
      expect(policies.rows.filter((p) => p.tablename === t).map((p) => p.cmd).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    }
  });
});

describe('a second account cannot touch the first account', () => {
  for (const table of TABLES) {
    it(`cannot read ${table}`, async () => {
      expect(await as(pg, B, `select * from public.${table}`)).toEqual([]);
      expect(await as(pg, B, `select * from public.${table} where user_id = $1`, [A])).toEqual([]);
    });
    it(`cannot update ${table}`, async () => {
      expect(await as(pg, B, `update public.${table} set deleted_at = now() where user_id = $1 returning *`, [A])).toEqual([]);
      const owner = await as<{ deleted_at: string | null }>(pg, A, `select deleted_at from public.${table}`);
      expect(owner[0].deleted_at).toBeNull();
    });
    it(`cannot delete ${table}`, async () => {
      expect(await as(pg, B, `delete from public.${table} where user_id = $1 returning *`, [A])).toEqual([]);
      expect(await as(pg, A, `select * from public.${table}`)).toHaveLength(1);
    });
  }

  it('cannot insert rows into the first account', async () => {
    await expect(insertQuest(B, A, 'planted')).rejects.toThrow(/row-level security/);
    expect((await as<{ id: string }>(pg, A, 'select id from public.quests')).map((r) => r.id)).toEqual(['q1']);
  });

  it('cannot move its own row into the first account', async () => {
    await insertQuest(B, B, 'mine');
    await as(pg, B, `update public.quests set user_id = $1 where id = 'mine'`, [A]);
    expect((await as<{ id: string }>(pg, A, 'select id from public.quests')).map((r) => r.id)).toEqual(['q1']);
    expect((await as<{ user_id: string }>(pg, B, `select user_id from public.quests where id = 'mine'`))[0].user_id).toBe(B);
  });

  it('can own a row with the same id as the first account', async () => {
    const [row] = await insertQuest(B, B, 'q1');
    expect(row).toBeTruthy();
  });
});

describe('visitors who are not signed in', () => {
  for (const table of TABLES) {
    it(`have no access to ${table}`, async () => {
      await expect(as(pg, null, `select * from public.${table}`)).rejects.toThrow(/permission denied/);
    });
  }
  it('cannot insert', async () => {
    await expect(insertQuest(null, A, 'anon')).rejects.toThrow(/permission denied/);
  });
});

describe('data integrity', () => {
  it('rejects a second completion of the same quest on the same day, even with a different id', async () => {
    await expect(insertCompletion(A, 'different-id', 'q1', '2026-11-05')).rejects.toThrow(/duplicate key/);
    expect(await as(pg, A, 'select * from public.completions')).toHaveLength(1);
  });

  it('ignores a retried insert instead of duplicating it', async () => {
    const retry = await as(pg, A, `insert into public.quests (user_id, id, name, category, stat, exp, difficulty) values ($1, 'q1', 'Changed', 'Physical', 'AGI', 99, 'Normal') on conflict (user_id, id) do nothing returning *`, [A]);
    expect(retry).toEqual([]);
    expect((await as<{ name: string }>(pg, A, `select name from public.quests where id = 'q1'`))[0].name).toBe('Walk');
  });

  it('bumps version on update and refuses a client-supplied version', async () => {
    await insertQuest(A, A, 'v1');
    const [updated] = await as<{ version: number }>(pg, A, `update public.quests set name = 'New', version = 999 where id = 'v1' returning version`);
    expect(updated.version).toBe(2);
  });

  it('applies an update only when the version the device saw is still current', async () => {
    await insertQuest(A, A, 'v2');
    const first = await as(pg, A, `update public.quests set name = 'Device 1' where id = 'v2' and version = 1 returning *`);
    const stale = await as(pg, A, `update public.quests set name = 'Device 2' where id = 'v2' and version = 1 returning *`);
    expect(first).toHaveLength(1);
    expect(stale).toEqual([]);
  });

  it('rejects values outside the allowed ranges', async () => {
    await expect(insertQuest(A, A, 'bad', -5)).rejects.toThrow(/check constraint/);
  });
});
