# Where things stand (written at the end of the cloud session)

Branch: `main-heldr1` (everything is pushed). Draft PR #5 into `main`. Production (pos.nurullah.com.bd) deploys from `main`.

## Live now (on `main`)
Projects + Archive for projects, profile photo upload, top bar (profile left / menu right on phones, menu drawer from the right),
menu order (Job Apply last of the main list, then Settings, Archive), and the fix for pages zooming out on phones
(hidden label inside the wide Topics/Transactions tables; `<main>` is `relative overflow-x-clip`).

## On the branch, NOT live yet
1. **Archive for everything** (deleting any item moves it to the Archive; delete from the Archive is permanent).
   Code is done and tested (59 unit tests, 119 database checks, browser checks).
   **Blocked on one database step**: the Supabase tool refused to create two functions. The table and `archive_config`
   are already in the live database. To finish, in Supabase -> SQL Editor run everything in
   `supabase/migrations/20261008000100_archive_items.sql` **from the line `-- Moves one item (with what goes with it)`
   to the end** (the `archive_delete` and `archive_restore` functions and their grants). Then check that both functions
   exist, merge `origin/main` into `main-heldr1`, and push to `main`. **Do not push this branch to `main` before that**:
   every delete in the app would fail.
2. **Phone-layout fixes** (commit "Phone layout: fix what a full-site check found" and the follow-up): `overflow-wrap: anywhere`
   on `body`, always-visible buttons on touch (`.reveal`), wrapping dialog buttons, a phone card list for course topics,
   and many small fixes. A second round of checking found regressions from the global `overflow-wrap: anywhere`
   (short numbers like `41%` wrapping one character per line when next to a truncating title); those found were fixed.
   Only the pages "core" (Dashboard, Tasks, Projects, Archive) and "learning/calendar" were re-checked; **Goals, Habits, Health,
   Notes, Finance, Jobs, Settings and the shell were not re-checked after the fixes** (the checker ran out of usage).
   Re-check those at 320-450 px before shipping (`dev-tools/browser-checks/audit-lib.mjs` has the helper).
   Known small leftovers (all low): category/project badges hard-clipped without ellipsis; Tasks search placeholder clipped at 320;
   project form due-date field narrow at 320 and long link button; Projects list names cut to one line; Archive detail line truncated;
   course table between 640 and 1023 px still tall (could use the card list up to `lg`); Weekly Plan row labels scroll away;
   small tap targets (habit dots, project back link).
   Before pushing to `main`, remember the Archive code is also on this branch, so ship the layout fixes together with the
   Archive step, or cherry-pick them onto `origin/main` as was done for the zoom fix.

## Run it locally
`cd web && npm install && cp .env.example .env.local` (fill in the two Supabase values from Vercel's Environment Variables or
the Supabase dashboard) `&& npm run dev` -> http://localhost:3000. Tests: `cd web && npm test`, `npm run lint`, `npx tsc --noEmit`;
database tests: `cd supabase/tests && npm install && npm test`. Browser checks: see `dev-tools/browser-checks/README.md`.

## Notes
- Deploy order rule: apply a new migration to the live Supabase project FIRST, then push the code that needs it.
- The Supabase and Vercel connections (MCP tools) exist only in the cloud session; locally, use the Supabase SQL Editor and the Vercel dashboard.
- Never push the dev server's auto-generated `web/AGENTS.md` / `web/CLAUDE.md` (Next.js creates them when `next dev` runs); they are not part of the repo.
