/**
 * Settings > Account: who is signed in, what is saved, sign out, and importing
 * or removing the copy of progress stored in this browser before accounts.
 */
import { useEffect, useState } from 'react';
import Dexie from 'dexie';
import { LogOut, RefreshCw, UserRound } from 'lucide-react';
import { appConfig } from '../../config';
import { LEGACY_DB_NAME, db } from '../../data/db';
import { getEngine, getRemote, getSupabase, stopSync, useSync } from '../../sync/runtime';
import { readLocalSummary, type LocalSummary } from '../../sync/importLocal';
import { chooseAccountMode, rememberImportDecision } from '../../state/AuthGate';
import { ImportPanel } from './ImportDialog';
import { Modal, Panel } from '../ui/primitives';
import { useUI } from '../../state/ui';

export function AccountPanel() {
  const mode = useSync((s) => s.mode);
  const email = useSync((s) => s.email);
  const status = useSync((s) => s.status);
  const pushToast = useUI((s) => s.pushToast);
  const [legacy, setLegacy] = useState<LocalSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'cloud') void readLocalSummary().then(setLegacy);
  }, [mode]);

  if (appConfig.state !== 'cloud') return null;

  if (mode !== 'cloud') {
    return (
      <Panel title="Account" icon={<UserRound size={14} />}>
        <p className="font-display text-[15px] text-white">You are not signed in, so progress is stored in this browser only and does not reach your other devices.</p>
        <button className="btn mt-3" onClick={chooseAccountMode}>
          Sign in or create account
        </button>
      </Panel>
    );
  }

  const signOut = async () => {
    setError(null);
    await getEngine()?.sync();
    const { error: err } = await getSupabase().auth.signOut({ scope: 'local' });
    if (err) return setError(`Could not sign out: ${err.message}`);
    stopSync();
    if (wipe) {
      const name = db.name;
      db.close();
      await Dexie.delete(name);
    }
    location.reload();
  };

  const saved = status.phase === 'saved' && status.pending === 0;

  return (
    <Panel title="Account" icon={<UserRound size={14} />}>
      <dl className="space-y-1 font-mono text-xs text-slate-200">
        <div className="flex flex-wrap gap-2">
          <dt className="text-cyan-200">Signed in as</dt>
          <dd className="break-all text-white">{email}</dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="text-cyan-200">Status</dt>
          <dd>{saved ? `All changes saved online${status.lastSavedAt ? ` at ${new Date(status.lastSavedAt).toLocaleTimeString()}` : ''}` : status.pending > 0 ? `${status.pending} not uploaded yet` : 'Checking…'}</dd>
        </div>
      </dl>
      <p className="mt-2 font-mono text-[10px] text-slate-400">
        Offline editing works: changes wait on this device and upload when you reconnect. They reach your other devices only after that. Uploaded videos and audio stay on the device that added them.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" onClick={() => void getEngine()?.sync()}>
          <RefreshCw size={14} /> Sync now
        </button>
        <button className="btn" onClick={() => setSigningOut(true)}>
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {legacy && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <span className="label">Progress saved in this browser</span>
          <p className="font-mono text-xs text-slate-300">
            {legacy.completions.toLocaleString()} completed quests, {legacy.exp.toLocaleString()} EXP, from before you signed in.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn" onClick={() => setImporting(true)}>
              Import to my account
            </button>
            <button className="btn-danger" onClick={() => setRemoving(true)}>
              Remove from this browser
            </button>
          </div>
        </div>
      )}

      <Modal open={importing} onClose={() => setImporting(false)} title="Import Progress">
        {legacy && getRemote() && (
          <ImportPanel
            summary={legacy}
            remote={getRemote()!}
            skipLabel="Cancel"
            onSkip={() => setImporting(false)}
            onImported={async () => {
              const userId = (await getSupabase().auth.getSession()).data.session?.user.id;
              if (userId) rememberImportDecision(userId);
              await getEngine()?.sync();
              setImporting(false);
              pushToast({ title: 'Import complete', body: 'Every record was confirmed online.', tone: 'success' });
            }}
          />
        )}
      </Modal>

      <Modal open={removing} onClose={() => setRemoving(false)} title="Remove local copy?">
        <p className="font-mono text-sm text-slate-300">
          This permanently deletes the {legacy?.completions.toLocaleString()} completions stored in this browser from before you signed in. Records you imported stay in your account. Records you did not import are lost.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setRemoving(false)}>
            Cancel
          </button>
          <button
            className="btn-danger"
            onClick={async () => {
              await Dexie.delete(LEGACY_DB_NAME);
              setLegacy(null);
              setRemoving(false);
            }}
          >
            Remove
          </button>
        </div>
      </Modal>

      <Modal open={signingOut} onClose={() => setSigningOut(false)} title="Sign out?">
        {status.pending > 0 && (
          <p className="mb-3 rounded border border-amber-300/50 bg-amber-950/30 px-3 py-2 font-mono text-xs text-amber-100">
            {status.pending} change{status.pending === 1 ? ' has' : 's have'} not reached the server. They stay on this device and upload next time you sign in here, unless you remove the data below.
          </p>
        )}
        <label className="flex items-start gap-2 font-mono text-xs text-slate-200">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-cyan-400" checked={wipe} onChange={(e) => setWipe(e.target.checked)} />
          <span>This is a shared device: remove my data from this browser{status.pending > 0 ? ' (unsent changes will be lost)' : ''}.</span>
        </label>
        {error && (
          <p role="alert" className="mt-3 font-mono text-xs text-red-300">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setSigningOut(false)}>
            Cancel
          </button>
          <button className={wipe ? 'btn-danger' : 'btn'} onClick={signOut}>
            Sign out
          </button>
        </div>
      </Modal>
    </Panel>
  );
}
