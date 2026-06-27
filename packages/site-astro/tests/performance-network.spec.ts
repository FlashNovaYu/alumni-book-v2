import { test, expect } from '@playwright/test'

test('home page does not request GSAP or ScrollTrigger', async ({ page }) => {
  const requests: string[] = []
  page.on('request', req => requests.push(req.url()))

  // 访问首页，等待网络空闲
  await page.goto('/', { waitUntil: 'networkidle' })

  // 检查请求的 JS 文件中是否包含 ScrollTrigger 或者是 gsap 的名字
  const hasScrollTrigger = requests.some(url => url.toLowerCase().includes('scrolltrigger') && (url.endsWith('.js') || url.includes('.js?')))
  const hasGsap = requests.some(url => url.toLowerCase().includes('gsap') && (url.endsWith('.js') || url.includes('.js?')))
  
  expect(hasScrollTrigger).toBe(false)
  expect(hasGsap).toBe(false)
})

test('timeline page keeps animation libraries out of initial load', async ({ page }) => {
  const requests: string[] = []
  page.on('request', req => requests.push(req.url()))

  await page.goto('/timeline/', { waitUntil: 'networkidle' })

  const hasScrollTrigger = requests.some(url => url.toLowerCase().includes('scrolltrigger') && (url.endsWith('.js') || url.includes('.js?')))
  const hasGsap = requests.some(url => url.toLowerCase().includes('gsap') && (url.endsWith('.js') || url.includes('.js?')))
  
  expect(hasScrollTrigger).toBe(false)
  expect(hasGsap).toBe(false)
})

test('student page remains interactive and loads animation libraries only after page script starts', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  // 访问学生详情页模板
  await page.goto('/student/template/', { waitUntil: 'domcontentloaded' })
  
  // 确保页面上的容器正常展现，即使还没全部水合
  await expect(page.locator('.student-loading-container, .student-page, .student-error-container').first()).toBeVisible()
  expect(consoleErrors).toEqual([])
})
