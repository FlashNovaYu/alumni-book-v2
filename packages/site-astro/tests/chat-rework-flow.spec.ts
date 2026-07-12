import { expect, test } from '@playwright/test'
import { mockClassmateAdminEntry } from './classmate-session-mocks'

const currentTime = new Date().toISOString()

const initialChat = {
  success: true,
  data: {
    chat: {
      items: [
        {
          id: 'pm-classmate',
          author: { name: '班长', slug: 'monitor', avatarUrl: null },
          content: '周末一起回学校看看吗？',
          status: 'visible',
          replyTo: null,
          reactionCounts: {},
          myReaction: null,
          canRecall: false,
          createdAt: '2026-07-11T08:00:00.000Z',
          updatedAt: '2026-07-11T08:00:00.000Z',
        },
        {
          id: 'pm-own',
          author: { name: '测试同学', slug: 'test_init', avatarUrl: null },
          content: '我会把旧照片也带上。',
          status: 'visible',
          replyTo: null,
          reactionCounts: {},
          myReaction: null,
          canRecall: true,
          createdAt: currentTime,
          updatedAt: currentTime,
        },
      ],
      cursor: 'chat-cursor-initial',
      mute: null,
    },
    albums: [],
    timeline: [],
    counts: { groupMessages: 1, albums: 0, timelineItems: 0 },
  },
}

async function seedClassmateSession(page: any) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({
      name: '测试同学',
      slug: 'test_init',
      avatarUrl: null,
    }))
  })
}

test.beforeEach(async ({ page }) => {
  await mockClassmateAdminEntry(page)
})

async function mockClassSpace(page: any, onSend: (route: any) => Promise<void>, overview = initialChat) {
  await page.route('**/api/inbox/summary', (route: any) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { directUnread: 0, notificationUnread: 0, totalUnread: 0 } }),
  }))
  await page.route('**/api/class-space/overview', (route: any) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(overview),
  }))
  await page.route('**/api/group-chat/messages**', async (route: any, request: any) => {
    if (request.method() === 'POST') return onSend(route)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { items: [], nextCursor: null } }),
    })
  })
}

function createHistoryOverview() {
  return {
    ...initialChat,
    data: {
      ...initialChat.data,
      chat: {
        ...initialChat.data.chat,
        items: Array.from({ length: 24 }, (_, index) => ({
          ...initialChat.data.chat.items[0],
          id: `history-${index}`,
          content: `第 ${index + 1} 条班级消息，保留给正在阅读过去的同学。`,
          createdAt: new Date(Date.now() - (24 - index) * 60_000).toISOString(),
          updatedAt: new Date(Date.now() - (24 - index) * 60_000).toISOString(),
        })),
      },
    },
  }
}

