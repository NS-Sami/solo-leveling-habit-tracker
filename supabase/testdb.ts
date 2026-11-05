/**
 * Test helper: boots real Postgres (PGlite, WebAssembly) with the same roles and
 * auth.uid() that Supabase provides, then runs the actual migration file.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION = fileURLToPath(new URL('./migrations/0001_init.sql', import.meta.url));

export const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

export async function createTestDb(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUBS);
  await pg.exec(readFileSync(MIGRATION, 'utf8'));
  return pg;
}

export async function addUser(pg: PGlite, id: string) {
  await pg.query('insert into auth.users (id) values ($1)', [id]);
}

/** Run a query exactly as a signed-in user (or `null` for an anonymous visitor). */
export async function as<T = Record<string, unknown>>(pg: PGlite, userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' })]);
    await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
    const res = await tx.query<T>(sql, params);
    return res.rows;
  }) as Promise<T[]>;
}
