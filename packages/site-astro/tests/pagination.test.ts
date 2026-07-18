import { describe, expect, it } from 'vitest'
import { buildPaginationItems } from '../../shared/src/pagination'

describe('buildPaginationItems', () => {
  it('uses one page when the total is one or less', () => {
    expect(buildPaginationItems(1, 1, 1)).toEqual([1])
    expect(buildPaginationItems(1, 0, 1)).toEqual([1])
  })

  it('renders every page for two and three pages', () => {
    expect(buildPaginationItems(1, 2, 1)).toEqual([1, 2])
    expect(buildPaginationItems(2, 3, 1)).toEqual([1, 2, 3])
  })

  it('condenses a ten-page range around the current page', () => {
    expect(buildPaginationItems(1, 10, 1)).toEqual([1, 2, 'ellipsis', 10])
    expect(buildPaginationItems(5, 10, 1)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
    expect(buildPaginationItems(10, 10, 1)).toEqual([1, 'ellipsis', 9, 10])
  })

  it('keeps numeric items ascending and unique without adjacent ellipses', () => {
    for (let current = 1; current <= 10; current++) {
      const items = buildPaginationItems(current, 10, 1)
      const pages = items.filter((item): item is number => typeof item === 'number')

      expect(pages).toEqual([...new Set(pages)])
      expect(pages).toEqual([...pages].sort((a, b) => a - b))
      expect(items.join(',')).not.toContain('ellipsis,ellipsis')
    }
  })
})
