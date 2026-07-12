import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf-8')

describe('档案卡共享元素转场', () => {
  it('在减少动态偏好下禁用 Gemini 添加的预淡出动画', () => {
    const card = read('components/ArchiveRosterCard.vue')

    expect(card).toContain('.vt-fade-out')
    expect(card).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.vt-fade-out\s*\{[\s\S]*?transition:\s*none\s*!important;/)
  })
})
