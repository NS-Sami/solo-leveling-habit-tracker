# LinkedIn post kit

**Image to attach:** `docs/assets/cover-linkedin.png` (1200×627). Add 2–3 more from `docs/screenshots/` for a carousel.
**Before posting:** replace `<LIVE_URL>` and `<REPO_URL>` with your links.

---

## Option 1: Story (recommended)

> I turned my habit tracker into an RPG. ⚔️
>
> For months I tracked 27 daily habits in Google Sheets: prayer, DSA practice, deep study, water, sleep by 10:30. It worked, but a spreadsheet can't celebrate you. No sound, no level-up, and it's clumsy on a phone.
>
> So I built **The System**, a habit tracker inspired by the "System" in Solo Leveling:
>
> 🗡️ Every habit is a daily quest that earns EXP
> 🏅 EXP levels you up from E-Rank to S-Rank
> 🔥 Streaks that *forgive*: rest days don't break them
> 📅 A 28-day grid, weekly donut charts and an attribute radar (STR · INT · VIT…)
> 🚨 An "Emergency Quest" alert if I'm under 40% by 10 PM
> 📱 Installs on my phone and works fully offline
>
> Before writing any code, I researched why people *quit* habit apps. The top reasons were streak anxiety, rigid "every day" schedules, and losing their data. So I designed against each one: forgiving streaks, per-weekday schedules, and local-first storage with one-click backups.
>
> Built with React, TypeScript, Vite, Tailwind, Framer Motion, Recharts, IndexedDB (Dexie) and a PWA service worker. The sound effects and anthem are synthesized live with the Web Audio API, so there are zero audio files.
>
> 🔗 Live: <LIVE_URL>
> 💻 Code: <REPO_URL>
>
> What habit would you turn into a daily quest?
>
> #React #TypeScript #WebDevelopment #PWA #Gamification #HabitTracking #BuildInPublic #SoloLeveling

---

## Option 2: Short

> Shipped: **The System** ⚔️, an RPG habit tracker inspired by Solo Leveling.
> 27 daily quests → EXP → E-Rank to S-Rank. Forgiving streaks, a 28-day grid, attribute radar, offline PWA.
> React + TypeScript + IndexedDB, with sound synthesized via the Web Audio API.
> Live: <LIVE_URL> · Code: <REPO_URL>
> #React #TypeScript #PWA #Gamification

---

## Talking points for comments / interviews

- **Design challenge:** "How do you gamify without punishing?" Penalties are visual only. Nothing ever takes away EXP.
- **Engineering choice:** store facts, derive everything else. EXP, level and streak are pure functions over completions, so they can never get out of sync.
- **A subtle bug avoided:** dates are local `YYYY-MM-DD`, not UTC. Otherwise a check-in at 1 AM in Dhaka (UTC+6) would land on the previous day.
- **History integrity:** each completion stores its EXP value, so editing a quest's reward doesn't rewrite the past.
- **Migration:** a CSV importer that fuzzy-matches the Google Sheet's quest names to app quests.
- **Quality:** 24 unit tests; screenshots generated automatically by a headless browser script.

## Suggested carousel order

1. `docs/assets/cover-linkedin.png`
2. `docs/screenshots/02-grid-desktop.png`, "The spreadsheet, upgraded"
3. `docs/screenshots/03-stats-desktop.png`, "Attributes & EXP history"
4. `docs/screenshots/07-levelup.png`, "The part a spreadsheet can't do"
5. `docs/screenshots/05-today-mobile.png`, "2-second check-in on mobile"
