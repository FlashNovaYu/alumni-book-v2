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

test('从滚动位置进入档案后返回时在新页面截图前恢复同一视口', async ({ page }) => {
  await page.addInitScript(() => {
    const ensureRosterScrollSpace = () => {
      if (document.querySelector('[data-test-roster-scroll-space]')) return
      const style = document.createElement('style')
      style.dataset.testRosterScrollSpace = ''
      style.textContent = 'body:has(.roster-card[href]) { padding-top: 800px !important; }'
      document.head.append(style)
    }
    document.addEventListener('DOMContentLoaded', ensureRosterScrollSpace, { once: true })
    document.addEventListener('astro:after-swap', () => {
      ensureRosterScrollSpace()
      if (document.documentElement.dataset.studentTransition !== 'return-edge') return
      const style = document.createElement('style')
      style.textContent = 'body > .app, body > .alumni-ambient-bg { display: none !important; }'
      document.head.append(style)
      requestAnimationFrame(() => requestAnimationFrame(() => style.remove()))
    })
  })
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  const card = page.locator('.roster-card[href]:not([href="#"]):visible').first()
  await card.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy({ top: 120, behavior: 'instant' }))
  const href = await card.getAttribute('href')
  expect(href).not.toBeNull()
  const slug = href!.split('/').filter(Boolean).at(-1)!
  const before = await card.evaluate((element) => ({
    scrollY: window.scrollY,
    top: element.getBoundingClientRect().top,
  }))
  expect(before.scrollY).toBeGreaterThan(300)

  await card.click()
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.studentTransition || '')).toBe('')
  await page.evaluate(() => {
    ;(window as Window & { __studentReturnAfterSwapScrollY?: number }).__studentReturnAfterSwapScrollY = -1
    document.addEventListener('astro:after-swap', () => {
      ;(window as Window & { __studentReturnAfterSwapScrollY?: number }).__studentReturnAfterSwapScrollY = window.scrollY
    }, { once: true })
  })

  await page.getByRole('link', { name: '同学档案' }).click()
  await expect(page).toHaveURL(/\/roster\/$/)
  const returnedCard = page.locator(`[data-student-identity-card="${slug}"]`)
  await expect(returnedCard).toBeVisible()
  const after = await returnedCard.evaluate((element) => ({
    scrollY: window.scrollY,
    top: element.getBoundingClientRect().top,
    afterSwapScrollY: (window as Window & { __studentReturnAfterSwapScrollY?: number }).__studentReturnAfterSwapScrollY ?? -1,
  }))

  expect(Math.abs(after.afterSwapScrollY - before.scrollY)).toBeLessThanOrEqual(2)
  expect(Math.abs(after.scrollY - before.scrollY)).toBeLessThanOrEqual(2)
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(2)
})

test('其他学生留下的陈旧返回状态不会驱动当前档案的动画和滚动', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  const cards = page.locator('.roster-card[href]:not([href="#"]):visible')
  const firstCard = cards.first()
  const firstHref = await firstCard.getAttribute('href')
  const secondHref = await cards.nth(1).getAttribute('href')
  expect(firstHref).not.toBeNull()
  expect(secondHref).not.toBeNull()
  await firstCard.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy({ top: 120, behavior: 'instant' }))
  await firstCard.click()
  await expect(page).toHaveURL(new RegExp(firstHref!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.studentTransition || '')).toBe('')

  await page.goto(secondHref!, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    ;(window as Window & { __staleReturnState?: { mode: string; scrollY: number } }).__staleReturnState = { mode: '', scrollY: -1 }
    document.addEventListener('astro:before-swap', () => {
      const state = (window as Window & { __staleReturnState?: { mode: string; scrollY: number } }).__staleReturnState
      if (state) state.mode = document.documentElement.dataset.studentTransition || ''
    }, { once: true })
    document.addEventListener('astro:after-swap', () => {
      const state = (window as Window & { __staleReturnState?: { mode: string; scrollY: number } }).__staleReturnState
      if (state) state.scrollY = window.scrollY
    }, { once: true })
  })

  await page.getByRole('link', { name: '同学档案' }).click()
  await expect(page).toHaveURL(/\/roster\/$/)
  await expect.poll(() => page.evaluate(() => (window as Window & { __staleReturnState?: { mode: string; scrollY: number } }).__staleReturnState)).toEqual({
    mode: '',
    scrollY: 0,
  })
})

