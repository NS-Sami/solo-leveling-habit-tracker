/**
 * Asks before uploading progress saved in this browser. Nothing is imported without
 * a click, and the local copy stays in place afterwards.
 */
import { useState } from 'react';
import { importLocalData, type LocalSummary } from '../../sync/importLocal';
import type { RemoteStore } from '../../sync/remote';

export function ImportPanel({
  summary,
  remote,
  onImported,
  onSkip,
  skipLabel = 'Not now',
}: {
  summary: LocalSummary;
  remote: RemoteStore;
  onImported: () => void | Promise<void>;
  onSkip: () => void;
  skipLabel?: string;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setProgress({ done: 0, total: 1 });
    try {
      await importLocalData(remote, (done, total) => setProgress({ done, total }));
      await onImported();
    } catch (err) {
      setProgress(null);
      setError(`Import did not finish: ${(err as Error).message}. Nothing was lost, and it is safe to try again.`);
    }
  };

  return (
    <div className="space-y-3">
      <p className="font-display text-[15px] leading-snug text-white">This browser holds progress that is not in your account yet:</p>
      <ul className="font-mono text-xs text-slate-200">
        <li>{summary.completions.toLocaleString()} completed quests</li>
        <li>{summary.exp.toLocaleString()} EXP</li>
        <li>{summary.quests} quests</li>
        <li>{summary.restDays} rest days</li>
      </ul>
      <p className="font-mono text-[11px] text-slate-400">
        Anything already in your account is kept. Only missing records are added. The copy in this browser stays until you remove it, and importing twice creates no duplicates.
      </p>
      {error && (
        <p role="alert" className="rounded border border-red-500/60 bg-red-950/40 px-3 py-2 font-mono text-xs text-red-200">
          {error}
        </p>
      )}
      {progress && (
        <p role="status" className="font-mono text-xs text-cyan-100">
          Importing {progress.done.toLocaleString()} of {progress.total.toLocaleString()}…
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn-ghost" onClick={onSkip} disabled={!!progress}>
          {skipLabel}
        </button>
        <button className="btn" onClick={run} disabled={!!progress}>
          {error ? 'Try Again' : 'Import to My Account'}
        </button>
      </div>
    </div>
  );
}
