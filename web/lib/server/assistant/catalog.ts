// The API, described for the assistant. Body shapes come from the same schemas the API checks with.
import {
  BillFields, BlockCreate, BudgetCategoryFields, CategoryCreate, CourseFields, EventFields, GoalCreate, HabitCreate, HabitUpdate,
  HealthFields, JobAdd, JobCreate, JobFields, METHODS, MilestoneCreate, NoteFields, ProfileUpdate, ReminderFields, ResourceCreate, ResourceFields, TaskCreate, TaskUpdate,
  TopicFields, TxFields, UnitFields, WeekUpdate,
} from "../schemas.ts";
import { z } from "../validate.ts";

const shape = (schema: z.ZodType) => {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  // Drop what only adds noise for the model (long regexes, "no maximum", the closed-object flag).
  return JSON.stringify(json, (key, value) =>
    key === "pattern" || key === "additionalProperties" || (key === "maximum" && value === Number.MAX_SAFE_INTEGER) ? undefined : value);
};

// [method, path, what it does, body schema]
const ENDPOINTS: [string, string, string, z.ZodType?][] = [
  ["GET", "/dashboard", "Today at a glance: schedule, tasks (today/week/overdue), habits, goals, budget, health, reminders"],
  ["GET", "/search?q=", "Find anything by words (max 5 per kind) — use it to get ids"],
  ["GET", "/profile", "Settings, time zone, today's date, and the user's skills"],
  ["PATCH", "/profile", "Change settings or the skills list (send the whole new skills array)", ProfileUpdate],
  ["GET", "/categories", "Categories for tasks, events and goals"],
  ["POST", "/categories", "New category", CategoryCreate],
  ["PATCH", "/categories/:id", "Change a category", CategoryCreate.partial()],
  ["DELETE", "/categories/:id", "Delete a category (it goes to the Archive; its items stay, uncategorised)"],

  ["GET", "/tasks", "Open tasks plus tasks done in the last 14 days"],
  ["POST", "/tasks", "New task (end_date only for tasks running over several days)", TaskCreate.omit({ project_id: true })],
  ["PATCH", "/tasks/:id", "Change a task; {done:true} ticks it, {done:false} unticks it", TaskUpdate.omit({ project_id: true })],
  ["DELETE", "/tasks/:id", "Delete a task (it goes to the Archive)"],

  ["GET", "/events?from=YYYY-MM-DD&to=YYYY-MM-DD", "Calendar events between two dates (repeats expanded)"],
  ["POST", "/events", "New calendar event (times HH:MM)", EventFields],
  ["PATCH", "/events/:id", "Change an event (whole series if it repeats)", EventFields.partial()],
  ["DELETE", "/events/:id", "Delete an event (it goes to the Archive)"],

  ["GET", "/goals", "Goals with milestones and progress"],
  ["POST", "/goals", "New goal", GoalCreate],
  ["PATCH", "/goals/:id", "Change a goal (e.g. current_value, status)", GoalCreate.partial()],
  ["DELETE", "/goals/:id", "Delete a goal (it goes to the Archive)"],
  ["POST", "/goals/:id/milestones", "Add a milestone to a goal", MilestoneCreate],
  ["PATCH", "/milestones/:id", "Change or tick a milestone", MilestoneCreate.partial()],
  ["DELETE", "/milestones/:id", "Delete a milestone (it goes to the Archive)"],

  ["GET", "/habits?days=7", "Habits with the last N days ticked or not, and streaks"],
  ["POST", "/habits", "New habit", HabitCreate],
  ["PATCH", "/habits/:id", "Change or archive a habit", HabitUpdate],
  ["DELETE", "/habits/:id", "Delete a habit and its history (it goes to the Archive)"],
  ["PUT", "/habits/:id/logs/:date", "Tick a habit for a day (no body)"],
  ["DELETE", "/habits/:id/logs/:date", "Untick a habit for a day"],

  ["GET", "/learning/week?start=YYYY-MM-DD", "A study week (default this week): topic, goal hours, study blocks, and every course's progress"],
  ["PUT", "/learning/week/:monday", "Set a week's topic or goal hours (path date must be a Monday)", WeekUpdate],
  ["POST", "/learning/blocks", "Plan a study block (weekday 0 = Monday … 6 = Sunday)", BlockCreate],
  ["PATCH", "/learning/blocks/:id", "Change or tick a study block", BlockCreate.omit({ week_start: true }).partial()],
  ["DELETE", "/learning/blocks/:id", "Delete a study block (it goes to the Archive)"],
  ["GET", "/courses", "Courses (learning modules) with progress"],
  ["GET", "/courses/:id", "One course with its units and topics (get ids here)"],
  ["POST", "/courses", "New course / learning module (start_date is moved to its Monday)", CourseFields],
  ["PATCH", "/courses/:id", "Change a course", CourseFields.partial()],
  ["DELETE", "/courses/:id", "Delete a course with its units and topics (it goes to the Archive)"],
  ["POST", "/courses/:id/units", "Add a unit to a course", UnitFields],
  ["PATCH", "/units/:id", "Change a unit", UnitFields.partial()],
  ["DELETE", "/units/:id", "Delete a unit and its topics (it goes to the Archive)"],
  ["POST", "/courses/:id/topics", "Add a topic to a unit of the course", TopicFields],
  ["PATCH", "/topics/:id", "Change a topic (status, actual_hours …)", TopicFields.omit({ unit_id: true }).partial()],
  ["DELETE", "/topics/:id", "Delete a topic (it goes to the Archive)"],

  ["GET", "/finance?month=YYYY-MM", "A month of money: budget categories, transactions, unpaid bills"],
  ["POST", "/finance/transactions", `New income or expense (method one of ${METHODS.join(", ")})`, TxFields],
  ["PATCH", "/finance/transactions/:id", "Change a transaction", TxFields.partial()],
  ["DELETE", "/finance/transactions/:id", "Delete a transaction (it goes to the Archive)"],
  ["POST", "/finance/categories", "New budget category", BudgetCategoryFields],
  ["PATCH", "/finance/categories/:id", "Change a budget category", BudgetCategoryFields.partial()],
  ["DELETE", "/finance/categories/:id", "Delete a budget category (it goes to the Archive)"],
  ["POST", "/finance/bills", "New bill", BillFields],
  ["PATCH", "/finance/bills/:id", "Change an unpaid bill", BillFields.partial()],
  ["DELETE", "/finance/bills/:id", "Delete a bill (it goes to the Archive)"],
  ["POST", "/finance/bills/:id/pay", "Pay a bill: records the expense ({method} optional)"],

  ["GET", "/health?days=30", "Health logs for the last N days, and goals"],
  ["PUT", "/health/:date", "Save a day's health (only the fields sent change)", HealthFields],

  ["GET", "/notes", "Notes, pinned first"],
  ["POST", "/notes", "New note", NoteFields],
  ["PATCH", "/notes/:id", "Change or pin a note", NoteFields.partial()],
  ["DELETE", "/notes/:id", "Delete a note (it goes to the Archive)"],
  ["GET", "/reminders", "Open reminders and recently ticked ones"],
  ["POST", "/reminders", "New reminder", ReminderFields],
  ["PATCH", "/reminders/:id", "Change or tick a reminder", ReminderFields.partial()],
  ["DELETE", "/reminders/:id", "Delete a reminder (it goes to the Archive)"],

  ["GET", "/jobs", "Saved job applications, nearest last date to apply first, with each job's required skills"],
  ["POST", "/jobs/analyze", "Read a job link or pasted post and return title, company, deadline, requirements and skills. Does NOT save: pass the result to POST /jobs", JobAdd],
  ["POST", "/jobs", "Save a job (title required; use the fields from /jobs/analyze)", JobCreate],
  ["PATCH", "/jobs/:id", "Change a job (status saved/applied/interview/offer/rejected, deadline, notes …)", JobFields],
  ["DELETE", "/jobs/:id", "Delete a saved job (it goes to the Archive)"],

  ["GET", "/resources", "The Learning library: certificate courses, YouTube playlists, videos and books to complete (status todo/learning/completed/dropped, progress items_done of items_total, certificate details)"],
  ["POST", "/resources", "Add a course, playlist or video to the library (title required; platform is found from the url)", ResourceCreate],
  ["PATCH", "/resources/:id", "Change an item; {status:\"completed\"} completes it, {items_done:n} sets the videos watched (the status and dates follow)", ResourceFields],
  ["DELETE", "/resources/:id", "Delete a library item (it goes to the Archive)"],
  ["POST", "/resources/:id/practice", "Make a practice project (6-8 tasks: redo it, apply it, publish proof, teach it back, get feedback, add to CV) for a library item; opens the existing one if there is one"],
];

/** The endpoint list for the system prompt (built once). */
export const API_GUIDE = ENDPOINTS.map(([method, path, about, body]) => `${method} ${path} — ${about}${body ? `\n  body: ${shape(body)}` : ""}`).join("\n");
