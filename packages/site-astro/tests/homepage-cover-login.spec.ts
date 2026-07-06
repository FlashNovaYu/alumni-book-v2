import { expect, test } from '@playwright/test'

test('homepage reveals the paper login section from the dark cover CTA', async ({ page }) => {
  await page.route('**/api/classmate-auth/login', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          token: 'token-normal-login',
          mustChangePassword: false,
          student: { name: '测试同学', slug: 'test_init', avatarUrl: null },
        },
      }),
    })
  })

  await page.goto('/')

  await expect(page.locator('.home-cover')).toBeVisible()
  await expect(page.locator('#login')).toBeVisible()
  await expect(page.locator('#username-input')).toBeVisible()

  const cta = page.getByTestId('home-login-cta')
  await expect(cta).toBeVisible()
  await cta.click()

  await expect(page.locator('#username-input')).toBeInViewport()
  await page.locator('#username-input').fill('测试同学')
  await page.locator('#password-input').fill('123456')
  await page.locator('.login-btn').click()

  await expect(page).toHaveURL(/\/preface/, { timeout: 15000 })
})

test('homepage cover keeps the form out of the initial visual center on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const coverBox = await page.locator('.home-cover').boundingBox()
  const formBox = await page.locator('#login').boundingBox()

  expect(coverBox).not.toBeNull()
  expect(formBox).not.toBeNull()
  expect(formBox!.y).toBeGreaterThan(coverBox!.height * 0.72)
})

test('homepage cover and login section fit mobile viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)

  await page.getByTestId('home-login-cta').click()
  await expect(page.locator('#login')).toBeInViewport()
  await page.screenshot({ path: 'test-results/homepage-cover-mobile.png', fullPage: true })
})

test('homepage logged-out navigation is minimal', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('.top-nav.top-nav--home')).toBeVisible()
  await expect(page.locator('.top-nav:not(.has-session) .nav-links')).toBeHidden()
})
