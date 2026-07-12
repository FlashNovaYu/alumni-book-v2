import { expect, test } from '@playwright/test'

test('top navigation records a backward marker transition when moving from roster to preface', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({
      name: '测试同学',
      slug: 'test_init',
      avatarUrl: null,
    }))
  })

  await page.goto('./roster/', { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: '前言', exact: true }).click()
  await expect(page).toHaveURL(/\/preface\/?$/)
  await expect(page.locator('[data-nav-directory]')).toHaveAttribute('data-nav-direction', 'backward')
})