test.describe('班级空间群聊基础流程', () => {
  test('向上滚动到记录区顶部时自动载入更早消息', async ({ page }) => {
    const cursor = 'auto-history-cursor'
    const overview = createHistoryOverview()
    overview.data.chat.cursor = cursor
    let historyRequests = 0

    await mockClassSpace(page, async (route) => {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: initialChat.data.chat.items[1] }) })
    }, overview)
    await page.route((url) => url.pathname === '/api/group-chat/messages' && url.searchParams.get('before') === cursor, async (route) => {
      historyRequests += 1
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [{
              ...initialChat.data.chat.items[0],
              id: 'auto-history-message',
              content: '通过向上滚动自动载入的历史消息。',
              createdAt: '2026-07-11T06:00:00.000Z',
              updatedAt: '2026-07-11T06:00:00.000Z',
            }],
            nextCursor: null,
          },
        }),
      })
    })

    await seedClassmateSession(page)
    await page.goto('./class-space/', { waitUntil: 'networkidle' })
    const log = page.locator('.chat-log')
    await log.locator('.group-chat-message').evaluateAll((messages: HTMLElement[]) => {
      messages.forEach(message => { message.style.minHeight = '80px' })
    })
    await log.evaluate((element: HTMLElement) => {
      element.style.display = 'block'
      element.style.height = '120px'
      element.scrollTop = 0
      element.dispatchEvent(new Event('scroll'))
    })

    await expect.poll(() => historyRequests).toBe(1)
    await expect(page.locator('[data-message-id="auto-history-message"]')).toContainText('自动载入的历史消息')
  })

  test('载入最后一页历史后隐藏入口，避免空请求', async ({ page }) => {
    const historyCursor = 'history-cursor'
    const overview = {
      ...initialChat,
      data: {
        ...initialChat.data,
        chat: { ...initialChat.data.chat, cursor: historyCursor },
      },
    }
    const older = {
      ...initialChat.data.chat.items[0],
      id: 'pm-history-final',
      content: '这是一条最后载入的历史消息。',
      createdAt: '2026-07-11T07:00:00.000Z',
      updatedAt: '2026-07-11T07:00:00.000Z',
    }
    let historyRequests = 0
    await mockClassSpace(page, async (route) => {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: initialChat.data.chat.items[1] }) })
    }, overview)
    await page.route((url) => url.pathname === '/api/group-chat/messages' && url.searchParams.get('before') === historyCursor, async (route) => {
      historyRequests += 1
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { items: [older], nextCursor: null } }),
      })
    })

    await seedClassmateSession(page)
    await page.goto('./class-space/', { waitUntil: 'networkidle' })

    const loadButton = page.getByRole('button', { name: '载入更早消息' })
    await expect(loadButton).toBeVisible()
    await loadButton.click()

    await expect.poll(() => historyRequests).toBe(1)
    await expect(page.locator('[data-message-id="pm-history-final"]')).toContainText('最后载入的历史消息')
    await expect(loadButton).toBeHidden()
  })

  test('显示左右消息，并以服务端规范消息替换乐观消息', async ({ page }) => {
    let releaseResponse!: () => void
    const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve })
    await mockClassSpace(page, async (route) => {
      await responseGate
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            ...initialChat.data.chat.items[0],
            id: 'pm-server',
            author: { name: '测试同学', slug: 'test_init', avatarUrl: null },
            content: '周末见',
            canRecall: true,
            createdAt: '2026-07-11T09:00:00.000Z',
            updatedAt: '2026-07-11T09:00:00.000Z',
          },
        }),
      })
    })
    await seedClassmateSession(page)
    await page.goto('./class-space/', { waitUntil: 'networkidle' })

    await expect(page.locator('[data-message-id="pm-classmate"]')).toHaveClass(/is-peer/)
    await page.getByPlaceholder('写下消息……').fill('周末见')
    const sendRequest = page.waitForRequest('**/api/group-chat/messages')
    await page.getByRole('button', { name: '发送消息' }).click()
    await sendRequest
    await expect(page.locator('[data-message-state="sending"]')).toContainText('周末见')

    releaseResponse()
    await expect(page.locator('[data-message-id="pm-server"]')).toContainText('周末见')
    await expect(page.locator('[data-message-state="sending"]')).toHaveCount(0)
  })

  test('发送失败后保留消息并沿用同一 nonce 重试', async ({ page }) => {
    const nonces: string[] = []
    let attempt = 0
    await mockClassSpace(page, async (route) => {
      attempt += 1
      const payload = route.request().postDataJSON()
      nonces.push(payload.clientNonce)
      if (attempt === 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: '暂时无法送达' }),
        })
        return
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            ...initialChat.data.chat.items[0],
            id: 'pm-retried',
            author: { name: '测试同学', slug: 'test_init', avatarUrl: null },
            content: '我会到',
            canRecall: true,
            createdAt: '2026-07-11T09:01:00.000Z',
            updatedAt: '2026-07-11T09:01:00.000Z',
          },
        }),
      })
    })
    await seedClassmateSession(page)
    await page.goto('./class-space/', { waitUntil: 'networkidle' })

    await page.getByPlaceholder('写下消息……').fill('我会到')
    await page.getByRole('button', { name: '发送消息' }).click()
    await expect(page.locator('[data-message-state="failed"]')).toContainText('我会到')

    await page.getByRole('button', { name: '重试发送' }).click()
    await expect(page.locator('[data-message-id="pm-retried"]')).toContainText('我会到')
    expect(nonces).toHaveLength(2)
    expect(nonces[1]).toBe(nonces[0])
  })

  test('五秒后才首次同步，并在离开班级空间前取消调度', async ({ page }) => {
    let syncCalls = 0
    let firstSyncAt = 0
    await mockClassSpace(page, async (route) => {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: initialChat.data.chat.items[1] }) })
    })
    await page.route('**/api/group-chat/sync**', async (route) => {
      syncCalls += 1
      if (!firstSyncAt) firstSyncAt = Date.now()
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { cursor: 'sync-1', items: [], mute: null } }) })
    })

    await seedClassmateSession(page)
    const navigationStartedAt = Date.now()
    await page.goto('./class-space/', { waitUntil: 'networkidle' })
    await expect.poll(() => syncCalls, { timeout: 7_000 }).toBe(1)
    expect(firstSyncAt - navigationStartedAt).toBeGreaterThanOrEqual(4_750)

    await page.goto('./preface/', { waitUntil: 'networkidle' })
    const callsBeforeWait = syncCalls
    await page.waitForTimeout(5_500)
    expect(syncCalls).toBe(callsBeforeWait)
  })

  test('阅读历史时不自动滚到底部，而是显示新消息提示', async ({ page }) => {
    let syncCalls = 0
    await mockClassSpace(page, async (route) => {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: initialChat.data.chat.items[1] }) })
    }, createHistoryOverview())
    await page.route('**/api/group-chat/sync**', async (route) => {
      syncCalls += 1
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            cursor: 'history-sync-1',
            items: [{
              ...initialChat.data.chat.items[0],
              id: 'history-new-message',
              content: '这是一条在阅读历史时到达的新消息。',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }],
            mute: null,
          },
        }),
      })
    })

    await seedClassmateSession(page)
    await page.goto('./class-space/', { waitUntil: 'networkidle' })
    const log = page.locator('.chat-log')
    await expect(log.locator('.group-chat-message')).toHaveCount(24)
    await log.locator('.group-chat-message').evaluateAll((messages: HTMLElement[]) => {
      messages.forEach(message => { message.style.minHeight = '80px' })
    })
    await log.evaluate((element: HTMLElement) => {
      element.style.display = 'block'
      element.style.height = '120px'
      element.scrollTop = element.scrollHeight
    })
    await log.evaluate((element: HTMLElement) => element.scrollTo({ top: 0 }))
    await page.waitForTimeout(50)
    const scrollMetrics = await log.evaluate((element: HTMLElement) => {
      return { scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }
    })
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight)
    expect(scrollMetrics.scrollTop).toBe(0)

    await expect.poll(() => syncCalls, { timeout: 7_000 }).toBe(1)
    await expect(page.getByRole('button', { name: /有 1 条新消息/ })).toBeVisible({ timeout: 7_000 })
    const scrollTop = await log.evaluate((element: HTMLElement) => element.scrollTop)
    expect(scrollTop).toBe(0)
  })

  test('同一条消息的快速回应按点击顺序写入', async ({ page }) => {
    let releaseFirstResponse!: () => void
    const firstResponse = new Promise<void>(resolve => { releaseFirstResponse = resolve })
    const reactions: string[] = []
    await mockClassSpace(page, async (route) => {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: initialChat.data.chat.items[1] }) })
    })
    await page.route('**/api/group-chat/messages/pm-classmate/reaction', async (route) => {
      const reaction = route.request().postDataJSON().reaction
      reactions.push(reaction)
      if (reactions.length === 1) {
        await firstResponse
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { reactionCounts: { '👍': 1 }, myReaction: '👍' } }) })
        return
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { reactionCounts: { '❤️': 1 }, myReaction: '❤️' } }) })
    })

    await seedClassmateSession(page)
    await page.goto('./class-space/', { waitUntil: 'networkidle' })
    const peer = page.locator('[data-message-id="pm-classmate"]')
    const reactionTrigger = peer.getByRole('button', { name: '添加回应' })

    await reactionTrigger.click()
    await peer.getByRole('button', { name: /回应：赞/ }).click()
    await expect.poll(() => reactions).toEqual(['👍'])

    await reactionTrigger.click()
    await peer.getByRole('button', { name: /回应：喜欢/ }).click()
    await page.waitForTimeout(150)
    expect(reactions).toEqual(['👍'])

    releaseFirstResponse()
    await expect.poll(() => reactions).toEqual(['👍', '❤️'])
    await expect(peer.getByRole('button', { name: /回应：喜欢/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('支持引用、回应、撤回和查看我的记录', async ({ page }) => {
    const mineRequestUrls: string[] = []
    await mockClassSpace(page, async (route) => {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: initialChat.data.chat.items[1] }) })
    })
    await page.route('**/api/group-chat/messages/pm-classmate/reaction', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { reactionCounts: { '👍': 1 }, myReaction: '👍' } }),
      })
    })
    await page.route('**/api/group-chat/messages/pm-own', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { ...initialChat.data.chat.items[1], content: null, status: 'recalled_by_author' } }),
      })
    })
    await page.route('**/api/group-chat/mine**', async (route) => {
      mineRequestUrls.push(route.request().url())
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [
              { ...initialChat.data.chat.items[1], id: 'pm-pending', content: '等待审核的内容', status: 'pending', moderationReason: null },
              { ...initialChat.data.chat.items[1], id: 'pm-rejected', content: '未通过的内容', status: 'rejected', moderationReason: '内容需要调整' },
              { ...initialChat.data.chat.items[1], id: 'pm-hidden', content: '已隐藏的内容', status: 'hidden', moderationReason: '管理员隐藏' },
              { ...initialChat.data.chat.items[1], id: 'pm-recalled', content: null, status: 'recalled_by_author', moderationReason: null },
            ],
            nextCursor: null,
          },
        }),
      })
    })
    await seedClassmateSession(page)
    await page.goto('./class-space/', { waitUntil: 'networkidle' })

    const peer = page.locator('[data-message-id="pm-classmate"]')
    await peer.getByRole('button', { name: '引用这条消息' }).click()
    await expect(page.locator('.composer-reply-preview')).toContainText('班长')

    const reactionTrigger = peer.getByRole('button', { name: '添加回应' })
    await reactionTrigger.click()
    const reactionMenu = peer.getByRole('group', { name: '选择回应' })
    await expect(reactionMenu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(reactionMenu).toBeHidden()
    await expect(reactionTrigger).toBeFocused()

    await reactionTrigger.click()
    const like = peer.getByRole('button', { name: /回应：赞/ })
    await like.click()
    await expect(like).toHaveAttribute('aria-pressed', 'true')

    await page.locator('[data-message-id="pm-own"]').getByRole('button', { name: '撤回这条消息' }).click()
    await expect(page.locator('[data-message-id="pm-own"] .message-recalled')).toBeVisible()

    const mineButton = page.getByRole('button', { name: '查看我的记录' })
    await mineButton.click()
    const drawer = page.getByRole('dialog', { name: '我的群聊记录' })
    await expect(drawer).toContainText('待审核')
    await expect(drawer).toContainText('未通过')
    await expect(drawer).toContainText('已隐藏')
    await expect(drawer).toContainText('已撤回')
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
    const closeDrawer = drawer.getByRole('button', { name: '关闭我的记录' })
    await expect(closeDrawer).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(closeDrawer).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(closeDrawer).toBeFocused()
    await closeDrawer.click()
    await expect(mineButton).toBeFocused()
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')

    await mineButton.click()
    await expect(mineRequestUrls).toHaveLength(2)
    expect(mineRequestUrls.map(url => new URL(url).searchParams.get('before'))).toEqual([null, null])
  })
})
