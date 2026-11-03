/**
 * Weekly analytics: one donut ring (week completion %) + a 7-day bar chart per week.
 * Mirrors the original Google Sheet's layout, colour-coded W1 cyan → W4 red.
 *
 * Future days are excluded from the week % (and drawn as empty slots),
 * so an in-progress week is never shown as "failing".
 */
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSystem } from '../../state/SystemProvider';
import { aggregateRatio } from '../../domain/completion';
import { WEEK_COLORS, type CycleInfo } from '../../domain/cycle';
import { fromKey, WEEKDAY_SHORT, prettyDate } from '../../domain/dates';

function Donut({ value, color, size = 92 }: { value: number; color: string; size?: number }) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(value * 1000) / 10}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * Math.min(1, value)} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray .6s ease', filter: `drop-shadow(0 0 5px ${color}aa)` }}
      />
      <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" className="fill-white font-mono text-[15px] font-bold">
        {(Math.round(value * 1000) / 10).toFixed(1)}%
      </text>
    </svg>
  );
}

interface BarDatum {
  day: string;
  date: string;
  pct: number | null;
  done: number;
  scheduled: number;
  rest: boolean;
}

function BarTip({ active, payload }: { active?: boolean; payload?: { payload: BarDatum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-cyan-400/30 bg-void-900/95 px-2.5 py-1.5 font-mono text-[11px] text-slate-200 shadow-glow">
      <div className="text-slate-400">{prettyDate(d.date)}</div>
      {d.pct === null ? <div>Upcoming</div> : d.rest ? <div>Rest day</div> : <div><b className="text-white">{d.pct}%</b> · {d.done}/{d.scheduled} quests</div>}
    </div>
  );
}

export function WeeklyAnalytics({ cycle }: { cycle: CycleInfo }) {
  const { getDay, today } = useSystem();

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
      {cycle.weeks.map((week, w) => {
        const color = WEEK_COLORS[w];
        const past = week.filter((d) => d <= today).map(getDay);
        const ratio = aggregateRatio(past.filter((d) => !d.restDay));
        const data: BarDatum[] = week.map((d) => {
          const s = getDay(d);
          return {
            day: WEEKDAY_SHORT[fromKey(d).getDay()].slice(0, 2),
            date: d,
            pct: d > today ? null : Math.round(s.ratio * 1000) / 10,
            done: s.done,
            scheduled: s.scheduled,
            rest: s.restDay,
          };
        });
        const isCurrent = week.includes(today);
        return (
          <div key={w} className={`panel p-3 ${isCurrent ? 'ring-1 ring-cyan-300/40' : ''}`} style={{ borderColor: `${color}40` }}>
            <div className="flex items-center justify-between">
              <span className="font-display text-xs font-bold uppercase tracking-[0.2em] text-slate-200">Week {w + 1}</span>
              <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} aria-hidden />
            </div>
            <div className="mt-1 flex justify-center">
              <Donut value={ratio} color={color} />
            </div>
            <div className="h-24 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 6, right: 2, left: 2, bottom: 0 }} barCategoryGap="22%">
                  <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.12)' }} tick={{ fill: '#64798f', fontSize: 9, fontFamily: 'JetBrains Mono' }} interval={0} />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip content={<BarTip />} cursor={{ fill: 'rgba(59, 158, 255,0.08)' }} />
                  <Bar dataKey="pct" radius={[4, 4, 0, 0]} isAnimationActive>
                    {data.map((d) => (
                      <Cell key={d.date} fill={d.rest ? '#475569' : color} fillOpacity={d.date === today ? 1 : 0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
