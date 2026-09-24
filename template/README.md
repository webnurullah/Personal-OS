# Nurullah POS — HTML template

A clickable template of the personal life management system. Plain HTML, Tailwind CSS and a little JavaScript. No database, no build step.

## Open it

Double-click `index.html` (or drag it into Chrome, Edge or Firefox). Keep the internet on: Tailwind, the icons and the fonts load from a CDN.

Changes you make (ticking tasks, adding notes, and so on) last until you reload the page.

## Pages

| File | Page |
|---|---|
| `index.html` | Dashboard |
| `tasks.html` | Tasks: filters, search, add, delete |
| `calendar.html` | Month view, day agenda, add event |
| `goals.html` | Goals with milestones, status and progress updates |
| `habits.html` | 7-day habit tracker, streaks, consistency heatmap |
| `learning.html` | Weekly study plan (the "Learning Tab" design) |
| `course.html` | IQA course tracker (the "Learning Details" design) |
| `finance.html` | Transactions, budget by category, bills |
| `health.html` | Steps, sleep, heart rate, water, weight, wellness score |
| `notes.html` | Notes and reminders |
| `settings.html` | Profile, preferences, categories, notifications |

## How it is built

```
assets/css/app.css    Shared styles: cards, buttons, inputs, checkboxes, tabs
assets/js/app.js      Sidebar, top bar, Ctrl+K search, pop-up windows, toasts, date helpers
assets/js/<page>.js   Behaviour for one page (dashboard.js, tasks.js, …)
```

- The sidebar and top bar are written once in `app.js` and added to every page. To add a menu item, edit `NAV` there.
- Sample dates are written as "days from today" (`data-date-offset="3"`), so the template never looks out of date.
- **Numbers are calculated, not typed.** Each page keeps the facts in the HTML (a task is ticked, a transaction's amount, a topic's hours) and the page script adds them up. That is why some numbers differ from the mockup images: in `course.html` the topic hours add up to 51, not 60, and the dashboard shows 2 of 6 tasks done because 2 are ticked.
- `tasks.html#new`, `notes.html#new` and so on open that page's "New …" window straight away. The Ctrl+K search uses this for quick actions.

## Moving to Next.js later

Each HTML page becomes a route (`app/tasks/page.tsx`), the sidebar and top bar become a shared `layout.tsx`, and repeated markup (a task row, a goal card) becomes a component. The icon names are the same in `lucide-react`, and the Tailwind classes copy across as they are.
