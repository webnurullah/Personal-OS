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
- `study-e2e.mjs`: Learning "Study next" (the card, Log time, the topic picker in the session form, Done, and +30m/+1h on the course page) at 390 and 320 px; `SHOTS=<folder>` also saves pictures.
- `plan-e2e.mjs`: Learning faster setup (paste an outline, plan the weeks and carry over, New course from a template, Job Apply's Course button) at 390 and 320 px.
- `company-e2e.mjs`: Job Apply → Company list (the sidebar sub-menu, the tabs, the list page with edit, delete and add, and "Add company" from a job's box) at 390, 320 and 1280 px.
- `job-favourite-e2e.mjs`: Job Apply order and the favourite star (starred first, then saved by nearest date, applied below, closed last; starring and unstarring from a card and from the Board; marking a job applied moves it down) at 390, 320 and 1280 px.
- `job-image-e2e.mjs`: Job Apply pictures (the "Job URL" field and "Upload image" button, a file that is not a picture refused, a big picture shown at once and sent as a JPEG of at most 2000 px after the job is saved, the card's small picture opening large, changing and removing it, the job kept when only the picture fails) at 390, 320 and 1280 px.
- `progress-e2e.mjs`: Learning "Learning progress and time" (Weekly / Monthly / Quarterly bars, tapping a past period, the pace text, where the time went) and the page order (My courses, Study next, progress) at 390, 320 and 1280 px.
- `phone-audit.mjs`: the phone-layout audit with hostile data (very long names, huge amounts, many items) on every page, its dialogs, the menu, the bell, search and Quick Add at 320/360/390/450 px; prints only what overflows (`ONLY=goals,finance` to pick pages). Exit code 1 when something overflows.
- `step6-e2e.mjs`: Learning connected to the rest (the focus timer and its form, "Time to revise" with Revised, a goal that follows a course or certificates, study sessions on the Calendar, a course's week as tasks) at 390 and 320 px.
