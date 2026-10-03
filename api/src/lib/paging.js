const { must } = require('./http');

/**
 * Supabase returns at most 1,000 rows per request. This keeps asking for the
 * next page until everything is in (used for habit history and exports).
 * @param {() => { range: (from: number, to: number) => PromiseLike<any> }} makeQuery builds a fresh query each time
 * @param {number} [pageSize]
 * @returns {Promise<any[]>}
 */
async function fetchAll(makeQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = must(await makeQuery().range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

module.exports = { fetchAll };
