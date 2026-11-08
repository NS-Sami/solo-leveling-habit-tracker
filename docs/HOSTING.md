# Where to host The System

Research done 8 Nov 2026. Prices and limits change, so check the linked official pages before relying on them.

## The short answer

**Use Supabase for the backend (accounts and data), and Cloudflare for the website.** Both are free, neither needs a credit card, and Cloudflare gives you a free web address.

## Why not host the website on Supabase?

Supabase is a backend: database, sign-in, file storage and server functions. It does not host websites.

- **Edge Functions:** on the free plan, a page returned as `text/html` is rewritten to `text/plain`, so the browser shows code instead of the app. Supabase's documentation says *"Serving of HTML content is only supported with custom domains"* ([Edge Functions limits](https://supabase.com/docs/guides/functions/limits)).
- **Custom domains:** these are *"available as a paid add-on for projects on a paid plan"* ([Custom domains](https://supabase.com/docs/guides/platform/custom-domains)). That means the Pro plan ($25/month) plus the add-on ($10/month per domain) ([Pricing](https://supabase.com/pricing)), and you would also need to buy a domain.
- **Storage:** users report that Supabase Storage serves `index.html` as plain text too ([discussion](https://github.com/orgs/supabase/discussions/39110)).
- **Roadmap:** a request for static site hosting has been open since 2021 ([discussion #991](https://github.com/orgs/supabase/discussions/991)).

So hosting everything on Supabase would cost about **$35/month or more**. Hosting the website elsewhere costs $0 and works better.

Nothing changes in the code for this: the app already uses Supabase from the browser. Wherever the website is hosted, it talks to the same Supabase project.

## Options compared

| | **Cloudflare Workers** ⭐ | GitHub Pages | Netlify | Vercel | Supabase (website) |
|---|---|---|---|---|---|
| **Cost** | Free | Free | Free | Free (Hobby) | ~$35/month |
| **Free web address** | `name.your-subdomain.workers.dev` | `ns-sami.github.io/repo/` | `name.netlify.app` | `name.vercel.app` | ✗ Needs a paid domain |
| **Allowed for a product that may earn money later** | ✅ | ❌ Not for an online business or SaaS | ✅ | ❌ Hobby plan is non-commercial | ✅ |
| **Website traffic** | Static files: **free and unlimited** | 100 GB/month soft limit | Credit-based, check current limits | Limited | 5 GB/month on the free plan |
| **Auto-deploy from GitHub** | ✅ 3,000 build minutes/month | ✅ | ✅ | ✅ | ✗ |
| **Setup effort** | Medium | Easiest | Easy | Easy | Not possible free |

**Why Cloudflare.** It is the only option here that is free, allows a product that may earn money later, and does not limit website traffic. Requests to static files are *"free and unlimited"* ([Workers static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)). This site is only static files, so it never uses the Workers free plan's 100,000 requests/day limit ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)). Builds get 3,000 minutes a month, one at a time, each up to 20 minutes ([Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)).

**Why Workers and not Cloudflare Pages.** Cloudflare now recommends Workers for new sites, and its new features go to Workers ([best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)). Pages still works.

**Why not stay on GitHub Pages.** It works for a personal portfolio. But GitHub's rules say Pages is *"not intended for or allowed to be used as a free web-hosting service to run your online business"*, and excludes sites *"providing commercial software as a service (SaaS)"*. They also say Pages sites *"shouldn't be used for sensitive transactions like sending passwords"* ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). Your plan is to grow and charge later, and the app has a login form, so it is better to start where you can stay.

## What happens as you grow

| Stage | What to do | Cost |
|---|---|---|
| **Now** (you and friends) | Cloudflare (free) + Supabase Free | $0 |
| **Real users** | Add custom SMTP so sign-up emails reach everyone. Free email providers exist. | $0 |
| **Want your own name**, like `thesystem.app` | Buy a domain (about $10/year) and connect it in Cloudflare | ~$10/year |
| **Database near 500 MB**, or you need no pausing and backups | Supabase Pro | $25/month |

At about 27 completions a day, one user adds roughly 10,000 rows a year, which is a few MB. The 500 MB free database holds a lot of hunters.

## The free plan limits that matter

**Supabase Free** ([pricing](https://supabase.com/pricing))

| Limit | Value |
|---|---|
| Database | 500 MB |
| Egress | 5 GB/month |
| Monthly active users | 50,000 |
| Active projects | 2 |
| **Inactivity** | **Pauses after one week without activity.** Data is kept, but you must press **Restore** in the dashboard. Visitors can't load or save online until you do. |
| Built-in email | Only reaches your own Supabase team, and only about 2 emails/hour ([SMTP docs](https://supabase.com/docs/guides/auth/auth-smtp)). Set up custom SMTP before inviting people. |

**Cloudflare Workers Free**

| Limit | Value |
|---|---|
| Static file requests | Free and unlimited |
| Files per site | 20,000 (this site has about 20) |
| Size per file | 25 MiB |
| Builds | 3,000 minutes/month, 1 at a time |
