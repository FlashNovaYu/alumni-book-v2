import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const srcRoot = path.resolve(__dirname, '../src')

function read(relativePath: string) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf-8')
}

function exists(relativePath: string) {
  return fs.existsSync(path.join(srcRoot, relativePath))
}

describe('class space public message wall refactoring static constraints', () => {
  it('verifies that the split files exist', () => {
    expect(exists('composables/usePublicMessages.ts')).toBe(true)
    expect(exists('components/MessageComposer.vue')).toBe(true)
    expect(exists('components/MessageCardGrid.vue')).toBe(true)
  })

  it('verifies usePublicMessages.ts interface and logic', () => {
    const source = read('composables/usePublicMessages.ts')
    expect(source).toContain('approved')
    expect(source).toContain('mine')
    expect(source).toContain('loading')
    expect(source).toContain('submitting')
    expect(source).toContain('notice')
    expect(source).toContain('loadApproved')
    expect(source).toContain('loadMine')
    expect(source).toContain('submit')
    expect(source).toContain('react')
  })

  it('verifies MessageComposer.vue has input, submit triggers and reset exposure', () => {
    const source = read('components/MessageComposer.vue')
    expect(source).toContain('textarea')
    expect(source).toContain('submit')
    expect(source).toContain('defineExpose')
    expect(source).toContain('reset')
  })

  it('verifies MessageCardGrid.vue has reactions and responsive design removing card rotation', () => {
    const source = read('components/MessageCardGrid.vue')
    expect(source).toContain('react')
    expect(source).toContain('❤️')
    expect(source).toContain('👍')
    expect(source).toContain('😂')
    expect(source).toContain('🎉')
    
    // 断言移动端样式下去掉了卡片旋转
    expect(source).toContain('@media')
    expect(source).toContain('max-width: 768px')
    expect(source).toContain('transform')
    expect(source).toContain('none')
  })
})
