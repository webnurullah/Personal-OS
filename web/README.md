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
| `proxy.ts`, `lib/supabase/` | Keeps the session fresh; sends signed-out visitors to `/login` |
| `lib/api.ts` | The pages call the API through this, with the user's token (SWR keys are API paths) |
| `lib/course.ts`, `lib/finance.ts` | Totals worked out in the browser, so numbers update while you type |
| `components/ui/`, `components/shell/` | Shared building blocks; sidebar, top bar, notifications, Ctrl+K search |
| `app/globals.css` | Theme and component classes (`card`, `btn`, `input`, …) |
