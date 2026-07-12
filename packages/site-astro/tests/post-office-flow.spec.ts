import { expect, test } from '@playwright/test'

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
  await page.route('**/api/notifications/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { unreadCount: 2 } }),
    })
  })

  await page.route('**/api/inbox/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { totalUnread: 2 } }),
    })
  })

  await page.route('**/api/public-messages**', async (route, request) => {
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'pm_test',
            status: 'pending',
            content: '测试公共留言',
          },
          message: '留言已提交，等待审核',
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          items: [{
            id: 'pm_approved',
            authorName: '测试同学',
            content: '愿我们都前程似锦',
            cardStyle: 'paper',
            status: 'approved',
            featured: true,
            pinned: false,
            reactions: {},
            createdAt: '2026-07-06 12:00:00',
          }],
        },
      }),
    })
  })

})

test('logged-in navigation exposes public messages and mailbox with unread stamp', async ({ page }) => {
  await seedClassmateSession(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  await expect(page.locator('a[href*="/mailbox"]').first()).toBeVisible()
  await expect(page.locator('.mail-unread-stamp').first()).toContainText('2')
})

test('legacy public message page redirects to the class group chat', async ({ page }) => {
  await page.route('**/api/class-space/overview', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { chat: { items: [], cursor: 'legacy', mute: null }, albums: [], timeline: [], counts: { groupMessages: 0, albums: 0, timelineItems: 0 } } }),
    })
  })

  await page.route('**/api/direct-conversations', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { items: [] } }),
    })
  })

  await seedClassmateSession(page)
  await page.goto('./messages/', { waitUntil: 'networkidle' })

  await expect(page).toHaveURL(/\/class-space#group-chat/)
})

test('mailbox page is usable on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { name: '班级信箱', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '私聊' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})
