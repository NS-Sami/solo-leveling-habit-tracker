/**
 * One-click JSON backup & restore.
 * Uploaded media blobs are NOT included (they can be large); media links are.
 */
import { db } from './db';
import { replaceAllData } from './actions';
import type { Completion, DayMeta, Quest, Settings } from '../domain/types';

export interface BackupFile {
  app: 'the-system';
  version: 1;
  exportedAt: string;
  quests: Quest[];
  completions: Completion[];
  dayMeta: DayMeta[];
  settings: Settings | null;
}

export async function exportBackup(): Promise<BackupFile> {
  const [quests, completions, dayMeta, settings] = await Promise.all([
    db.quests.toArray(),
    db.completions.toArray(),
    db.dayMeta.toArray(),
    db.settings.get('settings'),
  ]);
  return {
    app: 'the-system',
    version: 1,
    exportedAt: new Date().toISOString(),
    quests,
    completions,
    dayMeta,
    settings: settings ?? null,
  };
}

export async function downloadBackup() {
  const data = await exportBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `the-system-backup-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  await db.settings.update('settings', { lastBackupAt: data.exportedAt });
}

export function validateBackup(x: unknown): x is BackupFile {
  const b = x as BackupFile;
  return !!b && b.app === 'the-system' && Array.isArray(b.quests) && Array.isArray(b.completions);
}

/** Replaces ALL data with the backup. On an account, the online copy follows. */
export async function restoreBackup(data: BackupFile) {
  await replaceAllData({
    quests: data.quests,
    completions: data.completions,
    dayMeta: data.dayMeta ?? [],
    settings: data.settings,
  });
}
