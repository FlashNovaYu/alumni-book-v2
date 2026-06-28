import { test, expect } from '@playwright/test'

// 1. 首页测试：不加载 GSAP, ScrollTrigger, ClassGraphPreview, SeatMapPreview
test('home page does not request GSAP, ScrollTrigger, ClassGraphPreview, or SeatMapPreview', async ({ page }) => {
  const requests: string[] = []
  page.on('request', req => requests.push(req.url()))

  await page.goto('/', { waitUntil: 'networkidle' })

  const forbidden = ['scrolltrigger', 'gsap', 'classgraphpreview', 'seatmappreview']
  for (const token of forbidden) {
    const hasToken = requests.some(url => url.toLowerCase().includes(token) && (url.endsWith('.js') || url.includes('.js?')))
    expect(hasToken, `Home page should not load ${token}`).toBe(false)
  }
})

// 2. 时间轴页测试：不加载 GSAP, ScrollTrigger, ClassGraphPreview, SeatMapPreview
test('timeline page does not load GSAP, ScrollTrigger, ClassGraphPreview, or SeatMapPreview on initial load', async ({ page }) => {
  const requests: string[] = []
  page.on('request', req => requests.push(req.url()))

  // 先访问首页确立同源 origin，写入会话，避开重定向门控
  await page.goto('/')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_name', '测试同学')
  })

  await page.goto('/timeline/', { waitUntil: 'networkidle' })

  const forbidden = ['scrolltrigger', 'gsap', 'classgraphpreview', 'seatmappreview']
  for (const token of forbidden) {
    const hasToken = requests.some(url => url.toLowerCase().includes(token) && (url.endsWith('.js') || url.includes('.js?')))
    expect(hasToken, `Timeline page should not load ${token}`).toBe(false)
  }
})

// 3. 人物长廊页测试：初始不加载 ClassGraphPreview 和 SeatMapPreview，滚动后加载它们，且始终不加载 GSAP/ScrollTrigger
test('roster page: lazy loads ClassGraphPreview and SeatMapPreview on scroll, and never loads GSAP/ScrollTrigger', async ({ page }) => {
  const requests: string[] = []
  page.on('request', req => requests.push(req.url()))

  // 先访问首页确立同源 origin，写入会话，避开重定向门控
  await page.goto('/')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_name', '测试同学')
  })

  // 1. 访问人物长廊页，等待网络稳定（首屏加载完毕）
  await page.goto('/roster/', { waitUntil: 'networkidle' })

  // 2. 验证初始状态不包含 ClassGraphPreview 和 SeatMapPreview 以及 GSAP/ScrollTrigger
  const forbiddenInitial = ['scrolltrigger', 'gsap', 'classgraphpreview', 'seatmappreview']
  for (const token of forbiddenInitial) {
    const hasToken = requests.some(url => url.toLowerCase().includes(token) && (url.endsWith('.js') || url.includes('.js?')))
    expect(hasToken, `Roster page initially should not load ${token}`).toBe(false)
  }

  // 3. 滚动到底部以触发 client:visible
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const lazyHighlights = page.locator('.lazy-highlights')
  await lazyHighlights.scrollIntoViewIfNeeded()

  // 4. 等待片刻让动态导入的脚本加载
  await page.waitForTimeout(2000)

  // 5. 验证滚动后，ClassGraphPreview 和 SeatMapPreview 被成功加载
  const hasClassGraph = requests.some(url => url.toLowerCase().includes('classgraphpreview') && (url.endsWith('.js') || url.includes('.js?')))
  const hasSeatMap = requests.some(url => url.toLowerCase().includes('seatmappreview') && (url.endsWith('.js') || url.includes('.js?')))
  expect(hasClassGraph, 'Roster page should load ClassGraphPreview after scrolling').toBe(true)
  expect(hasSeatMap, 'Roster page should load SeatMapPreview after scrolling').toBe(true)

  // 验证 GSAP / ScrollTrigger 还是没有被加载
  const hasScrollTrigger = requests.some(url => url.toLowerCase().includes('scrolltrigger') && (url.endsWith('.js') || url.includes('.js?')))
  const hasGsap = requests.some(url => url.toLowerCase().includes('gsap') && (url.endsWith('.js') || url.includes('.js?')))
  expect(hasScrollTrigger, 'Roster page should never load ScrollTrigger').toBe(false)
  expect(hasGsap, 'Roster page should never load GSAP').toBe(false)
})

