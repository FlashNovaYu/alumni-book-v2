import { expect, test } from '@playwright/test'
import { mockClassmateAdminEntry } from './classmate-session-mocks'

const conversation = {
  id: 'conversation-lisi',
  peer: { name: '李四', slug: 'lisi', avatarUrl: null },
  lastMessage: { id: 'direct-1', senderSlug: 'lisi', body: '周末见。', createdAt: '2026-07-11T08:00:00.000Z' },
  unreadCount: 1,
  updatedAt: '2026-07-11T08:00:00.000Z',
}

async function seedClassmateSession(page: any) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学', slug: 'test_init', avatarUrl: null }))
  })
}

test.beforeEach(async ({ page }) => {
  let messageAttempts = 0

  await mockClassmateAdminEntry(page)

  await page.route('**/api/inbox/summary', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { directUnread: 1, notificationUnread: 1, totalUnread: 2 } }),
  }))
  await page.route('**/api/notifications/summary', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { unreadCount: 1 } }),
  }))
  await page.route('**/api/direct-conversations', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { items: [conversation] } }),
  }))
  await page.route('**/api/direct-conversations/conversation-lisi/messages**', async (route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { items: [{ id: 'direct-1', conversationId: 'conversation-lisi', senderSlug: 'lisi', recipientSlug: 'test_init', body: '周末见。', createdAt: '2026-07-11T08:00:00.000Z' }], nextCursor: null } }),
      })
      return
    }

    messageAttempts += 1
    if (messageAttempts === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: '临时无法发送' }) })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { id: 'direct-2', conversationId: 'conversation-lisi', senderSlug: 'test_init', recipientSlug: 'lisi', body: '我会准时到。', createdAt: '2026-07-11T08:05:00.000Z' } }),
    })
  })
  await page.route('**/api/direct-conversations/conversation-lisi/read', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true }),
  }))
  await page.route('**/api/notifications', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { items: [{ id: 'notice-1', type: 'group_chat_rejected', title: '留言审核结果', body: '你的留言需要调整后再提交。', relatedType: 'group-chat', relatedId: 'chat-1', readAt: null, createdAt: '2026-07-11T08:02:00.000Z' }] } }),
  }))
  await page.route('**/api/notifications/notice-1/read', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true }),
  }))
  await page.route('**/api/classmates**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: [{ name: '测试同学', slug: 'test_init', avatarUrl: null }, { name: '李四', slug: 'lisi', avatarUrl: null }, { name: '王五', slug: 'wangwu', avatarUrl: null }] }),
  }))
})

async function chooseNewConversation(page: any, name: string) {
  await page.getByRole('button', { name: '新建私聊' }).click()
  await page.getByPlaceholder('搜索收件人姓名或拼音...').fill(name)
  await page.getByRole('button', { name: `选择${name}` }).click()
}

test('新会话首发成功后归并左侧会话并清理临时 ID', async ({ page }) => {
  let releaseResponse = () => {}
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve })
  await page.unroute('**/api/direct-conversations')
  await page.route('**/api/direct-conversations', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: [conversation] } }) })
    }
    await responseGate
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          conversation: { id: 'conversation-wang', peer: { name: '王五', slug: 'wangwu', avatarUrl: null }, lastMessage: { id: 'wang-first', senderSlug: 'test_init', body: '第一封私信', createdAt: '2026-07-20T08:00:00.000Z' }, unreadCount: 0, updatedAt: '2026-07-20T08:00:00.000Z' },
          message: { id: 'wang-first', conversationId: 'conversation-wang', senderSlug: 'test_init', recipientSlug: 'wangwu', body: '第一封私信', createdAt: '2026-07-20T08:00:00.000Z' },
        },
      }),
    })
  })

  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })
  await chooseNewConversation(page, '王五')
  await page.getByPlaceholder('写下想对王五说的话……').fill('第一封私信')
  await page.getByRole('button', { name: '发送私信' }).click()
  await expect(page.getByRole('log', { name: '与王五的私聊记录' }).getByText('发送中')).toBeVisible()
  await expect(page.getByRole('button', { name: '王五', exact: true })).toHaveCount(0)

  releaseResponse()
  await expect(page.getByRole('button', { name: '王五', exact: true })).toContainText('第一封私信')
  await expect(page.getByRole('button', { name: '王五', exact: true })).toHaveCount(1)
  await expect(page.locator('.direct-message[data-conversation-id="conversation-wang"]')).toContainText('第一封私信')
  await expect(page.locator('.direct-message[data-conversation-id^="pending-"]')).toHaveCount(0)
})

