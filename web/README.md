# Nurullah POS — the app (Next.js: pages + API)

The whole app: the pages and the backend API. Deployed on Vercel as one project with **Root Directory = `web`**.
Setup, environment variables and deployment are in the [main README](../README.md).

```bash
cp .env.example .env.local   # Supabase URL + publishable key
npm install
npm run dev                  # http://localhost:3000 · API at /api
```

## Where things are

| Path | What |
|---|---|
| `app/(app)/…` | The signed-in pages. Each `page.tsx` renders a `*-view.tsx` client component in the same folder. |
| `app/login`, `app/forgot-password`, `app/update-password`, `app/auth/confirm` | Sign-in pages and the email-link handler |
| `app/api/…/route.ts` | The API. Each folder is an address, e.g. `app/api/tasks/[id]/route.ts` answers `PATCH /api/tasks/:id`. |
| `lib/server/` | API code: `api.ts` (sign-in check, errors), `schemas.ts` (what each endpoint accepts), calculations, database types |
| `lib/supabase/`, `components/shell/app-shell.tsx` | Sign-in in the browser; signed-out visitors are sent to `/login` without a trip to the server (the API checks sign-in on every request) |
| `lib/cache.ts`, `lib/prefetch.ts` | Last-loaded data is kept in this browser so pages open at once; every page's data is loaded in the background. Signing out clears it. |
| `components/shell/assistant.tsx`, `lib/quickadd.ts`, `lib/parse-date.ts` | Quick Add (Ctrl+J): typed commands (`task call bank tomorrow !high`, `spent 450 lunch bkash` …) read by rules, no AI needed |
| `app/api/assistant`, `lib/server/assistant/` | Optional chat assistant (needs `ANTHROPIC_API_KEY`): Claude calls this app's own API (as you) through one `call_api` tool; `catalog.ts` lists the endpoints it may use |
| `app/api/jobs`, `lib/server/jobs.ts`, `lib/job-extract.ts`, `lib/skills.ts`, `lib/jobs.ts` | Applications → Job Apply: read a job link (page job data + keyword rules; Claude when a key is set), find deadline/requirements/skills, compare with your skills |
| `app/api/projects`, `app/(app)/projects`, `app/(app)/archive`, `lib/projects.ts` | Projects: websites, social media, branding … with or without a due date (no due date = ongoing). Tasks link to a project; progress and "due in 5 days" / "running 34 days" are worked out, never stored. Removing a project = Archive (menu item); delete for good only from there |
| `lib/api.ts` | The pages call the API through this, with the user's token (SWR keys are API paths) |
| `lib/course.ts`, `lib/finance.ts` | Totals worked out in the browser, so numbers update while you type |
| `components/ui/`, `components/shell/` | Shared building blocks; sidebar, top bar, notifications, Ctrl+K search |
| `app/globals.css` | Theme and component classes (`card`, `btn`, `input`, …) |
