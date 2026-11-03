/**
 * Stats dashboard: attribute radar, cumulative EXP curve, quest leaderboard, summary tiles.
 */
import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, BarChart3, Crown, Medal } from 'lucide-react';
import { useSystem } from '../state/SystemProvider';
import { STATS, expHistory, questLeaderboard, statPoints } from '../domain/stats';
import { addDays, fromKey, MONTH_SHORT, prettyDate } from '../domain/dates';
import { Panel, ProgressBar, StatTile } from '../components/ui/primitives';

const RANGES = [
  { id: 30, label: '30D' },
  { id: 90, label: '90D' },
  { id: 365, label: '1Y' },
];

export function StatsPage() {
  const { completions, quests, idx, today, exp, level, streak, best, earliest } = useSystem();
  const [range, setRange] = useState(30);

  const points = useMemo(() => statPoints(completions), [completions]);
  const radarData = STATS.map((s) => ({ stat: s.label, long: s.long, value: points[s.id] }));
  const maxStat = Math.max(100, ...radarData.map((d) => d.value));

  const from = useMemo(() => {
    const f = addDays(today, -(range - 1));
    return f < earliest ? earliest : f;
  }, [today, range, earliest]);
  const history = useMemo(() => expHistory(completions, from, today), [completions, from, today]);
  const leaderboard = useMemo(() => questLeaderboard(quests, idx, today, 28).slice(0, 10), [quests, idx, today]);

  const activeDays = new Set(completions.map((c) => c.date)).size;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Total EXP" value={exp.toLocaleString()} sub={`Lv ${level.level} · ${level.rank.label}`} color={level.rank.color} />
        <StatTile label="Quests cleared" value={completions.length.toLocaleString()} sub={`${activeDays} active days`} />
        <StatTile label="Current streak" value={`${streak}d`} sub="days ≥ threshold" color="#FB923C" />
        <StatTile label="Best streak" value={`${best}d`} sub="all time" color="#FBBF24" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel title="Attributes" icon={<Activity size={14} />} className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="rgba(59, 158, 255,0.18)" />
                <PolarAngleAxis dataKey="stat" tick={{ fill: '#cbd5e1', fontSize: 12, fontFamily: 'Orbitron', fontWeight: 700 }} />
                <PolarRadiusAxis domain={[0, maxStat]} tick={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0B0E14', border: '1px solid rgba(59, 158, 255,.35)', borderRadius: 8, fontFamily: 'JetBrains Mono', fontSize: 12 }}
                  formatter={(v: number, _n, p) => [`${v.toLocaleString()} pts`, (p?.payload as { long: string })?.long]}
                  labelFormatter={() => ''}
                />
                <Radar dataKey="value" stroke="#5CC8FF" strokeWidth={2} fill="#5CC8FF" fillOpacity={0.22} dot={{ r: 4, fill: '#5CC8FF', stroke: '#0B0E14', strokeWidth: 2 }} isAnimationActive />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1.5">
            {STATS.map((s) => (
              <li key={s.id} className="grid grid-cols-[44px_1fr_64px] items-center gap-2 font-mono text-xs">
                <span className="font-bold text-slate-200">{s.label}</span>
                <ProgressBar value={points[s.id] / maxStat} color={s.color} height={6} label={s.long} />
                <span className="text-right text-slate-300">{points[s.id].toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="EXP History"
          icon={<BarChart3 size={14} />}
          className="lg:col-span-3"
          action={
            <div className="flex gap-1" role="group" aria-label="Range">
              {RANGES.map((r) => (
                <button key={r.id} onClick={() => setRange(r.id)} className={`chip ${range === r.id ? 'border-cyan-300/70 bg-cyan-400/15 text-cyan-100' : 'border-white/10 text-slate-400'}`} aria-pressed={range === r.id}>
                  {r.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="expFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5CC8FF" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5CC8FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => `${fromKey(d).getDate()} ${MONTH_SHORT[fromKey(d).getMonth()]}`}
                  tick={{ fill: '#64798f', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis tick={{ fill: '#64798f', fontSize: 10, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} width={48} />
                <Tooltip
                  contentStyle={{ background: '#0B0E14', border: '1px solid rgba(59, 158, 255,.35)', borderRadius: 8, fontFamily: 'JetBrains Mono', fontSize: 12 }}
                  labelFormatter={(d) => prettyDate(String(d))}
                  formatter={(v: number, n) => [v.toLocaleString(), n === 'exp' ? 'Total EXP' : 'Gained']}
                  cursor={{ stroke: 'rgba(92, 200, 255,0.4)' }}
                />
                <Area type="monotone" dataKey="exp" stroke="#5CC8FF" strokeWidth={2} fill="url(#expFill)" activeDot={{ r: 5, stroke: '#0B0E14', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Quest Leaderboard · last 28 days" icon={<Crown size={14} />} bodyClass="p-0">
        {leaderboard.length === 0 ? (
          <p className="p-4 font-mono text-sm text-slate-400">Complete quests to populate the leaderboard.</p>
        ) : (
          <ol className="divide-y divide-white/5">
            {leaderboard.map((s, i) => (
              <li key={s.quest.id} className="grid grid-cols-[32px_1fr_auto] items-center gap-3 px-4 py-2 sm:grid-cols-[32px_1fr_180px_auto]">
                <span className="flex justify-center font-display text-sm font-black" style={{ color: i === 0 ? '#FBBF24' : i === 1 ? '#CBD5E1' : i === 2 ? '#F59E0B' : '#64798f' }}>
                  {i < 3 ? <Medal size={18} /> : i + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-sans text-sm font-semibold text-slate-100">{s.quest.name}</div>
                  <div className="font-mono text-[10px] text-slate-500">
                    {s.quest.category} · {s.done}/{s.scheduled} days
                  </div>
                </div>
                <div className="hidden sm:block">
                  <ProgressBar value={s.rate} color={s.rate >= 0.8 ? '#22C55E' : s.rate >= 0.5 ? '#3B9EFF' : '#64748B'} height={6} label={`${s.quest.name} consistency`} />
                </div>
                <span className="w-14 text-right font-mono text-sm font-bold text-white">{Math.round(s.rate * 100)}%</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
