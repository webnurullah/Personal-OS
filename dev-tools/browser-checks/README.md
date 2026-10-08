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
