import { expect, test } from '@playwright/test'
import { mockClassmateAdminEntry, mockClassmateInboxSummary } from './classmate-session-mocks'

test('top navigation records a backward marker transition when moving from roster to preface', async ({ page }) => {
  await mockClassmateAdminEntry(page)
  await mockClassmateInboxSummary(page)
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
  const fillOrigin = await page.locator('[data-nav-item][aria-current="page"]').evaluate((element) => {
    const { transformOrigin } = getComputedStyle(element, '::after')
    return Number.parseFloat(transformOrigin.split(' ')[0])
  })
  expect(fillOrigin).toBeGreaterThan(0)
})
