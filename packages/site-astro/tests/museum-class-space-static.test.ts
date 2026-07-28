import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (relative: string) => readFileSync(resolve(__dirname, '../src', relative), 'utf-8')

describe('museum class space navigation', () => {
  it('uses an unnumbered centered section directory while preserving the vertical exhibition order', () => {
    const hub = read('components/ClassSpaceHub.vue')
    const nav = read('components/ClassSpaceSectionNav.vue')

    expect(hub).toMatch(/id="group-chat"[\s\S]*id="albums"[\s\S]*id="timeline"/)
    expect(hub).not.toContain("index: '01'")
    expect(nav).not.toContain('section.index')
    expect(nav).not.toContain('position: sticky')
    expect(nav).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(nav).toContain('IntersectionObserver')
  })
})
