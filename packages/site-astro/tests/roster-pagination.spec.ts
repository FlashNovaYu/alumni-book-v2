import { expect, test } from '@playwright/test'

const classmates = Array.from({ length: 10 }, (_, index) => ({
  name: `分页同学 ${index + 1}`,
  slug: `page-mate-${index + 1}`,
  hasPage: true,
  avatarUrl: index === 0 ? '/api/files/avatars/broken-avatar.png' : null,
  motto: `第 ${index + 1} 位同学`,
  completion: 50,
  tags: [],
}))

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

test('roster paginates nine cards, resets search to the first page, and hides broken avatars', async ({ page }) => {
  await page.route('**/api/classmates', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: classmates }),
    })
  })
  await page.route('**/api/files/avatars/broken-avatar.png', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: 'not a decodable PNG' })
  })

  await seedClassmateSession(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  await expect(page.getByRole('button', { name: '第 2 页' })).toBeVisible()
  await expect(page.locator('.archive-card')).toHaveCount(9)
  const firstAvatar = page.locator('.archive-card').first().locator('.archive-card__avatar')
  await expect(firstAvatar.locator('img')).toHaveCount(0)
  await expect(firstAvatar).toHaveText('分')

  await page.getByRole('button', { name: '第 2 页' }).click()
  await expect(page.locator('.archive-card')).toHaveCount(1)
  await expect(page.getByText('分页同学 10')).toBeVisible()

  await page.getByRole('textbox', { name: '档案检索' }).fill('分页')
  await expect(page.locator('.roster-pagination button[aria-current="page"]')).toHaveText('1')
  await expect(page.getByText('分页同学 1')).toBeVisible()
})
