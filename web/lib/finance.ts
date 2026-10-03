// Month totals, added up from the transactions (the facts).

type Tx = { type: "income" | "expense"; amount: number; budget_category_id: string | null };
type Cat = { id: string; monthly_limit: number; is_savings: boolean };

export function monthTotals<C extends Cat>(categories: C[], transactions: Tx[]) {
  const spentBy: Record<string, number> = {};
  let income = 0;
  let outgoing = 0;
  let uncategorized = 0;
  for (const tx of transactions) {
    const amount = Number(tx.amount);
    if (tx.type === "income") {
      income += amount;
      continue;
    }
    outgoing += amount;
    if (tx.budget_category_id) spentBy[tx.budget_category_id] = (spentBy[tx.budget_category_id] || 0) + amount;
    else uncategorized += amount;
  }
  const saved = categories.filter((c) => c.is_savings).reduce((total, c) => total + (spentBy[c.id] || 0), 0);
  const budget = categories.reduce((total, c) => total + Number(c.monthly_limit), 0);
  return {
    income,
    /** All money out, savings included (what the budget is measured against). */
    outgoing,
    /** Money out, not counting savings. */
    spent: outgoing - saved,
    saved,
    budget,
    left: budget - outgoing,
    uncategorized,
    rows: categories.map((c) => ({ ...c, spent: spentBy[c.id] || 0 })),
  };
}
