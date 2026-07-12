import { expect, test } from '@playwright/test'

async function signInForNavigation(page: import('@playwright/test').Page) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学', slug: 'test_init', avatarUrl: null }))
  })
}

test('点击卡片后身份元素进入 Hero，并在返回时恢复到原卡片', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  const card = page.locator('.archive-card[href]:not([href="#"])').first()
  const href = await card.getAttribute('href')
  expect(href).not.toBeNull()
  const slug = href!.split('/').filter(Boolean).at(-1)!
  const avatarName = 'student-avatar-' + slug
  const nameName = 'student-name-' + slug

  await card.click()
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await expect(page.locator('.hero-avatar')).toHaveCSS('view-transition-name', avatarName)
  await expect(page.locator('.hero-name')).toHaveCSS('view-transition-name', nameName)

  await page.evaluate(() => {
    document.addEventListener('astro:before-swap', (event) => {
      const targetDocument = (event as Event & { newDocument?: Document }).newDocument
      const card = targetDocument?.querySelector<HTMLElement>('[data-student-identity-card]')
      const avatar = card?.querySelector<HTMLElement>('.archive-card__avatar')
      const name = card?.querySelector<HTMLElement>('.archive-card__name')
      ;(window as Window & {
        __studentIdentityReturnTarget?: { avatar: string; name: string }
      }).__studentIdentityReturnTarget = {
        avatar: avatar?.style.viewTransitionName || '',
        name: name?.style.viewTransitionName || '',
      }
    }, { once: true })
  })
  await page.goBack({ waitUntil: 'networkidle' })
  await expect(card).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as Window & {
    __studentIdentityReturnTarget?: { avatar: string; name: string }
  }).__studentIdentityReturnTarget)).toEqual({
    avatar: avatarName,
    name: nameName,
  })
})

test.describe('减少动态偏好', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('个人页立即显示身份元素和辅助资料', async ({ page }) => {
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })
    await page.locator('.archive-card[href]:not([href="#"])').first().click()

    await expect(page.locator('.hero-avatar')).toHaveCSS('view-transition-name', 'none')
    await expect(page.locator('.hero-name')).toHaveCSS('view-transition-name', 'none')
    await expect(page.locator('.hero-support')).toHaveCSS('opacity', '1')
    await expect(page.locator('.student-body')).toHaveCSS('opacity', '1')
  })
})
