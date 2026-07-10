import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const src = resolve(__dirname, '../src')
const read = (path: string) => readFileSync(resolve(src, path), 'utf-8')

describe('class space and inbox contracts', () => {
  it('defines focused API clients', () => {
    expect(existsSync(resolve(src, 'api/classSpace.ts'))).toBe(true)
    expect(read('api/postOffice.ts')).toContain('/api/inbox/summary')
    expect(read('api/postOffice.ts')).toContain('/api/mailbox/threads/${threadId}')
    expect(read('api/postOffice.ts')).toContain('/api/notifications')
    expect(read('api/classmateAuth.ts')).toContain('/api/classmate-auth/me')
  })
})

describe('class space public message wall refactoring static constraints', () => {
  it('verifies that the split files exist', () => {
    expect(existsSync(resolve(src, 'composables/usePublicMessages.ts'))).toBe(true)
    expect(existsSync(resolve(src, 'components/MessageComposer.vue'))).toBe(true)
    expect(existsSync(resolve(src, 'components/MessageCardGrid.vue'))).toBe(true)
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

describe('class space responsive dashboard contracts', () => {
  it('verifies class-space.astro page exists and contains ClassSpaceHub and no AlbumGrid or ScrollTrigger', () => {
    expect(existsSync(resolve(src, 'pages/class-space.astro'))).toBe(true)
    const source = read('pages/class-space.astro')
    expect(source).toContain('ClassSpaceHub')
    expect(source).not.toContain('AlbumGrid')
    expect(source).not.toContain('ScrollTrigger')
  })

  it('verifies ClassSpaceHub.vue exists, handles API overview fetching, state orchestration, and sub-components', () => {
    expect(existsSync(resolve(src, 'components/ClassSpaceHub.vue'))).toBe(true)
    const source = read('components/ClassSpaceHub.vue')
    expect(source).toContain('ClassSpaceMessageStage')
    expect(source).toContain('ClassSpaceAlbumRail')
    expect(source).toContain('ClassSpaceTimelinePreview')
    expect(source).toContain('fetchClassSpaceOverview')
    expect(source).not.toContain('AlbumGrid')
    expect(source).not.toContain('ScrollTrigger')
  })
})

