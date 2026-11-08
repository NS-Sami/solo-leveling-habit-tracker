/**
 * Full browser test of the built site, served from the GitHub Pages sub-path.
 *
 *   npm run build && npm run e2e
 *
 * Uses Microsoft Edge (BROWSER=chrome for Chrome), the real supabase-js client, and
 * real Postgres with the real migration and RLS. Supabase's HTTP layer is imitated by
 * scripts/mock-supabase.mjs, so this does not prove the hosted project's settings.
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMock } from './mock-supabase.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.E2E_BASE ?? '/solo-leveling-habit-tracker/';
const mock = await startMock({ dist: path.join(root, 'dist'), base: BASE, migration: path.join(root, 'supabase/migrations/0001_init.sql') });
const browser = await chromium.launch({ channel: process.env.BROWSER === 'chrome' ? 'chrome' : 'msedge' });

let passed = 0;
const diagnostics = {};
const failures = [];
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${String(err.message).split('\n').slice(0, 9).join('\n       ')}`);
    for (const [label, p] of Object.entries(diagnostics)) await p?.screenshot({ path: path.join(process.env.TEMP ?? '.', `e2e-${failures.length}-${label}.png`) }).catch(() => {});
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const DESKTOP = { viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' };

async function open(options = DESKTOP) {
  const ctx = await browser.newContext({ ...options, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  page.errors = [];
  page.on('pageerror', (e) => {
    page.errors.push(e.message);
    console.log(`       [page error] ${e.message} :: ${String(e.stack).split('\n').slice(0, 4).join(' | ')}`);
  });
  await page.goto(mock.url);
  return { ctx, page };
}

const badge = (page) => page.locator('header [role=status]');
const waitFor = (page, text, timeout = 15000) => page.getByText(text, { exact: false }).first().waitFor({ timeout });
const waitBadge = (page, text) =>
  page.waitForFunction(
    (t) => document.querySelector('header [role=status]')?.textContent?.includes(t),
    text,
    { timeout: 15000 },
  );
/** Lets the tap reach the sync engine, then waits for the server's confirmation. */
const saved = async (page) => {
  await page.waitForTimeout(100);
  await waitBadge(page, 'Saved');
};
const tab = (page, name) => page.getByRole('button', { name, exact: true }).first().click();
const check = (page, name) => page.getByRole('checkbox', { name, exact: true }).first();

async function signIn(page, email, password) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}
async function signUpConfirmed(page, email, password) {
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  await waitFor(page, 'Open the confirmation link');
  await page.goto('about:blank');
  await page.goto(mock.link(email, 'signup'));
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 1);
const serverRows = async (table, email) => {
  const id = mock.users.get(email).id;
  return (await mock.pg.query(`select * from public.${table} where user_id = $1`, [id])).rows;
};

const A = 'hunter-a@example.com';
const B = 'hunter-b@example.com';
const C = 'hunter-c@example.com';
const PASS = 'correct-horse-1';

console.log('\nAccounts');
const laptop = await open();
diagnostics.laptop = laptop.page;

await step('the sign-in screen appears at the Pages path, and fits a phone', async () => {
  await laptop.page.getByRole('heading', { name: 'Sign In' }).waitFor();
  const phone = await open(PHONE);
  await phone.page.getByRole('heading', { name: 'Sign In' }).waitFor();
  assert(await noOverflow(phone.page), 'sign-in page overflows on a phone');
  await phone.page.screenshot({ path: path.join(root, 'docs/screenshots/08-sign-in-mobile.png') });
  await phone.ctx.close();
});

await step('creating an account asks the user to confirm by email', async () => {
  const { page } = laptop;
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Email').fill(A);
  await page.getByLabel('Password').fill(PASS);
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  await waitFor(page, 'Open the confirmation link');
  assert(mock.mailbox.some((m) => m.to === A && m.redirect === mock.url), `redirect was ${mock.mailbox.at(-1)?.redirect}`);
});

