import { expect, test } from '@playwright/test'

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

async function mockClassSpace(page: any, onSend: (route: any) => Promise<void>) {
  await page.route('**/api/inbox/summary', (route: any) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { directUnread: 0, notificationUnread: 0, totalUnread: 0 } }),
  }))
  await page.route('**/api/class-space/overview', (route: any) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(initialChat),
  }))
  await page.route('**/api/group-chat/messages', async (route: any, request: any) => {
    if (request.method() === 'POST') return onSend(route)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { items: [], nextCursor: null } }),
    })
  })
}

test.describe('班级空间群聊基础流程', () => {
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
    await page.getByRole('button', { name: '发送消息' }).click()
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
})
