/**
 * Google Sheets → The System migration.
 *
 * Export the sheet with File → Download → CSV. Checkbox cells export as TRUE/FALSE.
 * For each row whose text matches a quest name, we read the first 28 TRUE/FALSE
 * cells in order and map them onto 28 consecutive dates starting at `startDate`.
 */
import type { Completion, DateKey, Quest } from '../domain/types';
import { addDays } from '../domain/dates';
import { completionId } from '../domain/completion';

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[–—-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Word-overlap similarity 0..1, tolerant of small renames between sheet and app. */
function similarity(a: string, b: string): number {
  const A = new Set(norm(a).split(' ').filter((w) => w.length > 1));
  const B = new Set(norm(b).split(' ').filter((w) => w.length > 1));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach((w) => B.has(w) && hit++);
  return hit / Math.min(A.size, B.size);
}

export interface ImportPreviewRow {
  sheetName: string;
  quest: Quest | null;
  checks: boolean[]; // up to 28
}

export function previewImport(csv: string, quests: Quest[]): ImportPreviewRow[] {
  const out: ImportPreviewRow[] = [];
  for (const row of parseCsv(csv)) {
    const bools = row
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c === 'TRUE' || c === 'FALSE')
      .slice(0, 28)
      .map((c) => c === 'TRUE');
    if (bools.length < 7) continue; // not a habit row
    // the quest name is the longest non-boolean, non-numeric text cell
    const name = row
      .filter((c) => !/^(true|false)$/i.test(c.trim()) && !/^[\d.,%\s]*$/.test(c))
      .sort((a, b) => b.length - a.length)[0];
    if (!name) continue;
    let best: Quest | null = null;
    let bestScore = 0;
    for (const q of quests) {
      const s = similarity(name, q.name);
      if (s > bestScore) {
        bestScore = s;
        best = q;
      }
    }
    out.push({ sheetName: name.trim(), quest: bestScore >= 0.6 ? best : null, checks: bools });
  }
  return out;
}

export function buildCompletions(rows: ImportPreviewRow[], startDate: DateKey): Completion[] {
  const out: Completion[] = [];
  for (const r of rows) {
    if (!r.quest) continue;
    r.checks.forEach((checked, i) => {
      if (!checked) return;
      const date = addDays(startDate, i);
      out.push({
        id: completionId(r.quest!.id, date),
        questId: r.quest!.id,
        date,
        expAwarded: r.quest!.exp,
        stat: r.quest!.stat,
        category: r.quest!.category,
        completedAt: new Date().toISOString(),
      });
    });
  }
  return out;
}
