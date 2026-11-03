/**
 * One-click JSON backup & restore.
 * Uploaded media blobs are NOT included (they can be large); media links are.
 */
import { db } from './db';
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

/** Replaces ALL local data with the backup. */
export async function restoreBackup(data: BackupFile) {
  await db.transaction('rw', [db.quests, db.completions, db.dayMeta, db.settings], async () => {
    await Promise.all([db.quests.clear(), db.completions.clear(), db.dayMeta.clear()]);
    await db.quests.bulkPut(data.quests);
    await db.completions.bulkPut(data.completions);
    await db.dayMeta.bulkPut(data.dayMeta ?? []);
    if (data.settings) {
      const current = await db.settings.get('settings');
      // Keep uploaded-blob references only if those blobs exist on this device.
      await db.settings.put({ ...data.settings, anthemBlobKey: current?.anthemBlobKey ?? null });
    }
  });
}
