import { ChevronLeft, ChevronRight, LocateFixed } from 'lucide-react';
import { useState } from 'react';
import { useSystem } from '../state/SystemProvider';
import { cycleAt, cycleIndexFor } from '../domain/cycle';
import { prettyDate } from '../domain/dates';
import { WeeklyAnalytics } from '../components/analytics/WeeklyAnalytics';
import { HabitGrid } from '../components/grid/HabitGrid';

export function GridPage() {
  const { settings, today } = useSystem();
  const currentIndex = cycleIndexFor(today, settings.cycleAnchor);
  const [offset, setOffset] = useState(0);
  const cycle = cycleAt(currentIndex + offset, settings.cycleAnchor);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-lg font-black uppercase tracking-wider text-cyan-300 text-glow">28-Day Cycle {cycle.index + 1}</h1>
          <p className="font-mono text-xs text-slate-400">
            {prettyDate(cycle.start)} → {prettyDate(cycle.end)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-ghost" onClick={() => setOffset((o) => o - 1)} aria-label="Previous cycle">
            <ChevronLeft size={16} /> Prev
          </button>
          {offset !== 0 && (
            <button className="btn-ghost text-cyan-200" onClick={() => setOffset(0)}>
              <LocateFixed size={14} /> Current
            </button>
          )}
          <button className="btn-ghost" onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0} aria-label="Next cycle">
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <WeeklyAnalytics cycle={cycle} />
      <HabitGrid cycle={cycle} />
      <p className="text-center font-mono text-[10px] text-slate-500">Dimmed boxes = not scheduled that day (bonus EXP). Scroll sideways on mobile →</p>
    </div>
  );
}