// 4. 学生详情页：网络和加载生命周期断言
test('student page: loads PhotoWall, MessageWall, ClassGraphPreview, SeatMapPreview dynamically and on-demand', async ({ page }) => {
  const requests: string[] = []
  page.on('request', req => {
    requests.push(req.url())
  })

  // 先访问首页确立同源 origin，写入会话，避开重定向门控
  await page.goto('/')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_name', '测试同学')
  })

  // 1. 访问学生详情页（用 template），等待网络稳定，但首屏不应该触发下半部分延迟加载的组件
  await page.goto('/student/template/', { waitUntil: 'networkidle' })

  // 2. 检查初始状态：绝对不请求 PhotoWall, MessageWall, ClassGraphPreview, SeatMapPreview
  const forbiddenInitial = ['photowall', 'messagewall', 'classgraphpreview', 'seatmappreview']
  for (const token of forbiddenInitial) {
    const hasToken = requests.some(url => url.toLowerCase().includes(token) && (url.endsWith('.js') || url.includes('.js?')))
    expect(hasToken, `Student page initially should not load component: ${token}`).toBe(false)
  }

  // 3. 滚动到 PhotoWall 区域触发加载
  const photoWallAnchor = page.locator('#photo-wall-anchor')
  await photoWallAnchor.scrollIntoViewIfNeeded()
  await page.waitForTimeout(2000)
  
  const hasPhotoWall = requests.some(url => url.toLowerCase().includes('photowall') && (url.endsWith('.js') || url.includes('.js?')))
  expect(hasPhotoWall, 'Student page should load PhotoWall after scrolling to it').toBe(true)

  // 此时 MessageWall 和亮点图依然不应被加载
  const hasMessageWallBefore = requests.some(url => url.toLowerCase().includes('messagewall') && (url.endsWith('.js') || url.includes('.js?')))
  expect(hasMessageWallBefore, 'Student page should not load MessageWall before scrolling to it').toBe(false)

  // 4. 滚动到 MessageWall 区域触发加载
  const messageWallAnchor = page.locator('#message-wall-anchor')
  await messageWallAnchor.scrollIntoViewIfNeeded()
  await page.waitForTimeout(2000)

  const hasMessageWall = requests.some(url => url.toLowerCase().includes('messagewall') && (url.endsWith('.js') || url.includes('.js?')))
  expect(hasMessageWall, 'Student page should load MessageWall after scrolling to it').toBe(true)

  // 此时亮点图依然不应被加载
  const hasClassGraphBefore = requests.some(url => url.toLowerCase().includes('classgraphpreview') && (url.endsWith('.js') || url.includes('.js?')))
  expect(hasClassGraphBefore, 'Student page should not load ClassGraphPreview before scrolling to it').toBe(false)

  // 5. 滚动到 Highlights 区域触发加载
  const highlightsAnchor = page.locator('#highlights-anchor')
  await highlightsAnchor.scrollIntoViewIfNeeded()
  await page.waitForTimeout(2000)

  const hasClassGraph = requests.some(url => url.toLowerCase().includes('classgraphpreview') && (url.endsWith('.js') || url.includes('.js?')))
  const hasSeatMap = requests.some(url => url.toLowerCase().includes('seatmappreview') && (url.endsWith('.js') || url.includes('.js?')))
  expect(hasClassGraph, 'Student page should load ClassGraphPreview after scrolling to it').toBe(true)
  expect(hasSeatMap, 'Student page should load SeatMapPreview after scrolling to it').toBe(true)
})
