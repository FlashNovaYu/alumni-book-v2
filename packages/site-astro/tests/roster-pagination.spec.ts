import { expect, test } from '@playwright/test'
import { mockClassmateAdminEntry, mockClassmateInboxSummary } from './classmate-session-mocks'

const classmates = Array.from({ length: 13 }, (_, index) => ({
  name: `分页同学 ${index + 1}`,
  slug: `page-mate-${index + 1}`,
  hasPage: true,
  avatarUrl: index === 0 ? '/api/files/avatars/broken-avatar.png' : null,
  motto: `第 ${index + 1} 位同学`,
  completion: 50,
  tags: [],
}))

function createClassmates(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `边界同学 ${index + 1}`,
    slug: `boundary-mate-${index + 1}`,
    hasPage: true,
    avatarUrl: null,
    motto: `第 ${index + 1} 位同学`,
    completion: 50,
    tags: [],
  }))
}

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

async function transitionXEndpoints(locator: any) {
  return locator.evaluate((element: Element) => {
    const values = element.getAnimations().flatMap((animation) => {
      const effect = animation.effect as KeyframeEffect | null
      return effect?.getKeyframes()
        .filter((frame) => typeof frame.transform === 'string')
        .map((frame) => new DOMMatrix(String(frame.transform)).m41) ?? []
    })
    return { min: Math.min(...values), max: Math.max(...values) }
  })
}

test.beforeEach(async ({ page }) => {
  await mockClassmateAdminEntry(page)
  await mockClassmateInboxSummary(page)
})

test('roster paginates twelve cards, resets search to the first page, and hides broken avatars', async ({ page }) => {
  await page.route('**/api/classmates**', async (route) => {
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
  await expect(page.locator('.roster-card:visible')).toHaveCount(12)
  const firstAvatar = page.locator('.roster-card:visible').first().locator('.roster-card__avatar')
  await expect(firstAvatar.locator('img')).toHaveCount(0)
  await expect(firstAvatar).toHaveText('分')

  await page.getByRole('button', { name: '第 2 页' }).click()
  await expect(page.locator('.roster-card:visible')).toHaveCount(1)
  await expect(page.getByText('分页同学 13')).toBeVisible()

  await page.getByRole('textbox', { name: '档案检索' }).fill('分页')
  const pagination = page.getByRole('navigation', { name: '人物长廊分页' })
  await expect(pagination.locator('.ui-pagination__page[aria-current="page"]')).toHaveText('1')
  await expect(page.locator('.roster-card:visible').getByText('分页同学 1', { exact: true })).toBeVisible()
})

test('roster switches whole pages horizontally without collapsing the grid or changing scroll position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/classmates**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: classmates }),
    })
  })

  await seedClassmateSession(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  const viewport = page.locator('.roster-page-viewport')
  const firstPage = page.locator('[data-roster-page="1"]')
  const pagination = page.getByRole('navigation', { name: '人物长廊分页' })
  await expect(firstPage.locator('.roster-card')).toHaveCount(12)
  await pagination.scrollIntoViewIfNeeded()

  const initialHeight = await viewport.evaluate((element) => element.getBoundingClientRect().height)
  const initialScrollY = await page.evaluate(() => window.scrollY)
  await page.getByRole('button', { name: '第 2 页' }).click()

  const secondPage = page.locator('[data-roster-page="2"]')
  await Promise.all([
    expect(firstPage).toHaveClass(/roster-page-forward-leave-active/),
    expect(secondPage).toHaveClass(/roster-page-forward-enter-active/),
  ])

  const [outgoingEndpoints, incomingEndpoints, transitionHeight] = await Promise.all([
    transitionXEndpoints(firstPage),
    transitionXEndpoints(secondPage),
    viewport.evaluate((element) => element.getBoundingClientRect().height),
  ])
  expect(outgoingEndpoints.min).toBeLessThanOrEqual(-95)
  expect(incomingEndpoints.max).toBeGreaterThanOrEqual(95)
  expect(transitionHeight).toBeGreaterThanOrEqual(initialHeight - 1)

  await expect(firstPage).toHaveCount(0)
  await expect(secondPage.locator('.roster-card')).toHaveCount(1)
  const finalHeight = await viewport.evaluate((element) => element.getBoundingClientRect().height)
  const finalScrollY = await page.evaluate(() => window.scrollY)
  expect(finalHeight).toBeGreaterThanOrEqual(initialHeight - 1)
  expect(Math.abs(finalScrollY - initialScrollY)).toBeLessThanOrEqual(2)

  await page.getByRole('button', { name: '第 1 页' }).click()
  await Promise.all([
    expect(secondPage).toHaveClass(/roster-page-backward-leave-active/),
    expect(firstPage).toHaveClass(/roster-page-backward-enter-active/),
  ])

  const [backwardOutgoingEndpoints, backwardIncomingEndpoints] = await Promise.all([
    transitionXEndpoints(secondPage),
    transitionXEndpoints(firstPage),
  ])
  expect(backwardOutgoingEndpoints.max).toBeGreaterThanOrEqual(95)
  expect(backwardIncomingEndpoints.min).toBeLessThanOrEqual(-95)
  await expect(secondPage).toHaveCount(0)
  await expect(firstPage.locator('.roster-card')).toHaveCount(12)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '第 2 页' }).click()
  await expect(secondPage).toHaveClass(/roster-page-forward-enter-active/)
  const desktopIncomingEndpoints = await transitionXEndpoints(secondPage)
  expect(desktopIncomingEndpoints.max).toBeCloseTo(280, 0)
})

test('roster only renders ellipses when pagination omits page numbers', async ({ page }) => {
  let responseClassmates = createClassmates(27)
  await page.route('**/api/classmates**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: responseClassmates }),
  }))

  await seedClassmateSession(page)

  for (const scenario of [
    { count: 27, labels: ['1', '2', '3'], ellipses: 0 },
    { count: 60, labels: ['1', '2', '3', '4', '5'], ellipses: 0 },
    { count: 72, labels: ['1', '2', '6'], ellipses: 1 },
  ]) {
    responseClassmates = createClassmates(scenario.count)
    await page.goto('./roster/', { waitUntil: 'networkidle' })

    const pagination = page.getByRole('navigation', { name: '人物长廊分页' })
    const pageButtons = pagination.locator('.ui-pagination__page')
    await expect(pageButtons.last()).toHaveText(scenario.labels.at(-1)!)
    const labels = await pageButtons.allTextContents()
    expect(labels.map((label) => label.trim())).toEqual(scenario.labels)
    expect(new Set(labels).size).toBe(labels.length)
    await expect(pagination.locator('.ui-pagination__ellipsis')).toHaveCount(scenario.ellipses)
  }
})
