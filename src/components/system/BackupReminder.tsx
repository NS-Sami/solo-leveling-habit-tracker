import { DownloadCloud } from 'lucide-react';
import { useSystem } from '../../state/SystemProvider';
import { downloadBackup } from '../../data/backup';

/** Research: data loss is the #1 complaint in 1-3★ habit-app reviews. Nudge a backup every 7 days. */
export function BackupReminder() {
  const { settings, completions, now } = useSystem();
  const last = settings.lastBackupAt ? new Date(settings.lastBackupAt).getTime() : 0;
  const days = Math.floor((now.getTime() - last) / 86_400_000);
  if (completions.length < 10 || days < 7) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-500/5 px-4 py-3">
      <DownloadCloud size={20} className="shrink-0 text-amber-300" />
      <p className="flex-1 font-mono text-xs text-amber-100/90">{last ? `Last backup ${days} days ago.` : 'No backup yet.'} Your data lives only on this device.</p>
      <button className="btn-ghost text-amber-200" onClick={() => downloadBackup()}>
        Back up
      </button>
    </div>
  );
}
