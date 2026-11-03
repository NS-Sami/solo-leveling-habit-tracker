# The System: Solo Leveling Habit Tracker (Build Plan)

> **Status (v1.0):** Phases 1–8 are implemented. Phase 9 (Supabase sync) is designed but not wired up (schema in [DATA-MODEL.md](DATA-MODEL.md)).
> Defaults chosen for the open questions: the spec's rank table kept as-is (the old sheet's 4,935 EXP is B-Rank Lv 18 under it); EXP and rank are lifetime across cycles; the folder is `domain/ data/ state/ lib/ components/ pages/`.

## 1. Context

The tracker currently lives in Google Sheets: a 28-day checkbox grid, weekly donut and bar charts, a Player Status block, and a quote with a link to a video. Sheets can't embed video, play sound, animate, or show level-up moments, and it's awkward to use on a phone. The goal is a web app that **replaces the sheet completely**: offline-first, works well on a phone, keeps the existing history, and adds the "System" feel from the anime.

---

## 2. Research: what similar apps do and why people stick with them

| App / type | What keeps people using it | What makes them quit |
|---|---|---|
| **Solo Leveling-style apps** (Solo Level: System, Solo Hunter, Quest Leveling, HabitForge, Dual, IRLQUEST) | E→S rank progress, daily quests that reset each day, stat points, the "System window" style notifications | Thin features under the theme, aggressive paywalls, apps that only work on iOS |
| **Habitica** (the original RPG habit tracker) | Real stakes (you lose HP when you skip), party accountability | Every habit has to be done every day, harsh punishment, too much game "noise" |
| **Streaks** | A big visible streak counter (loss aversion), very fast check-ins | The streak becomes a source of anxiety; one missed day feels like a disaster |
| **Finch** | Warm tone, forgiving, gentle | Not enough challenge for people who want discipline |

**The common patterns behind the popular apps:**
1. **Check-ins take about 2 seconds.** Opening the app and ticking today's quests has to be instant. Most people quit because of friction.
2. **Each day has a visible ending.** "Today's quests" refresh, with a clear finish state ("Daily Quest Complete").
3. **Progress has to show up in one place.** EXP, level, rank, and stats all update the moment you tick a box.
4. **Streaks should be forgiving.** The most common reason people give for abandoning a habit app is anxiety over a broken streak. The apps that last offer rest days or a freeze, and they **never wipe progress**.
5. **Schedules have to match real life.** A habit like "Isometric Split (training days only)" must not count against you on rest days. That is one of Habitica's biggest complaints.
6. **Never lose data.** Losing data after a reinstall or sync is the top complaint in 1–3★ reviews. Backups are a core feature.
7. **The theme should sit on top of real usefulness.** Too much game "noise" (constant sounds, popups, confetti) wears people out. Keep the big effects for big moments.

