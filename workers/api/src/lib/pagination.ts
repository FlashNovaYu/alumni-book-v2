export type Pagination = { page: number; limit: number; offset: number }

type QueryParams = URLSearchParams | Record<string, string | undefined>

export function parsePagination(query: QueryParams, defaultLimit = 100, maxLimit = 100): Pagination {
  const get = (key: string) => typeof (query as URLSearchParams).get === 'function'
    ? (query as URLSearchParams).get(key)
    : (query as Record<string, string | undefined>)[key] ?? null
  const rawPage = Number.parseInt(get('page') || '1', 10)
  const rawLimit = Number.parseInt(get('limit') || String(defaultLimit), 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), maxLimit) : defaultLimit
  return { page, limit, offset: (page - 1) * limit }
}
