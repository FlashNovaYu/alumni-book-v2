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

describe('classmate account center static constraints', () => {
  it('verifies that the account page and component exist', () => {
    expect(existsSync(resolve(src, 'pages/account.astro'))).toBe(true)
    expect(existsSync(resolve(src, 'components/AccountCenter.vue'))).toBe(true)
  })

  it('verifies AccountCenter.vue details and password change contracts', () => {
    const source = read('components/AccountCenter.vue')
    expect(source).toContain('changeClassmatePassword')
    expect(source).toContain('logoutClassmate')
    expect(source).toContain('confirmPassword')
    expect(source).toContain('8')
  })

  it('verifies SelfEditPanel.vue dynamic edit parameter detection and cleanup', () => {
    const source = read('components/SelfEditPanel.vue')
    expect(source).toContain('edit')
    expect(source).toContain('replaceState')
    expect(source).toContain('openEditor')
  })
})
