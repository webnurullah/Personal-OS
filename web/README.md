# Nurullah POS — web app (Next.js)

The pages of Nurullah POS. Deployed on Vercel with **Root Directory = `web`**.
Setup, environment variables and deployment are in the [main README](../README.md).

```bash
cp .env.example .env.local   # Supabase URL + publishable key, API URL
npm install
npm run dev                  # http://localhost:3000
```

## Where things are

| Path | What |
|---|---|
| `app/(app)/…` | The signed-in pages. Each `page.tsx` renders a `*-view.tsx` client component in the same folder. |
| `app/login`, `app/forgot-password`, `app/update-password`, `app/auth/confirm` | Sign-in pages and the email-link handler |
| `proxy.ts`, `lib/supabase/` | Keeps the session fresh; sends signed-out visitors to `/login` |
| `lib/api.ts` | Calls the Node.js API with the user's token (SWR keys are API paths) |
| `lib/course.ts`, `lib/finance.ts` | Totals worked out in the browser, so numbers update while you type |
| `components/ui/` | Shared building blocks: modal, charts, toasts, pickers |
| `components/shell/` | Sidebar, top bar, notifications, Ctrl+K search |
| `app/globals.css` | Theme and component classes (`card`, `btn`, `input`, …) |
