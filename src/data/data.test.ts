import { describe, expect, it } from 'vitest';
import { buildCompletions, parseCsv, previewImport } from './csvImport';
import { SEED_QUESTS } from './seed';
import { detectMediaType, facebookEmbedUrl, safeHttpUrl, youtubeId } from '../lib/media';
import { checkConfig } from '../config';

const T = 'TRUE';
const F = 'FALSE';
const row = (cat: string, name: string, exp: number, checks: string[]) => [cat, name, exp, ...checks, checks.filter((c) => c === T).length, 0].join(',');

describe('Google Sheets CSV import', () => {
  it('parses quoted cells', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('matches renamed sheet rows to quests and maps checkboxes to dates', () => {
    const checks = Array.from({ length: 28 }, (_, i) => (i === 0 || i === 27 ? T : F));
    const csv = [
      'Quest Category,Quest Name,EXP Reward,Sun,Mon,Tue',
      row('Physical', 'Isometric Split Executed (training day only)', 15, checks),
      row('Intellectual', '"AWS(visit,like,comment-90), (publish,vote)"', 15, checks),
      row('Other', 'Totally unknown habit', 10, checks),
    ].join('\n');
    const preview = previewImport(csv, SEED_QUESTS);
    expect(preview).toHaveLength(3);
    expect(preview[0].quest?.id).toBe('phy-isosplit');
    expect(preview[1].quest?.id).toBe('int-awscomm');
    expect(preview[2].quest).toBeNull();
    const comps = buildCompletions(preview, '2026-10-11');
    expect(comps).toHaveLength(4);
    expect(comps.map((c) => c.date)).toContain('2026-11-07');
    expect(comps[0].expAwarded).toBe(15);
  });
});

describe('link safety', () => {
  it('only allows http and https links', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
  it('rejects YouTube ids that could break out of the embed URL', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=abc"><script>')).toBeNull();
  });
});

describe('frontend config', () => {
  it('runs local-only when empty', () => {
    expect(checkConfig({ supabaseUrl: '', supabasePublishableKey: '' }).state).toBe('local');
    expect(checkConfig(undefined).state).toBe('local');
  });
  it('accepts a project URL and publishable key', () => {
    expect(checkConfig({ supabaseUrl: 'https://abc.supabase.co/', supabasePublishableKey: 'sb_publishable_x' })).toEqual({ state: 'cloud', config: { url: 'https://abc.supabase.co', key: 'sb_publishable_x' } });
  });
  it('refuses secret keys, including legacy service_role JWTs', () => {
    expect(checkConfig({ supabaseUrl: 'https://abc.supabase.co', supabasePublishableKey: 'sb_secret_x' }).state).toBe('invalid');
    const jwt = `x.${btoa(JSON.stringify({ role: 'service_role' }))}.y`;
    expect(checkConfig({ supabaseUrl: 'https://abc.supabase.co', supabasePublishableKey: jwt }).state).toBe('invalid');
  });
  it('refuses placeholders and plain http', () => {
    expect(checkConfig({ supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co', supabasePublishableKey: 'sb_publishable_YOUR-PUBLISHABLE-KEY' }).state).toBe('invalid');
    expect(checkConfig({ supabaseUrl: 'http://abc.supabase.co', supabasePublishableKey: 'sb_publishable_x' }).state).toBe('invalid');
  });
});

describe('media URLs', () => {
  it('extracts YouTube ids from watch, short and Shorts links', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtube.com/shorts/abcDEF12345')).toBe('abcDEF12345');
    expect(youtubeId('https://example.com')).toBeNull();
  });
  it('detects Facebook reels and builds plugin URLs', () => {
    const fb = 'https://www.facebook.com/share/r/1MreFhRpQ1/';
    expect(detectMediaType(fb)).toBe('facebook');
    expect(facebookEmbedUrl(fb)).toContain(encodeURIComponent(fb));
  });
});
