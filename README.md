# Nurullah POS — Personal Operating System

A private life-management app: dashboard, tasks, calendar, goals, habits, learning (weekly planner + course tracker), finance, health, notes and reminders.

```
  Browser ──► Next.js web app (Vercel)          pos.nurullah.com.bd
     │            │  sign in / sign out
     │            ▼
     │        Supabase Auth ◄──────────────┐
     │                                      │ checks every token
     └──────► Node.js API (cPanel) ─────────┤   api.nurullah.com.bd
                  │                         │
                  ▼                         │
              Supabase Postgres ◄───────────┘
              (Row Level Security: each user sees only their own rows)
```

- **web/** — Next.js 16 (App Router, Tailwind CSS v4). Pages, forms and charts. Talks to the API for all data.
- **api/** — Node.js + Express 5. The REST API (validation, business rules, totals). Runs on cPanel.
- **supabase/** — the database: `migrations/` (tables, security rules, functions) and `tests/`.
- **template/** — the original static HTML template (reference only).

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
5. **Project Settings → API Keys**: copy the **Project URL** and the **Publishable key** (`sb_publishable_…`; the legacy `anon` key also works).
   **Never** use the *secret* / `service_role` key anywhere in this project. The app does not need it.

After your own account exists (step 4 below), turn off public sign-ups: **Authentication → Sign In / Providers → Allow new users to sign up → off**. It is your private app.

> Free Supabase projects pause after a week without any use. Opening the app now and then keeps it awake.

---

## 2. API on cPanel (Node.js)

You need cPanel with **Setup Node.js App** and **Node.js 20.12 or newer** (22 is recommended).

1. **Domains** → create the subdomain `api.nurullah.com.bd`. Turn on SSL for it (**SSL/TLS Status → Run AutoSSL**). The API must use `https`.
2. Upload the `api/` folder to your home directory, for example as `/home/<you>/pos-api`. Leave out `node_modules` and any `.env` file. A zip upload + **Extract** in File Manager is easiest.
3. **Setup Node.js App → Create Application**
   - Node.js version: **20** or **22**
   - Application mode: **Production**
   - Application root: `pos-api`
   - Application URL: `api.nurullah.com.bd`
   - Application startup file: `app.js`
4. Add the **environment variables** (same page):

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL, e.g. `https://abcd1234.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | your publishable key |
   | `CORS_ORIGINS` | `https://pos.nurullah.com.bd` (add `,http://localhost:3000` for local testing) |
   | `NODE_ENV` | `production` |

   (Instead of these, you can put them in `pos-api/.env`. Copy `api/.env.example`.)
5. Click **Create**, then **Run NPM Install**, then **Restart**.
6. Open `https://api.nurullah.com.bd/` in a browser. You should see `{"ok":true,"name":"Nurullah POS API",…}`.

If cPanel serves the app at a path instead of a subdomain (for example `https://nurullah.com.bd/api`), also set `BASE_PATH=/api` and use that full address as the API URL in the web app.

After changing code: upload the changed files, then **Restart** (and **Run NPM Install** again if `package.json` changed).

---

## 3. Web app on Vercel (Next.js)

1. Push this repository to GitHub (private is fine).
2. On [vercel.com](https://vercel.com): **Add New → Project** → import the repository.
3. **Root Directory: `web`** (important). Vercel detects Next.js by itself.
4. **Environment Variables**:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key |
   | `NEXT_PUBLIC_API_URL` | `https://api.nurullah.com.bd` (no trailing slash) |

5. **Deploy**.
6. **Settings → Domains** → add `pos.nurullah.com.bd`. Vercel shows a CNAME record. Add it in cPanel → **Zone Editor** (name `pos`, type `CNAME`, value as shown by Vercel, usually `cname.vercel-dns.com`).

Every push to GitHub now redeploys the web app.

---

## 4. First sign-in

1. Open `https://pos.nurullah.com.bd` → **Create an account** → confirm the email.
2. Sign in. The dashboard offers **Load sample data**: example tasks, habits, the IQA course, a month of money and more. Delete it all later in **Settings → Data & privacy** when you start for real.
3. Turn off public sign-ups in Supabase (see section 1).
4. Check **Settings → Preferences**: time zone (default Asia/Dhaka), currency (৳ BDT or $ USD), week start, and your daily goals.

---

## Run it on your computer

Needs Node.js 20.12+.

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
- No secret keys exist in this project. The publishable key is safe to be public; it can only do what the security rules allow.
- The API only accepts browser calls from the addresses in `CORS_ORIGINS`, limits request rates, validates every input, and sets security headers.

## Troubleshooting

| Problem | Fix |
|---|---|
| Pages show "Cannot reach the server" | Check `NEXT_PUBLIC_API_URL` on Vercel (https, no trailing slash) and that `https://api…/` answers `{"ok":true}`. Redeploy after changing Vercel variables. |
| Browser console shows a CORS error | `CORS_ORIGINS` on cPanel must exactly match the web address (`https://pos.nurullah.com.bd`, no trailing slash). Restart the app after changing it. |
| API app will not start on cPanel | Node.js must be 20.12+. Check that all environment variables are set, then look at the app's `stderr.log` in its folder. |
| Email link says it is invalid or expired | Add the site to Supabase **Redirect URLs**, and use the email templates from section 1. |
| Always sent back to the sign-in page | The Supabase URL/key on Vercel must be from the same project as on cPanel. |