test('新会话首发 503 后保留失败消息并用同一 nonce 重试归并', async ({ page }) => {
  const nonces: string[] = []
  let attempts = 0
  await page.unroute('**/api/direct-conversations')
  await page.route('**/api/direct-conversations', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: [conversation] } }) })
    }
    attempts += 1
    nonces.push(route.request().postDataJSON().clientNonce)
    if (attempts === 1) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: '首发暂不可用' }) })
    }
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: {
        conversation: { id: 'conversation-wang', peer: { name: '王五', slug: 'wangwu', avatarUrl: null }, lastMessage: { id: 'wang-retry', senderSlug: 'test_init', body: '失败后重试', createdAt: '2026-07-20T08:01:00.000Z' }, unreadCount: 0, updatedAt: '2026-07-20T08:01:00.000Z' },
        message: { id: 'wang-retry', conversationId: 'conversation-wang', senderSlug: 'test_init', recipientSlug: 'wangwu', body: '失败后重试', createdAt: '2026-07-20T08:01:00.000Z' },
      } }),
    })
  })

  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })
  await chooseNewConversation(page, '王五')
  await page.getByPlaceholder('写下想对王五说的话……').fill('失败后重试')
  await page.getByRole('button', { name: '发送私信' }).click()
  await expect(page.getByRole('alert')).toContainText('首发暂不可用')
  await expect(page.getByRole('button', { name: '重试发送' })).toBeVisible()
  await expect(page.getByRole('button', { name: '王五', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: '重试发送' }).click()
  await expect(page.getByRole('button', { name: '王五', exact: true })).toContainText('失败后重试')
  await expect(page.locator('.direct-message[data-conversation-id^="pending-"]')).toHaveCount(0)
  expect(nonces).toHaveLength(2)
  expect(nonces[1]).toBe(nonces[0])
})

test('新会话首发超时后恢复编辑器并显示可重试消息', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window)
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => (
      nativeSetTimeout(handler, timeout === 15_000 ? 100 : timeout, ...args)
    )) as typeof window.setTimeout
  })
  await page.unroute('**/api/direct-conversations')
  await page.route('**/api/direct-conversations', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: [conversation] } }) })
    }
    await new Promise(resolve => setTimeout(resolve, 1_000))
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) }).catch(() => {})
  })

  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })
  await chooseNewConversation(page, '王五')
  const composer = page.getByPlaceholder('写下想对王五说的话……')
  await composer.fill('等待超时')
  await page.getByRole('button', { name: '发送私信' }).click()
  await expect(page.getByRole('button', { name: '重试发送' })).toBeVisible({ timeout: 5_000 })
  await expect(page.getByRole('alert')).toContainText('请求超时，请稍后重试')
  await expect(composer).toBeEnabled()
})

