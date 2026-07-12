import type { Page } from '@playwright/test'

export async function mockClassmateAdminEntry(page: Page) {
  await page.route('**/api/classmate-auth/admin-entry', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { available: false } }),
  }))
}

export async function mockClassmateInboxSummary(page: Page) {
  await page.route('**/api/inbox/summary', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { directUnread: 0, notificationUnread: 0, totalUnread: 0 } }),
  }))
}