await step('signing in before confirming shows a clear message', async () => {
  const { page } = laptop;
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await signIn(page, A, PASS);
  await waitFor(page, 'Please confirm your email');
});

await step('a wrong password is refused', async () => {
  mock.users.get(A).confirmed = true;
  await signIn(laptop.page, A, 'wrong-password');
  await waitFor(laptop.page, 'Email or password is incorrect');
  mock.users.get(A).confirmed = false;
});

await step('the emailed confirmation link signs in, and a new account gets 27 quests', async () => {
  const { page } = laptop;
  // A real link opens fresh; going to the same URL with a new #hash would not reload.
  await page.goto('about:blank');
  await page.goto(mock.link(A, 'signup'));
  await check(page, 'Morning Walk').waitFor({ timeout: 15000 });
  await waitBadge(page, 'Saved');
  assert((await serverRows('quests', A)).length === 27, 'quests not on the server');
  assert((await serverRows('user_settings', A))[0].timezone === 'Asia/Dhaka', 'default timezone wrong');
});

console.log('\nProgress');
await step('daily completion saves to the database and awards EXP once', async () => {
  const { page } = laptop;
  await check(page, 'Morning Walk').click();
  await waitFor(page, '+20');
  await saved(page);
  const rows = await serverRows('completions', A);
  assert(rows.length === 1 && rows[0].exp_awarded === 20, `rows: ${rows.length}`);
});

await step('"Saved" is never shown before the database confirms', async () => {
  const { page } = laptop;
  await page.evaluate(() => {
    window.__seen = [];
    new MutationObserver(() => window.__seen.push(document.querySelector('header [role=status]')?.textContent)).observe(document.querySelector('header'), { subtree: true, childList: true, characterData: true });
  });
  mock.net.down = true;
  await check(page, 'Daily Dhikr').click();
  await page.waitForTimeout(2500);
  const seen = await page.evaluate(() => window.__seen);
  mock.net.down = false;
  assert(!seen.slice(1).some((s) => s?.includes('Saved')), `saw Saved while the server was down: ${seen.join(' > ')}`);
  await page.getByRole('button', { name: 'Retry' }).click();
  await waitBadge(page, 'Saved');
});

await step('rapid repeat taps cannot award duplicate EXP', async () => {
  const { page } = laptop;
  const box = check(page, 'Make Bed');
  await box.evaluate((el) => {
    for (let i = 0; i < 5; i++) el.click();
  });
  await page.waitForTimeout(400);
  await waitBadge(page, 'Saved');
  const rows = (await serverRows('completions', A)).filter((r) => r.quest_id === 'rou-bed');
  assert(rows.length <= 1, `${rows.length} rows for one quest and day`);
});

await step('progress survives a refresh', async () => {
  const { page } = laptop;
  await page.reload();
  await check(page, 'Morning Walk').waitFor();
  assert((await check(page, 'Morning Walk').getAttribute('aria-checked')) === 'true', 'completion lost on refresh');
});

await step('a quest can be created, edited and deleted', async () => {
  const { page } = laptop;
  await tab(page, 'Quests');
  await page.getByRole('button', { name: 'New Quest' }).click();
  await page.getByLabel('Quest name').fill('<img src=x onerror="window.__xss=1">Pushups');
  await page.getByRole('button', { name: 'Save Quest' }).click();
  await page.getByText('Pushups').first().waitFor();
  await saved(page);
  assert((await serverRows('quests', A)).length === 28, 'new quest not saved');

  await page.getByRole('button', { name: /^Edit <img/ }).click();
  await page.getByLabel('Quest name').fill('<img src=x onerror="window.__xss=1">Pushups v2');
  await page.getByRole('button', { name: 'Save Quest' }).click();
  await page.getByText('Pushups v2').first().waitFor();
  await saved(page);
  assert((await serverRows('quests', A)).some((q) => q.name.endsWith('Pushups v2')), 'edit not saved');
  assert((await page.evaluate(() => window.__xss)) === undefined, 'user-entered HTML was executed');

  await page.getByRole('button', { name: /^Delete <img/ }).click();
  await page.getByText('Delete quest permanently?').waitFor();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await saved(page);
  const gone = (await serverRows('quests', A)).find((q) => q.name.endsWith('Pushups v2'));
  assert(gone?.deleted_at, 'delete not recorded on the server');
  await tab(page, 'Today');
});

