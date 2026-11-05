/**
 * Local stand-in for Supabase, used only by scripts/e2e-cloud.mjs.
 *
 * Real: Postgres (PGlite), the real migration, real RLS, the real supabase-js client.
 * Fake: this HTTP layer. It imitates the Auth and PostgREST routes the app calls, so a
 * pass here does NOT prove the hosted Supabase project is configured correctly.
 *
 * It also serves dist/ at the GitHub Pages sub-path with case-sensitive file lookup,
 * which Windows would otherwise hide.
 */
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { SUPABASE_STUBS } from '../supabase/testdb.ts';

const TABLES = new Set(['quests', 'completions', 'day_meta', 'user_settings']);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const PUBLISHABLE_KEY = 'sb_publishable_e2e_test';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (user) => `${b64({ alg: 'none' })}.${b64({ sub: user.id, role: 'authenticated', email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const claims = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  } catch {
    return null;
  }
};
const ident = (c) => {
  if (!/^[a-z_]+$/.test(c)) throw new Error(`bad column ${c}`);
  return `"${c}"`;
};
const bind = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);

function walk(dir, root = dir, out = new Set()) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, root, out);
    else out.add(path.relative(root, p).split(path.sep).join('/'));
  }
  return out;
}

export async function startMock({ dist, base, migration }) {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUBS);
  await pg.exec(readFileSync(migration, 'utf8'));

  const users = new Map(); // email -> user
  const mailbox = [];
  const assets = { requested: [], missing: [] };
  const files = walk(dist);
  const net = { down: false };

  const as = (userId, sql, params) =>
    pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
      await tx.exec('set local role authenticated');
      return (await tx.query(sql, params)).rows.map((r) => r.row);
    });

  const session = (user) => ({ access_token: jwt(user), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r-${user.id}`, user: publicUser(user) });
  const publicUser = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.confirmed ? new Date().toISOString() : null, created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, identities: [{ id: u.id }] });

  async function auth(req, res, url, body, send) {
    const route = url.pathname.replace('/auth/v1/', '');
    const redirect = url.searchParams.get('redirect_to') ?? body.options?.email_redirect_to;
    if (route === 'signup') {
      if (users.has(body.email)) return send(200, { ...publicUser(users.get(body.email)), identities: [] });
      const user = { id: randomUUID(), email: body.email, password: body.password, confirmed: false };
      users.set(body.email, user);
      await pg.query('insert into auth.users (id, email) values ($1, $2)', [user.id, user.email]);
      mailbox.push({ to: body.email, type: 'signup', redirect });
      return send(200, publicUser(user));
    }
    if (route === 'token') {
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const user = [...users.values()].find((u) => `r-${u.id}` === body.refresh_token);
        return user ? send(200, session(user)) : send(400, { error_code: 'invalid_grant', msg: 'Invalid Refresh Token' });
      }
      const user = users.get(body.email);
      if (!user || user.password !== body.password) return send(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      if (!user.confirmed) return send(400, { error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
      return send(200, session(user));
    }
    if (route === 'recover') {
      if (users.has(body.email)) mailbox.push({ to: body.email, type: 'recovery', redirect });
      return send(200, {});
    }
    const token = req.headers.authorization?.replace('Bearer ', '');
    const who = token && claims(token);
    const user = who && [...users.values()].find((u) => u.id === who.sub);
    if (route === 'user') {
      if (!user) return send(401, { msg: 'invalid JWT' });
      if (req.method === 'PUT') user.password = body.password ?? user.password;
      return send(200, publicUser(user));
    }
    if (route === 'logout') return send(204, null);
    return send(404, { msg: `no route ${route}` });
  }

  /** Mirrors the PostgREST filters supabase-js sends. */
  function filters(url, startAt) {
    const where = [];
    const params = [];
    for (const [k, v] of url.searchParams) {
      if (['select', 'order', 'offset', 'limit', 'on_conflict', 'columns'].includes(k)) continue;
      const m = v.match(/^(eq|gte)\.(.*)$/s);
      if (!m) throw new Error(`unsupported filter ${k}=${v}`);
      params.push(m[2]);
      where.push(`${ident(k)}${k === 'version' ? '' : '::text'} ${m[1] === 'eq' ? '=' : '>='} $${startAt + params.length - 1}${k === 'version' ? '::int' : ''}`);
    }
    return { where, params };
  }

  async function rest(req, res, url, body, send) {
    const table = url.pathname.replace('/rest/v1/', '');
    if (!TABLES.has(table)) return send(404, { message: 'no table' });
    if (req.headers.apikey !== PUBLISHABLE_KEY) return send(401, { message: 'Invalid API key' });
    const token = req.headers.authorization?.replace('Bearer ', '');
    const who = token && claims(token);
    if (!who?.sub) return send(401, { code: 'PGRST301', message: 'JWT required' });

    try {
      if (req.method === 'GET') {
        const { where, params } = filters(url, 1);
        const timeFilter = where.map((w) => w.replace('"updated_at"::text >= $', '"updated_at" >= $').replace(/("updated_at" >= \$\d+)/, '$1::timestamptz'));
        const order = (url.searchParams.get('order') ?? 'id.asc').split(',').map((o) => `${ident(o.split('.')[0])} ${o.split('.')[1] === 'desc' ? 'desc' : 'asc'}`).join(', ');
        const limit = Number(url.searchParams.get('limit') ?? 1000);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const rows = await as(who.sub, `select to_jsonb(t.*) as row from public.${table} t ${timeFilter.length ? `where ${timeFilter.join(' and ')}` : ''} order by ${order} limit ${limit} offset ${offset}`, params);
        return send(200, rows);
      }
      if (req.method === 'POST') {
        const out = [];
        for (const row of Array.isArray(body) ? body : [body]) {
          const cols = Object.keys(row);
          const ignore = (req.headers.prefer ?? '').includes('ignore-duplicates') ? 'on conflict (user_id, id) do nothing' : '';
          out.push(...(await as(who.sub, `insert into public.${table} (${cols.map(ident).join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) ${ignore} returning to_jsonb(${table}.*) as row`, cols.map((c) => bind(row[c])))));
        }
        return send(201, out);
      }
      if (req.method === 'PATCH') {
        const cols = Object.keys(body);
        const { where, params } = filters(url, cols.length + 1);
        const sql = `update public.${table} set ${cols.map((c, i) => `${ident(c)} = $${i + 1}`).join(',')} where ${where.join(' and ')} returning to_jsonb(${table}.*) as row`;
        return send(200, await as(who.sub, sql, [...cols.map((c) => bind(body[c])), ...params]));
      }
      if (req.method === 'DELETE') {
        const { where, params } = filters(url, 1);
        return send(200, await as(who.sub, `delete from public.${table} where ${where.join(' and ')} returning to_jsonb(${table}.*) as row`, params));
      }
      return send(405, { message: 'method' });
    } catch (err) {
      const rls = /row-level security/.test(err.message);
      return send(rls ? 403 : 400, { code: rls ? '42501' : (err.code ?? 'P0001'), message: err.message });
    }
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const send = (status, data) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(data === null ? undefined : JSON.stringify(data));
      };
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {};
      try {
        if (url.pathname.startsWith('/auth/v1/') || url.pathname.startsWith('/rest/v1/')) {
          if (net.down) return req.socket.destroy();
          return url.pathname.startsWith('/auth/') ? await auth(req, res, url, body, send) : await rest(req, res, url, body, send);
        }
        if (!url.pathname.startsWith(base)) {
          assets.missing.push(url.pathname);
          res.writeHead(404);
          return res.end('outside the repository path');
        }
        const rel = url.pathname.slice(base.length) || 'index.html';
        assets.requested.push(rel);
        if (rel === 'config.js') {
          res.writeHead(200, { 'content-type': 'text/javascript' });
          return res.end(`window.SYSTEM_CONFIG = { supabaseUrl: 'http://localhost:${server.address().port}', supabasePublishableKey: '${PUBLISHABLE_KEY}' };`);
        }
        if (!files.has(rel)) {
          assets.missing.push(rel);
          res.writeHead(404);
          return res.end('not found (case-sensitive)');
        }
        res.writeHead(200, { 'content-type': MIME[path.extname(rel)] ?? 'application/octet-stream' });
        res.end(readFileSync(path.join(dist, rel)));
      } catch (err) {
        send(500, { message: err.message });
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  return {
    pg,
    net,
    assets,
    users,
    mailbox,
    url: `http://localhost:${port}${base}`,
    origin: `http://localhost:${port}`,
    publishableKey: PUBLISHABLE_KEY,
    token: (email) => jwt(users.get(email)),
    /** What clicking the newest emailed link would open. */
    link(email, type) {
      const mail = [...mailbox].reverse().find((m) => m.to === email && m.type === type);
      const user = users.get(email);
      if (type === 'signup') user.confirmed = true;
      const s = session(user);
      return `${mail.redirect}#access_token=${s.access_token}&expires_at=${s.expires_at}&expires_in=3600&refresh_token=${s.refresh_token}&token_type=bearer&type=${type}`;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}
