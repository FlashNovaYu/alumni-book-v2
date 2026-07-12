import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const src = resolve(__dirname, '../src')
const read = (path: string) => readFileSync(resolve(src, path), 'utf-8')
const readSiteFile = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf-8')

describe('class space and inbox contracts', () => {
  it('defines focused API clients', () => {
    expect(existsSync(resolve(src, 'api/classSpace.ts'))).toBe(true)
    expect(existsSync(resolve(src, 'api/inbox.ts'))).toBe(true)
    expect(existsSync(resolve(src, 'api/postOffice.ts'))).toBe(false)
    expect(read('api/classmateAuth.ts')).toContain('/api/classmate-auth/me')
  })
})

describe('Playwright preview isolation', () => {
  it('uses a private free port instead of stopping an existing local server', () => {
    const runner = readSiteFile('scripts/run-playwright-preview.ts')
    const config = readSiteFile('playwright.config.ts')

    expect(runner).toContain("import { createServer } from 'net'")
    expect(runner).toContain('port: 0')
    expect(runner).toContain('PLAYWRIGHT_PORT: String(port)')
    expect(runner).not.toContain('releasePreviewPort')
    expect(config).toContain("process.env.PLAYWRIGHT_PORT ?? '4321'")
    expect(config).toContain('port: previewPort')
    expect(config).not.toContain('globalTeardown')
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
    expect(existsSync(resolve(src, 'components/ClassSpaceSectionNav.vue'))).toBe(true)
    expect(existsSync(resolve(src, 'components/ClassSpaceTimelineRail.vue'))).toBe(true)
    expect(existsSync(resolve(src, 'components/ClassSpaceTimelinePreview.vue'))).toBe(false)
    expect(existsSync(resolve(src, 'components/ClassSpaceMessageStage.vue'))).toBe(false)
    const source = read('components/ClassSpaceHub.vue')
    expect(source).toContain('GroupChatStage')
    expect(source).toContain('ClassSpaceAlbumRail')
    expect(source).toContain('ClassSpaceSectionNav')
    expect(source).toContain('ClassSpaceTimelineRail')
    expect(source).toContain('fetchClassSpaceOverview')
    expect(source).toContain('id="group-chat"')
    expect(source).not.toContain('ClassSpaceTimelinePreview')
    expect(source).not.toContain('ClassSpaceMessageStage')
    expect(source).not.toContain('AlbumGrid')
    expect(source).not.toContain('ScrollTrigger')
  })

  it('keeps the class space preview aligned with the group-chat overview contract', () => {
    const hub = read('components/ClassSpaceHub.vue')
    const stage = read('components/GroupChatStage.vue')
    const albumRail = read('components/ClassSpaceAlbumRail.vue')

    expect(hub).toContain('overviewData.value.counts.groupMessages')
    expect(hub).toContain(':initial-items="overviewData.chat.items"')
    expect(hub).toContain('id="group-chat"')
    expect(stage).toContain('GroupChatMessage')
    expect(stage).toContain('useGroupChat')
    expect(albumRail).toContain('albumHref(album.id)')
    expect(albumRail).toContain('album#album-${albumId}')
  })
})

describe('class mailbox components static constraints', () => {
  it('verifies that the subcomponent files exist', () => {
    expect(existsSync(resolve(src, 'components/RecipientPicker.vue'))).toBe(true)
    for (const file of ['MailboxList.vue', 'MailboxDetail.vue', 'MailComposer.vue']) {
      expect(existsSync(resolve(src, `components/${file}`))).toBe(false)
    }
  })

  it('verifies RecipientPicker.vue supports search and excludes self', () => {
    const source = read('components/RecipientPicker.vue')
    expect(source).toContain('fetchInboxClassmates')
    expect(source).toContain('mySlug')
    expect(source).toContain('avatarUrl')
  })

  it('verifies MailboxApp.vue orchestrates the conversation and notification workbench', () => {
    const source = read('components/MailboxApp.vue')
    expect(source).toContain('useInbox')
    expect(source).toContain('DirectConversationList')
    expect(source).toContain('DirectConversationView')
    expect(source).toContain('NotificationList')
    expect(source).toContain('NotificationDetail')
    expect(source).toContain('NewConversationDialog')
    expect(source).toContain('popstate')
    expect(source).not.toContain('fetchMailboxThreads')
    expect(source).not.toContain('MailComposer')
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