test('阅读历史时收件不抢滚动并提供跳到最新消息，在底部收件自动跟随', async ({ page }) => {
  const history = Array.from({ length: 24 }, (_, index) => ({
    id: `history-${index}`,
    conversationId: 'conversation-lisi',
    senderSlug: index % 2 ? 'test_init' : 'lisi',
    recipientSlug: index % 2 ? 'lisi' : 'test_init',
    body: `历史私信 ${index + 1}`,
    createdAt: new Date(Date.UTC(2026, 6, 20, 0, index)).toISOString(),
  }))
  let syncCalls = 0
  let readyForMessages = false
  await page.route('**/api/direct-conversations/conversation-lisi/messages**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { items: history, nextCursor: null } }),
    })
  })
  await page.route('**/api/inbox/sync**', (route) => {
    if (!readyForMessages) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { cursor: 'sync-waiting', conversations: [], messages: [], notifications: [], unread: { directUnread: 0, notificationUnread: 0, totalUnread: 0 } } }) })
    }
    syncCalls += 1
    const message = { id: `incoming-${syncCalls}`, conversationId: 'conversation-lisi', senderSlug: 'lisi', recipientSlug: 'test_init', body: `新收到私信 ${syncCalls}`, createdAt: new Date(Date.UTC(2026, 6, 20, 1, syncCalls)).toISOString() }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { cursor: `sync-${syncCalls}`, conversations: [], messages: [message], notifications: [], unread: { directUnread: syncCalls, notificationUnread: 0, totalUnread: syncCalls } } }) })
  })

  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '李四', exact: true }).click()
  const log = page.getByRole('log', { name: '与李四的私聊记录' })
  await expect(log).toContainText('历史私信 24')
  await expect(log.locator('.direct-message')).toHaveCount(24)
  await log.locator('.direct-message').evaluateAll((messages: HTMLElement[]) => messages.forEach(message => { message.style.minHeight = '64px' }))
  await log.evaluate((element: HTMLElement) => {
    element.style.display = 'block'
    element.style.height = '180px'
    element.style.maxHeight = '180px'
    element.scrollTop = 0
    element.dispatchEvent(new Event('scroll'))
  })
  readyForMessages = true

  await expect.poll(() => log.evaluate((element: HTMLElement) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(96)
  await expect(log).toContainText('新收到私信 1', { timeout: 7_000 })
  await expect(page.getByRole('button', { name: '跳到最新消息' })).toBeVisible({ timeout: 7_000 })
  expect(await log.evaluate((element: HTMLElement) => element.scrollTop)).toBeLessThan(10)
  await page.getByRole('button', { name: '跳到最新消息' }).click()
  await expect.poll(() => log.evaluate((element: HTMLElement) => element.scrollTop)).toBeGreaterThan(0)
  await log.evaluate((element: HTMLElement) => { element.scrollTop = element.scrollHeight })

  await expect(log).toContainText('新收到私信 2', { timeout: 7_000 })
  await expect(page.getByRole('button', { name: '跳到最新消息' })).toHaveCount(0)
  await expect.poll(() => log.evaluate((element: HTMLElement) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThanOrEqual(96)

  await log.evaluate((element: HTMLElement) => {
    element.scrollTop = 0
    element.dispatchEvent(new Event('scroll'))
  })
  await page.getByPlaceholder('写下想对李四说的话……').fill('主动发送时跟随到底部')
  await page.getByRole('button', { name: '发送私信' }).click()
  await expect(log).toContainText('主动发送时跟随到底部')
  await expect.poll(() => log.evaluate((element: HTMLElement) => element.scrollTop)).toBeGreaterThan(0)
})

test('班级信箱以会话式私聊展示历史、重试发送并复用已有会话', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })

  await expect(page.getByRole('tab', { name: '私聊' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '通知' })).toBeVisible()
  await page.getByRole('tab', { name: '私聊' }).click()
  await page.getByRole('button', { name: '李四', exact: true }).click()

  await expect(page.locator('.direct-conversation-view')).toBeVisible()
  await expect(page.getByRole('log', { name: '与李四的私聊记录' })).toContainText('周末见。')
  await expect(page.getByPlaceholder('给信件起个标题吧...')).toHaveCount(0)

  await page.getByPlaceholder('写下想对李四说的话……').fill('我会准时到。')
  await page.getByRole('button', { name: '发送私信' }).click()
  await expect(page.getByRole('button', { name: '重试发送' })).toBeVisible()
  await page.getByRole('button', { name: '重试发送' }).click()
  await expect(page.getByRole('log', { name: '与李四的私聊记录' })).toContainText('我会准时到。')
  await expect(page.getByRole('button', { name: '重试发送' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.getByRole('button', { name: '新建私聊' }).click()
  await page.getByPlaceholder('搜索收件人姓名或拼音...').fill('李四')
  const noConversationCreate = page.waitForRequest(
    request => request.method() === 'POST' && /\/api\/direct-conversations$/.test(request.url()),
    { timeout: 500 },
  ).then(() => false).catch(() => true)
  await page.getByRole('button', { name: '选择李四' }).click()
  await expect(page.locator('.direct-conversation-view')).toBeVisible()
  await expect(page.getByRole('heading', { name: '李四' })).toBeVisible()
  expect(await noConversationCreate).toBe(true)

  await page.getByRole('button', { name: '新建私聊' }).click()
  await expect(page.getByPlaceholder('搜索收件人姓名或拼音...')).toBeVisible()
  await page.screenshot({ path: 'test-results/chat-rework/mailbox-desktop-viewport.png' })
  await page.screenshot({ path: 'test-results/chat-rework/mailbox-desktop.png', fullPage: true })
})

test('班级信箱以通知详情承接系统消息而不显示私聊编辑器', async ({ page }) => {
  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })

  await page.getByRole('tab', { name: '通知' }).click()
  await page.getByRole('button', { name: /留言审核结果/ }).click()
  await expect(page.getByRole('article', { name: '通知详情' })).toContainText('你的留言需要调整后再提交。')
  await expect(page.getByRole('textbox', { name: /写下想对/ })).toHaveCount(0)
})

