# Verification Report

What was actually tested, and how. Run on 5 Nov 2026, on Windows with Node 26 and Microsoft Edge.

**Summary: everything below ran against a local stand-in, not a real Supabase project.** No Supabase project or keys existed when this was written, and the site was not live.

| Part | Real or stand-in? |
|---|---|
| Postgres, the migration, RLS policies, triggers | **Real** (PGlite, Postgres compiled to WebAssembly) |
| `supabase-js` client, the app, the browser | **Real** (production build in Microsoft Edge) |
| Supabase Auth and REST servers | **Stand-in** (`scripts/mock-supabase.mjs`, imitating the routes the app calls) |
| Sending real email | **Not tested** |
| GitHub Pages hosting | **Stand-in** (same sub-path with case-sensitive file lookup) |

## Automated results

| Suite | Command | Result |
|---|---|---|
| Unit, sync and security | `npm test` | 84 passed |
| Browser | `npm run e2e` | 24 passed, in 3 consecutive runs |
| Type check and production build | `npm run build` | Passed |

The sync engine's safety rules were also checked by deliberately breaking each of four rules in the code and confirming a test failed. One break initially went unnoticed, so a test was added for it.

## Requirement by requirement

| Check | Status | Evidence |
|---|---|---|
| Account creation | ✅ Tested on stand-in | Browser |
| Email confirmation required before sign-in | ✅ Tested on stand-in | Browser |
| Wrong password refused | ✅ Tested on stand-in | Browser |
| Login and logout | ✅ Tested on stand-in | Browser |
| Password reset | ✅ Tested on stand-in, with a simulated email link | Browser |
| Quest creation, editing, deletion | ✅ Tested | Browser, confirmed in the database |
| Daily completion and EXP | ✅ Tested | Browser, confirmed in the database |
| Streak calculation | ✅ Tested | Unit tests only, not through the browser flow |
| Persistence after refresh | ✅ Tested | Browser |
| Progress on one device appears on another | ✅ Tested | Two browser contexts (desktop and phone size), not two physical devices |
| Second account cannot read or change the first | ✅ Tested | 27 database tests, plus direct attack requests from a signed-in browser |
| No duplicate EXP from repeat taps or retries | ✅ Tested | Database constraint, lost-reply simulation, 5 rapid clicks |
| Import is approved, retry-safe, and keeps local data | ✅ Tested | Sync tests and browser |
| Network failure keeps changes, and "Saved" is not shown early | ✅ Tested | Sync tests and browser |
| Two-device conflicts are not silently overwritten | ✅ Tested | Sync tests and browser |
| Explicit timezone, default Asia/Dhaka | ✅ Tested | Unit tests with fixed instants |
| User-entered text rendered safely | ✅ Tested | Quest name containing HTML did not run. `javascript:` links are blocked. |
| Confirmation before destructive actions | ✅ Tested for quest delete and reset | Browser. Restore JSON and removing the local copy have confirmations, but were not run in the browser. |
| JSON export | ✅ Tested | Browser |
| Mobile layout | ✅ Tested at 390 px | No horizontal overflow on the sign-in and Today pages |
| Asset loading at the repository path | ✅ Tested on stand-in | No missing files, exact filename case |
| Secret keys refused | ✅ Tested | Unit tests for the app's check. The workflow step has not run on GitHub yet. |

## Bugs these tests found and fixed

- On phones, dialog buttons such as **Save Quest** were hidden behind the bottom navigation.
- "Saved" stayed on screen for a moment after an edit, before the status changed.
- A `javascript:` media link could have run code when clicked.

## Must be checked by a person

These cannot be tested without your accounts. Step 7 of the README lists them as a checklist.

- [ ] The migration runs on your real Supabase project.
- [ ] Real sign-up, confirmation and password reset emails arrive, and their links return to the site.
- [ ] The site works at its real GitHub Pages address, and the deploy workflow passes.
- [ ] RLS blocks a second account on the hosted project.
- [ ] Sync between a real phone and laptop, including real airplane mode.
- [ ] Installing as an app, and the service worker, which was disabled during browser tests.
- [ ] Behaviour while the project is paused. The app should show it cannot reach the server, but this has not been observed.
- [ ] Tokens expiring during long use. Automatic refresh was not exercised.
- [ ] Facebook reel embedding.