console.log('\nTwo devices');
const phone = await open(PHONE);
diagnostics.phone = phone.page;

await step('signing in on a second device loads the same progress', async () => {
  const { page } = phone;
  await signIn(page, A, PASS);
  await check(page, 'Morning Walk').waitFor({ timeout: 15000 });
  assert((await check(page, 'Morning Walk').getAttribute('aria-checked')) === 'true', 'second device did not get the completion');
  assert(await noOverflow(page), 'app overflows on a phone');
});

await step('a change on the phone reaches the laptop after refresh', async () => {
  await check(phone.page, 'Drink 3L Water').click();
  await saved(phone.page);
  await laptop.page.reload();
  await check(laptop.page, 'Drink 3L Water').waitFor();
  await laptop.page.waitForFunction(() => document.querySelector('[role=checkbox][aria-label="Drink 3L Water"]')?.getAttribute('aria-checked') === 'true', null, { timeout: 15000 });
});

await step('a level-up from another device does not pop up a false celebration', async () => {
  assert((await laptop.page.getByText('LEVEL UP!').count()) === 0, 'popup appeared for synced data');
});

await step('offline: changes queue, are explained, and upload on reconnect', async () => {
  const { page, ctx } = laptop;
  await ctx.setOffline(true);
  await check(page, 'No Sugar').click();
  await waitFor(page, 'stay on this device');
  await waitBadge(page, 'Offline');
  assert((await serverRows('completions', A)).every((r) => r.quest_id !== 'hea-nosugar'), 'should not be online yet');
  await page.reload().catch(() => {});
  await ctx.setOffline(false);
  await page.goto(mock.url);
  await check(page, 'No Sugar').waitFor();
  await waitBadge(page, 'Saved');
  assert((await serverRows('completions', A)).some((r) => r.quest_id === 'hea-nosugar'), 'queued change never uploaded');
});

await step('two devices editing one quest: nothing is overwritten, and the user chooses', async () => {
  await phone.page.reload();
  await check(phone.page, 'Morning Walk').waitFor();
  await waitBadge(phone.page, 'Saved');
  await phone.ctx.setOffline(true);

  await tab(laptop.page, 'Quests');
  await laptop.page.getByRole('button', { name: 'Edit Make Bed' }).click();
  await laptop.page.getByLabel('Quest name').fill('Make Bed (laptop)');
  await laptop.page.getByRole('button', { name: 'Save Quest' }).click();
  await saved(laptop.page);

  await tab(phone.page, 'Quests');
  await phone.page.getByRole('button', { name: 'Edit Make Bed' }).click();
  await phone.page.getByLabel('Quest name').fill('Make Bed (phone)');
  // Would fail if the phone navigation covered the dialog's button.
  await phone.page.getByRole('button', { name: 'Save Quest' }).click();
  await phone.ctx.setOffline(false);
  await phone.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitFor(phone.page, 'changed on two devices');

  const server = (await serverRows('quests', A)).find((q) => q.id === 'rou-bed');
  assert(server.name === 'Make Bed (laptop)', `server became ${server.name}`);
  await phone.page.getByRole('button', { name: 'Review' }).click();
  await phone.page.getByText('Make Bed (phone)').last().waitFor();
  await phone.page.getByRole('button', { name: 'Keep other device' }).click();
  await saved(phone.page);
  await phone.page.getByText('Make Bed (laptop)').first().waitFor();
  await tab(phone.page, 'Today');
  await tab(laptop.page, 'Today');
});