test('切换会话不会让异步发送覆盖另一位同学的预览或消息记录', async ({ page }) => {
  const wangConversation = {
    id: 'conversation-wang',
    peer: { name: '王五', slug: 'wangwu', avatarUrl: null },
    lastMessage: { id: 'wang-1', senderSlug: 'wangwu', body: '王五的上一条消息。', createdAt: '2026-07-11T08:01:00.000Z' },
    unreadCount: 0,
    updatedAt: '2026-07-11T08:01:00.000Z',
  }
  let releaseSend = () => {}
  const waitForSend = new Promise<void>((resolve) => { releaseSend = resolve })

  await page.route('**/api/direct-conversations', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { items: [wangConversation, { ...conversation, lastMessage: { ...conversation.lastMessage, body: '李四的上一条消息。' } }] } }),
  }))
  await page.route('**/api/direct-conversations/conversation-lisi/messages**', async (route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: [{ id: 'lisi-1', conversationId: 'conversation-lisi', senderSlug: 'lisi', recipientSlug: 'test_init', body: '李四的上一条消息。', createdAt: '2026-07-11T08:00:00.000Z' }], nextCursor: null } }) })
      return
    }
    await waitForSend
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'lisi-2', conversationId: 'conversation-lisi', senderSlug: 'test_init', recipientSlug: 'lisi', body: '只发给李四的新消息。', createdAt: '2026-07-11T08:05:00.000Z' } }) })
  })
  await page.route('**/api/direct-conversations/conversation-wang/messages**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { items: [{ id: 'wang-1', conversationId: 'conversation-wang', senderSlug: 'wangwu', recipientSlug: 'test_init', body: '王五的上一条消息。', createdAt: '2026-07-11T08:01:00.000Z' }], nextCursor: null } }),
  }))
  await page.route('**/api/direct-conversations/*/read', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) }))

  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '李四', exact: true }).click()
  await expect(page.getByRole('log', { name: '与李四的私聊记录' })).toContainText('李四的上一条消息。')

  await page.getByPlaceholder('写下想对李四说的话……').fill('只发给李四的新消息。')
  await page.getByRole('button', { name: '发送私信' }).click()
  await expect(page.getByRole('log', { name: '与李四的私聊记录' }).getByText('发送中')).toBeVisible()
  await page.getByRole('button', { name: '王五', exact: true }).click()
  await expect(page.getByRole('log', { name: '与王五的私聊记录' })).toContainText('王五的上一条消息。')

  releaseSend()
  await expect(page.getByRole('button', { name: '李四', exact: true })).toContainText('只发给李四的新消息。')
  await expect(page.getByRole('button', { name: '王五', exact: true })).toContainText('王五的上一条消息。')
  await expect(page.getByRole('log', { name: '与王五的私聊记录' })).not.toContainText('只发给李四的新消息。')
})

