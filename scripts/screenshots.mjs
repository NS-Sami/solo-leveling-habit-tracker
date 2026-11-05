/**
 * Capture README / LinkedIn screenshots of the production build in demo mode.
 *
 *   npm run build && npm run screenshots
 *
 * Uses the locally installed Microsoft Edge (or Chrome via BROWSER=chrome) through
 * playwright-core, so no browser download is needed.
 */
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'screenshots');
await mkdir(out, { recursive: true });

const server = await preview({ root, preview: { port: 4174, strictPort: false } });
const url = server.resolvedUrls.local[0];
console.log('preview at', url);

const browser = await chromium.launch({ channel: process.env.BROWSER === 'chrome' ? 'chrome' : 'msedge' });

async function shoot(name, viewport, tab, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.scale ?? 2, isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  const page = await ctx.newPage();
  await page.goto(`${url}?demo=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=THE SYSTEM');
  if (tab !== 'Today') {
    await page.getByRole('button', { name: tab, exact: true }).first().click();
  }
  await page.waitForTimeout(1400); // let charts animate in
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) console.warn(`⚠ ${name}: page overflows horizontally by ${overflow}px`);
  if (opts.before) await opts.before(page);
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: !!opts.fullPage });
  console.log('✓', name);
  await ctx.close();
}

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };

await shoot('01-today-desktop', desktop, 'Today', { fullPage: true, scale: 1.5 });
await shoot('02-grid-desktop', desktop, 'Grid', { fullPage: true, scale: 1.5 });
await shoot('03-stats-desktop', desktop, 'Stats', { fullPage: true, scale: 1.5 });
await shoot('04-quests-desktop', desktop, 'Quests', { scale: 1.5 });
await shoot('05-today-mobile', mobile, 'Today', { mobile: true, scale: 3 });
await shoot('06-grid-mobile', mobile, 'Grid', { mobile: true, scale: 3 });
await shoot('07-levelup', desktop, 'Today', {
  scale: 1.5,
  // Top EXP up to 5 below the next level (one synthetic completion), reload,
  // then tick a real quest so the genuine level-up flow fires.
  before: async (page) => {
    const txt = await page.locator('text=/\\d[\\d,]* \\/ [\\d,]+ EXP/').first().innerText();
    const [cur, next] = txt.replace(/,/g, '').match(/\d+/g).map(Number);
    const deficit = next - cur - 5;
    await page.evaluate(
      (exp) =>
        new Promise((res, rej) => {
          const req = indexedDB.open('the-system-demo');
          req.onsuccess = () => {
            const tx = req.result.transaction('completions', 'readwrite');
            tx.objectStore('completions').put({ id: 'screenshot-bonus|2020-01-01', questId: 'screenshot-bonus', date: '2020-01-01', expAwarded: exp, stat: 'INT', category: 'Intellectual', completedAt: '' });
            tx.oncomplete = () => res(true);
            tx.onerror = () => rej(tx.error);
          };
        }),
      deficit,
    );
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('text=THE SYSTEM');
    await page.waitForTimeout(600);
    await page.locator('[role="checkbox"][aria-checked="false"]').first().click({ force: true });
    await page.waitForSelector('text=/LEVEL UP!|RANK UP!/');
    await page.waitForTimeout(1100);
  },
});

await browser.close();
server.httpServer.close();
console.log('screenshots saved to', out);
