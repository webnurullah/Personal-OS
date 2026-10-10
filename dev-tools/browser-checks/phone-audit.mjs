// Phone-layout audit with HOSTILE data: every page of the app is opened on a phone-sized screen with very long titles and
// names (no spaces, Bengali, emoji, web addresses), huge money amounts and many items, then its dialogs are opened and
// filled with long text, the menu drawer, the bell, the search box and the Quick Add assistant are opened too.
// Each state is measured with measure() from audit-lib.mjs (zoomedOut, docWidth, mainClipped, offenders) plus three extra
// checks that measure() cannot do: content that overflows inside an open dialog / panel, content cut off by overflow:hidden,
// and (as information only) boxes that scroll sideways on purpose (wide tables).
//
// The built app must already be running on http://localhost:3123 (it is never started or rebuilt here); a stand-in API
// answers every /api call, so nothing real is touched.
//
// Run (from this folder, takes about 3-5 minutes):
//   node phone-audit.mjs
// Options (environment variables):
//   WIDTHS=320,360,390,450   phone widths in CSS pixels (default as shown)
//   ONLY=tasks,finance       only these pages (ids are listed at the bottom of this file, in UNITS)
//   POOL=4                   how many phones are open at the same time
//   SHOTS=/some/folder       also save a picture of every failing state (ALL=1: of every state, FULL=1: whole page, not just the screen)
//   OUT=/some/file.json      where the full result is written (default /tmp/claude-0/audit/phone-audit.json)
// Exit code 0 = everything clean, 1 = something overflows (the failures are listed at the end).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { deflateSync } from "node:zlib";
import { launch, newPhone, apiMock, measure, BASE, TODAY, profile as baseProfile } from "./audit-lib.mjs";
import { buildProgress } from "../../web/lib/progress.ts";

const WIDTHS = (process.env.WIDTHS ?? "320,360,390,450").split(",").map(Number);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const POOL = Number(process.env.POOL ?? 4);
const SHOTS = process.env.SHOTS || "";
const OUT = process.env.OUT || "/tmp/claude-0/audit/phone-audit.json";

// ---------------------------------------------------------------------------------------------------------------
// Hostile text
// ---------------------------------------------------------------------------------------------------------------
const SENT = "Prepare the quarterly marketing performance review deck and send it to every regional manager before the Thursday leadership sync";
const WORD = "Unbroken" + "Segment".repeat(14); // 106 letters, no space
const BN = "বাংলা ভাষায় একটি অনেক লম্বা শিরোনাম যা ছোট পর্দায় সহজে ধরে না, আজকের সব কাজের তালিকা এবং পরিকল্পনা 🎉🚀😀 আরও লিখছি";
const BNW = "বাংলাভাষায়অনেকলম্বাশব্দযেখানেকোনোফাঁকানেই".repeat(3);
const LINK = "https://www.example-company-careers.com/jobs/senior-software-engineer-platform-infrastructure/apply?utm_source=linkedin&utm_campaign=" + "x".repeat(50);
const EMO = "🎉🚀✅".repeat(25);
const KINDS = [SENT, WORD, BN, LINK, EMO, BNW];
const cut = (s, max) => (max && [...s].length > max ? [...s].slice(0, max).join("") : s);
/** The i-th kind of hostile text, cut to `max` characters (the length limit of the field it goes in). */
const H = (i, max) => cut(KINDS[((i % 6) + 6) % 6], max);
const BIG = 12345678.5;
const HUGE = 99999999.99;

