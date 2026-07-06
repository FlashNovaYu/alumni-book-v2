import { expect, test } from '@playwright/test'

const mobilePages = ['/', '/preface/', '/roster/', '/album/', '/timeline/', '/yearbook/', '/student/template/']

async function seedClassmateSession(page: any) {
  await page.goto('/')
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

test.describe('public site major redesign responsive smoke', () => {
  for (const pathname of mobilePages) {
    test(`mobile page has no horizontal overflow: ${pathname}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      if (pathname !== '/') {
        await seedClassmateSession(page)
      }
      await page.goto(pathname)

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(overflow).toBe(false)
    })
  }

  test('homepage keeps logged-out nav minimal and scrolls to login smoothly', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.top-nav.top-nav--home')).toBeVisible()
    await expect(page.locator('.top-nav:not(.has-session) .nav-links')).toBeHidden()

    await page.getByTestId('home-login-cta').click()
    await expect(page.locator('#login')).toBeInViewport()
  })

  test('core browsing pages expose paper page headers', async ({ page }) => {
    await seedClassmateSession(page)
    for (const pathname of ['/preface/', '/roster/', '/album/', '/timeline/']) {
      await page.goto(pathname)
      await expect(page.locator('.page-shell')).toBeVisible()
      await expect(page.locator('.page-header')).toBeVisible()
    }
  })
})