console.log('\nData safety');
await step('the second account sees nothing from the first', async () => {
  const other = await open();
  await signUpConfirmed(other.page, B, PASS);
  await check(other.page, 'Morning Walk').waitFor({ timeout: 15000 });
  assert((await check(other.page, 'Morning Walk').getAttribute('aria-checked')) === 'false', 'second account sees first account data');

  const stolen = await other.page.evaluate(
    async ({ origin, key, token, victim }) => {
      const headers = { apikey: key, Authorization: `Bearer ${token}`, 'content-type': 'application/json', Prefer: 'return=representation' };
      const read = await (await fetch(`${origin}/rest/v1/completions?select=*&user_id=eq.${victim}`, { headers })).json();
      const write = await (await fetch(`${origin}/rest/v1/completions?user_id=eq.${victim}`, { method: 'PATCH', headers, body: JSON.stringify({ exp_awarded: 99999 }) })).json();
      const del = await (await fetch(`${origin}/rest/v1/quests?user_id=eq.${victim}`, { method: 'DELETE', headers })).json();
      const insert = await fetch(`${origin}/rest/v1/day_meta`, { method: 'POST', headers, body: JSON.stringify({ user_id: victim, id: '2026-01-01', rest_day: true }) });
      return { read, write, del, insertStatus: insert.status };
    },
    { origin: mock.origin, key: mock.publishableKey, token: mock.token(B), victim: mock.users.get(A).id },
  );
  assert(stolen.read.length === 0, 'read another account');
  assert(stolen.write.length === 0, 'updated another account');
  assert(stolen.del.length === 0, 'deleted another account');
  assert(stolen.insertStatus === 403, `insert into another account returned ${stolen.insertStatus}`);
  assert((await serverRows('completions', A)).every((r) => r.exp_awarded < 1000), 'first account was changed');
  assert((await serverRows('quests', A)).length === 28, 'first account lost quests');
  await other.ctx.close();
});

await step('JSON export downloads the account records', async () => {
  const { page } = laptop;
  await tab(page, 'Settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const file = await download;
  const data = JSON.parse(readFileSync(await file.path(), 'utf8'));
  assert(data.app === 'the-system' && data.completions.length >= 3 && data.quests.length >= 27, 'export is incomplete');
});

await step('sign out returns to sign-in and keeps data safe on the server', async () => {
  const { page } = laptop;
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('heading', { name: 'Sign In' }).waitFor({ timeout: 15000 });
  await signIn(page, A, PASS);
  await tab(page, 'Today');
  await check(page, 'Morning Walk').waitFor({ timeout: 15000 });
  assert((await check(page, 'Morning Walk').getAttribute('aria-checked')) === 'true', 'progress missing after signing back in');
});

await step('password reset: link, new password, old one stops working', async () => {
  const fresh = await open();
  const { page } = fresh;
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(A);
  await page.getByRole('button', { name: 'Send Reset Link' }).click();
  await waitFor(page, 'reset link is on its way');
  await page.goto('about:blank');
  await page.goto(mock.link(A, 'recovery'));
  await page.getByLabel('New password', { exact: true }).fill('brand-new-pass-2');
  await page.getByLabel('Repeat new password').fill('brand-new-pass-2');
  await page.getByRole('button', { name: 'Save New Password' }).click();
  await check(page, 'Morning Walk').waitFor({ timeout: 15000 });
  assert(mock.users.get(A).password === 'brand-new-pass-2', 'password not changed');
  await fresh.ctx.close();
});

await step('local progress imports only after approval, with no duplicates, and the local copy remains', async () => {
  const { page, ctx } = await open();
  await page.getByRole('button', { name: 'Continue without an account' }).click();
  await check(page, 'Morning Walk').waitFor();
  await check(page, 'Morning Walk').click();
  await check(page, 'Daily Dhikr').click();
  await page.waitForTimeout(300);
  await tab(page, 'Settings');
  await page.getByRole('button', { name: 'Sign in or create account' }).click();
  await page.getByRole('heading', { name: 'Sign In' }).waitFor();
  await signUpConfirmed(page, C, PASS);
  await page.getByRole('heading', { name: 'Import Progress' }).waitFor({ timeout: 15000 });
  assert((await serverRows('completions', C)).length === 0, 'imported without approval');
  await page.getByRole('button', { name: 'Import to My Account' }).click();
  await tab(page, 'Today');
  await check(page, 'Morning Walk').waitFor({ timeout: 15000 });
  await saved(page);
  assert((await serverRows('completions', C)).length === 2, 'import count wrong');
  assert((await serverRows('quests', C)).length === 27, 'quests wrong');
  const local = await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('the-system');
        r.onsuccess = () => {
          const c = r.result.transaction('completions').objectStore('completions').count();
          c.onsuccess = () => res(c.result);
        };
      }),
  );
  assert(local === 2, `local copy has ${local} rows`);
  await ctx.close();
});