// ---------------------------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------------------------
const DAY = 86400000;
const toMs = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const addDays = (iso, n) => new Date(toMs(iso) + n * DAY).toISOString().slice(0, 10);
const weekdayIndex = (iso) => (new Date(toMs(iso)).getUTCDay() + 6) % 7;
const mondayOf = (iso) => addDays(iso, -weekdayIndex(iso));
const D = (n) => addDays(TODAY, n);
const iso = (day, time = "08:00:00") => `${day}T${time}.000Z`;
const uuid = (i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`;
const COLORS = ["blue", "emerald", "amber", "rose", "violet", "teal", "orange", "pink", "indigo", "cyan"];
const range = (n) => Array.from({ length: n }, (_, i) => i);

// ---------------------------------------------------------------------------------------------------------------
// Fixtures (the shapes are in web/lib/types.ts; what each endpoint returns is in web/app/api/<name>/route.ts)
// ---------------------------------------------------------------------------------------------------------------
const hostileProfile = {
  ...baseProfile,
  full_name: cut(WORD, 80),
  tagline: cut(SENT, 120),
  city: cut(BN, 80),
  email: "this.is.a.very.long.email.address.for.testing.purposes.only@subdomain.example-company-domain.com",
  skills: ["React", "Git", cut(WORD, 40), cut(BN, 40), cut(LINK, 40), "Communication", "Project management", cut(EMO, 40)],
  notify: { morning_plan: true, habit_reminder: false, bills_due: true, study_sessions: true, weekly_review: false },
  notifications_read_at: null,
  weekly_study_goal: 8,
};

const categories = range(8).map((i) => ({
  id: `cat${i}`,
  name: ["Family and Friends and Extended Relatives", "Supercalifragilisticexpialidocious-Cat", "Personal", "Work", cut(BN, 40), cut(BNW, 40), "Health", "Learning"][i],
  color: COLORS[i],
  position: i,
}));

const task = (i, over = {}) => ({
  id: `t${i}`, title: H(i, 200), category_id: categories[i % 8].id, project_id: i % 3 === 0 ? `p${i % 4}` : null,
  due_date: null, end_date: null, priority: ["low", "medium", "high"][i % 3], notes: i % 2 ? SENT : "", done_at: null, created_at: iso("2026-10-01"), ...over,
});
const tasks = [
  ...range(6).map((k) => task(k + 1, { due_date: D(-(k + 1)) })), // overdue
  ...range(6).map((k) => task(k + 7, { due_date: TODAY })), // today
  task(13, { due_date: D(-1), end_date: D(3) }), task(14, { due_date: D(2), end_date: D(5) }), // several days
  ...range(8).map((k) => task(k + 15, { due_date: D(k + 2) })), // upcoming
  ...range(6).map((k) => task(k + 23)), // no date
  ...range(8).map((k) => task(k + 29, { due_date: D(-2), done_at: iso(D(-(k % 4)), "10:00:00") })), // done
];
const projectChoices = range(4).map((i) => ({ id: `p${i}`, name: H(i + 1, 120), color: COLORS[i], status: i === 3 ? "done" : "active", archived_at: null }));

const makeProject = (i, over = {}) => {
  const due = i % 2 ? D(10 + i) : null;
  const total = 40 + i;
  const done = 12 + i;
  return {
    id: `p${i}`, name: H(i + 1, 120), kind: ["website", "social", "brand", "other"][i % 4], status: i < 8 ? "active" : i < 10 ? "paused" : "done", color: COLORS[i % 10],
    client: H(i + 2, 120), goal: H(i + 3, 300), start_date: D(-20), due_date: due, archived_at: null, created_at: iso("2026-09-01"), created_on: "2026-09-01", archived_on: null,
    links: [{ label: H(0, 60), url: cut(LINK, 500) }, { label: H(1, 60), url: cut(LINK, 500) }, { label: "Plain", url: "https://example.com" }],
    timeframe: { kind: due ? "dated" : "ongoing", label: due ? `Due in ${10 + i} days` : "Ongoing · running 36 days", days: due ? 10 + i : null, tone: "ok" },
    tasks_total: total, tasks_done: done, tasks_open: total - done, percent: Math.round((done / total) * 100), ...over,
  };
};
const projects = range(12).map((i) => makeProject(i));
const projectDetail = (i, over = {}) => ({
  today: TODAY,
  project: { ...makeProject(i), notes: [SENT, WORD, BN, LINK].join("\n"), ...over },
  tasks: [...range(14).map((k) => task(k + 100, { project_id: `p${i}`, due_date: k % 2 ? D(k) : null })), ...range(8).map((k) => task(k + 200, { project_id: `p${i}`, done_at: iso(D(-1), "09:00:00") }))],
});

const habitIcons = ["dumbbell", "book-open", "brain", "glass-water", "salad", "moon", "footprints", "notebook-pen"];
const habitDays = range(7).map((i) => D(i - 6));
const habits = range(8).map((i) => ({
  id: `h${i}`, name: H(i, 80), goal_text: H(i + 1, 80), icon: habitIcons[i], color: COLORS[i], position: i,
  done: habitDays.map((_, j) => (i + j) % 3 !== 0), streak: [365, 1234, 7, 0, 99999, 12, 3, 45][i], share: [100, 86, 57, 14, 0, 71, 43, 29][i],
}));
const heatStart = addDays(mondayOf(TODAY), -19 * 7);
const heatmap = range(140).map((i) => { const date = addDays(heatStart, i); return date > TODAY ? { date, share: null } : { date, share: (i % 5) / 4 }; });
const habitsResponse = {
  today: TODAY, days: habitDays, items: habits, heatmap,
  summary: { total: 8, done_today: 5, best: { days: 99999, name: H(4, 80) }, share: 66, perfect_days: 3, most_consistent: { name: H(1, 80), share: 100 }, needs_attention: { name: H(2, 80), share: 14 } },
};

const goal = (i, over = {}) => ({
  id: `g${i}`, title: H(i, 200), category_id: categories[i % 8].id, icon: ["target", "piggy-bank", "footprints", "graduation-cap", "plane", "trophy", "house", "code"][i % 8], color: COLORS[i % 10],
  status: ["on-track", "behind", "on-track", "on-track", "completed", "on-track", "behind", "on-track"][i % 8], progress_mode: "value", current_value: 45, target_value: 120, unit: "books", deadline: D(30 + i),
  note: H(i + 3, 500), completed_on: null, link_kind: null, course_id: null, course_title: null, linked: false, milestones: [], percent: 38, ...over,
});
const milestones = range(5).map((k) => ({ id: `m${k}`, goal_id: "g2", title: H(k, 200), at_value: k === 4 ? 50 : null, done: k < 2, position: k }));
const goals = [
  goal(0, { unit: "৳", current_value: BIG, target_value: 99999999.5, percent: 12 }),
  goal(1, { unit: "kilometres-per-hour", current_value: 99999, target_value: 100000, percent: 99 }),
  goal(2, { progress_mode: "milestones", milestones, percent: 40, unit: "" }),
  goal(3, { link_kind: "course", course_id: "c0", course_title: H(0, 300), linked: true, unit: "hours", current_value: 14.5, target_value: 1234.5, percent: 1 }),
  goal(4, { status: "completed", completed_on: D(-3), percent: 100, note: H(3, 500) }),
  goal(5, { link_kind: "certificates", linked: true, unit: "certificates", current_value: 1, target_value: 2, percent: 50 }),
  goal(6, { unit: cut("abcdefghijklmnopqrst", 20) }),
  goal(7, { link_kind: "course", course_id: null, course_title: null, linked: false, percent: 10 }),
];
const goalsResponse = { today: TODAY, items: goals, summary: { active: 7, on_track: 4, behind: 3, average: 100 } };

const healthLogs = range(30).map((i) => ({ log_date: D(i - 29), steps: 150000 + i * 1000, sleep_minutes: 500 + i, resting_hr: 150 + (i % 40), weight_kg: 123.4 + i / 10, water_glasses: 20 + (i % 30), mood: (i % 10) + 1 }));
healthLogs[29] = { log_date: TODAY, steps: 199999, sleep_minutes: 1439, resting_hr: 250, weight_kg: 499.9, water_glasses: 50, mood: 10 };
const healthResponse = { today: TODAY, goals: { steps: 100000, sleep_minutes: 960, water: 30 }, logs: healthLogs };

const note = (i) => ({
  id: `n${i}`, title: H(i, 200), body: [H(i + 1), `- ${H(i + 2, 120)}`, `- ${WORD}`, `1. ${LINK}`, H(i + 4)].join("\n"), tag: i % 3 ? cut(H(i + 4), 30) : "",
  color: ["white", ...COLORS][i % 11], pinned: i < 3, created_at: iso("2026-10-01"), updated_at: iso(D(-(i % 6))),
});
const notes = { today: TODAY, items: range(18).map(note) };
const reminders = { today: TODAY, items: range(10).map((i) => ({ id: `r${i}`, text: H(i, 200), due_date: i % 3 ? D(i - 4) : null, done: i % 4 === 0, created_at: iso("2026-10-01") })) };

const budgetCats = range(8).map((i) => ({
  id: `b${i}`, name: ["Family and Friends and Extended Relatives", "Supercalifragilisticexpialidocious-Cat", "Groceries", "Rent", cut(BN, 40), cut(BNW, 40), "Savings", "Fun"][i],
  color: COLORS[i], icon: ["house", "utensils", "car", "bus", "sparkles", "piggy-bank", "wallet", "shopping-cart"][i], monthly_limit: [BIG, HUGE, 5000, 45000, 12000, 8000, 99999999, 300][i], is_savings: i === 6, position: i,
}));
const amounts = [BIG, HUGE, 450, 5000000.25, 120, 87654321.1, 15.5, 1000000];
const transactions = range(30).map((i) => ({
  id: `x${i}`, type: i % 5 === 0 ? "income" : "expense", amount: amounts[i % 8], budget_category_id: i % 5 === 0 || i % 7 === 6 ? null : budgetCats[i % 8].id,
  description: H(i, 200), note: i % 2 ? H(i + 1, 200) : "", method: ["bKash", "Nagad", "Card", "Cash", "Bank", "Other"][i % 6], tx_date: D(-(i % 10)), created_at: iso(D(-(i % 10))),
}));
const bills = range(6).map((i) => ({
  id: `bill${i}`, name: H(i, 120), note: H(i + 1, 120), amount: [BIG, 450, HUGE, 1200, 87654321.1, 15][i], budget_category_id: i === 5 ? null : budgetCats[i].id,
  icon: ["house", "wifi", "zap", "smartphone", "receipt", "gift"][i], due_date: D(i * 3 - 4), repeats_monthly: i % 2 === 0,
}));
const financeMonth = { today: TODAY, month: TODAY.slice(0, 7), categories: budgetCats, transactions, bills };

const events = (from, to) => {
  const items = [];
  for (let day = from, i = 0; day <= to; day = addDays(day, 1), i++) {
    if (i % 2 && day !== TODAY) continue;
    for (let k = 0; k < 1 + (i % 4) + (day === TODAY ? 2 : 0); k++) {
      const n = i * 7 + k;
      const allDay = n % 3 === 0;
      items.push({
        id: `e${n}`, title: H(n, 200), event_date: day, all_day: allDay, start_time: allDay ? null : `${String(8 + k).padStart(2, "0")}:00:00`, end_time: allDay ? null : `${String(9 + k).padStart(2, "0")}:30:00`,
        repeat: n % 7 === 0 ? "weekly" : "none", repeat_until: null, category_id: categories[n % 8].id, note: H(n + 1, 300), date: day,
      });
    }
  }
  return items;
};
const eventsResponse = (_method, url) => {
  const from = url.searchParams.get("from") ?? D(-10);
  const to = url.searchParams.get("to") ?? D(35);
  const days = [TODAY, D(1), D(3), D(8)].filter((d) => d >= from && d <= to);
  return {
    today: TODAY, from, to, items: events(from, to),
    deadlines: days.map((date, i) => ({ id: `jd${i}`, title: H(i, 200), company: H(i + 1, 200), date })),
    project_dates: days.map((date, i) => ({ id: `pd${i}`, project_id: `p${i}`, title: H(i + 2, 120), kind: "deadline", date, color: COLORS[i] })),
    study: days.flatMap((date, i) => [{ id: `s${i}a`, date, hours: 1.5, activity: H(i, 200) }, { id: `s${i}b`, date, hours: 12.25, activity: H(i + 3, 200) }]),
  };
};

// A tiny picture saved with every other job (shown scaled up, so it also shows how the card and the viewer lay out a picture).
const PIC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const job = (i, over = {}) => ({
  id: `j${i}`, url: cut(LINK, 500), title: H(i, 200), company: H(i + 1, 200), location: H(i + 2, 200), deadline: i === 6 ? null : D(i * 2 - 3),
  status: ["saved", "saved", "applied", "interview", "offer", "rejected", "saved", "saved"][i], applied_on: i === 2 || i === 3 ? D(-4) : null,
  summary: `${H(i + 3, 2000)} ${SENT} ${SENT}`, requirements: [H(i), H(i + 1), H(i + 2), WORD], skills: ["React", "TypeScript", cut(WORD, 60), cut(BN, 60), cut(LINK, 60), "Communication", cut(EMO, 40)],
  notes: H(i, 500), image_url: i % 2 === 0 ? PIC : null, created_at: iso("2026-10-01"), ...over,
});
const jobs = { today: TODAY, items: range(8).map((i) => job(i)) };
// The company list: very long names and links, some without links, matching some of the jobs' companies.
const companyRow = (i, over = {}) => ({ id: `co${i}`, name: i < 3 ? H(i, 200) : `${H(i, 180)} (${i})`, website: i % 3 === 2 ? "" : `https://www.${"verylongcompanydomain".repeat(4)}.com/${WORD}`, facebook: i % 2 ? `https://facebook.com/${WORD}` : "", linkedin: i % 2 ? "" : `https://www.linkedin.com/company/${WORD}`, note: i % 2 ? H(i + 1, 1000) : "", created_at: iso("2026-10-01"), ...over });
const companies = { today: TODAY, items: range(7).map((i) => companyRow(i)) };
const jobAnalysis = {
  title: H(0, 200), company: H(1, 200), location: H(2, 200), deadline: D(9), summary: SENT.repeat(4), requirements: [H(0), H(1), H(2), H(3)],
  skills: ["React", "Docker", cut(WORD, 60), cut(BN, 60), cut(LINK, 60)], by: "rules",
  hints: [H(0), H(1, 200), `Could not find the last date to apply ${WORD}`, H(2)],
};

const courseSummary = (i, over = {}) => ({
  id: `c${i}`, title: H(i, 300), subtitle: H(i + 1, 120), start_date: D(-30), target_date: D(60 + i), color: COLORS[i], est_hours: 1234.5, done_hours: 456.25, spent_hours: 500, percent: 37,
  topic_count: 240, unit_count: 12, days_left: 64, state: ["behind", "on-track", "not-started"][i % 3], behind_hours: 99.5, weeks_behind: 12, forecast: { date: D(100), days_late: 40 }, ...over,
});
// Courses in different categories (one with a very long name) and statuses.
const courses = range(5).map((i) => courseSummary(i, { category: i === 0 ? cut(WORD, 60) : i === 3 ? "" : ["Digital Marketing", "Data"][i % 2], status: ["active", "active", "active", "active", "paused"][i] }));
const coursesResponse = { today: TODAY, items: courses };
// Learning progress and time: a lot of sessions over a year, six courses with very long names, big hours.
const progressResponse = {
  today: TODAY,
  weekly_goal: 6,
  ...buildProgress({
    today: TODAY,
    weeklyGoal: 6,
    sessions: range(160).map((i) => ({ date: addDays(TODAY, -i * 2), hours: [0.25, 1.5, 12, 3.25][i % 4], course_id: i % 7 === 6 ? null : `c${i % 6}`, library: i % 7 === 6 })),
    topicDays: range(40).map((i) => addDays(TODAY, -i * 3)),
    itemDays: range(15).map((i) => addDays(TODAY, -i * 9)),
    courseTitles: Object.fromEntries(range(6).map((i) => [`c${i}`, H(i, 300)])),
  }),
};
const openTopics = range(8).map((i) => ({ id: uuid(i + 1), course_id: `c${i % 3}`, label: `1.${i + 1} ${H(i, 300)}`, status: i % 2 ? "in-progress" : "not-started", hours_left: 3.5 }));
const studyNext = range(4).map((i) => ({
  topic_id: uuid(i + 1), course_id: `c${i % 3}`, course_title: H(i, 300), course_color: COLORS[i], code: `1.${i + 1}`, title: H(i + 1, 300), status: "not-started", est_hours: 3, hours_left: 3,
  planned_week: 4, reason: ["overdue", "this-week", "in-progress", "next"][i], weeks_late: 12,
}));
const weekStart = mondayOf(TODAY);
const learningWeek = {
  today: TODAY, week_start: weekStart, topic: H(0, 120), goal_hours: 6,
  blocks: range(8).map((i) => ({ id: `b${i}`, week_start: weekStart, weekday: i % 7, hours: i === 2 ? 12.25 : 2.5, activity: H(i, 200), done: i % 2 === 0, created_at: iso(TODAY), topic_id: null, resource_id: null })),
  courses, study_next: studyNext, open_topics: openTopics, library: range(3).map((i) => ({ id: uuid(100 + i), title: H(i + 2, 300) })),
  stats: { streak: 12, weeks: range(8).map((i) => ({ week_start: addDays(weekStart, -7 * (7 - i)), hours: [0, 2, 6, 7.5, 1, 9, 12, 3][i] })) },
  revision: range(3).map((i) => ({ kind: i % 2 ? "resource" : "topic", id: `rv${i}`, title: H(i, 300), label: H(i + 1, 120), step: i, dueAfter: 7, daysSince: 8, href: "/learning/c0" })),
  late: 12,
  review: { topics_done: range(3).map((i) => ({ id: `td${i}`, course_id: "c0", code: `2.${i}`, title: H(i, 300) })), items_done: range(2).map((i) => ({ id: `id${i}`, title: H(i + 2, 300) })), late: 12, reflection: H(0, 500) },
};
const topic = (u, k) => ({
  id: `tp${u}-${k}`, unit_id: `u${u}`, course_id: "c0", code: `${u + 1}.${k + 1}`, title: H(u + k, 300), short_title: H(u + k + 1, 80), outcome: H(u + k + 2, 300), est_hours: 2.5, planned_week: 1 + k,
  status: ["not-started", "in-progress", "done"][(u + k) % 3], actual_hours: k === 1 ? 123.25 : 1.25, notes: H(u + k + 3, 300), position: k,
});
const courseDetail = {
  today: TODAY,
  course: { id: "c0", title: H(0, 300), subtitle: H(1, 120), quote: H(2, 200), start_date: D(-30), target_date: D(60), weekly_plan: range(14).map((i) => (i % 3) * 2.5), color: "blue" },
  units: range(3).map((u) => ({ id: `u${u}`, course_id: "c0", code: String(u + 1), title: H(u + 3, 200), color: COLORS[u], position: u, topics: range(4).map((k) => topic(u, k)) })),
};
const resource = (i, over = {}) => ({
  id: `res${i}`, course_id: i % 2 ? "c0" : null, unit_id: null, practice_project_id: i === 4 ? "p1" : null, kind: ["certificate", "playlist", "video", "reading", "other"][i % 5], title: H(i, 300), url: cut(LINK, 500),
  platform: cut(H(i + 1), 60), provider: cut(H(i + 2), 120), status: ["learning", "todo", "completed", "dropped", "todo", "completed", "learning", "completed"][i % 8], priority: ["high", "medium", "low"][i % 3],
  est_hours: 123.5, items_total: 240, items_done: 118, due_date: D(i - 3), started_on: D(-10), completed_on: i % 8 === 2 || i % 8 === 5 || i % 8 === 7 ? D(-2) : null, cost: BIG, skills: [cut(WORD, 40), cut(BN, 40), "SEO", cut(LINK, 40)],
  rating: 4, takeaway: H(i + 3, 300), dropped_reason: H(i + 4, 300), notes: H(i, 2000), certificate_url: i % 8 === 2 || i % 8 === 5 || i % 8 === 7 ? cut(LINK, 500) : "", certificate_id: cut(WORD, 120),
  issued_on: D(-2), expires_on: D(20 + i), created_at: iso("2026-09-01"), ...over,
});
const resources = { today: TODAY, items: range(14).map((i) => resource(i)) };

const archiveKinds = ["task", "note", "event", "goal", "milestone", "habit", "course", "unit", "topic", "study_block", "transaction", "bill", "budget_category", "category", "reminder", "job", "project", "resource"];
const archive = {
  today: TODAY,
  items: archiveKinds.flatMap((kind, i) => [0, 1].map((k) => ({
    id: `a${i}-${k}`, source: kind === "project" ? "project" : "item", kind, title: H(i + k, 300), detail: k ? H(i + 3, 200) : D(-3), related: kind === "goal" || kind === "course" || kind === "project" || kind === "habit" ? 120 : 0,
    deleted_at: iso(D(-2)), deleted_on: D(-2), color: COLORS[i % 10],
  }))),
};

const notifications = {
  unread: 8,
  items: range(8).map((i) => ({ id: `nt${i}`, icon: ["calendar-clock", "receipt", "target", "heart-pulse", "graduation-cap", "repeat", "briefcase", "award"][i], tone: COLORS[i], title: H(i, 200), meta: H(i + 1, 200), href: "/tasks" })),
};
const searchResults = {
  items: range(10).map((i) => ({ type: ["Task", "Note", "Goal", "Event", "Habit", "Course", "Transaction", "Project", "Task", "Note"][i], id: `sr${i}`, title: H(i, 200), hint: i % 2 ? H(i + 2, 100) : D(-i), href: "/tasks" })),
};

const dashboard = {
  today: TODAY, name: hostileProfile.full_name,
  stats: { tasks: { done: 3, total: 9 }, goals: { on_track: 4, active: 7 }, streak: { days: 99999, name: H(4, 80) }, wellness: 10 },
  schedule: events(TODAY, TODAY).slice(0, 7),
  tasks: { today: [...tasks.filter((t) => t.due_date === TODAY), ...tasks.filter((t) => t.done_at).slice(0, 2)], week: tasks.filter((t) => t.due_date > TODAY && !t.done_at).slice(0, 7), overdue: tasks.filter((t) => t.due_date < TODAY && !t.done_at && !t.end_date) },
  habits: { days: habitDays.slice(2), items: habits.slice(0, 6).map((h) => ({ ...h, done: h.done.slice(2) })), done_today: 4 },
  goals: goals.filter((g) => g.status !== "completed").slice(0, 5),
  budget: { month: TODAY.slice(0, 7), total: 99999999.5, spent: BIG, categories: budgetCats.map((c, i) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon, limit: c.monthly_limit, spent: [BIG, HUGE, 450, 5000000.25, 120, 87654321.1, 15.5, 1000000][i] })) },
  health: { steps: 199999, sleep_minutes: 1439, resting_hr: 250, goals: { steps: 100000, sleep_minutes: 960 } },
  reminders: reminders.items.slice(0, 6),
  productivity: { days: range(7).map((i) => ({ date: D(i - 6), count: [99, 12, 0, 1234, 7, 100, 3][i] })), this_week: 999999, last_week: 1, change: 99999 },
};

