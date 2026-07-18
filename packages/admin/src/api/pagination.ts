export const DEFAULT_PAGE_SIZE = 50

export interface PageResult<T> {
  items: T[]
  nextCursor: string | null
  total: number
}

function cursorOffset(cursor: string | null | undefined): number {
  const offset = Number(cursor)
  return Number.isSafeInteger(offset) && offset > 0 ? offset : 0
}

/**
 * 新接口返回游标页；迁移期间旧接口仍可能返回完整数组。
 * 旧数组在客户端切片，保证首屏不会一次挂载全部 DOM。
 */
export function normalizePageResult<T>(
  value: PageResult<T> | T[] | null | undefined,
  limit = DEFAULT_PAGE_SIZE,
  cursor?: string | null,
): PageResult<T> {
  if (Array.isArray(value)) {
    const offset = cursorOffset(cursor)
    const items = value.slice(offset, offset + limit)
    return {
      items,
      nextCursor: offset + items.length < value.length ? String(offset + items.length) : null,
      total: value.length,
    }
  }

  return {
    items: value?.items || [],
    nextCursor: value?.nextCursor || null,
    total: value?.total || 0,
  }
}

export function pageSearchParams(limit = DEFAULT_PAGE_SIZE, cursor?: string | null): URLSearchParams {
  const query = new URLSearchParams({ limit: String(Math.min(limit, DEFAULT_PAGE_SIZE)) })
  if (cursor) query.set('cursor', cursor)
  return query
}
