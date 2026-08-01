import { expect, test } from '@playwright/test'
import { mockClassmateAdminEntry, mockClassmateInboxSummary } from './classmate-session-mocks'

async function seedClassmateSession(page: import('@playwright/test').Page) {
  await page.goto('./')
  await page.evaluate(() => {
    localStorage.setItem('alumni_theme', 'paper')
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学', slug: 'template', avatarUrl: null }))
  })
}

test.beforeEach(async ({ page }) => {
  await mockClassmateAdminEntry(page)
  await mockClassmateInboxSummary(page)
})

test('纸张与夜读主题保持统一的语义层级', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await seedClassmateSession(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper')
  await expect(page.locator('[data-starfield-canvas]')).toBeVisible()
  const paperBg = await page.locator('html').evaluate((node) => getComputedStyle(node).getPropertyValue('--surface-canvas').trim())

  await page.locator('[data-theme-toggle]:visible').first().click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  const nightBg = await page.locator('html').evaluate((node) => getComputedStyle(node).getPropertyValue('--surface-canvas').trim())
  expect(nightBg).not.toBe(paperBg)
  await expect(page.locator('.roster-card').first()).toBeVisible()
})

test('375px 移动端无横向溢出且主题切换不改变路由', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await seedClassmateSession(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })
  const rosterUrl = page.url()

  await page.locator('[data-theme-toggle]:visible').first().click()
  await expect(page).toHaveURL(rosterUrl)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')

  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth)
  await expect(page.locator('.mobile-nav-button')).toBeVisible()
})

test.describe('减少动态效果', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('减少动态效果时保留星空和档案卡的可读终态', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await seedClassmateSession(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-starfield-canvas]')).toBeVisible()
    await expect(page.locator('.roster-card').first()).toHaveCSS('opacity', '1')
  })
})
