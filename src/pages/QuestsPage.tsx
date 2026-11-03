/**
 * Quest management: add, edit, schedule, re-order, archive, delete.
 */
import { useState } from 'react';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil, Plus, ScrollText, Trash2 } from 'lucide-react';
import { useSystem } from '../state/SystemProvider';
import { archiveQuest, deleteQuest, moveQuest, saveQuest } from '../data/actions';
import { CATEGORIES, CATEGORY_DEFAULT_STAT, STATS } from '../domain/stats';
import { WEEKDAY_SHORT } from '../domain/dates';
import type { Category, Difficulty, Quest, Stat } from '../domain/types';
import { CATEGORY_STYLE, Modal, Panel } from '../components/ui/primitives';

type Draft = Pick<Quest, 'name' | 'category' | 'stat' | 'exp' | 'difficulty' | 'scheduleDays'> & { id?: string };

const EMPTY: Draft = { name: '', category: 'Physical', stat: 'STR', exp: 20, difficulty: 'Normal', scheduleDays: [0, 1, 2, 3, 4, 5, 6] };
const DIFFS: Difficulty[] = ['Easy', 'Normal', 'Hard'];

export function QuestsPage() {
  const { quests } = useSystem();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Quest | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = quests.filter((q) => !q.archivedAt);
  const archived = quests.filter((q) => q.archivedAt);
  const maxDaily = active.reduce((a, q) => a + q.exp, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-lg font-black uppercase tracking-wider text-cyan-300 text-glow">Quest Database</h1>
          <p className="font-mono text-xs text-slate-400">
            {active.length} active quests · up to {maxDaily} EXP/day
          </p>
        </div>
        <button className="btn" onClick={() => setDraft({ ...EMPTY })}>
          <Plus size={14} /> New Quest
        </button>
      </div>

      {CATEGORIES.map((cat) => {
        const list = active.filter((q) => q.category === cat);
        if (!list.length) return null;
        return (
          <Panel key={cat} title={`${CATEGORY_STYLE[cat].icon} ${cat}`} bodyClass="p-0">
            <ul className="divide-y divide-white/5">
              {list.map((q) => (
                <QuestItem key={q.id} q={q} onEdit={() => setDraft({ ...q })} onDelete={() => setConfirmDelete(q)} />
              ))}
            </ul>
          </Panel>
        );
      })}

      {archived.length > 0 && (
        <Panel title={<button onClick={() => setShowArchived((v) => !v)}>Archived ({archived.length}) {showArchived ? '▾' : '▸'}</button>} icon={<ScrollText size={14} />} bodyClass="p-0">
          {showArchived && (
            <ul className="divide-y divide-white/5">
              {archived.map((q) => (
                <QuestItem key={q.id} q={q} onEdit={() => setDraft({ ...q })} onDelete={() => setConfirmDelete(q)} />
              ))}
            </ul>
          )}
        </Panel>
      )}

      <QuestForm draft={draft} onClose={() => setDraft(null)} />

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete quest permanently?">
        <p className="font-mono text-sm text-slate-300">
          <b className="text-white">{confirmDelete?.name}</b> and <b className="text-red-300">all of its completion history and EXP</b> will be erased. This cannot be undone.
        </p>
        <p className="mt-2 font-mono text-xs text-slate-400">Tip: Archive keeps your earned EXP and just hides the quest.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="btn"
            onClick={async () => {
              if (confirmDelete) await archiveQuest(confirmDelete.id, true);
              setConfirmDelete(null);
            }}
          >
            <Archive size={14} /> Archive instead
          </button>
          <button
            className="btn-danger"
            onClick={async () => {
              if (confirmDelete) await deleteQuest(confirmDelete.id);
              setConfirmDelete(null);
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

function QuestItem({ q, onEdit, onDelete }: { q: Quest; onEdit: () => void; onDelete: () => void }) {
  const everyday = q.scheduleDays.length === 7;
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <div className="flex flex-col">
        <button className="btn-ghost min-h-0 p-0.5" onClick={() => moveQuest(q.id, -1)} aria-label={`Move ${q.name} up`}>
          <ArrowUp size={12} />
        </button>
        <button className="btn-ghost min-h-0 p-0.5" onClick={() => moveQuest(q.id, 1)} aria-label={`Move ${q.name} down`}>
          <ArrowDown size={12} />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-sans text-[15px] font-semibold text-slate-100">{q.name}</div>
        <div className="font-mono text-[10px] text-slate-400">
          {q.difficulty} · {q.stat} · {everyday ? 'Every day' : q.scheduleDays.map((d) => WEEKDAY_SHORT[d]).join(' ')}
        </div>
      </div>
      <span className="font-mono text-sm font-bold text-cyan-200">+{q.exp}</span>
      <button className="btn-ghost" onClick={onEdit} aria-label={`Edit ${q.name}`}>
        <Pencil size={14} />
      </button>
      <button className="btn-ghost" onClick={() => archiveQuest(q.id, !q.archivedAt)} aria-label={q.archivedAt ? `Restore ${q.name}` : `Archive ${q.name}`} title={q.archivedAt ? 'Restore' : 'Archive'}>
        {q.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
      </button>
      <button className="btn-ghost text-red-300" onClick={onDelete} aria-label={`Delete ${q.name}`}>
        <Trash2 size={14} />
      </button>
    </li>
  );
}

function QuestForm({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const [d, setD] = useState<Draft>(EMPTY);
  const [lastId, setLastId] = useState<string | undefined | null>(null);
  // sync local state when a new draft opens
  if (draft && (draft.id ?? 'new') !== lastId) {
    setD(draft);
    setLastId(draft.id ?? 'new');
  }
  if (!draft && lastId !== null) setLastId(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const valid = d.name.trim().length > 0 && d.exp > 0 && d.scheduleDays.length > 0;

  return (
    <Modal open={!!draft} onClose={onClose} title={d.id ? 'Edit Quest' : 'New Quest'}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await saveQuest({ ...d, name: d.name.trim() });
          onClose();
        }}
      >
        <div>
          <label className="label" htmlFor="qname">Quest name</label>
          <input id="qname" className="input" value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. 30 push-ups" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="qcat">Category</label>
            <select
              id="qcat"
              className="input"
              value={d.category}
              onChange={(e) => {
                const c = e.target.value as Category;
                setD((x) => ({ ...x, category: c, stat: CATEGORY_DEFAULT_STAT[c] }));
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="qstat">Attribute</label>
            <select id="qstat" className="input" value={d.stat} onChange={(e) => set('stat', e.target.value as Stat)}>
              {STATS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} — {s.long}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="qexp">EXP reward</label>
            <input id="qexp" type="number" min={1} max={500} className="input" value={d.exp} onChange={(e) => set('exp', Math.max(0, Number(e.target.value)))} />
          </div>
          <div>
            <label className="label" htmlFor="qdiff">Difficulty</label>
            <select id="qdiff" className="input" value={d.difficulty} onChange={(e) => set('difficulty', e.target.value as Difficulty)}>
              {DIFFS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <span className="label">Schedule</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_SHORT.map((w, i) => {
              const on = d.scheduleDays.includes(i);
              return (
                <button
                  type="button"
                  key={w}
                  aria-pressed={on}
                  onClick={() => set('scheduleDays', on ? d.scheduleDays.filter((x) => x !== i) : [...d.scheduleDays, i].sort())}
                  className={`h-10 w-11 rounded-md border font-mono text-xs ${on ? 'border-cyan-300/70 bg-cyan-400/20 text-white' : 'border-white/10 text-slate-500'}`}
                >
                  {w}
                </button>
              );
            })}
          </div>
          <p className="mt-1 font-mono text-[10px] text-slate-500">Unscheduled days don't count against your completion %.</p>
        </div>
        {d.id && <p className="font-mono text-[10px] text-slate-500">Changing the EXP reward only affects future completions — your history stays as earned.</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!valid}>
            Save Quest
          </button>
        </div>
      </form>
    </Modal>
  );
}
