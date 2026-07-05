// packages/site-astro/tests/classmate-login-flow.spec.ts
// CCSwitch: Playwright 端到端测试，验证首次登录强制改密流程。

import { test, expect } from '@playwright/test'

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

  await page.goto('/')
  
  // 输入同学姓名
  await page.locator('#username-input').fill('测试同学')
  
  // 输入初始密码并点击登录
  await page.locator('#password-input').fill('123456')
  await page.click('.login-btn')
  
  // 检查是否显示强制改密弹窗
  const modal = page.locator('.change-password-modal')
  await expect(modal).toBeVisible()
  
  // 填写新密码并提交
  await page.locator('#new-password').fill('new-pass-123')
  await page.locator('#confirm-password').fill('new-pass-123')
  await page.click('.change-password-btn')
  
  // 校验是否跳转至前言页面
  await expect(page).toHaveURL(/\/preface/, { timeout: 15000 })
})
