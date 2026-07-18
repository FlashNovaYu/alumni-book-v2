export const DEFAULT_PAGE_SIZE = 50

export interface PageResult<T> {
  items: T[]
  nextCursor: string | null
  /** 仅在服务端返回或确认拿到完整旧数组时可知。 */
  total: number | null
}

const PAGE_CURSOR_PREFIX = 'page:'
const OFFSET_CURSOR_PREFIX = 'offset:'

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function pageFromCursor(cursor?: string | null): number {
  return cursor?.startsWith(PAGE_CURSOR_PREFIX)
    ? positiveInteger(cursor.slice(PAGE_CURSOR_PREFIX.length), 1)
    : 1
}

export function nextArrayPageCursor(cursor?: string | null): string {
  return `${PAGE_CURSOR_PREFIX}${pageFromCursor(cursor) + 1}`
}

function offsetFromCursor(cursor?: string | null): number {
  return cursor?.startsWith(OFFSET_CURSOR_PREFIX)
    ? Math.max(0, Number(cursor.slice(OFFSET_CURSOR_PREFIX.length)) || 0)
    : 0
}

/**
 * 同时兼容三类响应：PageResult、page/limit 分页数组，以及完全忽略分页参数的完整旧数组。
 */
export function normalizePageResult<T>(
  value: PageResult<T> | T[] | null | undefined,
  limit = DEFAULT_PAGE_SIZE,
  cursor?: string | null,
): PageResult<T> {
  if (Array.isArray(value)) {
    if (value.length > limit) {
      const offset = offsetFromCursor(cursor)
      const items = value.slice(offset, offset + limit)
      return {
        items,
        nextCursor: offset + items.length < value.length ? `${OFFSET_CURSOR_PREFIX}${offset + items.length}` : null,
        total: value.length,
      }
    }

    const page = pageFromCursor(cursor)
    return {
      items: value,
      // 数组响应没有 total。满页时必须探测下一页，不能提前判定数据结束。
      nextCursor: value.length === limit ? `${PAGE_CURSOR_PREFIX}${page + 1}` : null,
      total: null,
    }
  }

  return {
    items: value?.items || [],
    nextCursor: value?.nextCursor || null,
    total: typeof value?.total === 'number' ? value.total : null,
  }
}

export function pageSearchParams(limit = DEFAULT_PAGE_SIZE, cursor?: string | null): URLSearchParams {
  const safeLimit = Math.min(Math.max(1, limit), DEFAULT_PAGE_SIZE)
  const query = new URLSearchParams({ page: String(pageFromCursor(cursor)), limit: String(safeLimit) })
  if (cursor && !cursor.startsWith(PAGE_CURSOR_PREFIX) && !cursor.startsWith(OFFSET_CURSOR_PREFIX)) {
    query.set('cursor', cursor)
  }
  return query
}

export function appendUniquePage<T>(current: T[], incoming: T[], keyOf: (item: T) => string): { items: T[]; added: number } {
  const keys = new Set(current.map(keyOf))
  const novel = incoming.filter((item) => {
    const key = keyOf(item)
    if (keys.has(key)) return false
    keys.add(key)
    return true
  })
  return { items: [...current, ...novel], added: novel.length }
}
