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

test('档案卡导航保留身份元素并使用卡片矩形作为转场起点', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    ;(window as Window & { __dualEdgeState?: { events: string[]; edge?: string; left?: string } }).__dualEdgeState = { events: [] }
    document.addEventListener('astro:before-preparation', () => {
      const state = (window as Window & { __dualEdgeState?: { events: string[]; edge?: string; left?: string } }).__dualEdgeState
      if (!state) return
      state.events.push('preparation')
      state.edge = document.documentElement.dataset.studentTransition
      state.left = document.documentElement.style.getPropertyValue('--student-card-left')
    }, { once: true })
    document.addEventListener('astro:page-load', () => {
      ;(window as Window & { __dualEdgeState?: { events: string[]; edge?: string; left?: string } }).__dualEdgeState?.events.push('page-load')
    }, { once: true })
  })

  const card = page.locator('.roster-card[href]:not([href="#"]):visible').first()
  const href = await card.getAttribute('href')
  expect(href).not.toBeNull()
  const slug = href!.split('/').filter(Boolean).at(-1)!

  await card.click()
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await expect.poll(() => page.evaluate(() => ({
    events: (window as Window & { __dualEdgeState?: { events: string[]; edge?: string; left?: string } }).__dualEdgeState?.events || [],
    edge: (window as Window & { __dualEdgeState?: { events: string[]; edge?: string; left?: string } }).__dualEdgeState?.edge || '',
    left: (window as Window & { __dualEdgeState?: { events: string[]; edge?: string; left?: string } }).__dualEdgeState?.left || '',
    avatarName: document.querySelector<HTMLElement>('.student-hero__avatar')?.style.viewTransitionName || '',
    nameName: document.querySelector<HTMLElement>('.student-hero__name')?.style.viewTransitionName || '',
  }))).toMatchObject({
    events: ['preparation', 'page-load'],
    edge: 'edge',
    left: expect.stringMatching(/^-?\d+(\.\d+)?px$/),
    avatarName: `student-avatar-${slug}`,
    nameName: `student-name-${slug}`,
  })
})

test('点击卡片后身份元素进入 Hero，并在返回时恢复到原卡片', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  const card = page.locator('.roster-card[href]:not([href="#"]):visible').first()
  const href = await card.getAttribute('href')
  expect(href).not.toBeNull()
  const slug = href!.split('/').filter(Boolean).at(-1)!

  await card.click()
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await expect(page.locator('.student-hero__avatar')).toHaveCSS('view-transition-name', `student-avatar-${slug}`)
  await expect(page.locator('.student-hero__name')).toHaveCSS('view-transition-name', `student-name-${slug}`)
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('vt-student-return-edge-state'))).not.toBeNull()

  await page.goBack({ waitUntil: 'networkidle' })
  const returnedCard = page.locator(`[data-student-identity-card="${slug}"]`)
  await expect(returnedCard).toBeVisible()
  await expect(returnedCard.locator('.roster-card__avatar')).toHaveCSS('view-transition-name', `student-avatar-${slug}`)
  await expect(returnedCard.locator('.roster-card__name')).toHaveCSS('view-transition-name', `student-name-${slug}`)
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('vt-student-return-edge-state'))).toBeNull()
})

test('从第二页进入详情后返回时恢复第二页中的身份目标', async ({ page }) => {
  await signInForNavigation(page)
  await page.route('**/api/classmates**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: [
        ...Array.from({ length: 12 }, (_, index) => ({
          name: `占位同学${index + 1}`,
          slug: `placeholder-${index + 1}`,
          hasPage: false,
          avatarUrl: null,
          motto: '',
        })),
        { name: '周子耀', slug: 'zhou-zi-yao', hasPage: true, avatarUrl: null, motto: '' },
      ],
    }),
  }))
  await page.goto('./roster/', { waitUntil: 'networkidle' })
  await expect(page.getByRole('button', { name: '第 2 页' })).toBeVisible()
  await page.getByRole('button', { name: '第 2 页' }).click()

  const card = page.locator('.roster-card[href*="/student/zhou-zi-yao/"]:visible').first()
  const href = await card.getAttribute('href')
  expect(href).not.toBeNull()
  const slug = href!.split('/').filter(Boolean).at(-1)!

  await card.click()
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await page.goBack({ waitUntil: 'networkidle' })
  await expect(page.getByRole('button', { name: '第 2 页' })).toHaveAttribute('aria-current', 'page')
  const returnedCard = page.locator(`[data-student-identity-card="${slug}"]`)
  await expect(returnedCard).toBeVisible()
  await expect(returnedCard.locator('.roster-card__avatar')).toHaveCSS('view-transition-name', `student-avatar-${slug}`)
  await expect(returnedCard.locator('.roster-card__name')).toHaveCSS('view-transition-name', `student-name-${slug}`)
})

test.describe('手机端档案卡转场', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('在手机视口完成进入和返回，并保留同一身份元素', async ({ page }) => {
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })
    await expect.poll(() => page.evaluate(() => matchMedia('(max-width: 768px)').matches)).toBe(true)

    const card = page.locator('.roster-card[href]:not([href="#"]):visible').first()
    const href = await card.getAttribute('href')
    expect(href).not.toBeNull()
    const slug = href!.split('/').filter(Boolean).at(-1)!

    await card.click()
    await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
    await expect(page.locator('.student-hero__avatar')).toHaveCSS('view-transition-name', `student-avatar-${slug}`)
    await expect(page.locator('.student-hero__name')).toHaveCSS('view-transition-name', `student-name-${slug}`)

    await page.goBack({ waitUntil: 'networkidle' })
    const returnedCard = page.locator(`[data-student-identity-card="${slug}"]`)
    await expect(returnedCard).toBeVisible()
    await expect(returnedCard.locator('.roster-card__avatar')).toHaveCSS('view-transition-name', `student-avatar-${slug}`)
    await expect(returnedCard.locator('.roster-card__name')).toHaveCSS('view-transition-name', `student-name-${slug}`)
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
