/**
 * Settings: profile, sound, rules, cycle, motivation media, backup/restore, Google Sheets import.
 */
import { useEffect, useRef, useState } from 'react';
import { Database, Film, Music2, Plus, ShieldCheck, SlidersHorizontal, Trash2, Upload, User, Volume2 } from 'lucide-react';
import { useSystem } from '../state/SystemProvider';
import { addCompletions, deleteBlob, putBlob, resetAllData, uid, updateSettings } from '../data/actions';
import { downloadBackup, restoreBackup, validateBackup } from '../data/backup';
import { buildCompletions, previewImport, type ImportPreviewRow } from '../data/csvImport';
import { requestPersistence } from '../data/db';
import { detectMediaType, safeHttpUrl } from '../lib/media';
import { sfx } from '../lib/sfx';
import { DEFAULT_TIMEZONE, isValidKey, prettyDate } from '../domain/dates';
import { AccountPanel } from '../components/auth/AccountPanel';
import { useSync } from '../sync/runtime';
import { HunterAvatar } from '../components/hud/Avatar';
import { Modal, Panel } from '../components/ui/primitives';
import { useUI } from '../state/ui';

function timezones(current?: string): string[] {
  const list = Intl.supportedValuesOf?.('timeZone') ?? [];
  return [...new Set([DEFAULT_TIMEZONE, current ?? DEFAULT_TIMEZONE, ...list])];
}

async function resizeImage(file: File, size = 256): Promise<string> {
  const img = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const s = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.88);
}