/** The answers of the stand-in API that every page shares (the top bar, the pickers). */
const shared = () => ({
  "/profile": hostileProfile,
  "/categories": { today: TODAY, items: categories },
  "/projects?lite=1": { items: projectChoices },
  "/notifications": notifications,
  "/search": searchResults,
});

// ---------------------------------------------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------------------------------------------
const dlg = (page) => page.locator("dialog[open]").last();
/** Clicks, and when something floats over the button (the round Quick Add button, a toast) clicks it anyway. */
const press = async (locator) => {
  try {
    await locator.click({ timeout: 2500 });
  } catch {
    await locator.click({ timeout: 2500, force: true });
  }
};
const button = (scope, name, exact = false) => scope.getByRole("button", { name, exact }).first();
const tab = (scope, name) => scope.getByRole("tab", { name, exact: true }).first();
const settle = (page, ms = 300) => page.waitForTimeout(ms);
const openDialog = async (page, trigger) => {
  await press(trigger);
  await page.locator("dialog[open]").last().waitFor({ timeout: 3000 });
  await settle(page, 320); // the pop-in animation
};

/** Puts the longest choice into every <select> and long text into every text box of `scope` (kept within each box's maxlength). */
async function fillAll(page, scope, seed = 0) {
  const selects = scope.locator("select");
  for (let i = 0, n = await selects.count(); i < n; i++) {
    const s = selects.nth(i);
    if (!(await s.isVisible()) || !(await s.isEnabled())) continue;
    const value = await s.evaluate((el) => { let best = null; for (const o of el.options) if (!o.disabled && (!best || o.text.length > best.text.length)) best = o; return best ? best.value : null; });
    if (value !== null) await s.selectOption(value, { timeout: 1500 }).catch(() => undefined);
  }
  await settle(page, 150);
  const texts = scope.locator("input:not([type]), input[type=text], input[type=search], input[type=url], input[type=email], textarea");
  for (let i = 0, n = await texts.count(); i < n; i++) {
    const el = texts.nth(i);
    if (!(await el.isVisible()) || !(await el.isEditable())) continue;
    const max = Number(await el.getAttribute("maxlength")) || 0;
    await el.fill(H(seed + i, max || undefined), { timeout: 1500 }).catch(() => undefined);
  }
  const numbers = scope.locator("input[type=number]");
  for (let i = 0, n = await numbers.count(); i < n; i++) {
    const el = numbers.nth(i);
    if (!(await el.isVisible()) || !(await el.isEditable())) continue;
    await el.fill("12345678.5", { timeout: 1500 }).catch(() => undefined);
  }
  await settle(page, 200);
}

