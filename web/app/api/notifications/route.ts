import { handle } from "@/lib/server/api";
import { addDays, daysBetween, dateIn, minutesNowIn, mondayOf, startOfDayUtc, todayIn, weekdayIndex } from "@/lib/server/dates";
import { habitBoard } from "@/lib/server/habits";
import { must } from "@/lib/server/http";
import { courseSummaries, loadHabits } from "@/lib/server/queries";
import { EXPIRY_WARNING_DAYS } from "@/lib/library";
import { isActiveCourse } from "@/lib/study";
import { byTime, occurrences } from "@/lib/server/recurrence";
import { hm } from "@/lib/format";
import { isOnDay, isOverdue } from "@/lib/tasks";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "13:30" → "1:30 PM", or "13:30" for the 24-hour setting. */
function clock(hhmm: string, format: string) {
  if (format === "24h") return hhmm.slice(0, 5);
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
}

type Item = { id: string; icon: string; tone: string; title: string; meta: string; href: string };

// In-app notifications, worked out from your data and your Settings → Notifications choices.
export const GET = handle(async ({ db, profile: getProfile }) => {
  const profile = await getProfile();
  const zone = profile.timezone;
  const today = todayIn(zone);
  const notify = (profile.notify || {}) as Record<string, boolean>;
  const nowMinutes = minutesNowIn(zone);

  const [openTasks, bills, events, blocks, habitData, jobs, projects, libraryDue, libraryCerts, libraryUnused, libraryPractising, courses] = await Promise.all([
    db.from("tasks").select("due_date, end_date").is("done_at", null).lte("due_date", today).then(must),
    db.from("bills").select("*").is("paid_at", null).lte("due_date", addDays(today, 3)).order("due_date").then(must),
    db.from("events").select("*").lte("event_date", today).or(`repeat.neq.none,event_date.eq.${today}`).then(must),
    db.from("study_blocks").select("*").eq("week_start", mondayOf(today)).eq("weekday", weekdayIndex(today)).eq("done", false).then(must),
    notify.habit_reminder ? loadHabits(db, today) : Promise.resolve(null),
    // Saved jobs (not applied yet) whose last date to apply is within 3 days.
    db.from("job_applications").select("id, title, company, deadline").eq("status", "saved").gte("deadline", today).lte("deadline", addDays(today, 3)).order("deadline").then(must),
    // Active projects with a due date (ongoing projects have none) that is within 3 days or already past.
    db.from("projects").select("id, name, due_date").eq("status", "active").is("archived_at", null).not("due_date", "is", null).lte("due_date", addDays(today, 3)).order("due_date").then(must),
    // Library items still to do or in progress whose deadline is within 3 days.
    db.from("learning_resources").select("id, title, status, due_date, expires_on").in("status", ["todo", "learning"]).gte("due_date", today).lte("due_date", addDays(today, 3)).then(must),
    // Certificates that expire within a month, or did in the last 2 weeks.
    db.from("learning_resources").select("id, title, status, due_date, expires_on").eq("status", "completed").gte("expires_on", addDays(today, -14)).lte("expires_on", addDays(today, EXPIRY_WARNING_DAYS)).then(must),
    // Finished 3 to 30 days ago and still not practised (the two newest).
    db.from("learning_resources").select("id, title").eq("status", "completed").is("practice_project_id", null).gte("completed_on", addDays(today, -30)).lte("completed_on", addDays(today, -3)).order("completed_on", { ascending: false }).limit(2).then(must),
    // Items with a practice project (the 10 newest), to see whether the practice has stopped.
    db.from("learning_resources").select("id, title, practice_project_id").not("practice_project_id", "is", null).order("created_at", { ascending: false }).limit(10).then(must),
    // Courses that fell behind their plan (only looked up when study reminders are on).
    notify.study_sessions ? courseSummaries(db, today) : Promise.resolve([]),
  ]);

  const items: Item[] = [];
  const overdue = openTasks.filter((t) => isOverdue(t, today)).length;
  const todayCount = openTasks.filter((t) => isOnDay(t, today)).length;

  if (overdue) items.push({ id: "overdue", icon: "circle-alert", tone: "rose", title: `${plural(overdue, "task")} overdue`, meta: "Tasks", href: "/tasks" });

  if (notify.morning_plan) {
    const todayEvents = events.filter((e) => occurrences(e, today, today).length);
    items.push({ id: "plan", icon: "sunrise", tone: "amber", title: `Today: ${plural(todayCount, "task")} and ${plural(todayEvents.length, "event")}`, meta: "Your day", href: "/" });
  }

  if (notify.bills_due) {
    for (const bill of bills) {
      const days = daysBetween(today, bill.due_date);
      const when = days < 0 ? `overdue by ${plural(-days, "day")}` : days === 0 ? "due today" : `due in ${plural(days, "day")}`;
      items.push({ id: `bill-${bill.id}`, icon: "receipt", tone: days < 0 ? "rose" : "amber", title: `${bill.name} is ${when}`, meta: "Finance", href: "/finance" });
    }
  }

  for (const job of jobs) {
    const days = daysBetween(today, job.deadline!);
    const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${plural(days, "day")}`;
    items.push({ id: `job-${job.id}`, icon: "briefcase", tone: days <= 1 ? "rose" : "amber", title: `Apply for ${job.title}${job.company ? ` (${job.company})` : ""}: last day ${when}`, meta: "Job Apply", href: "/jobs" });
  }

  for (const project of projects) {
    const days = daysBetween(today, project.due_date!);
    const when = days < 0 ? `overdue by ${plural(-days, "day")}` : days === 0 ? "due today" : `due in ${plural(days, "day")}`;
    items.push({ id: `project-${project.id}`, icon: "briefcase", tone: days < 0 ? "rose" : "amber", title: `${project.name} is ${when}`, meta: "Projects", href: `/projects/${project.id}` });
  }

  for (const r of [...libraryDue, ...libraryCerts]) {
    if (r.status === "completed" && r.expires_on) {
      const days = daysBetween(today, r.expires_on);
      const when = days < 0 ? `expired ${plural(-days, "day")} ago` : days === 0 ? "expires today" : `expires in ${plural(days, "day")}`;
      items.push({ id: `cert-${r.id}`, icon: "award", tone: days <= 7 ? "rose" : "amber", title: `${r.title} certificate ${when}`, meta: "Learning", href: "/learning/library" });
    } else if (r.due_date) {
      const days = daysBetween(today, r.due_date);
      const when = days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${plural(days, "day")}`;
      items.push({ id: `library-${r.id}`, icon: "graduation-cap", tone: days <= 1 ? "rose" : "amber", title: `${r.title} is ${when}`, meta: "Learning", href: "/learning/library" });
    }
  }

  for (const r of libraryUnused) {
    items.push({ id: `practice-${r.id}`, icon: "award", tone: "violet", title: `You finished ${r.title}. Practise it so it stays with you`, meta: "Learning", href: "/learning/library" });
  }

  // A practice project with open tasks and nothing done for a week.
  if (libraryPractising.length) {
    const ids = libraryPractising.map((r) => r.practice_project_id!);
    const [practiceProjects, practiceTasks] = await Promise.all([
      db.from("projects").select("id, status, archived_at, created_at").in("id", ids).then(must),
      db.from("tasks").select("project_id, done_at").in("project_id", ids).then(must),
    ]);
    for (const r of libraryPractising) {
      const project = practiceProjects.find((p) => p.id === r.practice_project_id);
      const tasks = practiceTasks.filter((t) => t.project_id === r.practice_project_id);
      if (!project || project.archived_at || project.status !== "active" || !tasks.some((t) => !t.done_at)) continue;
      const lastDone = tasks.reduce<string | null>((latest, t) => (t.done_at && (!latest || t.done_at > latest) ? t.done_at : latest), null);
      const quietDays = daysBetween(dateIn(new Date(lastDone ?? project.created_at), zone), today);
      if (quietDays >= 7) items.push({ id: `practice-quiet-${r.id}`, icon: "target", tone: "amber", title: `Practice is waiting: ${r.title} (nothing done for ${plural(quietDays, "day")})`, meta: "Projects", href: `/projects/${project.id}` });
    }
  }

  // The next event still to come today.
  const next = events
    .filter((e) => !e.all_day && occurrences(e, today, today).length && e.start_time && Number(e.start_time.slice(0, 2)) * 60 + Number(e.start_time.slice(3, 5)) > nowMinutes)
    .sort(byTime)[0];
  if (next) items.push({ id: `event-${next.id}`, icon: "calendar-clock", tone: "blue", title: `Next: ${next.title} at ${clock(next.start_time || "", profile.time_format)}`, meta: "Calendar", href: "/calendar" });

  if (notify.study_sessions) {
    for (const block of blocks) items.push({ id: `study-${block.id}`, icon: "graduation-cap", tone: "indigo", title: `Study today: ${block.activity} (${Number(block.hours)}h)`, meta: "Learning", href: "/learning" });
  }

  // A course with something planned for an earlier week still open (the two furthest behind).
  const behind = courses.filter((c) => c.state === "behind" && isActiveCourse(c)).sort((a, b) => b.weeks_behind - a.weeks_behind || b.behind_hours - a.behind_hours).slice(0, 2);
  for (const course of behind) {
    const how = course.weeks_behind > 0 ? `${plural(course.weeks_behind, "week")} behind` : "behind";
    items.push({ id: `behind-${course.id}`, icon: "graduation-cap", tone: "amber", title: `${course.title} is ${how}: ${hm(course.behind_hours)} to catch up`, meta: "Learning", href: `/learning/${course.id}` });
  }

  if (habitData && nowMinutes >= 18 * 60) {
    const board = habitBoard(habitData.habits, habitData.logs, today, 1, 1);
    const left = board.summary.total - board.summary.done_today;
    if (left > 0) items.push({ id: "habits", icon: "repeat", tone: "emerald", title: `${plural(left, "habit")} left for today`, meta: "Habits", href: "/habits" });
  }

  if (notify.weekly_review && weekdayIndex(today) === 6) {
    items.push({ id: "review", icon: "notebook-pen", tone: "violet", title: "Time for your weekly review", meta: "Notes", href: "/notes" });
  }

  // "Mark all as read" covers everything until the next day.
  const readToday = Boolean(profile.notifications_read_at && profile.notifications_read_at >= startOfDayUtc(today, zone));
  return { items, unread: readToday ? 0 : items.length };
});
