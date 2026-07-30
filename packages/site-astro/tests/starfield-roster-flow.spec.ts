import { expect, test } from '@playwright/test'
import { mockClassmateAdminEntry, mockClassmateInboxSummary } from './classmate-session-mocks'

async function seedClassmateSession(page: import('@playwright/test').Page) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({
      name: '测试同学',
      slug: 'template',
      avatarUrl: null,
    }))
    sessionStorage.setItem('classmate_name', '测试同学')
  })
}

test.beforeEach(async ({ page }) => {
  await mockClassmateAdminEntry(page)
  await mockClassmateInboxSummary(page)
})

test('宽屏花名录显示全局星空与四列档案索引卡', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await seedClassmateSession(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  await expect(page.locator('[data-starfield-canvas]')).toBeVisible()
  await expect(page.locator('.roster-card').first()).toBeVisible()

  const columns = await page.locator('.roster-grid').first().evaluate((grid) =>
    getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
  )
  expect(columns).toBe(4)
})

test.describe('减少动态效果', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('保留静态星空终态但停止雾光漂移', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await seedClassmateSession(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })

    await expect(page.locator('[data-starfield-canvas]')).toBeVisible()
    await expect(page.locator('.starfield__mist--gold')).toHaveCSS('animation-name', 'none')
  })
})
