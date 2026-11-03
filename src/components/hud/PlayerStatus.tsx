/**
 * STATUS window — styled like a game "System" status screen:
 *   big LEVEL number · JOB / TITLE / NAME lines · EXP & QUEST bars · stat table.
 */
import { useMemo } from 'react';
import { Flame } from 'lucide-react';
import { useSystem } from '../../state/SystemProvider';
import { HunterAvatar } from './Avatar';
import { RankBadge } from './RankBadge';
import { Panel, ProgressBar } from '../ui/primitives';
import { dayOfCycle } from '../../domain/cycle';
import { STATS, statLevel, statPoints } from '../../domain/stats';

const STAT_GLYPH: Record<string, string> = { STR: '⚔', AGI: '➶', INT: '✦', VIT: '✚', SEN: '◉' };

export function PlayerStatus({ compact = false }: { compact?: boolean }) {
  const { settings, level, exp, streak, best, todayStats, today, completions } = useSystem();
  const points = useMemo(() => statPoints(completions), [completions]);

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <RankBadge rank={level.rank} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 font-mono text-xs">
            <span className="whitespace-nowrap font-bold text-white">Lv {level.level}</span>
            <span className="hidden truncate text-slate-400 sm:inline">{exp.toLocaleString()} EXP</span>
          </div>
          <ProgressBar value={level.levelProgress} color="#5CB4FF" height={5} label="Level progress" />
        </div>
        <div className="flex items-center gap-1 font-mono text-sm font-bold text-orange-300" title="Current streak">
          <Flame size={16} className={streak > 0 ? 'animate-flicker text-orange-400' : 'text-slate-600'} />
          {streak}
        </div>
      </div>
    );
  }

  const job = 'Hunter';

  return (
    <Panel title="Status" centered bodyClass="px-4 pb-4 pt-1 sm:px-5" className="overflow-hidden">
      {/* LEVEL · JOB / TITLE · Avatar + rank */}
      <div className="flex items-center gap-4">
        <div className="flex w-20 shrink-0 flex-col items-center sm:w-24">
          <span className="font-display text-5xl font-extrabold leading-none text-white text-glow sm:text-6xl">{level.level}</span>
          <span className="mt-1 font-display text-[11px] font-bold tracking-[0.35em] text-cyan-200">LEVEL</span>
        </div>
        <dl className="min-w-0 flex-1 space-y-1 font-display text-[13px] sm:text-sm">
          <StatusLine label="JOB" value={job} />
          <StatusLine label="TITLE" value={level.title} color={level.rank.color} />
          <StatusLine label="NAME" value={settings.hunterName} />
        </dl>
        <div className="relative shrink-0">
          <HunterAvatar src={settings.avatarDataUrl} size={56} color="#5CB4FF" />
          <div className="absolute -bottom-3 -right-3">
            <RankBadge rank={level.rank} size={34} />
          </div>
        </div>
      </div>

      <div className="sys-divider my-4" />

      {/* EXP + QUEST bars (the System's HP/MP equivalents) */}
      <div className="space-y-2.5">
        <BarRow label="EXP" value={level.levelProgress} color="#5CB4FF" text={`${exp.toLocaleString()} / ${level.nextLevelAt.toLocaleString()}`} />
        <BarRow
          label="QUEST"
          value={todayStats.ratio}
          color={todayStats.ratio >= 1 ? '#FBBF24' : '#8ACBFF'}
          text={`${todayStats.done} / ${todayStats.scheduled}`}
        />
        <div className="flex justify-between font-mono text-[10px] text-slate-400">
          <span>{(level.nextLevelAt - exp).toLocaleString()} EXP to Lv {level.level + 1}</span>
          <span>{level.nextRank ? `${level.nextRank.label} at ${level.nextRank.minExp.toLocaleString()}` : 'Highest rank'}</span>
        </div>
      </div>

      <div className="sys-divider my-4" />

      {/* Stat table, two columns like a game status screen */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-display text-[15px]">
        {STATS.map((s) => (
          <div key={s.id} className="flex items-center justify-between" title={`${s.long}: ${points[s.id].toLocaleString()} pts`}>
            <dt className="flex items-center gap-2 font-bold tracking-widest text-cyan-100">
              <span className="w-4 text-center text-cyan-300" aria-hidden>
                {STAT_GLYPH[s.id]}
              </span>
              {s.label}:
            </dt>
            <dd className="font-bold text-white text-glow">{statLevel(points[s.id])}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between" title={`Best streak: ${best} days`}>
          <dt className="flex items-center gap-2 font-bold tracking-widest text-orange-200">
            <Flame size={15} className={streak > 0 ? 'animate-flicker text-orange-400' : 'text-slate-600'} />
            STREAK:
          </dt>
          <dd className="font-bold text-white">{streak}</dd>
        </div>
      </dl>

      <div className="sys-divider my-4" />

      <div className="flex items-center justify-between font-mono text-[11px] text-slate-300">
        <span>
          Cycle day <b className="text-white">{dayOfCycle(today, settings.cycleAnchor)}</b>/28
        </span>
        <span>
          Best streak <b className="text-white">{best}</b>d
        </span>
      </div>
    </Panel>
  );
}

function StatusLine({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className="w-12 shrink-0 font-bold tracking-wider text-cyan-200 sm:w-14 sm:tracking-widest">{label}:</dt>
      <dd className="min-w-0 break-words font-semibold leading-tight text-white" style={color ? { color, textShadow: `0 0 10px ${color}99` } : undefined}>
        {value}
      </dd>
    </div>
  );
}

function BarRow({ label, value, color, text }: { label: string; value: number; color: string; text: string }) {
  return (
    <div className="grid grid-cols-[56px_1fr_auto] items-center gap-3">
      <span className="font-display text-sm font-bold tracking-widest text-cyan-100">{label}</span>
      <ProgressBar value={value} color={color} height={9} label={label} />
      <span className="min-w-[88px] text-right font-mono text-[11px] text-slate-200">{text}</span>
    </div>
  );
}