await step('reset asks for confirmation, then clears the account on every device', async () => {
  const { page } = phone;
  await tab(page, 'Settings');
  await page.getByRole('button', { name: 'Reset everything' }).click();
  await page.getByText('in your account, on all your devices').waitFor();
  await page.getByRole('button', { name: 'Erase & reset' }).click();
  await saved(page);
  const live = (await serverRows('completions', A)).filter((r) => !r.deleted_at);
  assert(live.length === 0, `${live.length} completions survived`);
  await laptop.page.reload();
  await tab(laptop.page, 'Today');
  await check(laptop.page, 'Morning Walk').waitFor();
  await laptop.page.waitForFunction(() => document.querySelector('[role=checkbox][aria-label="Morning Walk"]')?.getAttribute('aria-checked') === 'false', null, { timeout: 15000 });
});

console.log('\nDeployment');
await step('every asset loads from the repository sub-path with exact filename case', async () => {
  const shots = await open();
  await shots.page.goto(`${mock.url}?demo=1`);
  await shots.page.waitForTimeout(1500);
  await shots.ctx.close();
  const local = mock.assets.missing.filter((p) => !p.endsWith('favicon.ico'));
  assert(local.length === 0, `missing: ${[...new Set(local)].join(', ')}`);
  assert(mock.assets.requested.includes('config.js'), 'config.js never requested');
  const html = readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const manifest = JSON.parse(readFileSync(path.join(root, 'dist/manifest.webmanifest'), 'utf8'));
  const linked = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('http'));
  for (const rel of [...linked, 'manifest.webmanifest', ...manifest.icons.map((i) => i.src)]) {
    const res = await fetch(new URL(rel, mock.url));
    assert(res.ok, `${rel} returned ${res.status}`);
  }
  assert(!/(src|href)="\/(?!\/)/.test(html), 'index.html has an absolute path that breaks under a sub-path');
  assert(!/localhost/.test(html), 'index.html mentions localhost');
});

await step('demo mode never touches an account', async () => {
  const before = mock.mailbox.length;
  const demo = await open();
  await demo.page.goto(`${mock.url}?demo=1`);
  await check(demo.page, 'Morning Walk').waitFor({ timeout: 15000 });
  await badge(demo.page).filter({ hasText: 'This device only' }).waitFor();
  assert(mock.mailbox.length === before, 'demo sent mail');
  await demo.ctx.close();
});

await step('no uncaught errors in the pages used', async () => {
  const errs = [...laptop.page.errors, ...phone.page.errors];
  assert(errs.length === 0, errs.join(' | '));
});

await browser.close();
await mock.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(`Failed: ${failures.join('; ')}`);
  process.exit(1);
}
process.exit(0);