test('快速连续点击不同档案时由最后一次点击完整接管转场', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  const cards = page.locator('.roster-card[href]:not([href="#"]):visible')
  expect(await cards.count()).toBeGreaterThan(1)
  const secondHref = await cards.nth(1).getAttribute('href')
  expect(secondHref).not.toBeNull()
  const secondSlug = secondHref!.split('/').filter(Boolean).at(-1)!

  await page.evaluate(() => {
    const visibleCards = Array.from(document.querySelectorAll<HTMLAnchorElement>('.roster-card[href]:not([href="#"])'))
      .filter((card) => card.offsetParent !== null)
    visibleCards[0]?.click()
    window.setTimeout(() => visibleCards[1]?.click(), 20)
  })

  await expect(page).toHaveURL(new RegExp(secondHref!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await expect(page.locator('.student-hero__avatar')).toHaveCSS('view-transition-name', `student-avatar-${secondSlug}`)
  await expect(page.locator('.student-hero__name')).toHaveCSS('view-transition-name', `student-name-${secondSlug}`)
  await expect.poll(() => page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem('vt-student-return-edge-state') || 'null')?.slug || ''
    } catch {
      return ''
    }
  })).toBe(secondSlug)
})

test('返回动画尚未结束时连续点击多张档案会排队最后一次点击', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  const rosterCards = page.locator('.roster-card[href]:not([href="#"]):visible')
  const firstCard = rosterCards.first()
  const firstHref = await firstCard.getAttribute('href')
  const nextHref = await rosterCards.nth(2).getAttribute('href')
  expect(firstHref).not.toBeNull()
  expect(nextHref).not.toBeNull()
  const nextSlug = nextHref!.split('/').filter(Boolean).at(-1)!
  await firstCard.click()
  await expect(page).toHaveURL(new RegExp(firstHref!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.studentTransition || '')).toBe('')

  await page.getByRole('link', { name: '同学档案' }).click()
  await expect(page).toHaveURL(/\/roster\/$/)

  const nextPath = new URL(nextHref!, page.url()).pathname
  await page.route(`**${nextPath}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800))
    await route.continue()
  }, { times: 1 })
  await page.evaluate(() => {
    ;(window as Window & { __queuedStudentTransitionMode?: string }).__queuedStudentTransitionMode = ''
    document.addEventListener('astro:before-swap', () => {
      ;(window as Window & { __queuedStudentTransitionMode?: string }).__queuedStudentTransitionMode = document.documentElement.dataset.studentTransition || ''
    }, { once: true })
  })
  await page.evaluate(() => {
    const visibleCards = Array.from(document.querySelectorAll<HTMLAnchorElement>('.roster-card[href]:not([href="#"])'))
      .filter((card) => card.offsetParent !== null)
    visibleCards[1]?.click()
    window.setTimeout(() => visibleCards[2]?.click(), 20)
  })

  await page.waitForTimeout(150)
  expect(new URL(page.url()).pathname).toMatch(/\/roster\/$/)
  await expect(page).toHaveURL(new RegExp(nextHref!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await expect.poll(() => page.evaluate(() => (window as Window & { __queuedStudentTransitionMode?: string }).__queuedStudentTransitionMode || '')).toBe('edge')
  await expect.poll(() => page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem('vt-student-return-edge-state') || 'null')?.slug || ''
    } catch {
      return ''
    }
  })).toBe(nextSlug)
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

async function sampleIdentityContainment(
  page: import('@playwright/test').Page,
  selector: string,
  slug: string,
  rootPseudo: '::view-transition-new(root)' | '::view-transition-old(root)',
) {
  return page.locator(selector).first().evaluate(async (element, options) => {
    const rows: Array<{ contained: boolean; rootArea: number }> = []
    const avatarPseudo = `::view-transition-group(student-avatar-${options.slug})`
    const namePseudo = `::view-transition-group(student-name-${options.slug})`

    const insetBounds = (clipPath: string) => {
      const values = Array.from(clipPath.matchAll(/(-?\d+(?:\.\d+)?)px/g), match => Number(match[1]))
      if (values.length !== 4) return null
      return {
        top: values[0],
        right: innerWidth - values[1],
        bottom: innerHeight - values[2],
        left: values[3],
      }
    }
    const groupBounds = (pseudo: string) => {
      const style = getComputedStyle(document.documentElement, pseudo)
      if (style.width === 'auto' || style.transform === 'none') return null
      const matrix = new DOMMatrixReadOnly(style.transform)
      const width = Number.parseFloat(style.width)
      const height = Number.parseFloat(style.height)
      return { top: matrix.m42, right: matrix.m41 + width, bottom: matrix.m42 + height, left: matrix.m41 }
    }
    const contains = (outer: NonNullable<ReturnType<typeof insetBounds>>, inner: NonNullable<ReturnType<typeof groupBounds>>) => (
      inner.top >= outer.top - 2
      && inner.right <= outer.right + 2
      && inner.bottom <= outer.bottom + 2
      && inner.left >= outer.left - 2
    )

    ;(element as HTMLElement).click()
    const startedAt = performance.now()
    await new Promise<void>((resolve) => {
      const sample = () => {
        const root = insetBounds(getComputedStyle(document.documentElement, options.rootPseudo).clipPath)
        const avatar = groupBounds(avatarPseudo)
        const name = groupBounds(namePseudo)
        if (root && avatar && name) {
          rows.push({
            contained: contains(root, avatar) && contains(root, name),
            rootArea: Math.max(0, root.right - root.left) * Math.max(0, root.bottom - root.top),
          })
        }
        if (performance.now() - startedAt < 1150) requestAnimationFrame(sample)
        else resolve()
      }
      requestAnimationFrame(sample)
    })
    return rows
  }, { slug, rootPseudo })
}

test.describe('手机端档案卡转场', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('进入和返回过程中背景边界始终包住头像与姓名', async ({ page }) => {
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })

    const card = page.locator('.roster-card[href]:not([href="#"]):visible').first()
    const href = await card.getAttribute('href')
    expect(href).not.toBeNull()
    const slug = href!.split('/').filter(Boolean).at(-1)!

    const enter = await sampleIdentityContainment(page, '.roster-card[href]:not([href="#"]):visible', slug, '::view-transition-new(root)')
    await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.studentTransition || '')).toBe('')
    const back = await sampleIdentityContainment(page, 'a[href*="/roster/"]', slug, '::view-transition-old(root)')

    expect(enter.length).toBeGreaterThan(20)
    expect(back.length).toBeGreaterThan(20)
    expect(enter.every(sample => sample.contained)).toBe(true)
    expect(back.every(sample => sample.contained)).toBe(true)
    expect(enter.at(-1)!.rootArea).toBeGreaterThan(enter[0].rootArea)
    expect(back.at(-1)!.rootArea).toBeLessThan(back[0].rootArea)
  })

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

  test('返回动画中点击另一档案会等待手机端动画完整结束', async ({ page }) => {
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })

    const cards = page.locator('.roster-card[href]:not([href="#"]):visible')
    const firstHref = await cards.first().getAttribute('href')
    const nextHref = await cards.nth(1).getAttribute('href')
    expect(firstHref).not.toBeNull()
    expect(nextHref).not.toBeNull()

    await cards.first().click()
    await expect(page).toHaveURL(new RegExp(firstHref!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.studentTransition || '')).toBe('')

    await page.locator('a[data-nav-item][href*="/roster/"]').first().evaluate((anchor: HTMLAnchorElement) => anchor.click())
    await expect(page).toHaveURL(/\/roster\/$/)
    await page.locator('.roster-card[href]:not([href="#"]):visible').nth(1).evaluate((card: HTMLAnchorElement) => card.click())

    await page.waitForTimeout(200)
    expect(new URL(page.url()).pathname).toMatch(/\/roster\/$/)
    await expect(page).toHaveURL(new RegExp(nextHref!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  })
})

test.describe('手机横屏档案卡转场', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

  test('触摸横屏继续使用手机端扩散时长', async ({ page }) => {
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })
    const duration = page.evaluate(() => new Promise<string>((resolve) => {
      document.addEventListener('astro:before-swap', () => {
        requestAnimationFrame(() => resolve(
          getComputedStyle(document.documentElement, '::view-transition-new(root)').animationDuration,
        ))
      }, { once: true })
    }))
    await page.locator('.roster-card[href]:not([href="#"]):visible').first().click()
    expect(await duration).toBe('1.05s')
  })
})

test.describe('减少动态偏好', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('个人页立即显示身份元素和辅助资料', async ({ page }) => {
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })
    const cards = page.locator('.roster-card[href]:not([href="#"]):visible')
    const secondHref = await cards.nth(1).getAttribute('href')
    expect(secondHref).not.toBeNull()
    await page.evaluate(() => {
      const visibleCards = Array.from(document.querySelectorAll<HTMLAnchorElement>('.roster-card[href]:not([href="#"])'))
        .filter((card) => card.offsetParent !== null)
      visibleCards[0]?.click()
      window.setTimeout(() => visibleCards[1]?.click(), 20)
    })

    await expect(page).toHaveURL(new RegExp(secondHref!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
    await expect(page.locator('.student-hero__avatar')).toHaveCSS('view-transition-name', 'none')
    await expect(page.locator('.student-hero__name')).toHaveCSS('view-transition-name', 'none')
    await expect(page.locator('.hero-support')).toHaveCSS('opacity', '1')
    await expect(page.locator('.student-body')).toHaveCSS('opacity', '1')
  })
})
