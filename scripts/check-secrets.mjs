/**
 * Stops the build if a Supabase SECRET key is in any file that gets published.
 * Runs as part of `npm run build`, so it protects every host (Cloudflare, GitHub Pages, ...).
 *
 * The publishable key (sb_publishable_...) is fine: it is meant to be public.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = ['public', 'src', 'index.html'];
const PATTERN = /sb_secret_[A-Za-z0-9]|service_role["']?\s*[:=].*eyJ|eyJ[\w-]+\.eyJ[\w-]*InNlcnZpY2Vfcm9sZS/;

function files(p) {
  const full = path.join(root, p);
  if (statSync(full).isFile()) return [p];
  return readdirSync(full).flatMap((f) => files(path.join(p, f)));
}

const found = SCAN.flatMap(files)
  .filter((f) => !f.endsWith('.test.ts'))
  .filter((f) => PATTERN.test(readFileSync(path.join(root, f), 'utf8')));

if (found.length) {
  console.error(`\n✖ A Supabase SECRET key was found in: ${found.join(', ')}`);
  console.error('  These files are published to every visitor. Remove the key, then rotate it');
  console.error('  in Supabase (Project Settings > API Keys). Use the publishable key instead.\n');
  process.exit(1);
}
console.log('✓ No secret keys in published files');
