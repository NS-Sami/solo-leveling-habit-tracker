/**
 * 28-Day Habit Grid (interactive matrix).
 *
 * - Sticky quest column (left) and summary columns (right) so the grid scrolls
 *   horizontally on phones without losing context.
 * - Today's column is lit by a glowing cyan beam.
 * - Unscheduled cells are dimmed (still clickable for bonus EXP); future cells are locked.
 * - Summary: Total Days + Earned EXP per quest (this cycle), Daily Completion % row at the bottom.
 */
import { Fragment, useEffect, useMemo, useRef } from 'react';
import { useSystem } from '../../state/SystemProvider';
import { completionId, isActiveOn, isScheduled } from '../../domain/completion';
import { WEEK_COLORS, type CycleInfo } from '../../domain/cycle';
import { fromKey, WEEKDAY_SHORT } from '../../domain/dates';
import { CATEGORY_STYLE, QuestCheck } from '../ui/primitives';

export function HabitGrid({ cycle }: { cycle: CycleInfo }) {
  const { quests, completions, idx, today, getDay, toggle } = useSystem();

  // Quests visible in this cycle: active at some point during it.
  const rows = useMemo(
    () => quests.filter((q) => cycle.days.some((d) => isActiveOn(q, d))),
    [quests, cycle.days],
  );

  const perQuest = useMemo(() => {
    const m = new Map<string, { days: number; exp: number }>();
    for (const c of completions) {
      if (c.date < cycle.start || c.date > cycle.end) continue;
      const cur = m.get(c.questId) ?? { days: 0, exp: 0 };
      cur.days++;
      cur.exp += c.expAwarded;
      m.set(c.questId, cur);
    }
    return m;
  }, [completions, cycle.start, cycle.end]);

  const cycleExp = [...perQuest.values()].reduce((a, x) => a + x.exp, 0);

  // Keep today's column visible when the grid is wider than the screen (phones).
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    const th = el?.querySelector<HTMLElement>('th[data-today]');
    if (!el || !th) return;
    const target = th.offsetLeft - el.clientWidth / 2 + th.offsetWidth / 2;
    el.scrollTo({ left: Math.max(0, target) });
  }, [cycle.start]);

  return (
    <div className="panel overflow-hidden">
      <div ref={scroller} className="overflow-x-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-xs">
          <thead>
            {/* Row 1: day-of-month numbers */}
            <tr>
              <th className="grid-sticky-left bg-void-900 px-3 pt-2 text-left font-display text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400" rowSpan={2}>
                Quest
              </th>
              <th className="hidden bg-void-900 px-2 pt-2 font-display text-[10px] uppercase tracking-widest text-slate-400 md:table-cell" rowSpan={2}>
                EXP
              </th>
              {cycle.days.map((d) => (
                <th key={d} data-today={d === today || undefined} className={`min-w-[30px] px-0 pt-2 text-center text-[11px] font-semibold ${d === today ? 'bg-cyan-400/20 text-white' : 'text-slate-400'}`}>
                  {fromKey(d).getDate()}
                </th>
              ))}
              <th className="grid-sticky-right bg-void-900 px-2 pt-2 text-center font-display text-[9px] uppercase tracking-widest text-slate-400" rowSpan={2}>
                <div className="flex gap-2">
                  <span className="w-10">Days</span>
                  <span className="w-12">EXP</span>
                </div>
              </th>
            </tr>
            {/* Row 2: weekday labels, colour-coded by week */}
            <tr>
              {cycle.days.map((d, i) => {
                const color = WEEK_COLORS[Math.floor(i / 7)];
                return (
                  <th
                    key={d}
                    className={`py-1.5 text-center text-[10px] font-bold text-void-950 ${i % 7 === 6 && i < 27 ? 'border-r-2 border-void-900' : ''}`}
                    style={{ background: d === today ? '#5CC8FF' : color }}
                  >
                    {WEEKDAY_SHORT[fromKey(d).getDay()]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((q, r) => {
              const sum = perQuest.get(q.id) ?? { days: 0, exp: 0 };
              const zebra = r % 2 ? 'bg-void-800' : 'bg-void-900';
              return (
                <tr key={q.id} className={`${zebra} group`}>
                  <td className={`grid-sticky-left ${zebra} max-w-[150px] border-r border-white/5 px-3 py-0.5 sm:max-w-[220px] xl:max-w-[260px]`}>
                    <div className="flex items-center gap-2">
                      <span className={`${CATEGORY_STYLE[q.category].tint} text-sm`} title={q.category} aria-label={q.category}>
                        {CATEGORY_STYLE[q.category].icon}
                      </span>
                      <span className={`truncate font-sans text-[13px] font-semibold ${q.archivedAt ? 'text-slate-500 line-through' : 'text-slate-100'}`} title={q.name}>
                        {q.name}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-2 text-center text-slate-300 md:table-cell">{q.exp}</td>
                  {cycle.days.map((d, i) => {
                    const checked = idx.has(completionId(q.id, d));
                    const future = d > today;
                    const active = isActiveOn(q, d);
                    const scheduled = isScheduled(q, d);
                    const isToday = d === today;
                    return (
                      <td
                        key={d}
                        className={`relative p-0 text-center ${isToday ? 'bg-cyan-400/10' : ''} ${i % 7 === 6 && i < 27 ? 'border-r-2 border-void-950' : ''}`}
                      >
                        {isToday && <span className="pointer-events-none absolute inset-y-0 left-0 right-0 animate-beam border-x border-cyan-300/50" aria-hidden />}
                        {active && !future ? (
                          <QuestCheck checked={checked} onToggle={() => toggle(q, d)} label={`${q.name} on ${d}`} size="sm" dim={!scheduled && !checked} highlight={isToday} />
                        ) : (
                          <span className="inline-block h-5 w-5 rounded-[5px] border border-white/5 bg-black/20 align-middle" aria-hidden />
                        )}
                      </td>
                    );
                  })}
                  <td className={`grid-sticky-right ${zebra} border-l border-white/5 px-2 text-center`}>
                    <div className="flex gap-2">
                      <span className="w-10 text-slate-200">{sum.days}</span>
                      <span className="w-12 font-bold text-cyan-200">{sum.exp}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-void-950">
              <td className="grid-sticky-left bg-void-950 px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Daily %</td>
              <td className="hidden md:table-cell" />
              {cycle.days.map((d, i) => {
                const s = getDay(d);
                const color = WEEK_COLORS[Math.floor(i / 7)];
                return (
                  <Fragment key={d}>
                    <td className={`py-2 text-center text-[10px] ${d === today ? 'bg-cyan-400/20 text-white' : 'text-slate-300'}`} title={`${s.done}/${s.scheduled}`}>
                      {d > today ? <span className="text-slate-600">·</span> : s.restDay ? <span className="text-slate-500">REST</span> : <span style={{ color: s.ratio >= 0.5 ? color : undefined }}>{Math.round(s.ratio * 100)}</span>}
                    </td>
                  </Fragment>
                );
              })}
              <td className="grid-sticky-right bg-void-950 px-2 text-center">
                <div className="flex gap-2">
                  <span className="w-10 text-slate-500">Σ</span>
                  <span className="w-12 font-bold text-white">{cycleExp}</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
