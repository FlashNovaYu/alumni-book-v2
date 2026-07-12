import { expect, test } from '@playwright/test'
import { mockClassmateAdminEntry } from './classmate-session-mocks'

async function seedClassmateSession(page: any) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学', slug: 'chenyuhao', avatarUrl: null }))
  })
}

test.beforeEach(async ({ page }) => {
  await mockClassmateAdminEntry(page)
  await page.route('**/api/inbox/summary', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { directUnread: 1, notificationUnread: 1, totalUnread: 2 } }) }))
  await page.route('**/api/inbox/sync**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { cursor: 'test-sync', conversations: [], messages: [], notifications: [], unread: { directUnread: 1, notificationUnread: 1, totalUnread: 2 } } }) }))
  await page.route('**/api/direct-conversations', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: [{ id: 'conversation-lisi', peer: { name: '李四', slug: 'lisi', avatarUrl: null }, lastMessage: { id: 'direct-1', senderSlug: 'lisi', body: '周末见。', createdAt: '2026-07-11T08:00:00.000Z' }, unreadCount: 1, updatedAt: '2026-07-11T08:00:00.000Z' }] } }) }))
  await page.route('**/api/direct-conversations/conversation-lisi/messages**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: [{ id: 'direct-1', conversationId: 'conversation-lisi', senderSlug: 'lisi', recipientSlug: 'chenyuhao', body: '周末见。', createdAt: '2026-07-11T08:00:00.000Z' }], nextCursor: null } }) }))
  await page.route('**/api/direct-conversations/conversation-lisi/read', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) }))
  await page.route('**/api/notifications/notif_1/read', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) }))
  await page.route('**/api/notifications', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: [{ id: 'notif_1', type: 'system', title: '系统升级公告', body: '班级系统已升级到 V2 版本。', readAt: null, createdAt: '2026-07-06T10:00:00.000Z' }] } }) }))
  await page.route('**/api/classmates', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ name: '李四', slug: 'lisi', avatarUrl: null }, { name: '测试同学', slug: 'chenyuhao', avatarUrl: null }] }) }))
})

test.describe('Classmate Mailbox Flow', () => {
  test('separates direct conversations from notifications without using legacy threads', async ({ page }) => {
    await seedClassmateSession(page)
    await page.goto('./mailbox/', { waitUntil: 'networkidle' })

    await expect(page.getByRole('tab', { name: '私聊' })).toBeVisible()
    await expect(page.getByRole('button', { name: '李四', exact: true })).toContainText('周末见。')
    await page.getByRole('button', { name: '李四', exact: true }).click()
    await expect(page.getByRole('log', { name: '与李四的私聊记录' })).toContainText('周末见。')

    await page.getByRole('tab', { name: '通知' }).click()
    await expect(page.getByRole('button', { name: /系统升级公告/ })).toBeVisible()
    expect(await page.locator('[class*="mailbox-item"]').count()).toBe(0)
  })

  test('opening a notification marks it read and keeps the direct composer hidden', async ({ page }) => {
    let readCalled = false
    await page.route('**/api/notifications/notif_1/read', (route) => {
      readCalled = true
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })

    await seedClassmateSession(page)
    await page.goto('./mailbox/', { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: '通知' }).click()
    await page.getByRole('button', { name: /系统升级公告/ }).click()

    await expect(page.getByRole('article', { name: '通知详情' })).toContainText('班级系统已升级到 V2 版本。')
    await expect(page.getByRole('textbox', { name: /写下想对/ })).toHaveCount(0)
    expect(readCalled).toBe(true)
  })
})

test.describe('Classmate Account Center Flow', () => {
  test('redirects to homepage if not logged in', async ({ page }) => {
    await page.goto('./account/')
    await expect(page).toHaveURL(/\/$/)
  })

  test('renders user info and allows password change', async ({ page }) => {
    let changed = false
    await page.route('**/api/classmate-auth/change-password', (route) => {
      changed = true
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })

    await seedClassmateSession(page)
    await page.goto('./account/', { waitUntil: 'networkidle' })
    await expect(page.locator('.user-name')).toHaveText('测试同学')
    await page.locator('#old-password').fill('123456')
    await page.locator('#new-password').fill('new-password-123')
    await page.locator('#confirm-password').fill('new-password-123')
    await page.click('button[type="submit"]')
    await expect(page.locator('.success-msg')).toContainText('密码修改成功')
    expect(changed).toBe(true)
  })

  test('supports logout', async ({ page }) => {
    let logoutCalled = false
    await page.route('**/api/classmate-auth/logout', (route) => {
      logoutCalled = true
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })

    await seedClassmateSession(page)
    await page.goto('./account/', { waitUntil: 'networkidle' })
    page.on('dialog', (dialog) => dialog.accept())
    await page.click('.logout-section button')
    await expect(page).toHaveURL(/\/$/)
    expect(logoutCalled).toBe(true)
  })

  test('navigates to self-edit from account center', async ({ page }) => {
    await page.route('**/api/students/chenyuhao', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { name: '测试同学', slug: 'chenyuhao', avatarUrl: null, backgroundUrl: null, info: { visibility: {} } } }) }))
    await seedClassmateSession(page)
    await page.goto('./account/', { waitUntil: 'networkidle' })
    await page.click('a[href*="edit=1"]')
    await expect(page).toHaveURL(/\/student\/chenyuhao\/\?edit=1/)
    await expect(page.locator('.editor-overlay')).toBeVisible()
    await page.click('.editor-close')
    await expect(page).toHaveURL(/\/student\/chenyuhao\/$/)
  })
})