export function SettingsPage() {
  const { settings, level } = useSystem();
  const pushToast = useUI((s) => s.pushToast);
  const [name, setName] = useState(settings.hunterName);
  const [quote, setQuote] = useState(settings.quote);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <AccountPanel />

      <Panel title="Hunter Profile" icon={<User size={14} />}>
        <div className="flex items-center gap-4">
          <HunterAvatar src={settings.avatarDataUrl} size={80} color={level.rank.color} />
          <div className="flex flex-col gap-2">
            <label className="btn cursor-pointer">
              <Upload size={14} /> Upload avatar
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) await updateSettings({ avatarDataUrl: await resizeImage(f) });
                }}
              />
            </label>
            {settings.avatarDataUrl && (
              <button className="btn-ghost" onClick={() => updateSettings({ avatarDataUrl: null })}>
                Use Shadow silhouette
              </button>
            )}
          </div>
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="hname">Hunter name</label>
          <input id="hname" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => updateSettings({ hunterName: name.trim() || 'Hunter' })} />
        </div>
      </Panel>

      <Panel title="Sound" icon={<Volume2 size={14} />}>
        <label className="flex items-center justify-between gap-3 font-mono text-sm text-slate-200">
          Sound effects
          <input type="checkbox" className="h-5 w-5 accent-cyan-400" checked={settings.sfxOn} onChange={(e) => updateSettings({ sfxOn: e.target.checked })} />
        </label>
        <div className="mt-4">
          <label className="label" htmlFor="vol">Volume · {Math.round(settings.volume * 100)}%</label>
          <input id="vol" type="range" min={0} max={1} step={0.05} className="w-full accent-cyan-400" value={settings.volume} onChange={(e) => updateSettings({ volume: Number(e.target.value) })} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => sfx.check()}>Test check</button>
          <button className="btn-ghost" onClick={() => sfx.levelUp()}>Test level-up</button>
          <button className="btn-ghost" onClick={() => sfx.dayComplete()}>Test daily complete</button>
        </div>
        <div className="mt-4 border-t border-white/5 pt-3">
          <span className="label">Custom anthem (optional)</span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn cursor-pointer">
              <Music2 size={14} /> Upload audio
              <input
                type="file"
                accept="audio/*"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (settings.anthemBlobKey) await deleteBlob(settings.anthemBlobKey);
                  await updateSettings({ anthemBlobKey: await putBlob(f) });
                  pushToast({ title: 'Anthem uploaded', tone: 'success' });
                }}
              />
            </label>
            {settings.anthemBlobKey ? (
              <button
                className="btn-ghost"
                onClick={async () => {
                  await deleteBlob(settings.anthemBlobKey!);
                  await updateSettings({ anthemBlobKey: null });
                }}
              >
                Use built-in System Anthem
              </button>
            ) : (
              <span className="font-mono text-[10px] text-slate-500">Using the built-in synthesized System Anthem.</span>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="System Rules" icon={<SlidersHorizontal size={14} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="st">Streak threshold · {Math.round(settings.streakThreshold * 100)}%</label>
            <input id="st" type="range" min={0.1} max={1} step={0.05} className="w-full accent-cyan-400" value={settings.streakThreshold} onChange={(e) => updateSettings({ streakThreshold: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="et">Emergency below · {Math.round(settings.emergencyThreshold * 100)}%</label>
            <input id="et" type="range" min={0.1} max={1} step={0.05} className="w-full accent-red-400" value={settings.emergencyThreshold} onChange={(e) => updateSettings({ emergencyThreshold: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="eh">Emergency after (hour)</label>
            <select id="eh" className="input" value={settings.emergencyHour} onChange={(e) => updateSettings({ emergencyHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="tz">Timezone</label>
            <select id="tz" className="input" value={settings.timezone ?? DEFAULT_TIMEZONE} onChange={(e) => updateSettings({ timezone: e.target.value })}>
              {timezones(settings.timezone).map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="anchor">Cycle start date (day 1)</label>
            <input
              id="anchor"
              type="date"
              className="input"
              value={settings.cycleAnchor}
              onChange={(e) => isValidKey(e.target.value) && updateSettings({ cycleAnchor: e.target.value })}
            />
          </div>
        </div>
        <p className="mt-3 font-mono text-[10px] text-slate-500">
          The timezone decides when a new day starts on all your devices. 28-day cycles repeat from the start date, and changing it only re-groups history. Nothing is deleted.
        </p>
      </Panel>

      <MediaSettings />

      <Panel title="Quote" icon={<Film size={14} />}>
        <textarea className="input min-h-[90px]" value={quote} onChange={(e) => setQuote(e.target.value)} onBlur={() => updateSettings({ quote: quote.trim() })} />
      </Panel>

      <DataSettings persisted={persisted} onPersist={async () => setPersisted(await requestPersistence())} />
    </div>
  );
}

function MediaSettings() {
  const { settings } = useSystem();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const type = url ? detectMediaType(url) : null;
  const invalid = !!url.trim() && !safeHttpUrl(url);

  const add = async () => {
    if (!url.trim() || invalid) return;
    const item = { id: uid(), type: type!, title: title.trim() || (type === 'youtube' ? 'YouTube video' : type === 'facebook' ? 'Facebook Reel' : 'Link'), url: url.trim() };
    await updateSettings({ media: [...settings.media, item], activeMediaId: item.id });
    setUrl('');
    setTitle('');
  };

  return (
    <Panel title="Motivation Media" icon={<Film size={14} />}>
      <ul className="space-y-1.5">
        {settings.media.map((m) => (
          <li key={m.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-1.5">
            <input type="radio" name="activeMedia" className="accent-cyan-400" checked={m.id === settings.activeMediaId} onChange={() => updateSettings({ activeMediaId: m.id })} aria-label={`Set ${m.title} active`} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-sans text-sm font-semibold text-slate-100">{m.title}</div>
              <div className="truncate font-mono text-[10px] uppercase text-slate-500">{m.type}{m.url ? ` · ${m.url}` : ''}</div>
            </div>
            <button
              className="btn-ghost text-red-300"
              aria-label={`Remove ${m.title}`}
              onClick={async () => {
                if (m.blobKey) await deleteBlob(m.blobKey);
                const media = settings.media.filter((x) => x.id !== m.id);
                await updateSettings({ media, activeMediaId: settings.activeMediaId === m.id ? media[0]?.id ?? null : settings.activeMediaId });
              }}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
        <label className="label" htmlFor="murl">Add YouTube / Shorts / Facebook Reel URL</label>
        <input id="murl" className="input" placeholder="https://youtube.com/shorts/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        {invalid && (
          <p role="alert" className="font-mono text-[10px] text-red-300">
            Enter a full link starting with https://
          </p>
        )}
        <input className="input" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Media title" />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={add} disabled={!url.trim() || invalid}>
            <Plus size={14} /> Add {type && type !== 'link' ? type : 'link'}
          </button>
          <label className="btn cursor-pointer">
            <Upload size={14} /> Upload MP4 / WebM
            <input
              type="file"
              accept="video/mp4,video/webm,video/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const blobKey = await putBlob(f);
                const item = { id: uid(), type: 'file' as const, title: f.name.replace(/\.[^.]+$/, ''), blobKey, mime: f.type };
                await updateSettings({ media: [...settings.media, item], activeMediaId: item.id });
              }}
            />
          </label>
        </div>
        <p className="font-mono text-[10px] text-slate-500">Uploaded videos are stored on this device (IndexedDB) and work offline.</p>
      </div>
    </Panel>
  );
}

function DataSettings({ persisted, onPersist }: { persisted: boolean | null; onPersist: () => void }) {
  const { quests, settings, completions } = useSystem();
  const pushToast = useUI((s) => s.pushToast);
  const cloud = useSync((s) => s.mode) === 'cloud';
  const jsonInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreviewRow[] | null>(null);
  const [csvStart, setCsvStart] = useState(settings.cycleAnchor);
  const [setAnchor, setSetAnchor] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);

  const matched = preview?.filter((r) => r.quest) ?? [];
  const toImport = preview ? buildCompletions(preview, csvStart) : [];

  return (
    <Panel title="Data & Backups" icon={<Database size={14} />} className="lg:col-span-2">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <span className="label">Backup</span>
          <button className="btn w-full" onClick={() => downloadBackup().then(() => pushToast({ title: 'Backup downloaded', tone: 'success' }))}>
            Export JSON
          </button>
          <button className="btn w-full" onClick={() => jsonInput.current?.click()}>
            Restore JSON
          </button>
          <input
            ref={jsonInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const data = JSON.parse(await f.text());
                if (!validateBackup(data)) throw new Error('Not a System backup file');
                if (!confirm(`Replace ALL current data${cloud ? ' in your account, on every device,' : ''} with the backup from ${data.exportedAt.slice(0, 10)}? (${data.completions.length} completions) This cannot be undone.`)) return;
                await restoreBackup(data);
                pushToast({ title: 'Backup restored', tone: 'success' });
              } catch (err) {
                pushToast({ title: 'Restore failed', body: String((err as Error).message), tone: 'crimson' });
              }
            }}
          />
          <p className="font-mono text-[10px] text-slate-500">
            Last backup: {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : 'never'} · {completions.length} completions stored
          </p>
        </div>

        <div className="space-y-2">
          <span className="label">Import from Google Sheets</span>
          <button className="btn w-full" onClick={() => csvInput.current?.click()}>
            Choose CSV
          </button>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) setPreview(previewImport(await f.text(), quests));
            }}
          />
          <p className="font-mono text-[10px] text-slate-500">In Sheets: File → Download → CSV. Rows are matched to quests by name; checkbox cells (TRUE/FALSE) become completions.</p>
        </div>

        <div className="space-y-2">
          <span className="label">Storage</span>
          <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
            <ShieldCheck size={16} className={persisted ? 'text-emerald-300' : 'text-slate-500'} />
            {persisted ? 'Persistent storage granted' : 'Browser may clear data under pressure'}
          </div>
          {!persisted && (
            <button className="btn w-full" onClick={onPersist}>
              Request persistent storage
            </button>
          )}
          <button className="btn-danger w-full" onClick={() => setConfirmReset(true)}>
            Reset everything
          </button>
        </div>
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Import preview" wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="csvstart">Date of the sheet's first checkbox column</label>
            <input id="csvstart" type="date" className="input" value={csvStart} onChange={(e) => isValidKey(e.target.value) && setCsvStart(e.target.value)} />
            <p className="mt-1 font-mono text-[10px] text-slate-500">{prettyDate(csvStart)}</p>
          </div>
          <label className="flex items-center gap-2 font-mono text-xs text-slate-300">
            <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={setAnchor} onChange={(e) => setSetAnchor(e.target.checked)} />
            Also make this the cycle start date
          </label>
        </div>
        <ul className="mt-3 max-h-[45dvh] space-y-1 overflow-y-auto">
          {preview?.map((r, i) => (
            <li key={i} className={`flex items-center justify-between gap-2 rounded px-2 py-1 font-mono text-[11px] ${r.quest ? 'bg-emerald-500/5 text-slate-200' : 'bg-red-500/5 text-slate-500'}`}>
              <span className="truncate">{r.sheetName}</span>
              <span className="shrink-0">{r.quest ? `→ ${r.quest.name} · ${r.checks.filter(Boolean).length} ✓` : 'no match — skipped'}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-slate-300">
            {matched.length} rows matched · {toImport.length} completions
          </span>
          <button
            className="btn"
            disabled={!toImport.length}
            onClick={async () => {
              await addCompletions(toImport);
              if (setAnchor) await updateSettings({ cycleAnchor: csvStart });
              setPreview(null);
              pushToast({ title: 'Sheet imported', body: `${toImport.length} completions added`, tone: 'success' });
            }}
          >
            Import
          </button>
        </div>
      </Modal>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset all data?">
        <p className="font-mono text-sm text-slate-300">
          {cloud
            ? 'This erases every quest, completion and setting in your account, on all your devices, and restores the 27 default quests. It cannot be undone. Export a backup first.'
            : 'This erases every quest, completion and setting in this browser and restores the 27 default quests. It cannot be undone. Export a backup first.'}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
          <button
            className="btn-danger"
            onClick={async () => {
              await resetAllData();
              if (!cloud) location.reload();
              else setConfirmReset(false);
            }}
          >
            Erase & reset
          </button>
        </div>
      </Modal>
    </Panel>
  );
}