Sources: [Solo Level: System](https://apps.apple.com/us/app/id6755756882), [Solo Hunter](https://apps.apple.com/us/app/-/id6758021041), [Quest Leveling](https://apps.apple.com/us/app/quest-leveling/id6744368718), [HabitForge](https://habitforgeio.netlify.app/faq/), [Habitica vs Streaks](https://habitify.me/compare/habitica-vs-streaks), [HabitStreak comparison](https://habitstreak-web.pages.dev/compare), [Streak anxiety](https://habitdoom.com/blog/streak-anxiety-habit-trackers), [Yu-kai Chou on streak burnout](https://yukaichou.com/gamification-analysis/streak-design-gamification-motivation-burnout/), [Unstar 1–3★ review analysis](https://unstar.app/blog/habitica-streaks-productive-way-of-life-habit-bull-habit-tracker-apps-ranked-2026), [Gamification critique](https://mindcrate.vercel.app/best-habit-tracker-apps-with-gamification-that-still-feel-useful-d38b20). Most of these are vendor or blog sources, so treat them as direction rather than hard data.

---

## 3. Problems in the spec (decide before building)

| # | Problem | Recommended fix |
|---|---|---|
| 1 | The spec says **26 quests**, but the table lists **27** (Physical 5, Spiritual 2, Intellectual 9, Health 9, Routine 2). | Seed all 27. |
| 2 | Ranks cover 5 levels each, but the EXP needed for each individual level isn't defined. | Split each rank band evenly: E = 100 EXP/level, D = 200, C = 400, B = 700, A = 1000, S = +1500 per level after 12,001. Keep this in one config file. |
| 3 | The sheet shows **S-Rank at 4,935 EXP**. Under the new table, 4,935 EXP is **B-Rank (Lv 17)**. | Accept the new table (rank drops once on migration), or scale the thresholds. **The user decides.** |
| 4 | Ranks will come quickly: the maximum is **650 EXP/day** (18,200 per perfect 28-day cycle). At about 40% completion, S-Rank arrives around day 46. | EXP and rank are **lifetime** and carry across cycles. Optionally add prestige tiers after S (e.g. "National Level"). |
| 5 | The radar chart has 5 stats (STR, AGI, INT, VIT, SEN), but there are only 4 mappings, and Physical feeds both STR and AGI. | Give every quest a `stat` tag. Defaults: Walk and Sunlight → AGI; Isometrics, Neck, and Squat → STR; Intellectual → INT; Health → VIT; Spiritual and Routine → SEN. |
| 6 | `Earned EXP = Total Days × EXP Reward` rewrites past EXP whenever a reward is edited. | **Save the EXP value with each completion** at the time it's checked. History stays as it was. |
| 7 | "Completion % = done / all active quests" penalises quests that only happen on some days. | Each quest gets `scheduleDays` (default every day). The denominator only counts quests scheduled for that day. |
| 8 | The 28-day cycle isn't a calendar month (the sheet runs from the 11th to the 7th of the next month). | A cycle has a `startDate`. "Start New Cycle" archives the old one, and all history is kept. |
| 9 | Week colours and category colours share the same palette, which makes them easy to confuse. | Weeks use the colour ramp (cyan, purple, amber, red). Categories use small icons and labels, not those colours. |
| 10 | Facebook `share/r/...` links can't be embedded directly, and FB reel embeds are unreliable. | Resolve the link to `facebook.com/reel/<id>` and embed it with `plugins/video.php`. If that fails, show a thumbnail card that opens FB. YouTube and MP4 are the reliable main options. |
| 11 | IP: the official Solo Leveling art, logo, and music can't be used. | Use an **original** "System" HUD style (cyan holographic panels, hex grid). Use an original or royalty-free anthem and sound effects, or the user's own files. |

---

## 4. Tech stack

- **Vite + React 18 + TypeScript.** It's a single-user SPA with no server, and Next.js would add complexity it doesn't need.
- **Tailwind CSS** for the design tokens, **Framer Motion** for animation, **Lucide** for icons.
- **Recharts** for the donut, bar, radar, and line charts.
- **Zustand** for state, and **Dexie (IndexedDB)** for storage.
- **vite-plugin-pwa** so it can be installed on a phone, works offline, and gets a home-screen icon. The popular apps in this space are phone apps, so this matters a lot.
- **Howler.js** (or the Web Audio API) for sound effects.
- **Vitest** for tests of the domain logic.
- Later: a **Supabase** adapter behind a `StorageAdapter` interface.

---

## 5. Data model (Dexie now, maps 1:1 to Postgres later)

```ts
Quest      { id, name, category, stat, exp, difficulty, scheduleDays:number[], order, archived, createdAt }
Completion { id, questId, date:'YYYY-MM-DD', expAwarded, completedAt }   // unique (questId,date)
Cycle      { id, startDate, endDate, archived }
DayMeta    { date, restDay:boolean, note? }                               // forgiveness / streak freeze
Settings   { hunterName, avatar, sfxOn, volume, emergencyHour:22, streakThreshold:0.5,
             media:[{type:'youtube'|'facebook'|'file', url|blobKey, title}], quote, schemaVersion }
```

- **Derive** values like total EXP, level, streak, and completion % from `Completion` with pure functions. Never store them, so they can't drift out of sync.
- Store **local dates** (`YYYY-MM-DD` in the user's timezone, Asia/Dhaka). Never use UTC, or ticks near midnight land on the wrong day.
- Every record gets `updatedAt` and a `deleted` flag, which makes adding sync later straightforward.

---

## 6. Folder layout

```
src/
  domain/        # pure logic + tests: leveling.ts, streak.ts, completion.ts, stats.ts, cycle.ts
  data/          # db.ts (Dexie), seed.ts (27 quests), storageAdapter.ts, backup.ts, csvImport.ts
  store/         # zustand slices (quests, completions, settings, ui)
  components/
    hud/         # PlayerStatus, RankBadge, ExpBar, StreakFlame, TodayRing
    grid/        # HabitGrid, GridCell, DayHeader, SummaryRow, QuestRow
    analytics/   # WeekDonut, WeekBars, Radar, ExpHistory, Leaderboard
    media/       # QuoteCard, MediaPlayer, TheaterModal, AnthemToggle
    system/      # LevelUpModal, EmergencyBanner, SystemToast, Particles
    quests/      # QuestEditor (add / edit / archive / delete, reorder)
  pages/         # Today, Grid, Stats, Settings  (tabs / bottom nav on mobile)
  lib/           # sfx.ts, dates.ts, fbEmbed.ts
```

---

## 7. Build phases (each one ends with something you can use)

**Phase 1: Core logic.** Write the leveling curve, rank lookup, scheduled-aware completion %, streak (with rest days and "today doesn't count against you until it's over"), stat totals, and cycle week splits. Write unit tests for these first, because everything else depends on them.

**Phase 2: Storage, seed data, and the sheet import.** Set up the Dexie schema, seed the 27 quests, and add JSON export/import plus a **CSV import of the existing Google Sheet history**. Without the import, the migration is a non-starter.

**Phase 3: Habit grid.** Build the 28-day grid with sticky quest-name and summary columns, a glowing beam on today's column, and the summary row. On a phone, the default view is a **"Today" list** (big tap targets, one tap per quest), and the full grid scrolls horizontally.

**Phase 4: HUD.** Add the name and avatar, an animated rank badge (gold glow for S), the level/EXP bar, the streak flame, and today's ring.

**Phase 5: Analytics.** Add the 4 week donuts with daily bar charts (matching the sheet layout), plus the Stats tab: radar, cumulative EXP line, and top-10 quest leaderboard.

**Phase 6: Gamification.** Add the level-up / rank-up modal with particles, "Daily Quest Complete" at 100%, the **Emergency banner** (after 10 PM with today under 40%; visual only, nothing is ever deducted), System-style toasts ("[SYSTEM] +20 EXP · AGI +20"), and sound effects (on/off toggle and volume).

**Phase 7: Media hub.** Add the quote card, a YouTube/Shorts iframe, a Facebook reel embed with the fallback, MP4/WebM upload stored as an IndexedDB blob, theater mode, and the anthem toggle.

**Phase 8: Polish and PWA.** Add install-to-phone and offline caching, a weekly auto-backup reminder, keyboard support, `prefers-reduced-motion`, and contrast checks.

**Phase 9 (optional): Sync.** Add a Supabase adapter with magic-link login and last-write-wins sync by `updatedAt`.

---

## 8. Rules to follow throughout the build

1. **Tap to update: under 100 ms.** Update the UI first, then save in the background. Ticking a box must never feel slow.
2. **Never destroy progress.** Penalties are visual only. Rest days or a streak freeze protect the streak. Deleting a quest requires confirmation, and archive is the default.
3. **Save history with the record.** EXP is stored on each completion, and editing a quest never rewrites the past.
4. **Keep logic pure and tested.** Components don't calculate anything. They call `domain/` functions.
5. **Dates are local.** One `dates.ts` helper handles all of them, and it's tested around midnight and month rollovers.
6. **Save big effects for big moments.** Each tick gets a small sound and a toast. Confetti and fanfare are only for a level-up, a rank-up, or a 100% day. Respect reduced motion.
7. **Design for the phone first.** Tap targets of at least 44px. Bottom tab bar: Today / Grid / Stats / Settings. The full grid is a desktop luxury.
8. **Make backups obvious.** Put export one tap away, and remind the user if they haven't exported in 7 days.
9. **Keep the theme original.** No copyrighted Solo Leveling assets.
10. **Version the schema.** Add `schemaVersion` and Dexie migrations from day one, so future changes don't wipe data.

---

## 9. How to verify it works

- `npm test`: core-logic tests (level boundaries 500/501, 12,000/12,001; streak with rest days; scheduled denominators; cycle week split).
- `npm run dev`: tick quests and confirm EXP, level, today %, streak, donuts, and bars all update instantly. Push EXP across 500 and confirm the level-up modal appears.
- Change the system clock to 22:01 with today under 40% and confirm the Emergency banner shows.
- Export JSON → clear site data → import, and confirm everything is identical. Import the CSV exported from the sheet and confirm the totals match the sheet (e.g. "Fightback Nafs: 10 days / 200 EXP").
- Test on Chrome mobile emulation and a real phone: install as a PWA, turn on airplane mode, and confirm it still works.
- Lighthouse: PWA installable, accessibility ≥ 90.
