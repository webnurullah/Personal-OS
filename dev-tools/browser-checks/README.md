# Browser checks (kept from the cloud session)

These are the Playwright scripts used to test the app in a real (headless) browser with a **mocked API**
(no database needed). They were written inside the cloud sandbox, so some paths are the sandbox's
(`/opt/node22/lib/node_modules/playwright`, `/opt/pw-browsers/...`, `/tmp/...`): change those two or three
lines to your own Playwright/Chromium install before running. Not part of `npm test`.

- `archive-e2e.mjs`, `projects-e2e.mjs`: the Archive page and Projects (build the app with
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test`,
  `npx next start -p 3123`, then `node archive-e2e.mjs <folder for screenshots>`).
- `photo-e2e.mjs`, `route-test.mjs`, `mock3.mjs`: the profile photo (a stand-in Supabase with Storage on port 4012 and
  `next dev -p 3124` pointed at it). The test pictures it needs are generated with a few lines of Python/PIL (see the script).
- `audit-lib.mjs`, `overflow-pages.mjs`: phone-layout checks. `measure()` reports whether a page makes the phone zoom out
  (`window.innerWidth` bigger than the device width) or has sideways overflow.
- `learning-e2e.mjs`, `library-e2e.mjs`: the Learning course page (numbers, dialogs, saves) and the Certificates & playlists library (add by link, paste a list, ideas, +1 video, Make it count). Same setup as the phone-layout checks (built app on port 3123, a stand-in API); `library-e2e.mjs` imports `applyChange` from `web/lib/library.ts` so the stand-in follows the real status rules.
- `practice-e2e.mjs`: the hands-on part of the library (Practise it, practice progress chips, the skill ladder, the "Make it count" practice step).
- `plan-e2e.mjs`: Learning faster setup (paste an outline, plan the weeks and carry over, New course from a template, Job Apply's Course button) at 390 and 320 px.
- `company-e2e.mjs`: Job Apply → Company list (the sidebar sub-menu, the tabs, the list page with edit, delete and add, and "Add company" from a job's box) at 390, 320 and 1280 px.
- `dashboard-habits-e2e.mjs`: the habit tracker ("Last 7 days") as the first, full-width box on the dashboard (it replaced the small Habit Tracker box; rows, goals, dots, streaks, share of the week; today in view on a phone; ticking saves; no edit/delete there but a View All link; the empty state) and the same card on the Habits page with Edit and Delete, at 390, 320 and 1280 px.
- `dashboard-projects-e2e.mjs`: the dashboard's short Projects box (right after Tasks and before Learning; active projects only, nearest due date first, four at most; progress in per cent and in tasks; late/soon colours; the footer counts and "+N more"; a project without tasks; the empty states) at 390, 320 and 1280 px.
- `course-delete-e2e.mjs`: deleting a course (the question names what goes with it: units and topics, study sessions, tasks, certificates, courses and playlists; Cancel changes nothing; Delete sends one request and goes to Learning) at 390, 320 and 1280 px.
- `project-timer-e2e.mjs`: the "Time spent" timer on a project page (Continue/Start/Pause, counting up from the time already spent, still running after leaving and coming back, one timer at a time, an archived project cannot be timed) and Habits → "Project time" (the running timer, 7 days per project, the empty state) at 390, 320 and 1280 px, with a stand-in API that follows the server's rules.
- `course-time-e2e.mjs`: the course page header (This Week's Plan, Time spent and Target Date side by side; no hour tiles; no Estimated hours field) and the course timer (starting it pauses a running project timer; Pause keeps the time), with the course listed on Habits next to projects, at 390, 320 and 1280 px.
- `resource-timer-e2e.mjs`: the library certificate courses: To do + Start now, then Resume / Pause + Complete (no To do, no small status chip), the clock counting, the playlist keeping its three buttons, at 390, 320 and 1280 px.
- `running-timers-e2e.mjs`: the timer circles stacked right above the AI circle on every page: one per running timer, the card (module, name, clock, Pause / Start), several at once, a paused circle staying until hidden, at 390, 320 and 1280 px.
- `habit-goal-e2e.mjs`: habit time goals: today's time against the goal on the habit row, the habit form (goal minutes, projects and courses that count), no time goal, ticking by hand, at 390, 320 and 1280 px.
- `job-views-e2e.mjs`: Job Apply: the search box, the Calendar view after the Board (the Board stays), "Closing in 3 days" and "Closing in 7 days", at 390, 320 and 1280 px.
- `google-calendar-e2e.mjs`: Google Calendar in the Calendar page (chips in the grid, dots on a phone, the day's "Google Calendar" list with links that open in a new tab, "Coming up", the hide switch and its memory, the reconnect and could-not-be-reached notices that keep your own events, nothing shown when not connected) and in Settings → Integrations (not set up, Connect and the page Google sends you back to, connected, Disconnect, reconnect) at 390, 320 and 1280 px.
- `course-notes-e2e.mjs`: the text editor in the Notes card on the course page (formatting buttons, links and a refused link, undo and redo, autosave, saving on leaving the box, an empty note stored as empty, a failed save and "Try again", typing while a save is in flight, stored HTML with scripts and handlers that must not run, an old cached course without notes) at 390, 320 and 1280 px.
- `job-favourite-e2e.mjs`: Job Apply order and the favourite star (starred first, then saved by nearest date, applied below, closed last; starring and unstarring from a card and from the Board; marking a job applied moves it down) at 390, 320 and 1280 px.
- `job-image-e2e.mjs`: Job Apply pictures (the "Job URL" field and "Upload image" button, a file that is not a picture refused, a big picture shown at once and sent as a JPEG of at most 2000 px after the job is saved, the card's small picture opening large, changing and removing it, the job kept when only the picture fails) at 390, 320 and 1280 px.
- `phone-audit.mjs`: the phone-layout audit with hostile data (very long names, huge amounts, many items) on every page, its dialogs, the menu, the bell, search and Quick Add at 320/360/390/450 px; prints only what overflows (`ONLY=goals,finance` to pick pages). Exit code 1 when something overflows.
- `step6-e2e.mjs`: Learning connected to the rest ("Time to revise" with Revised, a goal that follows a course or certificates, study sessions on the Calendar, a course's week as tasks) at 390 and 320 px.
