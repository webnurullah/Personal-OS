// Lets the assistant use this app's own API, in the same server process and as the signed-in user,
// so it gets exactly the same checks (sign-in, validation, Row Level Security) as the web app.
import { NextRequest } from "next/server";
import * as categories from "@/app/api/categories/route";
import * as category from "@/app/api/categories/[id]/route";
import * as courses from "@/app/api/courses/route";
import * as course from "@/app/api/courses/[id]/route";
import * as courseOutline from "@/app/api/courses/[id]/outline/route";
import * as coursePlan from "@/app/api/courses/[id]/plan/route";
import * as courseTasks from "@/app/api/courses/[id]/tasks/route";
import * as courseTopics from "@/app/api/courses/[id]/topics/route";
import * as courseUnits from "@/app/api/courses/[id]/units/route";
import * as dashboard from "@/app/api/dashboard/route";
import * as events from "@/app/api/events/route";
import * as event from "@/app/api/events/[id]/route";
import * as finance from "@/app/api/finance/route";
import * as bills from "@/app/api/finance/bills/route";
import * as bill from "@/app/api/finance/bills/[id]/route";
import * as billPay from "@/app/api/finance/bills/[id]/pay/route";
import * as budgetCategories from "@/app/api/finance/categories/route";
import * as budgetCategory from "@/app/api/finance/categories/[id]/route";
import * as transactions from "@/app/api/finance/transactions/route";
import * as transaction from "@/app/api/finance/transactions/[id]/route";
import * as goals from "@/app/api/goals/route";
import * as goal from "@/app/api/goals/[id]/route";
import * as goalMilestones from "@/app/api/goals/[id]/milestones/route";
import * as habits from "@/app/api/habits/route";
import * as habit from "@/app/api/habits/[id]/route";
import * as habitLog from "@/app/api/habits/[id]/logs/[date]/route";
import * as health from "@/app/api/health/route";
import * as healthDay from "@/app/api/health/[date]/route";
import * as companies from "@/app/api/companies/route";
import * as company from "@/app/api/companies/[id]/route";
import * as jobs from "@/app/api/jobs/route";
import * as job from "@/app/api/jobs/[id]/route";
import * as jobAnalyze from "@/app/api/jobs/analyze/route";
import * as blocks from "@/app/api/learning/blocks/route";
import * as block from "@/app/api/learning/blocks/[id]/route";
import * as progress from "@/app/api/learning/progress/route";
import * as week from "@/app/api/learning/week/route";
import * as weekStart from "@/app/api/learning/week/[start]/route";
import * as milestone from "@/app/api/milestones/[id]/route";
import * as notes from "@/app/api/notes/route";
import * as note from "@/app/api/notes/[id]/route";
import * as notifications from "@/app/api/notifications/route";
import * as profile from "@/app/api/profile/route";
import * as reminders from "@/app/api/reminders/route";
import * as resources from "@/app/api/resources/route";
import * as resource from "@/app/api/resources/[id]/route";
import * as resourcePractice from "@/app/api/resources/[id]/practice/route";
import * as reminder from "@/app/api/reminders/[id]/route";
import * as search from "@/app/api/search/route";
import * as tasks from "@/app/api/tasks/route";
import * as task from "@/app/api/tasks/[id]/route";
import * as topic from "@/app/api/topics/[id]/route";
import * as unit from "@/app/api/units/[id]/route";

// Each route expects its own params ({ id }, { date } …); the router fills them from the path.
type Handler = (req: NextRequest, ctx: { params: Promise<never> }) => Promise<Response>;
type Module = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

// Every address the assistant may use. "Delete all data", "load sample data" and the export are left out on purpose.
const ROUTES: [string, Module][] = [
  ["/dashboard", dashboard], ["/search", search], ["/notifications", notifications], ["/profile", profile],
  ["/categories", categories], ["/categories/:id", category],
  ["/tasks", tasks], ["/tasks/:id", task],
  ["/events", events], ["/events/:id", event],
  ["/goals", goals], ["/goals/:id", goal], ["/goals/:id/milestones", goalMilestones], ["/milestones/:id", milestone],
  ["/habits", habits], ["/habits/:id", habit], ["/habits/:id/logs/:date", habitLog],
  ["/learning/progress", progress], ["/learning/week", week], ["/learning/week/:start", weekStart], ["/learning/blocks", blocks], ["/learning/blocks/:id", block],
  ["/courses", courses], ["/courses/:id", course], ["/courses/:id/units", courseUnits], ["/courses/:id/topics", courseTopics], ["/courses/:id/outline", courseOutline], ["/courses/:id/plan", coursePlan], ["/courses/:id/tasks", courseTasks],
  ["/units/:id", unit], ["/topics/:id", topic],
  ["/finance", finance], ["/finance/transactions", transactions], ["/finance/transactions/:id", transaction],
  ["/finance/categories", budgetCategories], ["/finance/categories/:id", budgetCategory],
  ["/finance/bills", bills], ["/finance/bills/:id", bill], ["/finance/bills/:id/pay", billPay],
  ["/health", health], ["/health/:date", healthDay],
  ["/notes", notes], ["/notes/:id", note], ["/reminders", reminders], ["/reminders/:id", reminder],
  ["/companies", companies], ["/companies/:id", company], ["/jobs", jobs], ["/jobs/analyze", jobAnalyze], ["/jobs/:id", job],
  ["/resources", resources], ["/resources/:id", resource], ["/resources/:id/practice", resourcePractice],
];

function match(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  for (const [pattern, mod] of ROUTES) {
    const want = pattern.split("/").filter(Boolean);
    if (want.length !== parts.length) continue;
    const params: Record<string, string> = {};
    if (want.every((w, i) => (w.startsWith(":") ? ((params[w.slice(1)] = decodeURIComponent(parts[i])), true) : w === parts[i]))) return { mod, params };
  }
  return null;
}

export type ApiCall = { method: string; path: string; body?: unknown };

/** Runs one API call as the user. Returns the status and the JSON answer (shortened if very long). */
export async function callApi({ method, path, body }: ApiCall, token: string, origin: string) {
  const url = new URL(`/api${path.startsWith("/") ? path : `/${path}`}`, origin);
  const found = match(url.pathname.replace(/^\/api/, ""));
  const verb = method.toUpperCase() as keyof Module;
  const handler = found?.mod[verb];
  if (!found || !handler) return { status: 404, body: { error: { message: `There is no ${verb} ${path}. Use only the endpoints listed.` } } };

  const hasBody = body !== undefined && body !== null && verb !== "GET" && verb !== "DELETE";
  const req = new NextRequest(url, {
    method: verb,
    headers: { authorization: `Bearer ${token}`, ...(hasBody ? { "content-type": "application/json" } : {}) },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const res = await handler(req, { params: Promise.resolve(found.params) as Promise<never> });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}