/** Runs inside the page: finds content that overflows a box. See the notes in the header. */
function inspectInPage({ deviceWidth, overlays }) {
  const desc = (el) => {
    const r = el.getBoundingClientRect();
    const cn = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).trim().replace(/\s+/g, ".").slice(0, 70);
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${cn} [width=${Math.round(r.width)} right=${Math.round(r.right)}] "${(el.textContent || "").trim().slice(0, 24)}"`;
  };
  const skip = (el) =>
    el.closest("aside[aria-label='Main menu']") || el.closest("dialog:not([open])") || el.closest("nextjs-portal") || el.closest("[data-nextjs-toast]") ||
    ["INPUT", "TEXTAREA", "SELECT", "SVG", "CANVAS", "HTML", "BODY"].includes(el.tagName.toUpperCase()) || el.classList.contains("sr-only") || el.closest(".sr-only");
  const scrolls = (cs) => cs.overflowX === "auto" || cs.overflowX === "scroll";
  const clips = (cs) => cs.overflowX === "hidden" || cs.overflowX === "clip";
  const nearestBox = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.tagName === "MAIN") return null; // main clips by design; it is judged as a whole
      const cs = getComputedStyle(p);
      if (scrolls(cs) || clips(cs)) return p;
    }
    return null;
  };
  /** What sticks out of box `s`: elements, then loose text. */
  const culprits = (s) => {
    const right = s.getBoundingClientRect().left + s.clientLeft + s.clientWidth;
    const out = [];
    for (const el of s.querySelectorAll("*")) {
      if (out.length >= 4) break;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || cs.display === "none" || cs.visibility === "hidden" || el.closest(".sr-only")) continue;
      if (r.right > right + 1 && nearestBox(el) === s) out.push(desc(el));
    }
    if (!out.length) {
      const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node && out.length < 3; node = walker.nextNode()) {
        if (!node.textContent.trim() || nearestBox(node.parentElement) !== s && node.parentElement !== s) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        if (range.getBoundingClientRect().right > right + 1) out.push(`text "${node.textContent.trim().slice(0, 40)}" in ${desc(node.parentElement)}`);
      }
    }
    return out;
  };
  const report = (root, keepScrollers) => {
    const found = [];
    for (const s of [root, ...root.querySelectorAll("*")]) {
      if (s !== root && skip(s)) continue;
      const cs = getComputedStyle(s);
      if (!(scrolls(cs) || clips(cs)) || cs.textOverflow === "ellipsis") continue;
      if (s.clientWidth <= 2 || s.scrollWidth <= s.clientWidth + 1) continue;
      found.push({ box: desc(s), kind: scrolls(cs) ? "scrolls" : "clipped", scrollWidth: s.scrollWidth, clientWidth: s.clientWidth, culprits: culprits(s) });
    }
    return keepScrollers ? found : found.filter((f) => f.kind === "clipped" || true);
  };

  /** Text that runs past the edge of its own box (a nowrap line in a card, a long word in a button): invisible to measure(), which only looks at boxes. */
  const textPokes = (root) => {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node && out.length < 40; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const el = node.parentElement;
      if (!el || skip(el) || el.closest("svg") || el.closest("select") || el.closest("option") || el.closest("[hidden]")) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      let box = el;
      while (box && box !== root.parentElement && getComputedStyle(box).display === "inline") box = box.parentElement;
      if (!box) continue;
      const bcs = getComputedStyle(box);
      if (bcs.overflowX !== "visible") continue; // clipped / scrolling boxes are reported by report()
      const range = document.createRange();
      range.selectNodeContents(node);
      const t = range.getBoundingClientRect();
      if (!t.width) continue;
      const b = box.getBoundingClientRect();
      const contentRight = b.right - parseFloat(bcs.paddingRight) - parseFloat(bcs.borderRightWidth);
      // A short word (a number, a label) chopped over several lines because its column is too narrow.
      const word = node.textContent.trim();
      if (word.length >= 3 && word.length <= 14 && !/\s/.test(word)) {
        const lines = new Set([...range.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top)));
        if (lines.size > 1) out.push(`word "${word}" is broken over ${lines.size} lines (its box is only ${Math.round(b.width)}px wide) in ${desc(box)}`);
      }
      if (t.right > contentRight + 1.5) out.push(`text "${node.textContent.trim().slice(0, 40)}" runs ${Math.round(t.right - contentRight)}px past its box (text right=${Math.round(t.right)}, box right=${Math.round(contentRight)}) in ${desc(box)}`);
    }
    return out;
  };
  const result = { overlay: [], clipped: [], scrolls: [], pokes: [], wide: [] };
  // Open dialogs, panels, the assistant: nothing may overflow or scroll sideways, and they must sit inside the screen.
  for (const sel of overlays) {
    for (const root of document.querySelectorAll(sel)) {
      const r = root.getBoundingClientRect();
      const name = `${sel}`;
      if (r.width > 0 && (r.left < -1 || r.right > deviceWidth + 1)) result.overlay.push({ box: desc(root), problem: `outside the screen: left=${Math.round(r.left)} right=${Math.round(r.right)} (screen ${deviceWidth})`, culprits: [] });
      for (const f of report(root, true)) result.overlay.push({ box: f.box, problem: `${f.kind} sideways: scrollWidth=${f.scrollWidth} clientWidth=${f.clientWidth}`, culprits: f.culprits, name });
      for (const t of textPokes(root)) result.pokes.push(`${t} [inside ${sel}]`);
    }
  }
  // The page itself: boxes that cut content off (overflow hidden / clip), and boxes that scroll sideways (information only).
  const main = document.querySelector("main");
  if (main) {
    for (const t of textPokes(main)) result.pokes.push(t);
    // If the page is wider than the screen: who reaches furthest right (boxes and loose text), outside scrolling boxes?
    const limit = main.getBoundingClientRect().right - parseFloat(getComputedStyle(main).paddingRight);
    if (main.scrollWidth > main.clientWidth || document.documentElement.scrollWidth > deviceWidth + 1) {
      const far = [];
      for (const el of main.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (!r.width || skip(el) || el.closest("dialog:not([open])")) continue;
        if (r.right > limit + 1 && nearestBox(el) === null) far.push({ right: r.right, text: desc(el) });
      }
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim() || !node.parentElement || skip(node.parentElement) || node.parentElement.closest("svg") || nearestBox(node.parentElement) !== null) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const r = range.getBoundingClientRect();
        if (r.width && r.right > limit + 1) far.push({ right: r.right, text: `text "${node.textContent.trim().slice(0, 40)}" in ${desc(node.parentElement)}` });
      }
      result.wide = far.sort((a, b) => b.right - a.right).slice(0, 5).map((f) => f.text);
    }
    for (const f of report(main, true)) {
      if (f.box.startsWith("main.")) continue;
      if (f.kind === "clipped") result.clipped.push(f);
      else result.scrolls.push(f);
    }
  }
  return result;
}

async function snapshot(page, width, overlays) {
  await page.evaluate(() => document.fonts.ready);
  const m = await measure(page, width);
  const problems = [];
  if (m.zoomedOut) problems.push(`zoomedOut: layout width ${m.layoutWidth} > screen ${width}`);
  if (m.docWidth > width + 1) problems.push(`docWidth ${m.docWidth} > screen ${width}`);
  if (m.mainClipped > 0) problems.push(`mainClipped ${m.mainClipped}`);
  for (const o of m.offenders) problems.push(`offender: ${o}`);
  const extra = await page.evaluate(inspectInPage, { deviceWidth: width, overlays: ["dialog[open]", ...overlays] });
  for (const w of extra.wide) problems.push(`reaches furthest right: ${w}`);
  for (const t of extra.pokes) problems.push(`text: ${t}`);
  for (const o of extra.overlay) problems.push(`overlay: ${o.box} ${o.problem}${o.culprits?.length ? " <= " + o.culprits.join(" ; ") : ""}`);
  for (const c of extra.clipped) problems.push(`clipped: ${c.box} scrollWidth=${c.scrollWidth} clientWidth=${c.clientWidth}${c.culprits.length ? " <= " + c.culprits.join(" ; ") : ""}`);
  const info = extra.scrolls.map((s) => `scrolls sideways (by design?): ${s.box} scrollWidth=${s.scrollWidth} clientWidth=${s.clientWidth}`);
  return { problems, info, measure: m };
}

/** A small valid PNG (for the profile photo editor). */
function makePng(w, h) {
  const crcTable = range(256).map((n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = (x * 255) / w; raw[i + 1] = (y * 255) / h; raw[i + 2] = 160; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------------------------------------------
// The pages and what to do on each (UNITS). A scene runs some clicks and typing, then the page is measured; a scene may
// call snap("label") several times to measure several states.
// ---------------------------------------------------------------------------------------------------------------
const scene = (name, run, opts = {}) => ({ name, run, overlays: [], ...opts });
const filledDialog = (name, open, extra) =>
  scene(name, async (page, snap) => {
    await openDialog(page, open(page));
    await snap("empty form");
    await fillAll(page, dlg(page));
    await snap("long text typed");
    if (extra) await extra(page, snap);
  });

const UNITS = [];
const unit = (id, path, ready, fixtures, scenes, routes) => UNITS.push({ id, path, ready, fixtures, scenes, routes });
const TOASTS = ["div.fixed[aria-live='polite']"];
/** Opens a "Delete …?" question and measures it (the question repeats the long title). */
const confirmScene = (name, open) =>
  scene(name, async (page, snap) => {
    await openDialog(page, open(page));
    await snap("confirm question");
  });
const heading = (page) => page.locator("main h1").first().waitFor({ timeout: 12000 });

unit("dashboard", "/", heading, () => ({ "/dashboard": dashboard, "/notes": notes, "/resources": resources, "/jobs": jobs, "/learning/week": learningWeek }), [
  scene("tasks widget tabs", async (page, snap) => {
    await press(tab(page, "This Week"));
    await snap("This Week");
    await press(page.getByRole("tab", { name: /Overdue/ }).first());
    await snap("Overdue");
  }),
]);

unit("tasks", "/tasks", heading, () => ({ "/tasks": { today: TODAY, items: tasks } }), [
  scene("filters", async (page, snap) => {
    for (const name of ["Today", "Upcoming", "Overdue", "Completed", "All"]) {
      await press(tab(page.locator("section[aria-label='Task list']"), name));
      await settle(page, 150);
      await snap(`filter ${name}`);
    }
    await page.locator("section[aria-label='Task list'] input[type=search]").fill(WORD);
    await page.locator("section[aria-label='Task list'] select").selectOption({ index: 2 }).catch(() => undefined);
    await snap("long search text + category chosen");
  }),
  scene("done group opened", async (page, snap) => {
    const done = page.locator("section[aria-label='Task list'] h3 button[aria-expanded]");
    if (await done.count()) await press(done.first());
    await snap("Completed group expanded");
  }),
  filledDialog("New task dialog", (p) => button(p, "New Task")),
  scene("Edit task dialog", async (page, snap) => {
    await openDialog(page, page.locator("section[aria-label='Task list'] li button.min-w-0").first());
    await snap("edit prefilled");
  }),
  confirmScene("Delete task question", (p) => p.locator("button[aria-label^='Delete ']").first()),
]);

unit("habits", "/habits", heading, () => ({ "/habits": habitsResponse }), [
  filledDialog("New habit dialog", (p) => button(p, "New Habit")),
  scene("Edit habit dialog", async (page, snap) => {
    await openDialog(page, page.locator("button[aria-label^='Edit ']").first());
    await snap("edit prefilled");
  }),
]);

unit("goals", "/goals", heading, () => ({ "/goals": goalsResponse, "/courses": coursesResponse }), [
  scene("filters", async (page, snap) => {
    for (const name of ["On track", "Behind", "Completed", "Active"]) {
      await press(tab(page, name));
      await snap(`filter ${name}`);
    }
  }),
  filledDialog("New goal dialog", (p) => button(p, "New Goal"), async (page, snap) => {
    await dlg(page).locator("#goal-link").selectOption("course");
    await dlg(page).locator("#goal-course").selectOption({ index: 1 }).catch(() => undefined);
    await snap("follows a course (long course name)");
    await press(tab(dlg(page), "Milestones I tick"));
    await snap("milestones mode");
  }),
  scene("Edit goal dialog", async (page, snap) => {
    await openDialog(page, page.getByRole("button", { name: "Edit goal" }).first());
    await snap("edit prefilled");
  }),
  scene("Update progress dialog", async (page, snap) => {
    await openDialog(page, page.getByRole("button", { name: "Update", exact: true }).first());
    await snap("update");
  }),
  confirmScene("Delete goal question", (p) => p.getByRole("button", { name: "Delete goal" }).first()),
]);

unit("health", "/health", heading, () => ({ "/health": healthResponse }), [
  filledDialog("Log health dialog", (p) => button(p, "Log Today")),
]);

unit("notes", "/notes", heading, () => ({ "/notes": notes, "/reminders": reminders }), [
  scene("search + tag", async (page, snap) => {
    await page.locator("main input[type=search]").fill(WORD);
    await snap("long search text");
    await page.locator("main input[type=search]").fill("");
    await page.locator("main select[aria-label='Tag']").selectOption({ index: 2 }).catch(() => undefined);
    await snap("tag chosen");
  }),
  scene("reminder typed", async (page, snap) => {
    await page.locator("input[aria-label='New reminder']").fill(H(0, 200));
    await snap("reminder text typed (date + Add shown)");
  }),
  filledDialog("New note dialog", (p) => button(p, "New Note")),
  scene("Edit note dialog", async (page, snap) => {
    await openDialog(page, page.locator("main article h3 button").first());
    await snap("edit prefilled");
  }),
  scene("Edit reminder dialog", async (page, snap) => {
    await openDialog(page, page.locator("button[aria-label='Edit reminder']").first());
    await snap("edit prefilled");
  }),
]);

unit("finance", "/finance", heading, () => ({ "/finance": financeMonth }), [
  scene("segments + search", async (page, snap) => {
    const card = page.locator("section[aria-labelledby='tx-title']");
    for (const name of ["Expenses", "Income", "All"]) {
      await press(tab(card, name));
      await snap(`filter ${name}`);
    }
    await card.locator("input[type=search]").fill(WORD);
    await snap("long search text");
  }),
  filledDialog("Add transaction dialog", (p) => button(p, "Add Transaction"), async (page, snap) => {
    await press(tab(dlg(page), "Income"));
    await snap("income");
  }),
  scene("Edit transaction dialog", async (page, snap) => {
    await openDialog(page, page.locator("section[aria-labelledby='tx-title'] tbody tr").first());
    await snap("edit prefilled");
  }),
  filledDialog("Add budget category dialog", (p) => page_add(p, "Add budget category")),
  scene("Edit budget category dialog", async (page, snap) => {
    await openDialog(page, page.locator("button[title='Edit category']").first());
    await snap("edit prefilled");
  }),
  filledDialog("Add bill dialog", (p) => page_add(p, "Add bill")),
  scene("Edit bill dialog", async (page, snap) => {
    await openDialog(page, page.locator("button[title='Edit bill']").first());
    await snap("edit prefilled");
  }),
  scene("Delete bill question", async (page, snap) => {
    await openDialog(page, page.locator("button[title='Edit bill']").first());
    await press(dlg(page).getByRole("button", { name: "Delete" }));
    await settle(page, 350);
    await snap("confirm question (over the bill form)");
  }),
  scene("Pay bill dialog", async (page, snap) => {
    await openDialog(page, page.getByRole("button", { name: "Pay", exact: true }).first());
    await snap("pay");
  }),
]);
function page_add(page, label) {
  return page.getByRole("button", { name: label, exact: true }).first();
}

unit("jobs", "/jobs", heading, () => ({ "/jobs": jobs, "/companies": companies, "/resources": resources, "/jobs/analyze": jobAnalysis }), [
  scene("Add company from a job", async (page, snap) => {
    await openDialog(page, page.getByRole("button", { name: /^Add company/ }).first());
    await snap("quick add dialog (company name filled in)");
    await fillAll(page, dlg(page));
    await snap("long text typed");
  }),
  scene("job card opened", async (page, snap) => {
    await press(page.getByRole("button", { name: /Requirements/ }).first());
    await snap("Requirements & notes expanded");
    await page.locator("aside input[placeholder^='Add skills']").fill(WORD);
    await snap("long skill typed");
  }),
  scene("Board view", async (page, snap) => {
    await press(tab(page, "Board"));
    await snap("board");
    await press(tab(page, "List"));
  }),
  scene("Add job dialog (read link)", async (page, snap) => {
    await openDialog(page, button(page, "Add Job"));
    await snap("empty form");
    await dlg(page).locator("#job-url").fill(LINK);
    await press(dlg(page).getByRole("button", { name: "Read link" }));
    await settle(page, 600);
    await snap("analyze result + hints");
    await press(dlg(page).getByRole("button", { name: /Paste the job text/ }));
    await dlg(page).locator("#job-text").fill(H(0, 30000).repeat(5));
    await snap("paste box with long text");
    await fillAll(page, dlg(page));
    await snap("all fields long");
  }),
  scene("Save job (toast)", async (page, snap) => {
    await openDialog(page, button(page, "Add Job"));
    await fillAll(page, dlg(page));
    await dlg(page).locator("#job-url").fill(LINK);
    await dlg(page).locator("#job-title").fill(H(0, 200));
    await dlg(page).locator("#job-deadline").fill(D(9));
    await press(dlg(page).locator("button[type=submit]"));
    await settle(page, 500);
    await snap("toast with the long title");
  }, { overlays: TOASTS, reload: true }),
  scene("Edit job dialog", async (page, snap) => {
    await openDialog(page, page.getByRole("button", { name: "Edit job" }).first());
    await snap("edit prefilled, with its picture");
  }),
  scene("Job picture", async (page, snap) => {
    await snap("cards with a picture");
    await openDialog(page, page.getByRole("button", { name: /^View the picture of/ }).first());
    await snap("picture viewer");
  }),
  scene("Add job dialog with a picture", async (page, snap) => {
    await openDialog(page, button(page, "Add Job"));
    await dlg(page).locator("#job-picture").setInputFiles({ name: "circular.png", mimeType: "image/png", buffer: makePng(900, 1600) });
    await dlg(page).getByRole("img", { name: "The picture of this job" }).waitFor({ timeout: 4000 });
    await snap("tall picture chosen");
    await dlg(page).locator("#job-picture").setInputFiles({ name: "not-a-picture.png", mimeType: "image/png", buffer: Buffer.from("hello") });
    await dlg(page).getByRole("alert").waitFor({ timeout: 4000 });
    await snap("message for a file that is not a picture");
  }),
]);

unit("settings", "/settings", heading, () => ({}), [
  scene("Profile tab", async (page, snap) => {
    await fillAll(page, page.locator("[role=tabpanel]"));
    await snap("long text typed");
  }),
  scene("Profile photo editor", async (page, snap) => {
    await page.locator("input[type=file]").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: makePng(600, 400) });
    await page.locator("dialog[open]").last().waitFor({ timeout: 3000 });
    await settle(page, 600);
    await snap("photo editor");
  }),
  scene("Preferences tab", async (page, snap) => {
    await press(tab(page, "Preferences"));
    await snap("preferences");
    await fillAll(page, page.locator("[role=tabpanel]"));
    await snap("preferences, longest choices + big numbers");
  }),
  scene("Categories tab", async (page, snap) => {
    await press(tab(page, "Categories"));
    await settle(page);
    await snap("categories");
    await page.locator("#c-name").fill(WORD);
    await snap("long new name typed");
    await openDialog(page, page.locator("button[aria-label^='Edit ']").first());
    await snap("edit category dialog");
  }),
  scene("Notifications tab", async (page, snap) => {
    await press(tab(page, "Notifications"));
    await snap("notifications");
  }),
  scene("Data & privacy tab", async (page, snap) => {
    await press(tab(page, "Data & privacy"));
    await snap("data");
    await page.locator("#del-confirm").fill(WORD);
    await snap("long confirm text typed");
  }),
]);

unit("calendar", "/calendar", heading, () => ({ "/events": eventsResponse }), [
  scene("month navigation + day", async (page, snap) => {
    await press(page.getByRole("button", { name: "Next month" }));
    await snap("next month");
    await press(page.getByRole("button", { name: "Previous month" }));
    await press(page.getByRole("button", { name: "Today", exact: true }));
    await snap("today selected (agenda)");
    await press(page.locator("section[aria-label='Month view'] button[aria-pressed]").nth(12));
    await snap("another day selected");
  }),
  filledDialog("New event dialog", (p) => button(p, "New Event"), async (page, snap) => {
    await dlg(page).locator("#event-repeat").selectOption("weekly");
    await dlg(page).getByLabel("All-day event").check();
    await snap("weekly + all day");
  }),
  scene("Edit event dialog", async (page, snap) => {
    await press(page.getByRole("button", { name: "Today", exact: true }));
    await openDialog(page, page.locator("aside ol li button").first());
    await snap("edit prefilled");
  }),
]);

unit("projects", "/projects", heading, () => ({ "/projects": { today: TODAY, items: projects } }), [
  scene("filters", async (page, snap) => {
    for (const name of ["Website", "Social media", "All"]) {
      const t = page.getByRole("tab", { name: new RegExp(name, "i") }).first();
      if (await t.count()) { await press(t); await snap(`type ${name}`); }
    }
    await press(page.getByRole("tab", { name: /Paused/ }).first());
    await snap("status Paused");
    await press(page.getByRole("tab", { name: /Done/ }).first());
    await snap("status Done");
  }),
  filledDialog("New project dialog", (p) => button(p, "New Project"), async (page, snap) => {
    for (let i = 0; i < 3; i++) await press(dlg(page).getByRole("button", { name: /Add a link/ }));
    const boxes = dlg(page).locator("ul input");
    for (let i = 0, n = await boxes.count(); i < n; i++) await boxes.nth(i).fill(i % 2 ? cut(LINK, 500) : cut(WORD, 60));
    await dlg(page).locator("#p-due").fill(D(30));
    await snap("3 long links + due date (No due date button)");
  }),
]);

unit("project", "/projects/p1", (p) => p.locator("main h1").first().waitFor({ timeout: 12000 }), () => ({ "/projects/p1": projectDetail(1) }), [
  scene("done tasks opened", async (page, snap) => {
    await press(page.getByRole("button", { name: /^Done \(/ }));
    await snap("done tasks");
    await page.locator("input[aria-label='New task']").fill(WORD);
    await page.locator("textarea#project-notes").fill(H(0, 10000).repeat(20));
    await snap("long task + notes typed");
  }),
  scene("Edit project dialog", async (page, snap) => {
    await openDialog(page, button(page, "Edit", true));
    await snap("edit prefilled (links)");
    await fillAll(page, dlg(page));
    await snap("long text typed");
  }),
]);

unit("project-archived", "/projects/p2", (p) => p.locator("main h1").first().waitFor({ timeout: 12000 }), () => ({ "/projects/p2": projectDetail(2, { archived_at: iso(D(-3)), archived_on: D(-3) }) }), []);

unit("learning", "/learning", heading, () => ({ "/learning/week": (_m, url) => ({ ...learningWeek, week_start: url.searchParams.get("start") ?? learningWeek.week_start }), "/courses": coursesResponse, "/learning/progress": progressResponse, "/resources": resources }), [
  scene("Progress and time", async (page, snap) => {
    const card = page.locator("section[aria-labelledby='progress-title']");
    await snap("weekly");
    await press(card.locator("button[aria-pressed]").nth(2));
    await snap("an older week picked");
    await press(card.getByRole("tab", { name: "Monthly" }));
    await snap("monthly");
    await press(card.getByRole("tab", { name: "Quarterly" }));
    await snap("quarterly");
    await press(card.locator("button[aria-pressed]").nth(1));
    await snap("an older quarter picked");
  }),
  scene("This week's study sessions", async (page, snap) => {
    await press(page.locator("details", { hasText: "Study sessions this week" }).locator("summary"));
    await snap("sessions list open");
  }),
  scene("Log study session dialog", async (page, snap) => {
    await openDialog(page, button(page, "Log Study Session"));
    await snap("empty form (long topic names in the picker)");
    await fillAll(page, dlg(page));
    await snap("long text typed");
  }),
  scene("Log time from Study next", async (page, snap) => {
    await openDialog(page, page.getByRole("button", { name: "Log time" }).first());
    await snap("form on a topic");
  }),
  scene("New course dialog", async (page, snap) => {
    await openDialog(page, page.getByRole("button", { name: "Add a course" }));
    await snap("empty form");
    await fillAll(page, dlg(page));
    await snap("long text typed");
    await dlg(page).locator("details").evaluate((el) => { el.open = true; });
    await dlg(page).locator("#course-outline").fill(("Unit 1: " + WORD + "\n- " + SENT + " | 1h\n").repeat(3));
    await snap("outline pasted");
  }),
  scene("Focus timer", async (page, snap) => {
    await page.evaluate((id) => localStorage.setItem("pos-focus", JSON.stringify({ startedAt: Date.now() - 50 * 60000, choice: `t:${id}` })), uuid(1));
    await page.reload();
    await page.getByRole("timer").waitFor({ timeout: 8000 });
    await settle(page, 400);
    await snap("timer bar with a long topic");
    await page.evaluate(() => localStorage.removeItem("pos-focus"));
  }, { reload: true }),
]);

unit("course", "/learning/c0", heading, () => ({ "/courses/c0": courseDetail, "/resources": resources, "/courses": coursesResponse }), [
  scene("Paste outline dialog", async (page, snap) => {
    await openDialog(page, button(page, "Paste outline"));
    await snap("empty form");
    await page.locator("#outline-text").fill(("Unit 1: " + WORD + "\n- " + SENT + " | 1h\n- " + BN + " | 2.5h\n").repeat(3));
    await snap("long outline typed");
  }),
  scene("Plan weeks dialog", async (page, snap) => {
    await openDialog(page, button(page, "Plan weeks"));
    await snap("plan");
  }),
  scene("Add unit dialog", async (page, snap) => {
    await openDialog(page, button(page, "Add unit"));
    await snap("empty form");
    await fillAll(page, dlg(page));
    await snap("long text typed");
  }),
  scene("Edit unit dialog", async (page, snap) => {
    await openDialog(page, page.getByRole("button", { name: /Edit unit/ }).first());
    await snap("edit prefilled");
  }),
  scene("Add/Edit topic dialog", async (page, snap) => {
    await openDialog(page, page.getByRole("button", { name: /Add topic to/ }).first());
    await snap("add topic, empty");
    await fillAll(page, dlg(page));
    await snap("long text typed");
    await page.keyboard.press("Escape");
    await settle(page, 300);
    await openDialog(page, page.getByRole("button", { name: /Edit topic/ }).first());
    await snap("edit topic prefilled");
  }),
  scene("Edit course dialog", async (page, snap) => {
    await openDialog(page, button(page, "Edit course"));
    await snap("edit prefilled");
    await fillAll(page, dlg(page));
    await snap("long text typed");
  }),
  confirmScene("Delete course question", (p) => p.getByRole("button", { name: "Delete", exact: true }).first()),
  scene("Library: add dialog", async (page, snap) => {
    await openDialog(page, page.locator("section[aria-labelledby='library-title']").getByRole("button", { name: "Add", exact: true }));
    await snap("empty form");
  }),
]);

unit("library", "/learning/library", heading, () => ({ "/resources": resources, "/courses": coursesResponse, "/courses/c0": courseDetail, "/projects": { today: TODAY, items: projects } }), [
  scene("tabs + filters", async (page, snap) => {
    await page.locator("input[aria-label='Search the library']").fill(WORD);
    await page.locator("select[aria-label='Subject']").selectOption({ index: 1 }).catch(() => undefined);
    await snap("search typed, subject chosen");
    await page.locator("input[aria-label='Search the library']").fill("");
    await page.locator("select[aria-label='Subject']").selectOption("all").catch(() => undefined);
    for (const name of [/^Completed/, /^Certificates/, /^To do/]) {
      await press(page.getByRole("tab", { name }).first());
      await snap(`tab ${name}`);
    }
  }),
  scene("Add dialog", async (page, snap) => {
    await openDialog(page, button(page, "Add", true));
    await snap("empty form");
    await fillAll(page, dlg(page));
    await snap("long text typed");
    await dlg(page).locator("#res-status").selectOption("completed");
    await fillAll(page, dlg(page), 3);
    await snap("status completed (certificate fields)");
  }),
  scene("Paste a list dialog", async (page, snap) => {
    await openDialog(page, button(page, "Paste a list"));
    await dlg(page).locator("#paste-list").fill([LINK, WORD, `${SENT} | ${LINK}`, BN].join("\n"));
    await snap("long list pasted");
  }),
  scene("Ideas dialog", async (page, snap) => {
    await openDialog(page, button(page, "Ideas"));
    await snap("ideas");
  }),
  scene("Complete dialog", async (page, snap) => {
    await openDialog(page, page.getByRole("button", { name: "Complete", exact: true }).first());
    await snap("make it count");
    await fillAll(page, dlg(page));
    await snap("long text typed");
  }),
  scene("Edit item dialog", async (page, snap) => {
    await openDialog(page, page.locator("button[aria-label^='Edit ']").first());
    await snap("edit prefilled");
  }),
]);

unit("companies", "/jobs/companies", heading, () => ({ "/jobs": jobs, "/companies": companies }), [
  scene("Search", async (page, snap) => {
    await page.locator("input[aria-label='Search companies']").fill(WORD);
    await snap("search with a long word");
  }),
  scene("Add company dialog", async (page, snap) => {
    await openDialog(page, page.getByRole("button", { name: "Add Company" }).first());
    await snap("empty form");
    await fillAll(page, dlg(page));
    await snap("long text typed");
  }),
  scene("Edit company dialog", async (page, snap) => {
    await openDialog(page, page.getByRole("button", { name: /^Edit / }).first());
    await snap("form with long links");
  }),
  confirmScene("Delete company question", (page) => page.getByRole("button", { name: /^Delete / }).first()),
]);

unit("archive", "/archive", heading, () => ({ "/archive": archive }), [
  scene("filter", async (page, snap) => {
    await page.locator("#archive-show").selectOption({ index: 3 }).catch(() => undefined);
    await snap("one kind");
  }),
  confirmScene("Delete for good question", (p) => p.locator("button[aria-label^='Delete ']").first()),
  scene("Restore (toast)", async (page, snap) => {
    await press(page.getByRole("button", { name: "Restore" }).first());
    await settle(page, 500);
    await snap("toast with the long title");
  }, { overlays: TOASTS, reload: true }),
]);

unit("load-error", "/tasks", (p) => p.getByText("This page could not load").waitFor({ timeout: 12000 }), () => ({}), [
  scene("error card", async (page, snap) => { await snap("long error message"); }),
], (ctx) => ctx.route("**/api/tasks", (route) => route.fulfill({ status: 500, json: { error: { message: `${SENT} ${WORD} ${LINK}` } } })));

const shellScenes = [
  scene("menu drawer", async (page, snap) => {
    await press(page.getByRole("button", { name: "Open menu" }));
    await settle(page, 450);
    await snap("drawer open");
  }, { overlays: ["aside[aria-label='Main menu']"], reload: true }),
  scene("notifications panel", async (page, snap) => {
    await press(page.getByRole("button", { name: "Notifications", exact: true }));
    await settle(page, 250);
    await snap("bell open (long notifications)");
  }, { overlays: ["header div.absolute.top-full"], reload: true }),
  scene("account menu", async (page, snap) => {
    await press(page.getByRole("button", { name: "Account menu" }));
    await settle(page, 250);
    await snap("profile menu open (long name + email)");
  }, { overlays: ["header div.absolute.top-full"], reload: true }),
  scene("search box", async (page, snap) => {
    await press(page.getByRole("button", { name: "Search", exact: true }));
    await settle(page, 350);
    await snap("search dialog, empty");
    await page.locator("dialog[open] input").fill(WORD);
    await settle(page, 900);
    await snap("search dialog, long text + long results");
  }, { reload: true }),
  scene("Quick Add assistant", async (page, snap) => {
    await press(page.getByRole("button", { name: /Open Quick Add/ }));
    await settle(page, 300);
    await snap("examples list");
    const box = page.locator("section[aria-label='Quick Add'] textarea");
    await box.fill(`task ${WORD} ${SENT} !high`);
    await snap("long command typed (textarea grows)");
    await box.press("Enter");
    await settle(page, 700);
    await box.fill(`note ${SENT}: ${WORD} ${LINK}`);
    await box.press("Enter");
    await settle(page, 700);
    await box.fill("help");
    await box.press("Enter");
    await settle(page, 600);
    await snap("replies (long task, note, help)");
  }, { overlays: ["section[aria-label='Quick Add']"], reload: true }),
];
unit("shell", "/archive", heading, () => ({ "/archive": archive }), shellScenes);

const aiReply = `**${WORD}** Here is what I found:\n- ${SENT}\n- ${WORD}\n- ${LINK}\n1. ${BN}\n2. **${BNW}** and ${EMO}\n\n${SENT} ${WORD}`;
unit("assistant-ai", "/archive", heading, () => ({ "/archive": archive, "/assistant": (method) => (method === "GET" ? { ai: true } : { reply: aiReply, changed: false }) }), [
  scene("AI assistant", async (page, snap) => {
    await press(page.getByRole("button", { name: /Open POS Assistant/ }));
    await settle(page, 300);
    await snap("assistant open");
    const box = page.locator("section[aria-label='POS Assistant'] textarea");
    await box.fill(`${SENT} ${WORD} ${LINK}`);
    await box.press("Enter");
    await settle(page, 800);
    await snap("long question + long answer with lists");
  }, { overlays: ["section[aria-label='POS Assistant']"], reload: true }),
]);

// ---------------------------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------------------------
const results = []; // one entry per (page, scene, state, width) that has a problem
const notExercised = []; // things that could not be done, with the reason
const infoBoxes = new Map(); // scrolls-sideways boxes: key -> {pages, widths}
let measured = 0;

async function runUnit(browser, u, width) {
  const ctx = await newPhone(browser, width, 844);
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  try {
    await apiMock(ctx, { ...shared(), ...u.fixtures() });
    if (u.routes) await u.routes(ctx);
    const baseline = new Set();
    const record = (sceneName, label, snapResult) => {
      measured++;
      const fresh = snapResult.problems.filter((p) => !baseline.has(p));
      for (const i of snapResult.info) {
        const key = `${u.id} | ${i}`;
        const entry = infoBoxes.get(key) ?? { widths: new Set() };
        entry.widths.add(width);
        infoBoxes.set(key, entry);
      }
      if (fresh.length) {
        results.push({ page: u.id, scene: sceneName, state: label, width, problems: fresh });
        if (SHOTS) return true;
      }
      return false;
    };
    const shoot = async (name) => {
      if (!SHOTS) return;
      mkdirSync(SHOTS, { recursive: true });
      const modal = (await page.locator("dialog[open]").count()) > 0;
      await page.screenshot({ path: `${SHOTS}/${name.replace(/[^a-z0-9]+/gi, "-")}.png`, fullPage: Boolean(process.env.FULL) && !modal }).catch(() => undefined);
    };

    // The page itself.
    try {
      await page.goto(BASE + u.path, { waitUntil: "domcontentloaded", timeout: 20000 });
      await u.ready(page);
      await settle(page, 700);
    } catch (e) {
      notExercised.push({ page: u.id, width, scene: "(page load)", reason: String(e.message).split("\n")[0] });
      return;
    }
    const first = await snapshot(page, width, []);
    for (const p of first.problems) baseline.add(p);
    // The first state is reported in full; later states only report what is new.
    measured++;
    for (const i of first.info) {
      const key = `${u.id} | ${i}`;
      const entry = infoBoxes.get(key) ?? { widths: new Set() };
      entry.widths.add(width);
      infoBoxes.set(key, entry);
    }
    if (first.problems.length) results.push({ page: u.id, scene: "page", state: "loaded with long data", width, problems: first.problems });
    if (first.problems.length || process.env.ALL) await shoot(`${u.id}-${width}-page`);

    for (const sc of u.scenes) {
      const taken = [];
      const snap = async (label) => {
        await settle(page, 80);
        const s = await snapshot(page, width, sc.overlays);
        const bad = record(sc.name, label, s);
        taken.push(label);
        if (bad || process.env.ALL) await shoot(`${u.id}-${width}-${sc.name}-${label}`);
      };
      try {
        await sc.run(page, snap);
        if (!taken.length) await snap("result");
      } catch (e) {
        notExercised.push({ page: u.id, width, scene: sc.name, reason: String(e.message).split("\n")[0].slice(0, 160) });
      }
      // Back to a clean page for the next scene.
      try {
        if (sc.reload) {
          await page.goto(BASE + u.path, { waitUntil: "domcontentloaded", timeout: 15000 });
          await u.ready(page);
          await settle(page, 500);
        } else {
          for (let i = 0; i < 4 && (await page.locator("dialog[open]").count()); i++) {
            await page.keyboard.press("Escape");
            await settle(page, 150);
          }
          if (await page.locator("dialog[open]").count()) {
            await page.reload();
            await u.ready(page);
            await settle(page, 500);
          }
        }
      } catch (e) {
        notExercised.push({ page: u.id, width, scene: `(after ${sc.name})`, reason: `could not get back to the page: ${String(e.message).split("\n")[0]}` });
        return;
      }
    }
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------
const short = (s, n = 260) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
/** The part of an offender line that names the element (so the same element at two widths is one row). */
const signature = (p) => p.replace(/\s+(right|width|\[width)=[^"]*"/, "").replace(/"[^"]*"$/, "").replace(/\d+/g, "#");

function report() {
  console.log("\n================ PHONE LAYOUT AUDIT (hostile data) ================");
  console.log(`widths ${WIDTHS.join(", ")} | ${UNITS.length} page groups | ${measured} states measured`);
  // Group: page + scene + state + problem signature -> widths
  const groups = new Map();
  for (const r of results) {
    for (const p of r.problems) {
      const key = `${r.page}\u0000${r.scene}\u0000${r.state}\u0000${signature(p)}`;
      const g = groups.get(key) ?? { page: r.page, scene: r.scene, state: r.state, widths: new Set(), example: p, exampleWidth: r.width };
      g.widths.add(r.width);
      if (r.width < g.exampleWidth) { g.example = p; g.exampleWidth = r.width; }
      groups.set(key, g);
    }
  }
  const rows = [...groups.values()].sort((a, b) => a.page.localeCompare(b.page) || a.scene.localeCompare(b.scene));
  if (!rows.length) console.log("\nNo failing states.");
  else {
    console.log(`\nFAILING (${rows.length} distinct problems)\n`);
    let last = "";
    for (const g of rows) {
      if (g.page !== last) { console.log(`\n## ${g.page}`); last = g.page; }
      console.log(`- [${[...g.widths].sort((a, b) => a - b).join(",")}] ${g.scene} / ${g.state}: ${short(g.example, 420)}`);
    }
  }
  if (infoBoxes.size) {
    console.log("\nINFORMATION: boxes that scroll sideways (not counted as failures)");
    for (const [key, v] of [...infoBoxes].sort()) console.log(`- [${[...v.widths].sort((a, b) => a - b).join(",")}] ${short(key, 300)}`);
  }
  if (notExercised.length) {
    console.log("\nCOULD NOT EXERCISE");
    const seen = new Set();
    for (const n of notExercised) {
      const key = `${n.page} | ${n.scene} | ${n.reason}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const widths = notExercised.filter((x) => x.page === n.page && x.scene === n.scene && x.reason === n.reason).map((x) => x.width).sort((a, b) => a - b);
      console.log(`- [${widths.join(",")}] ${n.page} / ${n.scene}: ${n.reason}`);
    }
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ widths: WIDTHS, measured, results, notExercised, scrollBoxes: [...infoBoxes].map(([k, v]) => ({ box: k, widths: [...v.widths] })) }, null, 2));
  console.log(`\nFull result: ${OUT}`);
}

const started = Date.now();
const browser = await launch();
const jobsToRun = UNITS.filter((u) => !ONLY || ONLY.includes(u.id)).flatMap((u) => WIDTHS.map((w) => ({ u, w })));
let next = 0;
const worker = async () => {
  while (next < jobsToRun.length) {
    const { u, w } = jobsToRun[next++];
    const t0 = Date.now();
    try {
      await runUnit(browser, u, w);
    } catch (e) {
      notExercised.push({ page: u.id, width: w, scene: "(whole page)", reason: String(e.message).split("\n")[0] });
    }
    process.stdout.write(`done ${u.id}@${w} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
  }
};
await Promise.all(range(Math.max(1, POOL)).map(worker));
await browser.close();
report();
console.log(`took ${((Date.now() - started) / 1000).toFixed(0)}s`);
process.exit(results.length ? 1 : 0);
