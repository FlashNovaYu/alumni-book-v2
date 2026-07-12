import { expect, test } from '@playwright/test'

async function signInForNavigation(page: import('@playwright/test').Page) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学', slug: 'test_init', avatarUrl: null }))
  })
}

test('一级栏目在路由切换中保留唯一共享标题锚点', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-page-heading]')).toHaveCount(1)
  await expect(page.locator('[data-page-heading]')).toHaveCSS('view-transition-name', 'page-heading')

  await page.getByRole('link', { name: '班级空间', exact: true }).click()
  await expect(page).toHaveURL(/\/class-space\/?$/)
  await expect(page.locator('[data-page-heading] h1')).toHaveText('班级空间')
  await expect(page.locator('[data-page-heading]')).toHaveCSS('view-transition-name', 'page-heading')
})

test('夜读按钮以根级水波切换并持久化选择', async ({ page }) => {
  await page.addInitScript(() => {
    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      const options = args[1] as KeyframeAnimationOptions | undefined
      if (options?.pseudoElement === '::view-transition-new(root)') {
        ;(window as Window & { __themeRipple?: string }).__themeRipple = options.pseudoElement
      }
      return originalAnimate.apply(this, args)
    }
  })
  await page.goto('./')
  await page.evaluate(() => localStorage.setItem('alumni_theme', 'paper'))
  await page.reload()

  const toggle = page.locator('[data-theme-toggle]').first()
  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(() => (window as Window & { __themeRipple?: string }).__themeRipple)).toBe('::view-transition-new(root)')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
})

test.describe('减少动态偏好', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('立即切换主题且不会留下转场状态', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('alumni_theme'))
    await page.goto('./')
    await page.locator('[data-theme-toggle]').first().click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
    await expect(page.locator('html')).not.toHaveClass(/theme-transition/)
  })
})
