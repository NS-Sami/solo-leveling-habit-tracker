/**
 * QUEST INFO window — the daily check-in, laid out like a System quest screen:
 *   [Daily Quest has arrived.] · GOAL list with [0/1] counters · REWARD · red WARNING.
 * One tap per quest (the whole row is the hit target).
 */
import { Bed, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useSystem } from '../../state/SystemProvider';
import { completionId, isScheduled } from '../../domain/completion';
import { CATEGORIES } from '../../domain/stats';
import { prettyDate } from '../../domain/dates';
import { dayOfCycle } from '../../domain/cycle';
import { CATEGORY_STYLE, Panel, ProgressBar, QuestCheck } from '../ui/primitives';
import { setRestDay } from '../../data/actions';
import type { Quest } from '../../domain/types';

const DIFF_COLOR = { Easy: 'text-emerald-300', Normal: 'text-cyan-200', Hard: 'text-rose-300' };

export function DailyQuests() {
  const { activeQuests, idx, today, todayStats, toggle, settings } = useSystem();
  const [showAll, setShowAll] = useState(false);

  const scheduled = activeQuests.filter((q) => isScheduled(q, today));
  const unscheduled = activeQuests.filter((q) => !isScheduled(q, today));
  const earnedToday = scheduled.filter((q) => idx.has(completionId(q.id, today))).reduce((a, q) => a + q.exp, 0);
  const possibleToday = scheduled.reduce((a, q) => a + q.exp, 0);
  const allDone = todayStats.scheduled > 0 && todayStats.done === todayStats.scheduled;

  return (
    <Panel
      title="Quest Info"
      action={
        <button
          className={`btn-ghost text-[11px] ${todayStats.restDay ? 'text-amber-300' : ''}`}
          onClick={() => setRestDay(today, !todayStats.restDay)}
          title="Rest days don't break (or extend) your streak"
        >
          <Bed size={14} /> <span className="hidden sm:inline">{todayStats.restDay ? 'Rest day ON' : 'Rest day'}</span>
        </button>
      }
      bodyClass="p-0"
    >
      {/* Arrival line + GOAL heading */}
      <div className="px-4 pb-2 pt-1 text-center">
        <p className="font-display text-[15px] font-semibold text-white text-glow sm:text-base">[Daily Quest has arrived.]</p>
        <p className="mt-0.5 font-mono text-[11px] text-slate-400">
          {prettyDate(today)} · Cycle day {dayOfCycle(today, settings.cycleAnchor)}/28
        </p>
        <div className="mt-3 inline-block border-b border-cyan-200/70 px-6 pb-0.5 font-display text-sm font-bold tracking-[0.4em] text-white text-glow">GOAL</div>
      </div>

      {/* Goal list */}
      <div>
        {CATEGORIES.map((cat) => {
          const list = scheduled.filter((q) => q.category === cat);
          if (!list.length) return null;
          const doneCount = list.filter((q) => idx.has(completionId(q.id, today))).length;
          return (
            <div key={cat} className="px-2 pb-1 pt-2 sm:px-4">
              <div className="flex items-center justify-between px-2 pb-1">
                <span className={`font-display text-[10px] font-bold uppercase tracking-[0.3em] ${CATEGORY_STYLE[cat].tint}`}>
                  {CATEGORY_STYLE[cat].icon} {cat}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  [{doneCount}/{list.length}]
                </span>
              </div>
              {list.map((q) => (
                <GoalRow key={q.id} quest={q} checked={idx.has(completionId(q.id, today))} onToggle={() => toggle(q, today)} />
              ))}
            </div>
          );
        })}
        {scheduled.length === 0 && <p className="px-4 py-6 text-center font-mono text-sm text-slate-400">No quests scheduled today. Add some in the Quests tab.</p>}
      </div>

      {unscheduled.length > 0 && (
        <div className="px-4 pt-1">
          <button className="btn-ghost w-full text-[11px]" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Hide' : 'Show'} {unscheduled.length} unscheduled quest{unscheduled.length > 1 ? 's' : ''} (bonus EXP)
          </button>
          {showAll &&
            unscheduled.map((q) => <GoalRow key={q.id} quest={q} dim checked={idx.has(completionId(q.id, today))} onToggle={() => toggle(q, today)} />)}
        </div>
      )}

      {/* Reward + progress */}
      <div className="mx-4 mt-3 space-y-2">
        <div className="sys-divider" />
        <div className="flex items-center justify-between pt-1 font-display text-sm">
          <span className="font-bold tracking-[0.25em] text-cyan-100">REWARD</span>
          <span className="font-mono text-white">
            <b className="text-glow">+{earnedToday}</b>
            <span className="text-slate-400"> / {possibleToday} EXP</span>
          </span>
        </div>
        <ProgressBar value={todayStats.ratio} color={allDone ? '#FBBF24' : '#5CB4FF'} label="Today's completion" />
      </div>

      {/* Completion or warning */}
      <div className="px-4 pb-4 pt-3 text-center">
        {allDone ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="inline-flex items-center gap-2 font-display text-sm font-bold tracking-widest text-amber-300" style={{ textShadow: '0 0 12px rgba(251,191,36,.8)' }}>
            <CheckCircle2 size={16} /> DAILY QUEST COMPLETE · REWARDS GRANTED
          </motion.div>
        ) : todayStats.restDay ? (
          <p className="font-mono text-xs text-amber-200/90">Rest day declared. Your streak is protected today.</p>
        ) : (
          <p className="font-display text-[13px] leading-snug text-red-400" style={{ textShadow: '0 0 10px rgba(239,68,68,.6)' }}>
            <b className="tracking-widest">WARNING:</b> Clearing less than {Math.round(settings.emergencyThreshold * 100)}% of the Daily Quest by{' '}
            {String(settings.emergencyHour).padStart(2, '0')}:00 will trigger an <b>Emergency Quest</b> alert.
          </p>
        )}
      </div>
    </Panel>
  );
}

function GoalRow({ quest, checked, onToggle, dim }: { quest: Quest; checked: boolean; onToggle: () => void; dim?: boolean }) {
  return (
    <div
      className={`group flex cursor-pointer select-none items-center gap-3 rounded-[4px] px-2 py-1 transition hover:bg-cyan-400/10 ${dim ? 'opacity-60' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onToggle();
      }}
    >
      <div className="min-w-0 flex-1">
        <div className={`truncate font-sans text-[16px] font-semibold leading-tight ${checked ? 'text-slate-400' : 'text-white'}`} style={checked ? undefined : { textShadow: '0 0 8px rgba(92,180,255,.35)' }}>
          {quest.name}
        </div>
        <div className="font-mono text-[10px] text-slate-500">
          <span className={DIFF_COLOR[quest.difficulty]}>{quest.difficulty}</span> · {quest.stat} · +{quest.exp} EXP
        </div>
      </div>
      <span className={`shrink-0 font-mono text-sm font-bold ${checked ? 'text-cyan-200 text-glow' : 'text-slate-300'}`}>[{checked ? 1 : 0}/1]</span>
      <QuestCheck checked={checked} onToggle={onToggle} label={quest.name} size="lg" />
    </div>
  );
}
