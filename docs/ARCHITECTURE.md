# Architecture

## Folder layout

```
src/
├─ domain/            Pure TypeScript. No React, no DB. 100% unit-testable.
│  ├─ types.ts        Quest, Completion, DayMeta, Settings, MediaItem
│  ├─ dates.ts        Local-date keys (YYYY-MM-DD), never UTC
│  ├─ leveling.ts     EXP → Level → Rank curve (the only place thresholds live)
│  ├─ completion.ts   Schedule-aware daily completion %
│  ├─ streak.ts       Forgiving streak + best streak
│  ├─ cycle.ts        28-day cycles from an anchor date
│  └─ stats.ts        Attribute points, EXP history, leaderboard
├─ data/
│  ├─ db.ts           Dexie schema (IndexedDB), first-run seed, demo mode
│  ├─ seed.ts         The 27 default quests + default settings
│  ├─ actions.ts      The single write seam (toggle, save, archive, …)
│  ├─ backup.ts       JSON export / restore
│  └─ csvImport.ts    Google Sheets CSV → completions (fuzzy name matching)
├─ state/
│  ├─ SystemProvider.tsx  Live queries + derived values + System events
│  └─ ui.ts               zustand: tab, toasts, modals
├─ lib/
│  ├─ sfx.ts          Web Audio sound effects + generative "System Anthem"
│  └─ media.ts        YouTube / Facebook URL parsing & embed URLs
├─ components/        hud/ · today/ · grid/ · analytics/ · media/ · system/ · ui/
└─ pages/             Today · Grid · Stats · Quests · Settings
```

## Data flow

1. **Write:** a component calls an action (`toggleCompletion(quest, date)`), which writes to IndexedDB through Dexie.
2. **React:** `useLiveQuery` in `SystemProvider` sees the change and re-reads the tables.
3. **Derive:** `SystemProvider` memoizes the derived state: a completion index (`Set<"questId|date">`), a per-day stats cache, total EXP, level info, current and best streak.
4. **Events:** the provider compares the previous and current level and today's completion, then fires the **level-up modal** and **daily-complete** fanfare. Neither fires on first load.
5. **Render:** components read everything from `useSystem()`.

Toggling a box goes through all five steps in a few milliseconds. There's no network involved at all.

## Core rules

### Level curve (`domain/leveling.ts`)

| Rank | Levels | EXP band | EXP per level |
|---|---|---|---|
| E | 1–5 | 0 – 500 | 100 |
| D | 6–10 | 501 – 1,500 | 200 |
| C | 11–15 | 1,501 – 3,500 | 400 |
| B | 16–20 | 3,501 – 7,000 | 700 |
| A | 21–25 | 7,001 – 12,000 | 1,000 |
| S | 26+ | 12,001+ | 1,500 (Lv 36+ = *National Level*) |

The maximum is 650 EXP/day (all 27 quests). Rank is **lifetime** and carries across cycles.

### Completion % (`domain/completion.ts`)

`ratio = completed scheduled quests / scheduled quests` for that date. A quest is *scheduled* on a date when:
`createdAt ≤ date`, it isn't archived yet, and the weekday is in `scheduleDays`.
Checking an unscheduled quest still earns EXP (bonus) but doesn't change the denominator.

### Streak (`domain/streak.ts`)

Walk backwards from today:
- **today** adds +1 only if it already qualifies. It never breaks the streak while it's in progress.
- **rest days** and days with nothing scheduled are skipped.
- any other day below the threshold (default 50%) ends the streak.

### Cycles (`domain/cycle.ts`)

`cycleStart = anchor + 28 × floor((date − anchor) / 28)`. Changing the anchor only re-groups history into different cycles. Nothing is deleted.

## Performance

- Vendor code is split into chunks (`react`, `charts`, `motion`, `data`), so app updates don't invalidate cached libraries.
- About 265 KB gzipped in total, precached by the service worker, so later visits load instantly from cache.
- Third-party video iframes are **click-to-load**: no Facebook or YouTube scripts run until you press play.

## Accessibility

- Every checkbox has `role="checkbox"`, `aria-checked`, and a label that includes the quest name and date.
- Keyboard: Tab/Enter/Space everywhere, `1`–`5` switch tabs, `Esc` closes modals.
- `prefers-reduced-motion` disables animation.
- Identity is never shown by colour alone: categories have icons and weeks have labels.

## Testing

```bash
npm test
```

24 Vitest tests cover date math (month/year/leap-year rollovers), rank boundaries (500/501, 12,000/12,001), schedule-aware percentages, streak forgiveness, cycle slicing that matches the original sheet (11 Oct → 7 Nov), EXP snapshots, the CSV importer, and media URL parsing.
