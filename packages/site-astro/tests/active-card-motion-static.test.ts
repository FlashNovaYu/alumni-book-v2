import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf-8')

describe('档案卡共享元素转场', () => {
  it('在减少动态偏好下保留 Gemini 添加的卡片内容可见', () => {
    const card = read('components/ArchiveRosterCard.vue')

    expect(card).toContain('.vt-fade-out')
    expect(card).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.vt-fade-out\s*\{[\s\S]*?opacity:\s*1\s*!important;[\s\S]*?transition:\s*none\s*!important;/)
  })
})
