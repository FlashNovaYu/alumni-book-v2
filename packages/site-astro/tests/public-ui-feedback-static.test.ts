import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf-8')

describe('公开站点界面反馈回归', () => {
  it('keeps the class-space timeline compact and resolves API file URLs exactly once', () => {
    const timeline = read('components/ClassSpaceTimelineRail.vue')

    expect(timeline).toContain("value.startsWith('/api/files/')")
    expect(timeline).toContain('timeline-rail__track')
  })

  it('gives each class-space chapter a numbered directory entry with a description', () => {
    const hub = read('components/ClassSpaceHub.vue')
    const directory = read('components/ClassSpaceSectionNav.vue')

    expect(hub).toContain("index: '01'")
    expect(hub).toContain("description: '此刻的对话'")
    expect(directory).toContain('section-index')
    expect(directory).toContain('section-description')
  })
})
