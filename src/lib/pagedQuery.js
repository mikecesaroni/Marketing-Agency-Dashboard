// PostgREST answers at most 1000 rows per request and says nothing when it
// stops there. The Reports page learned this the hard way: sixty days of
// ad_daily crossed 1000 rows the week Plumbquick went live, the page asked for
// the rows oldest first, and every row after September 7 (Plumbquick's whole
// history and two days of everyone else's) was silently cut.
//
// Any read that can grow past a thousand rows goes through here. The caller
// supplies a function that builds a fresh query with a deterministic order
// (date, then the primary key); this walks it in pages until a short page.
//
// Pure apart from the query object handed in, so the check script can drive
// it with a fake.

export const PAGE_SIZE = 1000

/**
 * makeQuery(): returns a new PostgREST builder each call (they are single
 * use). pageSize is for tests.
 */
export async function fetchAllRows(makeQuery, pageSize = PAGE_SIZE) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1)
    if (error) throw error
    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}
