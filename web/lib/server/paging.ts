import { must } from "./http.ts";

type Page<T> = PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>;

/**
 * Supabase returns at most 1,000 rows per request. This keeps asking for the
 * next page until everything is in (used for habit history, events and exports).
 * `makeQuery` builds a fresh query each time.
 */
export async function fetchAll<T>(makeQuery: () => { range: (from: number, to: number) => Page<T> }, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = must(await makeQuery().range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
