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

test('一级栏目切换时保留共享标题转场', async ({ page }) => {
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

test('移动主题水波从可见按钮中心开始', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function (keyframes, options) {
      if (options && typeof options === 'object' && options.pseudoElement === '::view-transition-new(root)') {
        const first = Array.isArray(keyframes) ? keyframes[0] : keyframes
        const clipPath = typeof first === 'object' && first && 'clipPath' in first ? String(first.clipPath) : ''
        const match = clipPath.match(/at ([\d.]+)px ([\d.]+)px/)
        if (match) (window as Window & { __themeRippleOrigin?: { x: number; y: number } }).__themeRippleOrigin = { x: Number(match[1]), y: Number(match[2]) }
      }
      return originalAnimate.call(this, keyframes, options)
    }
  })
  await page.goto('./')
  await page.evaluate(() => localStorage.setItem('alumni_theme', 'paper'))
  await page.reload()
  const toggle = page.locator('[data-theme-toggle]:visible').first()
  await toggle.locator('svg').evaluate((icon) => { (icon as SVGElement).style.transform = 'translateX(-6px)' })
  const button = await toggle.boundingBox()
  expect(button).not.toBeNull()
  await toggle.click()
  await expect.poll(() => page.evaluate(() => Boolean(
    (window as Window & { __themeRippleOrigin?: { x: number; y: number } }).__themeRippleOrigin,
  ))).toBe(true)
  const origin = await page.evaluate(() => (window as Window & { __themeRippleOrigin?: { x: number; y: number } }).__themeRippleOrigin)
  expect(origin).toBeDefined()
  expect(origin!.x).toBeCloseTo(button!.x + button!.width / 2, 1)
  expect(origin!.y).toBeCloseTo(button!.y + button!.height / 2, 1)
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

  test('档案卡进入详情时不隐藏头像和正文', async ({ page }) => {
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })

    const card = page.locator('.roster-card[href]:not([href="#"])').first()
    await card.evaluate((element) => element.addEventListener('click', (event) => event.preventDefault(), { once: true }))
    await card.click()

    await expect(card.locator('.roster-card__avatar')).toHaveCSS('opacity', '1')
    await expect(card.locator('.roster-card__body')).toHaveCSS('opacity', '1')
  })
})

test.describe('移动导航', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('登录后页面标题保持在导航正中', async ({ page }) => {
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })

    const centers = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>('.top-nav')?.getBoundingClientRect()
      const title = document.querySelector<HTMLElement>('.mobile-page-title')?.getBoundingClientRect()
      return nav && title ? { nav: nav.left + nav.width / 2, title: title.left + title.width / 2 } : null
    })

    expect(centers).not.toBeNull()
    expect(Math.abs(centers!.nav - centers!.title)).toBeLessThanOrEqual(1)
  })

  test('管理入口位于目录按钮右侧且右侧工具不与标题重叠', async ({ page }) => {
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })
    await page.evaluate(() => document.documentElement.classList.add('has-admin-entry'))

    const boxes = await page.evaluate(() => {
      const rect = (selector: string) => {
        const box = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect()
        return box && box.width > 0 ? { left: box.left, right: box.right } : null
      }
      return {
        menu: rect('.mobile-nav-button'),
        admin: rect('.nav-admin-button--mobile'),
        title: rect('.mobile-page-title'),
        volume: rect('.nav-volume-button'),
        mailbox: rect('.nav-mailbox-button'),
        theme: rect('.nav-theme-button--mobile'),
      }
    })

    for (const box of Object.values(boxes)) expect(box).not.toBeNull()
    expect(boxes.menu!.right).toBeLessThanOrEqual(boxes.admin!.left)
    expect(boxes.admin!.right).toBeLessThanOrEqual(boxes.title!.left)
    expect(boxes.title!.right).toBeLessThanOrEqual(boxes.volume!.left)
    expect(boxes.volume!.right).toBeLessThanOrEqual(boxes.mailbox!.left)
    expect(boxes.mailbox!.right).toBeLessThanOrEqual(boxes.theme!.left)
  })

  test('320px 窄屏标题在两侧工具之间保持可读', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })
    await page.evaluate(() => document.documentElement.classList.add('has-admin-entry'))

    const boxes = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null
      return {
        admin: rect('.nav-admin-button--mobile'),
        title: rect('.mobile-page-title'),
        volume: rect('.nav-volume-button'),
      }
    })

    expect(boxes.admin).not.toBeNull()
    expect(boxes.title).not.toBeNull()
    expect(boxes.volume).not.toBeNull()
    expect(boxes.title!.width).toBeGreaterThanOrEqual(56)
    expect(boxes.admin!.right).toBeLessThanOrEqual(boxes.title!.left)
    expect(boxes.title!.right).toBeLessThanOrEqual(boxes.volume!.left)
  })
})
