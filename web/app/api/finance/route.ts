import { handle } from "@/lib/server/api";
import { monthRange } from "@/lib/server/dates";
import { must } from "@/lib/server/http";
import { fetchAll } from "@/lib/server/paging";
import { parse, s, z } from "@/lib/server/validate";

// One month of money (?month=YYYY-MM): budget categories, every transaction, and unpaid bills.
// The web app adds up the totals.
export const GET = handle(async ({ db, query, today: getToday }) => {
  const today = await getToday();
  const { month = today.slice(0, 7) } = parse(z.object({ month: s.month.optional() }), query);
  const { first, last } = monthRange(month);
  const [categories, transactions, bills] = await Promise.all([
    db.from("budget_categories").select("*").order("position").order("created_at").then(must),
    fetchAll(() => db.from("transactions").select("*").gte("tx_date", first).lte("tx_date", last).order("tx_date", { ascending: false }).order("created_at", { ascending: false })),
    db.from("bills").select("*").is("paid_at", null).order("due_date").then(must),
  ]);
  return { today, month, categories, transactions, bills };
});
