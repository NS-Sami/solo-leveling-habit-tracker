# Deployment Guide

The full setup, including Supabase accounts, is in the [README](../README.md#-put-it-online-with-accounts-free). This page covers other hosts and installing on a phone.

The System is a **static site**: HTML, JS, and CSS plus a service worker. Accounts and saved progress are handled by Supabase, so there is no server of your own to run.

## Should I deploy it?

**Yes.** Deploying is what makes it easy to use every day:

| Need | Deploy? |
|---|---|
| Open it on your phone in one tap | ✅ Deploy, then **Install** it to your home screen (PWA) |
| Use it offline (on a bus, no data) | ✅ Works offline after the first visit |
| Share a link on LinkedIn / in your CV | ✅ A live demo is far more convincing than screenshots |
| Keep your habit data private | ✅ Each account's data is protected by Row Level Security |
| See the same progress on every device | ✅ Sign in to the same account |

> ⚠️ Without an account ("Continue without an account"), data is per browser and does not sync.

> ⚠️ **On any host other than GitHub Pages**, add that site's address to Supabase's Site URL and Redirect URLs, or email links will fail.

## Recommended options

| Host | Cost | Setup time | Best for |
|---|---|---|---|
| **GitHub Pages** ⭐ | Free | ~5 min | Portfolio and LinkedIn: the repo and live demo sit together |
| **Vercel** | Free | ~2 min | Fastest setup, preview URL for every push |
| **Netlify** | Free | ~2 min | Drag-and-drop `dist/` folder, no Git needed |
| **Cloudflare Pages** | Free | ~3 min | Fastest global CDN |

My pick: **GitHub Pages** for the portfolio link, plus installing it as a PWA on your phone for daily use.

---

### Option A: GitHub Pages (workflow included)

Follow [the README steps](../README.md#-put-it-online-with-accounts-free). The workflow in `.github/workflows/deploy.yml` runs the tests, builds, and deploys on every push to `main`. The Vite config uses `base: './'`, so it works under any sub-path without changes.

### Option B: Vercel

1. Go to <https://vercel.com/new> and import the GitHub repo.
2. Framework preset **Vite** (auto-detected). Build: `npm run build`, output: `dist`.
3. Deploy. You get `https://the-system-xxx.vercel.app`.

### Option C: Netlify drop (no Git)

1. Run `npm run build` locally.
2. Drag the `dist/` folder onto <https://app.netlify.com/drop>.

### Option D: Cloudflare Pages

Connect the repo. Build command `npm run build`, output directory `dist`.

---

## Install it on your phone (PWA)

- **Android (Chrome / Edge):** open the site → ⋮ menu → **Install app** (or *Add to Home screen*).
- **iPhone (Safari):** open the site → Share → **Add to Home Screen**.
- **Windows / macOS (Chrome / Edge):** click the install icon in the address bar.

It then opens full-screen like a native app and works offline.

## Keeping your data safe

1. Open **Settings → Data & Backups → Request persistent storage**, so the browser won't evict your data.
2. **Export JSON** weekly (the app reminds you after 7 days). Keep the file in Google Drive.
3. Clearing site data / browser data **erases your progress** unless you have a backup.

## Moving from the Google Sheet

1. In Google Sheets: **File → Download → Comma-separated values (.csv)** for the tracker tab.
2. In the app: **Settings → Data & Backups → Import from Google Sheets → Choose CSV**.
3. Set the date of the sheet's first checkbox column (e.g. *11 Oct 2026*) and check the preview, which shows each sheet row matched to an app quest.
4. Click **Import**.
