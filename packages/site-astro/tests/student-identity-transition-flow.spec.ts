import { expect, test } from '@playwright/test'
import { mockClassmateAdminEntry, mockClassmateInboxSummary } from './classmate-session-mocks'

async function signInForNavigation(page: import('@playwright/test').Page) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学', slug: 'test_init', avatarUrl: null }))
  })
}

test.beforeEach(async ({ page }) => {
  await mockClassmateAdminEntry(page)
  await mockClassmateInboxSummary(page)
})

test('点击卡片后身份元素进入 Hero，并在返回时恢复到原卡片', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  const card = page.locator('.roster-card[href]:not([href="#"]):visible').first()
  const href = await card.getAttribute('href')
  expect(href).not.toBeNull()
  const slug = href!.split('/').filter(Boolean).at(-1)!
  const avatarName = 'student-avatar-' + slug
  const nameName = 'student-name-' + slug

  await card.click()
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await expect(page.locator('.student-hero__avatar')).toHaveCSS('view-transition-name', avatarName)
  await expect(page.locator('.student-hero__name')).toHaveCSS('view-transition-name', nameName)

  await page.evaluate(() => {
    document.addEventListener('astro:before-swap', (event) => {
      const targetDocument = (event as Event & { newDocument?: Document }).newDocument
      const card = targetDocument?.querySelector<HTMLElement>('[data-student-identity-card]')
      const avatar = card?.querySelector<HTMLElement>('.roster-card__avatar')
      const name = card?.querySelector<HTMLElement>('.roster-card__name')
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

test('从第二页进入详情后返回时恢复第二页中的身份目标', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '第 2 页' }).click()

  const card = page.locator('.roster-card[href]:not([href="#"]):visible').first()
  const href = await card.getAttribute('href')
  expect(href).not.toBeNull()
  const slug = href!.split('/').filter(Boolean).at(-1)!
  const avatarName = 'student-avatar-' + slug
  const nameName = 'student-name-' + slug

  await card.click()
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await page.evaluate((selectedSlug) => {
    document.addEventListener('astro:before-swap', (event) => {
      const targetDocument = (event as Event & { newDocument?: Document }).newDocument
      const targetCard = Array.from(targetDocument?.querySelectorAll<HTMLElement>('[data-student-identity-card]') || [])
        .find((element) => element.dataset.studentIdentityCard === selectedSlug)
      ;(window as Window & {
        __studentIdentityPageTwoTarget?: { avatar: string; name: string }
      }).__studentIdentityPageTwoTarget = {
        avatar: targetCard?.querySelector<HTMLElement>('.roster-card__avatar')?.style.viewTransitionName || '',
        name: targetCard?.querySelector<HTMLElement>('.roster-card__name')?.style.viewTransitionName || '',
      }
    }, { once: true })
  }, slug)

  await page.goBack({ waitUntil: 'networkidle' })
  await expect(page.getByRole('button', { name: '第 2 页' })).toHaveAttribute('aria-current', 'page')
  await expect(card).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as Window & {
    __studentIdentityPageTwoTarget?: { avatar: string; name: string }
  }).__studentIdentityPageTwoTarget)).toEqual({
    avatar: avatarName,
    name: nameName,
  })
})

test.describe('减少动态偏好', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('个人页立即显示身份元素和辅助资料', async ({ page }) => {
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })
    await page.locator('.roster-card[href]:not([href="#"])').first().click()

    await expect(page.locator('.student-hero__avatar')).toHaveCSS('view-transition-name', 'none')
    await expect(page.locator('.student-hero__name')).toHaveCSS('view-transition-name', 'none')
    await expect(page.locator('.hero-support')).toHaveCSS('opacity', '1')
    await expect(page.locator('.student-body')).toHaveCSS('opacity', '1')
  })
})
