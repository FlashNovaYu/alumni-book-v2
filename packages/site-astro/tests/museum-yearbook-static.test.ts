import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (relative: string) => readFileSync(resolve(__dirname, '../src', relative), 'utf-8')

describe('museum yearbook and more pages', () => {
  it('keeps data reporting as a yearbook chapter and forces a daylight paper palette for print', () => {
    const yearbook = read('pages/yearbook.astro')

    expect(yearbook).toContain('class="yearbook-paper"')
    expect(yearbook).toMatch(/class="print-section[^\"]*"[\s\S]*?青春数据报告/)
    expect(yearbook).toContain('@media print')
    expect(yearbook).toMatch(/@media print[\s\S]*?--surface-canvas:\s*#F1E7CE/)
  })

  it('keeps more as an honest in-progress archive directory', () => {
    const more = read('pages/more.astro')

    expect(more).toContain('新的章节正在整理')
    expect(more).not.toContain('href=')
  })
})
