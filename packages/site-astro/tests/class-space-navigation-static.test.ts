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

describe('class space group chat migration static constraints', () => {
  it('removes the obsolete public message wall split and redirects its route to group chat', () => {
    expect(existsSync(resolve(src, 'composables/usePublicMessages.ts'))).toBe(false)
    expect(existsSync(resolve(src, 'components/PublicMessageBoard.vue'))).toBe(false)
    expect(existsSync(resolve(src, 'components/MessageComposer.vue'))).toBe(false)
    expect(existsSync(resolve(src, 'components/MessageCardGrid.vue'))).toBe(false)

    const messagesPage = read('pages/messages.astro')
    expect(messagesPage).toContain('class-space#group-chat')
    expect(messagesPage).not.toContain('class-space/#group-chat')
  })

  it('keeps advanced interaction state in the shared group chat composable', () => {
    const source = read('composables/useGroupChat.ts')

    for (const token of ['replyTarget', 'react', 'recall', 'loadMine', 'useVisibilityPolling']) {
      expect(source).toContain(token)
    }
    expect(source).toContain('reactionWriteQueues')
    expect(source).toContain('baseDelay: 5_000')
  })

  it('exposes quoted messages, reactions, recall and personal records through chat components', () => {
    const message = read('components/GroupChatMessage.vue')
    const composer = read('components/GroupChatComposer.vue')
    const stage = read('components/GroupChatStage.vue')

    expect(existsSync(resolve(src, 'components/GroupChatMineDrawer.vue'))).toBe(true)
    expect(message).toContain('引用这条消息')
    expect(message).toContain('撤回这条消息')
    expect(message).toContain('canRecall')
    expect(message).toContain('reactionTrigger')
    expect(composer).toContain('composer-reply-preview')
    expect(stage).toContain('GroupChatMineDrawer')
    expect(stage).toContain('isRecallAvailable')
    expect(stage).toContain('onBeforeUnmount')
    expect(stage).toContain('closeMine')

    const mineDrawer = read('components/GroupChatMineDrawer.vue')
    expect(mineDrawer).toContain('groupedMessages')
    expect(mineDrawer).toContain('previousBodyOverflow')
    expect(mineDrawer).toContain('restoreInteractionState')
    expect(mineDrawer).toContain('trapFocus')
    expect(mineDrawer).toContain('onBeforeUnmount')
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

  it('verifies ClassSpaceHub.vue mounts the group chat workbench from the authenticated overview', () => {
    expect(existsSync(resolve(src, 'components/ClassSpaceHub.vue'))).toBe(true)
    expect(existsSync(resolve(src, 'composables/useGroupChat.ts'))).toBe(true)
    expect(existsSync(resolve(src, 'components/GroupChatStage.vue'))).toBe(true)
    expect(existsSync(resolve(src, 'components/GroupChatMessage.vue'))).toBe(true)
    expect(existsSync(resolve(src, 'components/GroupChatComposer.vue'))).toBe(true)
    const source = read('components/ClassSpaceHub.vue')
    expect(source).toContain('GroupChatStage')
    expect(source).toContain('ClassSpaceAlbumRail')
    expect(source).toContain('ClassSpaceTimelinePreview')
    expect(source).toContain('fetchClassSpaceOverview')
    expect(source).toContain('id="group-chat"')
    expect(source).not.toContain('ClassSpaceMessageStage')
    expect(source).not.toContain('AlbumGrid')
    expect(source).not.toContain('ScrollTrigger')
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
