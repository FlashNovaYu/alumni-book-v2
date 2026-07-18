// packages/site-astro/tests/classmate-login-flow.spec.ts
// CCSwitch: Playwright 端到端测试，验证首次登录强制改密流程。

import { test, expect } from '@playwright/test'
import { mockClassmateAdminEntry, mockClassmateInboxSummary } from './classmate-session-mocks'

test('first login requires changing the initial password before entering preface', async ({ page }) => {
  await page.route('**/api/classmates**', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [{ name: '测试同学', slug: 'test_init', hasPage: true }] }),
    })
  })
  await page.route('**/api/classmate-auth/login', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          token: 'token-first-login',
          mustChangePassword: true,
          student: { name: '测试同学', slug: 'test_init', avatarUrl: null },
        },
      }),
    })
  })
  await page.route('**/api/classmate-auth/change-password', async route => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })
  await mockClassmateAdminEntry(page)
  await mockClassmateInboxSummary(page)

  const visitorPassRequests: string[] = []
  page.on('request', (request) => {
    if (/VisitorPass/i.test(request.url())) visitorPassRequests.push(request.url())
  })

  await page.goto('./', { waitUntil: 'networkidle' })
  expect(visitorPassRequests).toHaveLength(0)
  const visitorPassLoaded = page.waitForRequest((request) => /VisitorPass/i.test(request.url()))
  await page.getByTestId('home-login-cta').click()
  await visitorPassLoaded
  await expect(page.locator('astro-island[component-url*="VisitorPass"]')).not.toHaveAttribute('ssr', '')
  
  // 输入同学姓名
  const username = page.locator('#username-input')
  await expect(username).toBeEditable()
  await username.fill('测试同学')
  
  // 输入初始密码并点击登录
  await page.locator('#password-input').fill('123456')
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/classmate-auth/login') && response.ok()),
    page.click('.login-btn'),
  ])
  
  // 检查是否显示强制改密弹窗
  const modal = page.locator('.change-password-modal')
  await expect(modal).toBeVisible()
  
  // 填写新密码并提交
  await page.locator('#new-password').fill('new-pass-123')
  await page.locator('#confirm-password').fill('new-pass-123')
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/classmate-auth/change-password') && response.ok()),
    page.click('.change-password-btn'),
  ])
  
  // 校验是否跳转至前言页面
  await expect(page).toHaveURL(/\/preface/, { timeout: 15000 })
})
