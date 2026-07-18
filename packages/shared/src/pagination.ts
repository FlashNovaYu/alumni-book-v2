export type PaginationItem = number | 'ellipsis'

export function buildPaginationItems(
  currentPage: number,
  totalPages: number,
  siblingCount = 1,
): PaginationItem[] {
  const total = Number.isFinite(totalPages) && totalPages > 1
    ? Math.floor(totalPages)
    : 1
  if (total <= 1) return [1]

  const current = Number.isFinite(currentPage)
    ? Math.min(Math.max(Math.floor(currentPage), 1), total)
    : 1
  const sibling = Number.isFinite(siblingCount)
    ? Math.max(0, Math.floor(siblingCount))
    : 1

  if (total <= sibling * 2 + 3) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, total])

  for (
    let page = Math.max(1, current - sibling);
    page <= Math.min(total, current + sibling);
    page++
  ) {
    pages.add(page)
  }

  const sortedPages = [...pages].sort((a, b) => a - b)
  const items: PaginationItem[] = []

  for (const page of sortedPages) {
    const previous = items.at(-1)
    if (typeof previous === 'number' && page - previous > 1) {
      if (page - previous === 2) {
        items.push(previous + 1)
      } else {
        items.push('ellipsis')
      }
    }
    items.push(page)
  }

  return items
}
