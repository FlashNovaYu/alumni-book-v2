import { expect, test, type Page } from '@playwright/test'

test.describe('公开站点真实浏览器性能预算', () => {
  async function throttle(page: Page) {
    const client = await page.context().newCDPSession(page)
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  }

  test('静态首页不加载 Vue runtime，低端 CPU 首屏 TBT 保持在 600ms 内', async ({ page }) => {
    await throttle(page)
    await page.goto('./', { waitUntil: 'networkidle' })
    const scripts = await page.locator('script[src], script[component-url]').evaluateAll((elements) => elements.map((element) => element.getAttribute('src') || element.getAttribute('component-url') || ''))
    expect(scripts.join('\n')).not.toContain('vue')
    expect(scripts.join('\n')).not.toContain('astro:transitions')
    const tbt = await page.evaluate(() => {
      const entries = performance.getEntriesByType('longtask') as PerformanceEntry[]
      return entries.reduce((total, entry) => total + Math.max(0, entry.duration - 50), 0)
    })
    expect(tbt).toBeLessThan(600)
  })

  test('名册和年度册导航保持可交互且切换时间在预算内', async ({ page }) => {
    await throttle(page)
    await page.goto('./')
    await page.evaluate(() => {
      sessionStorage.setItem('classmate_account_token', 'performance-token')
      sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '性能测试', slug: 'performance' }))
    })
    await page.goto('./roster/', { waitUntil: 'networkidle' })
    const rosterStart = Date.now()
    await page.evaluate(() => document.querySelector<HTMLAnchorElement>('a[href$="/yearbook"]')?.click())
    await page.waitForURL(/\/yearbook\/?$/)
    expect(Date.now() - rosterStart).toBeLessThan(1200)
    const yearbookStart = Date.now()
    await page.evaluate(() => document.querySelector<HTMLAnchorElement>('a[href$="/roster"]')?.click())
    await page.waitForURL(/\/roster\/?$/)
    expect(Date.now() - yearbookStart).toBeLessThan(700)
  })
})
