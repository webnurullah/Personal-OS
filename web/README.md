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
| `app/api/resources`, `app/(app)/learning/library`, `lib/library.ts`, `lib/starter-ideas.ts`, `lib/server/resources.ts`, `lib/server/fetch-page.ts` | Learning → Certificates & playlists: the courses, YouTube playlists and videos you want to complete, with a to-do list, a completed list and a certificates gallery. Paste a link and the title/platform are read for free (YouTube's public title lookup, or the page title); paste a list; or pick from starter ideas. Finishing one ("Make it count") keeps the certificate, adds its skills to Job Apply and gives a CV line. "Practise it" makes a project with 6-8 dated tasks (redo it, apply it, publish proof, teach it back, get feedback, add it to your CV) from the rule-based plans in `lib/practice-templates.ts`; the skill ladder (learned → practised → proven) is worked out from those projects. Deleting a course never deletes its items. Status, counts and dates are kept in step by `applyChange` (`lib/library.ts`). |
| `lib/study.ts`, `lib/server/study.ts`, `app/(app)/learning/study-next.tsx` | Learning → "Study next": which topics to study now, whether a course is behind, the forecast at your pace, the weekly streak (pure rules in `lib/study.ts`; `studyOverview` feeds `GET /api/learning/week`; a study session that names a topic adds its hours to the topic in the database) |
| `lib/outline.ts`, `lib/plan.ts`, `lib/course-templates.ts`, `lib/server/course-planning.ts`, `app/api/courses/[id]/{outline,plan}`, `app/api/courses/from-skill`, `app/(app)/learning/[id]/planning-dialogs.tsx` | Learning → faster setup: paste an outline (rules read units, topics and hours), course templates, planning the weeks over your weekly hours, "carry over" late topics, and a small course for a skill you are missing (Job Apply) |
| `lib/progress.ts`, `lib/server/progress.ts`, `app/api/learning/progress`, `app/(app)/learning/learning-progress.tsx` | Learning → progress and time by week, month and quarter: hours studied against your weekly goal (a month or quarter has that many weeks' worth), study days, sessions, finished topics and library items, where the time went, and an even-pace check while the period runs. Pure sums in `lib/progress.ts`; the server only reads the finished sessions, finished topics and completed library items |
| `lib/revision.ts`, `lib/focus.ts`, `lib/use-focus.ts`, `lib/study-match.ts`, `lib/goal-link.ts`, `lib/server/study-tasks.ts`, `app/api/courses/[id]/tasks` | Learning → connected to the rest: finished topics and library items come back for a look after 1, 7 and 21 days ("Time to revise"), a focus timer that survives a reload and opens the session form with the time, a course's week as tasks, planned study on the Calendar, Quick Add `study 1h sql` / `course <link>`, and goals that follow a course (its hours) or the certificates you earn |
| `app/api/profile/avatar`, `lib/avatar-image.ts`, `lib/server/avatar.ts`, `app/(app)/settings/avatar-editor.tsx` | Profile photo (Settings → Profile): the phone cuts a 256 px square out of the chosen picture (move + zoom), the API checks it is really a JPG/PNG/WebP and stores it in the public `avatars` Storage bucket under your own folder with a new name each time |
| `lib/api.ts` | The pages call the API through this, with the user's token (SWR keys are API paths) |
| `lib/course.ts`, `lib/finance.ts` | Totals worked out in the browser, so numbers update while you type |
| `components/ui/`, `components/shell/` | Shared building blocks; sidebar, top bar, notifications, Ctrl+K search |
| `app/globals.css` | Theme and component classes (`card`, `btn`, `input`, …) |
