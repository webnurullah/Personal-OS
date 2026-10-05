# Nurullah POS — Personal Operating System

A private life-management app: dashboard, tasks, calendar, goals, habits, learning (weekly planner + course tracker), finance, health, notes and reminders.

```
  Browser ──► Next.js web app (Vercel)          pos.nurullah.com.bd
     │            │  sign in / sign out
     │            ▼
     │        Supabase Auth ◄──────────────┐
     │                                      │ checks every token
     └──────► Node.js API (Vercel) ─────────┤   api.nurullah.com.bd
                  │                         │
                  ▼                         │
              Supabase Postgres ◄───────────┘
              (Row Level Security: each user sees only their own rows)
```

- **web/** — Next.js 16 (App Router, Tailwind CSS v4). Pages, forms and charts. Talks to the API for all data.
- **api/** — Node.js + Express 5. The REST API (validation, business rules, totals).
- **supabase/** — the database: `migrations/` (tables, security rules, functions) and `tests/`.
- **template/** — the original static HTML template (reference only).

The web app and the API are two Vercel projects made from this one GitHub repository. **Every push to GitHub puts both live automatically.** Nothing is uploaded by hand.

**One rule throughout: store facts, calculate numbers.** The database keeps what happened (a transaction, a ticked habit, hours spent on a topic). Totals, streaks, percentages and progress are calculated when you look at them, so they are never out of date.

---

## 1. Supabase (database + sign-in)

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick the region **Southeast Asia (Singapore)**, the closest to Bangladesh. Save the database password somewhere safe.
2. Open **SQL Editor** → **New query**. Paste the whole of `supabase/migrations/20261001000000_init.sql` and click **Run**. Then do the same with `supabase/migrations/20261001000100_sample_data.sql`.
3. **Authentication → URL Configuration**
   - Site URL: `https://pos.nurullah.com.bd`
   - Redirect URLs: add `https://pos.nurullah.com.bd/**` and `http://localhost:3000/**`
4. **Authentication → Email Templates** (recommended, so email links work on any device):
   - *Confirm signup* — change the link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
   - *Reset password* — change the link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/update-password`
5. Copy two values (the **Connect** button at the top of the project shows both):
   - **Project URL**, like `https://abcdefghijklmnop.supabase.co` (also in **Project Settings → Data API**)
   - **Publishable key**, starting `sb_publishable_` (also in **Project Settings → API Keys**; the legacy `anon` key also works)

   **Never** use the *secret* / `service_role` key anywhere in this project. The app does not need it.

After your own account exists (section 3), turn off public sign-ups: **Authentication → Sign In / Providers → Allow new users to sign up → off**. It is your private app.

> Free Supabase projects pause after a week without any use. Opening the app now and then keeps it awake.

---

## 2. Vercel (API + web app)

Create **two projects from the same repository**. Both already run in Singapore, next to the database (`vercel.json` in each folder sets the region `sin1`), so pages stay fast.

### 2a. The API project (deploy this first)

1. On [vercel.com](https://vercel.com): **Add New → Project** → import `webnurullah/Personal-OS`.
2. Project name: for example `nurullah-pos-api`.
   **Root Directory: `api`**. Vercel detects **Express** by itself; leave the build settings empty.
3. **Environment Variables**:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_PUBLISHABLE_KEY` | your publishable key |
   | `CORS_ORIGINS` | `https://pos.nurullah.com.bd` (comma-separate more addresses, no trailing slash) |

4. **Deploy**. Open the address Vercel gives you (`https://nurullah-pos-api….vercel.app`). You should see `{"ok":true,"name":"Nurullah POS API",…}`.
5. **Settings → Domains** → add `api.nurullah.com.bd`, then add the DNS record Vercel shows (see 2c).

### 2b. The web app project

1. **Add New → Project** → import the **same** repository again.
2. Project name: for example `nurullah-pos`. **Root Directory: `web`**. Vercel detects Next.js by itself.
3. **Environment Variables**:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key |
   | `NEXT_PUBLIC_API_URL` | `https://api.nurullah.com.bd` (no trailing slash) |

4. **Deploy**, then **Settings → Domains** → add `pos.nurullah.com.bd` (see 2c).

> Before the domains work, you can test with the `….vercel.app` addresses: use the API's address as `NEXT_PUBLIC_API_URL`, and add the web app's address to `CORS_ORIGINS`. `NEXT_PUBLIC_…` values are built into the pages, so after changing one, **Redeploy** (Deployments → ⋯ → Redeploy).

### 2c. Domains (DNS in cPanel)

Your domain's DNS stays in cPanel. In **cPanel → Zone Editor** → `nurullah.com.bd` → **Manage**, add the records Vercel shows on each project's **Domains** page, usually:

| Name | Type | Value |
|---|---|---|
| `pos` | CNAME | as shown by Vercel (often `cname.vercel-dns.com`) |
| `api` | CNAME | as shown by Vercel |

Vercel adds the SSL certificate (https) by itself. If an `api` or `pos` record already exists (for example from a cPanel subdomain), remove it first; see 2d.

### 2d. If you set the API up on cPanel before

The API no longer runs on cPanel. Clean up so the `api` address can point to Vercel:

1. **cPanel → Setup Node.js App** → stop and delete the API application.
2. **File Manager** → delete the API folder you uploaded.
3. **Domains** → remove the `api.nurullah.com.bd` subdomain (this removes its old DNS record), then add the CNAME from 2c.

Keep cPanel for your WordPress portfolio.

### Updating the app

Push to GitHub. Pushes to `main` go live on both projects within a minute or two. Pushes to any other branch get their own **preview** link to try first. If a release goes wrong, Vercel's **Instant Rollback** switches back to an earlier deployment in one click (project → **Deployments**).

---

## 3. First sign-in

1. Open `https://pos.nurullah.com.bd` → **Create an account** → confirm the email.
   (Or create the user in Supabase: **Authentication → Users → Add user**, tick **Auto Confirm User**.)
2. Sign in. The dashboard offers **Load sample data**: example tasks, habits, the IQA course, a month of money and more. Delete it all later in **Settings → Data & privacy** when you start for real.
3. Turn off public sign-ups in Supabase (see section 1).
4. Check **Settings → Preferences**: time zone (default Asia/Dhaka), currency (৳ BDT or $ USD), week start, and your daily goals.

---

## Run it on your computer

Needs Node.js 24.

```bash
cd api
cp .env.example .env        # fill in SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev                 # http://localhost:4000
```

In a second terminal:

```bash
cd web
cp .env.example .env.local  # fill in the same Supabase values; API URL http://localhost:4000
npm install
npm run dev                 # http://localhost:3000
```

---

## Checks

| Where | Command | What it checks |
|---|---|---|
| `api/` | `npm test` | API: health check, sign-in required, bad tokens, CORS, security headers, date/streak/recurrence maths |
| `api/` | `npm run check` | Type-checks the JavaScript against the database types |
| `web/` | `npm test` | Budget and course calculations |
| `web/` | `npm run lint` · `npm run build` | Code style · production build |
| `supabase/tests/` | `npm install` then `npm test` | Migrations in an in-memory Postgres: every table's security rule (users cannot read or change each other's rows), sign-up trigger, sample data, bill payment, delete-all |

### After changing the database

Add a new file in `supabase/migrations/` (never edit one that has already run on your project), run it in the SQL Editor, then regenerate the API's types:

```bash
npx supabase gen types typescript --project-id <your-project-id> --schema public > api/src/types/database.ts
```

Then delete `api/src/types/database.d.ts` and run `npm run check` in `api/`.

---

## Security, in short

- Passwords and sign-in are handled by Supabase Auth. The app never sees or stores passwords.
- The API checks the sign-in token on every request, then talks to the database **as that user**. Postgres Row Level Security allows each user to reach only their own rows, even if the API had a bug.
- No secret keys exist in this project. The publishable key is safe to be public; it can only do what the security rules allow. Real values live only in Vercel's environment variables.
- The API only accepts browser calls from the addresses in `CORS_ORIGINS`, limits request rates, validates every input, and sets security headers.

## Troubleshooting

| Problem | Fix |
|---|---|
| Pages show "Cannot reach the server" | Check `NEXT_PUBLIC_API_URL` in the web project (https, no trailing slash) and that the API address answers `{"ok":true}`. Redeploy the web project after changing it. |
| Browser console shows a CORS error | `CORS_ORIGINS` in the **API** project must exactly match the web address (`https://pos.nurullah.com.bd`, no trailing slash). Redeploy the API project after changing it. |
| API shows an error page or 500 | Vercel → API project → **Logs** shows the reason. Usually a missing environment variable. |
| Email link says it is invalid or expired | Add the site to Supabase **Redirect URLs**, and use the email templates from section 1. |
| Always sent back to the sign-in page | Both Vercel projects must use the Supabase URL and key of the **same** Supabase project. |
| Domain does not open | DNS can take up to a few hours. Check the CNAME in cPanel Zone Editor matches what Vercel's **Domains** page shows. |
