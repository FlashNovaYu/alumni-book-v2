import { expect, test } from '@playwright/test'
import { mockClassmateAdminEntry, mockClassmateInboxSummary } from './classmate-session-mocks'

async function seedClassmateSession(page: import('@playwright/test').Page) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({
      name: '测试同学',
      slug: 'template',
      avatarUrl: null,
    }))
    sessionStorage.setItem('classmate_name', '测试同学')
  })
}

test.beforeEach(async ({ page }) => {
  await mockClassmateAdminEntry(page)
  await mockClassmateInboxSummary(page)
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`${viewport.width}px 档案墙保持单列且没有横向溢出`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await seedClassmateSession(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })

    const columns = await page.locator('.roster-grid').first().evaluate((grid) =>
      getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
    )
    expect(columns).toBe(1)

    const viewportWidth = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(viewportWidth.scrollWidth).toBeLessThanOrEqual(viewportWidth.clientWidth)
  })
}

test('方向事件不可用时显示触摸降级并由触摸位置驱动光影', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Object.defineProperty(window, 'DeviceOrientationEvent', {
      configurable: true,
      value: undefined,
    })
  })
  await seedClassmateSession(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: '开启 3D 光影' }).click()
  await expect(page.getByRole('status')).toHaveText('当前使用触摸光影')
  await expect(page.getByText('陀螺仪光影已开启', { exact: true })).toHaveCount(0)

  const card = page.locator('.roster-card').first()
  const glare = card.locator('.glare-layer')
  const box = await card.boundingBox()
  expect(box).not.toBeNull()

  await card.dispatchEvent('pointermove', {
    pointerType: 'touch',
    clientX: box!.x + box!.width * 0.2,
    clientY: box!.y + box!.height * 0.75,
  })

  await expect(glare).toHaveCSS('opacity', '1')
  const glarePosition = await card.evaluate((element) => ({
    x: element.style.getPropertyValue('--glare-x'),
    y: element.style.getPropertyValue('--glare-y'),
  }))
  expect(Number.parseFloat(glarePosition.x)).toBeCloseTo(20, 0)
  expect(Number.parseFloat(glarePosition.y)).toBeCloseTo(75, 0)
})

test('首页在用户授权后将设备倾斜同步给星空与入口牵引变量', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    class DeviceOrientationEventStub extends Event {
      static async requestPermission() { return 'granted' as const }
    }
    Object.defineProperty(window, 'DeviceOrientationEvent', {
      configurable: true,
      value: DeviceOrientationEventStub,
    })
  })

  await page.goto('./', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '开启沉浸光影' }).click()
  await expect(page.getByRole('status')).toContainText('沉浸光影已开启')

  await page.evaluate(() => {
    const event = new Event('deviceorientation')
    Object.defineProperties(event, {
      beta: { value: 18 },
      gamma: { value: 20 },
    })
    window.dispatchEvent(event)
  })

  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--ambient-tilt-x')))
    .not.toBe('0px')
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--ambient-hero-x')))
    .not.toBe('0px')
})
