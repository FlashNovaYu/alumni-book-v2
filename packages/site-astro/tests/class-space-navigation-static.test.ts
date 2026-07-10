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

describe('class mailbox components static constraints', () => {
  it('verifies that the subcomponent files exist', () => {
    expect(existsSync(resolve(src, 'components/MailboxList.vue'))).toBe(true)
    expect(existsSync(resolve(src, 'components/MailboxDetail.vue'))).toBe(true)
    expect(existsSync(resolve(src, 'components/RecipientPicker.vue'))).toBe(true)
    expect(existsSync(resolve(src, 'components/MailComposer.vue'))).toBe(true)
  })

  it('verifies MailboxList.vue aggregates notifications and mails', () => {
    const source = read('components/MailboxList.vue')
    expect(source).toContain('aggregatedItems')
    expect(source).toContain('notifications')
    expect(source).toContain('mails')
    expect(source).toContain('unread')
  })

  it('verifies MailboxDetail.vue loads detail and shows reply box conditionally', () => {
    const source = read('components/MailboxDetail.vue')
    expect(source).toContain('fetchMailboxThread')
    expect(source).toContain('replyMailboxThread')
    expect(source).toContain('allowReply')
    expect(source).toContain('replyText')
  })

  it('verifies RecipientPicker.vue supports search and excludes self', () => {
    const source = read('components/RecipientPicker.vue')
    expect(source).toContain('fetchRecipientDirectory')
    expect(source).toContain('mySlug')
    expect(source).toContain('avatarUrl')
  })

  it('verifies MailComposer.vue embeds RecipientPicker and emits submit', () => {
    const source = read('components/MailComposer.vue')
    expect(source).toContain('RecipientPicker')
    expect(source).toContain('submit')
    expect(source).toContain('recipientSlug')
    expect(source).toContain('subject')
    expect(source).toContain('body')
  })

  it('verifies MailboxApp.vue orchestrates the components and triggers events', () => {
    const source = read('components/MailboxApp.vue')
    expect(source).toContain('Promise.all')
    expect(source).toContain('fetchMailboxThreads')
    expect(source).toContain('fetchNotifications')
    expect(source).toContain('alumni:inbox-changed')
    expect(source).toContain('window.dispatchEvent')
  })
})
