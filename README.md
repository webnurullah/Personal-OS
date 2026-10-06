# Nurullah POS — Personal Operating System

A private life-management app: dashboard, tasks, calendar, goals, habits, learning (weekly planner + course tracker), finance, health, notes and reminders.

```
  Browser ──► Next.js app on Vercel  (pos.nurullah.com.bd)
                ├─ pages        /, /tasks, /finance …
                └─ API          /api/…   checks every sign-in token
                       │
                       ▼
              Supabase  (sign-in + Postgres database)
              Row Level Security: each user sees only their own rows
```

- **web/** — the whole app: Next.js 16 (App Router, Tailwind CSS v4).
  - `app/(app)/…` the pages · `app/api/…` the API (backend) · `lib/server/…` the API's shared code.
- **supabase/** — the database: `migrations/` (tables, security rules, functions) and `tests/`.
- **template/** — the original static HTML template (reference only).

Frontend and backend are **one Vercel project**. Every push to GitHub `main` puts it live automatically. Nothing is uploaded by hand.

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
   - **Project URL**, like `https://abcdefghijklmnop.supabase.co`
   - **Publishable key**, starting `sb_publishable_` (the legacy `anon` key also works)

   **Never** use the *secret* / `service_role` key anywhere in this project. The app does not need it.

> Free Supabase projects pause after a week without any use. Opening the app now and then keeps it awake.

---

## 2. Vercel (one project: frontend + backend)

1. Go to [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → `Personal-OS` → **Import**.
   (Not listed? Click **Adjust GitHub App Permissions** and give Vercel access to the repository.)
2. **Configure Project**:
   - Project Name: `nurullah-pos`
   - **Root Directory: `web`** (click **Edit**, choose `web`, **Continue**)
   - Framework Preset: **Next.js** (automatic). Leave the build settings as they are.
3. **Environment Variables** (only these two):

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key |

4. **Deploy** (1–2 minutes). Open the address Vercel shows (`https://nurullah-pos….vercel.app`):
   - `…/api` should show `{"ok":true,"name":"Nurullah POS API",…}`
   - the main address should show the sign-in page.
5. **Settings → Domains** → add `pos.nurullah.com.bd`. Vercel shows a **CNAME** value.
6. **cPanel → Zone Editor** → `nurullah.com.bd` → **Manage**:
   - delete any old record named `pos` (and `api`, which is no longer used),
   - **Add Record**: Type `CNAME`, Name `pos`, Record = the value from Vercel.

   When Vercel's Domains page says **Valid Configuration** (minutes, sometimes a few hours), https is added automatically.

The app runs in Singapore, next to the database (`web/vercel.json` sets the region `sin1`), so pages stay fast.

### Updating the app

Push to GitHub. Pushes to `main` go live within a minute or two; pushes to other branches get their own **preview** link to try first. If a release goes wrong, Vercel's **Instant Rollback** switches back to an earlier deployment in one click (project → **Deployments**).

---

## 3. First sign-in

1. Open `https://pos.nurullah.com.bd` → **Create an account** → confirm the email.
   (Or create the user in Supabase: **Authentication → Users → Add user**, tick **Auto Confirm User**.)
2. Sign in. The dashboard offers **Load sample data**: example tasks, habits, the IQA course, a month of money and more. Delete it all later in **Settings → Data & privacy** when you start for real.
3. Turn off public sign-ups: Supabase → **Authentication → Sign In / Providers → Allow new users to sign up → Off**. It is your private app.
4. Check **Settings → Preferences**: time zone (default Asia/Dhaka), currency (৳ BDT or $ USD), week start, and your daily goals.

---

## Run it on your computer

Needs Node.js 24.

```bash
cd web
cp .env.example .env.local   # fill in the two Supabase values
npm install
npm run dev                  # http://localhost:3000 (the API is at http://localhost:3000/api)
```

---

## Checks

| Where | Command | What it checks |
|---|---|---|
| `web/` | `npm test` | API helpers (dates, streaks, repeating events, habits, goals), sign-in check, error answers, budget and course totals |
| `web/` | `npm run lint` · `npm run build` | Code style · type check and production build |
| `supabase/tests/` | `npm install` then `npm test` | Migrations in an in-memory Postgres: every table's security rule (users cannot read or change each other's rows), sign-up trigger, sample data, bill payment, delete-all |

### After changing the database

Add a new file in `supabase/migrations/` (never edit one that has already run on your project), run it in the SQL Editor, then regenerate the API's types:

```bash
npx supabase gen types typescript --project-id <your-project-id> --schema public > web/lib/server/database.types.ts
```

Then run `npm run build` in `web/` to check everything still fits.

---

## Security, in short

- Passwords and sign-in are handled by Supabase Auth. The app never sees or stores passwords.
- Every `/api` request must carry the user's sign-in token. The API checks it, then talks to the database **as that user**. Postgres Row Level Security allows each user to reach only their own rows, even if the API had a bug.
- No secret keys exist in this project. The publishable key is safe to be public; it can only do what the security rules allow.
- The API validates every input and only answers the app itself (no other website can call it from a browser). Every page and answer has basic security headers.

## Troubleshooting

| Problem | Fix |
|---|---|
| Deploy fails | Vercel → project → **Deployments** → open the failed one → **Build Logs**. Check that **Root Directory** is `web`. |
| Pages show an error or keep loading | Vercel → project → **Logs**. Usually a missing or misspelled environment variable. After fixing it: **Deployments → ⋯ → Redeploy**. |
| Always sent back to the sign-in page | The two environment variables must be from the same Supabase project, with no extra spaces. Redeploy after changing them. |
| Email link says it is invalid or expired | Add the site to Supabase **Redirect URLs**, and use the email templates from section 1. |
| Domain does not open | DNS can take up to a few hours. Check the `pos` CNAME in cPanel Zone Editor matches what Vercel's **Domains** page shows. |
