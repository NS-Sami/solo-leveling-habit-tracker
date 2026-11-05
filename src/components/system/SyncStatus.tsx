/**
 * Honest save indicator. "Saved" only appears once the database has confirmed every
 * change. Nothing here reports success on its own: it only displays engine status.
 */
import { AlertTriangle, CheckCircle2, CloudOff, HardDrive, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { getEngine, useSync } from '../../sync/runtime';
import { fromRemote, type RemoteRow } from '../../sync/mapping';
import { Modal } from '../ui/primitives';
import type { Quest, Settings } from '../../domain/types';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Compact badge in the header. */
export function SyncBadge() {
  const mode = useSync((s) => s.mode);
  const { phase, pending } = useSync((s) => s.status);

  if (mode === 'none') {
    return (
      <span className="chip shrink-0 border-white/15 text-slate-300" title="Progress is stored in this browser only" role="status">
        <HardDrive size={12} aria-hidden /> <span className="hidden sm:inline">This device only</span>
        <span className="sr-only sm:hidden">This device only</span>
      </span>
    );
  }

  const view = {
    loading: { icon: <Loader2 size={12} className="animate-spin" aria-hidden />, text: 'Loading…', tone: 'border-cyan-300/40 text-cyan-100' },
    saving: { icon: <Loader2 size={12} className="animate-spin" aria-hidden />, text: 'Saving…', tone: 'border-cyan-300/40 text-cyan-100' },
    saved: { icon: <CheckCircle2 size={12} aria-hidden />, text: 'Saved', tone: 'border-emerald-300/50 text-emerald-200' },
    offline: { icon: <CloudOff size={12} aria-hidden />, text: pending ? `Offline · ${pending} waiting` : 'Offline', tone: 'border-amber-300/60 text-amber-200' },
    error: { icon: <AlertTriangle size={12} aria-hidden />, text: 'Not saved', tone: 'border-red-400/70 text-red-200' },
    conflict: { icon: <AlertTriangle size={12} aria-hidden />, text: 'Needs review', tone: 'border-amber-300/60 text-amber-200' },
  }[phase];

  return (
    <span className={`chip shrink-0 ${view.tone}`} role="status" aria-live="polite">
      {view.icon}
      <span className="hidden sm:inline">{view.text}</span>
      <span className="sr-only sm:hidden">{view.text}</span>
    </span>
  );
}

/** Full explanation under the header when something needs attention. */
export function SyncBanner() {
  const mode = useSync((s) => s.mode);
  const status = useSync((s) => s.status);
  const [reviewing, setReviewing] = useState(false);
  if (mode !== 'cloud') return null;

  if (status.phase === 'conflict') {
    return (
      <>
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[6px] border border-amber-300/60 bg-amber-950/40 px-4 py-2.5">
          <p className="min-w-0 flex-1 font-display text-[14px] text-amber-100">
            {plural(status.conflicts, 'item')} changed on two devices. Nothing has been overwritten. Choose which version to keep.
          </p>
          <button className="btn" onClick={() => setReviewing(true)}>
            Review
          </button>
        </div>
        <ConflictDialog open={reviewing} onClose={() => setReviewing(false)} />
      </>
    );
  }

  if (status.phase === 'offline' || status.phase === 'error') {
    const isError = status.phase === 'error';
    return (
      <div
        role={isError ? 'alert' : 'status'}
        className={`flex flex-wrap items-center gap-3 rounded-[6px] border px-4 py-2.5 ${isError ? 'border-red-500/70 bg-red-950/50' : 'border-amber-300/50 bg-amber-950/30'}`}
      >
        <p className={`min-w-0 flex-1 font-display text-[14px] ${isError ? 'text-red-100' : 'text-amber-100'}`}>
          {status.message ?? 'Changes stay on this device and upload when the connection returns.'}
          {status.pending > 0 && ` ${plural(status.pending, 'change')} not uploaded yet.`}
        </p>
        <button className="btn" onClick={() => void getEngine()?.sync()}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }
  return null;
}

const SCHEDULE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function describeQuest(q: Quest | undefined) {
  if (!q) return 'Deleted';
  const days = q.scheduleDays.length === 7 ? 'Every day' : q.scheduleDays.map((d) => SCHEDULE[d]).join(' ');
  return `${q.name} · ${q.exp} EXP · ${q.difficulty} · ${days}${q.archivedAt ? ' · archived' : ''}`;
}

function describeSettings(s: Partial<Settings> | undefined) {
  return s ? `${s.hunterName ?? 'Hunter'} · ${s.timezone ?? ''} · streak ${Math.round((s.streakThreshold ?? 0) * 100)}%` : 'Deleted';
}

export function ConflictDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const conflicts = useLiveQuery(() => db.conflicts.toArray(), []) ?? [];
  const locals = useLiveQuery(() => db.quests.toArray(), []) ?? [];
  const settings = useLiveQuery(() => db.settings.get('settings'), []);
  const [busy, setBusy] = useState(false);

  const choose = async (fn: () => Promise<void> | undefined) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
    if (conflicts.length <= 1) onClose();
  };

  return (
    <Modal open={open && conflicts.length > 0} onClose={onClose} title="Choose a version" wide>
      <ul className="space-y-4">
        {conflicts.map((c) => {
          const server = c.serverRow as RemoteRow;
          const isQuest = c.table === 'quests';
          const theirs = server.deleted_at ? 'Deleted' : isQuest ? describeQuest(fromRemote('quests', server) as Quest) : describeSettings(fromRemote('user_settings', server) as Partial<Settings>);
          const mine = isQuest ? describeQuest(locals.find((q) => q.id === c.rowId)) : describeSettings(settings);
          return (
            <li key={c.key} className="rounded border border-white/10 bg-black/20 p-3">
              <dl className="space-y-2 font-mono text-xs">
                <div>
                  <dt className="text-cyan-200">This device</dt>
                  <dd className="break-words text-slate-100">{mine}</dd>
                </div>
                <div>
                  <dt className="text-cyan-200">Other device</dt>
                  <dd className="break-words text-slate-100">{theirs}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button className="btn" disabled={busy} onClick={() => choose(() => getEngine()?.keepThisDevice(c.key))}>
                  Keep this device
                </button>
                <button className="btn" disabled={busy} onClick={() => choose(() => getEngine()?.keepOtherDevice(c.key))}>
                  Keep other device
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
