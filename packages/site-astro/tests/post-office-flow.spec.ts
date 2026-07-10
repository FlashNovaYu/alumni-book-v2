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

  await page.route('**/api/mailbox/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          items: [{
            id: 'thread_1',
            subject: '欢迎来到班级邮局',
            threadType: 'system',
            senderName: '系统邮局',
            preview: '你的收件箱已经准备好了',
            unread: true,
            updatedAt: '2026-07-06 12:00:00',
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

test('public message page can submit a pending message', async ({ page }) => {
  await seedClassmateSession(page)
  await page.goto('./messages/', { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { name: /公共留言/ })).toBeVisible()
  await page.getByPlaceholder(/写一张便签/).fill('测试公共留言')
  await page.getByRole('button', { name: /提交留言/ }).click()
  await expect(page.getByText(/等待审核/)).toBeVisible()
})

test('mailbox page is usable on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { name: '班级邮局', exact: true })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})

test('public message page supports adding emoji reactions', async ({ page }) => {
  await page.route('**/api/public-messages/pm_approved/react', async (route, request) => {
    expect(request.method()).toBe('PUT')
    const payload = request.postDataJSON()
    expect(payload.reaction).toBe('❤️')

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          reactions: {
            '❤️': 1,
          },
        },
      }),
    })
  })

  await seedClassmateSession(page)
  await page.goto('./messages/', { waitUntil: 'networkidle' })

  const card = page.locator('.public-message-card').filter({ hasText: '愿我们都前程似锦' })
  await expect(card).toBeVisible()

  const heartBtn = card.getByRole('button', { name: /反应 ❤️/ })
  await expect(heartBtn).toBeVisible()
  await expect(heartBtn.locator('.reaction-count')).toHaveText('0')

  await heartBtn.click()

  await expect(heartBtn.locator('.reaction-count')).toHaveText('1')
})