test('会话历史加载失败时不会显示上一位同学的消息或提交错误已读游标', async ({ page }) => {
  const wangConversation = {
    id: 'conversation-wang',
    peer: { name: '王五', slug: 'wangwu', avatarUrl: null },
    lastMessage: { id: 'wang-1', senderSlug: 'wangwu', body: '王五的上一条消息。', createdAt: '2026-07-11T08:01:00.000Z' },
    unreadCount: 1,
    updatedAt: '2026-07-11T08:01:00.000Z',
  }
  let wangReadCount = 0
  await page.route('**/api/direct-conversations', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { items: [wangConversation, conversation] } }),
  }))
  await page.route('**/api/direct-conversations/conversation-lisi/messages**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { items: [{ id: 'lisi-1', conversationId: 'conversation-lisi', senderSlug: 'lisi', recipientSlug: 'test_init', body: '李四的历史消息。', createdAt: '2026-07-11T08:00:00.000Z' }], nextCursor: null } }),
  }))
  await page.route('**/api/direct-conversations/conversation-wang/messages**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: '历史暂不可用' }) }))
  await page.route('**/api/direct-conversations/conversation-lisi/read', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) }))
  await page.route('**/api/direct-conversations/conversation-wang/read', (route) => {
    wangReadCount += 1
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })

  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '李四', exact: true }).click()
  await expect(page.getByRole('log', { name: '与李四的私聊记录' })).toContainText('李四的历史消息。')
  await page.getByRole('button', { name: '王五', exact: true }).click()

  await expect(page.getByRole('alert')).toContainText('历史暂不可用')
  await expect(page.getByRole('log', { name: '与王五的私聊记录' })).not.toContainText('李四的历史消息。')
  expect(wangReadCount).toBe(0)
})

test('新建私聊在目录加载失败时可重试且支持 Escape 关闭', async ({ page }) => {
  let shouldFailDirectory = true
  await page.route('**/api/classmates**', (route) => {
    if (shouldFailDirectory) {
      shouldFailDirectory = false
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: '目录暂不可用' }) })
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ name: '测试同学', slug: 'test_init', avatarUrl: null }, { name: '李四', slug: 'lisi', avatarUrl: null }] }) })
  })

  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '新建私聊' }).click()
  await expect(page.getByRole('alert')).toContainText('同学目录加载失败')
  await page.getByRole('button', { name: '重新加载同学目录' }).click()
  await expect(page.getByPlaceholder('搜索收件人姓名或拼音...')).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '新建私聊' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新建私聊' })).toBeFocused()
})

test('信箱分段控件支持左右方向键切换', async ({ page }) => {
  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })

  const directTab = page.getByRole('tab', { name: '私聊' })
  const notificationTab = page.getByRole('tab', { name: '通知' })
  await directTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(notificationTab).toBeFocused()
  await expect(notificationTab).toHaveAttribute('aria-selected', 'true')
})

test('手机端详情写入 URL 并由浏览器返回恢复会话列表', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: '李四', exact: true }).click()
  await expect(page).toHaveURL(/\/mailbox\/\?conversation=conversation-lisi/)
  await expect(page.locator('.mailbox-workspace')).toHaveClass(/has-detail/)
  await page.goBack()
  await expect(page).toHaveURL(/\/mailbox\/?$/)
  await expect(page.locator('.direct-conversation-list')).toBeVisible()
  await expect(page.locator('.mailbox-workspace')).not.toHaveClass(/has-detail/)
})

test('手机端从直达会话详情返回时清除详情查询参数', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedClassmateSession(page)
  await page.goto('./mailbox/?conversation=conversation-lisi', { waitUntil: 'networkidle' })

  await expect(page.locator('.mailbox-workspace')).toHaveClass(/has-detail/)
  await page.getByRole('button', { name: '返回信箱' }).click()
  await expect(page).toHaveURL(/\/mailbox\/?$/)
  await expect(page.locator('.direct-conversation-list')).toBeVisible()
})

test('430x932 手机端支持长消息、错误提示和返回且不产生横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  await seedClassmateSession(page)
  await page.goto('./mailbox/?conversation=conversation-lisi', { waitUntil: 'networkidle' })

  const composer = page.getByPlaceholder('写下想对李四说的话……')
  await expect(composer).toBeVisible()
  await composer.fill('这是一条用于移动端回归的超长私信。'.repeat(80))
  await page.getByRole('button', { name: '发送私信' }).click()
  await expect(page.getByRole('button', { name: '重试发送' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('临时无法发送')

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1)

  await page.getByRole('button', { name: '返回信箱' }).click()
  await expect(page.locator('.direct-conversation-list')).toBeVisible()
})
