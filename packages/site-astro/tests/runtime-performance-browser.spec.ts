import { expect, test, type Page } from '@playwright/test'
import { mockClassmateAdminEntry, mockClassmateInboxSummary } from './classmate-session-mocks'

test.describe('公开站点真实浏览器性能预算', () => {
  async function throttle(page: Page) {
    const client = await page.context().newCDPSession(page)
    await client.send('Network.enable')
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 80,
      downloadThroughput: Math.floor(4 * 1024 * 1024 / 8),
      uploadThroughput: Math.floor(1 * 1024 * 1024 / 8),
    })
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }

  async function installMetrics(page: Page) {
    await page.addInitScript(() => {
      const longTasks: Array<{ duration: number; startTime: number }> = []
      const runtimeWindow = window as Window & { __alumniLongTasks?: Array<{ duration: number; startTime: number }>; __alumniPageShowPersisted?: boolean[] }
      runtimeWindow.__alumniLongTasks = longTasks
      runtimeWindow.__alumniPageShowPersisted = []
      window.addEventListener('pageshow', (event) => runtimeWindow.__alumniPageShowPersisted?.push(event.persisted))
      if ('PerformanceObserver' in window) {
        new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => longTasks.push({ duration: entry.duration, startTime: entry.startTime }))
        }).observe({ type: 'longtask', buffered: true })
      }
    })
  }

  async function waitInteractive(page: Page) {
    await page.waitForLoadState('load')
    await page.waitForFunction(() => document.readyState === 'complete')
    await page.waitForSelector('[data-nav-directory][data-nav-ready="true"]', { state: 'attached' })
  }

  async function waitNavigationInteractive(page: Page) {
    await page.waitForSelector('[data-nav-directory][data-nav-ready="true"]', { state: 'attached' })
    await page.waitForLoadState('domcontentloaded')
  }

  test('静态首页不加载 Vue runtime，低端 CPU 首屏 TBT 保持在 600ms 内', async ({ page }) => {
    await throttle(page)
    await installMetrics(page)
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    await page.goto('./', { waitUntil: 'networkidle' })
    await waitInteractive(page)
    expect(requests.some((url) => /VisitorPass|vue|client\.[^/]+\.js/i.test(url))).toBe(false)
    const longTasks = await page.evaluate(() => (window as Window & { __alumniLongTasks?: Array<{ duration: number; startTime: number }> }).__alumniLongTasks || [])
    const tbt = longTasks.reduce((total, entry) => total + Math.max(0, entry.duration - 50), 0)
    expect(tbt, JSON.stringify(longTasks)).toBeLessThan(600)
    const visitorPassRequest = page.waitForRequest((request) => /VisitorPass/i.test(request.url()))
    await page.locator('#login').scrollIntoViewIfNeeded()
    await visitorPassRequest
  })

  test('名册和年度册导航保持可交互且切换时间在预算内', async ({ page }) => {
    await throttle(page)
    await installMetrics(page)
    await mockClassmateAdminEntry(page)
    await mockClassmateInboxSummary(page)
    await page.route('**/api/auth/verify', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) }))
    await page.goto('./', { waitUntil: 'load' })
    await page.evaluate(() => {
      sessionStorage.setItem('classmate_account_token', 'performance-token')
      sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '性能测试', slug: 'performance' }))
      sessionStorage.setItem('admin_token', 'performance-admin')
    })
    await page.goto('./roster/', { waitUntil: 'load' })
    await waitNavigationInteractive(page)
    await page.waitForFunction(() => Boolean((window as Window & { __alumniNavRuntime?: unknown }).__alumniNavRuntime))
    const yearbookLink = page.locator('[data-nav-item][href$="/yearbook/"]')
    await yearbookLink.hover()
    await expect(page.locator('link[rel="prefetch"][href$="/yearbook/"]')).toHaveCount(1)
    await page.waitForTimeout(300)
    const rosterStart = Date.now()
    await page.evaluate(() => document.querySelector<HTMLAnchorElement>('[data-nav-item][href$="/yearbook/"]')?.click())
    await page.waitForURL(/\/yearbook\/?$/, { waitUntil: 'commit' })
    await waitNavigationInteractive(page)
    expect(Date.now() - rosterStart).toBeLessThan(1200)
    await page.waitForLoadState('load')
    const yearbookStart = Date.now()
    await page.goBack({ waitUntil: 'commit' })
    await expect(page).toHaveURL(/\/roster\/?$/)
    await waitNavigationInteractive(page)
    expect(Date.now() - yearbookStart).toBeLessThan(700)
    await page.waitForLoadState('load')
  })

  test('同页登录锚点不会启动跨文档进度线', async ({ page }) => {
    await page.goto('./', { waitUntil: 'networkidle' })
    await page.getByTestId('home-login-cta').click()
    await expect(page).toHaveURL(/#login$/)
    await expect(page.locator('html')).not.toHaveClass(/is-navigating/)
  })

  test('悬停不会创建音频上下文，只有点击开启音效才会创建', async ({ page }) => {
    await page.addInitScript(() => {
      const NativeAudioContext = window.AudioContext
      ;(window as Window & { __audioContextCreations?: number }).__audioContextCreations = 0
      if (NativeAudioContext) {
        window.AudioContext = class extends NativeAudioContext {
          constructor(options?: AudioContextOptions) {
            super(options)
            ;(window as Window & { __audioContextCreations?: number }).__audioContextCreations! += 1
          }
        }
      }
    })
    const audioRequests: string[] = []
    page.on('request', (request) => {
      if (/\/audio\/ui\//i.test(request.url())) audioRequests.push(request.url())
    })
    await page.goto('./', { waitUntil: 'networkidle' })
    const volume = page.locator('[data-volume-toggle]')
    await volume.hover()
    expect(await page.evaluate(() => (window as Window & { __audioContextCreations?: number }).__audioContextCreations)).toBe(0)
    expect(audioRequests).toHaveLength(0)
    await volume.click()
    await volume.click()
    expect(await page.evaluate(() => (window as Window & { __audioContextCreations?: number }).__audioContextCreations)).toBe(1)
    await page.mouse.move(0, 0)
    await volume.hover()
    await page.waitForTimeout(250)
    expect(audioRequests.length).toBeLessThanOrEqual(3)

    for (let index = 0; index < 10; index += 1) {
      await page.mouse.move(0, 0)
      await volume.hover()
    }
    await page.waitForTimeout(250)
    expect(audioRequests.length).toBeLessThanOrEqual(3)
    expect(await page.evaluate(() => (window as Window & { __audioContextCreations?: number }).__audioContextCreations)).toBe(1)
  })
})
