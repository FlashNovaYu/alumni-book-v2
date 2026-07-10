import { test, expect } from '@playwright/test'

async function seedClassmateSession(page: any) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({
      name: '测试同学',
      slug: 'test_init',
      avatarUrl: null,
    }))
    sessionStorage.setItem('classmate_name', '测试同学')
  })
}

test.describe('Classmate Account Center Flow', () => {
  test('redirects to homepage if not logged in', async ({ page }) => {
    await page.goto('./account/')
    await expect(page).toHaveURL(/\/$/, { timeout: 10000 })
  })

  test('renders user info and allows password change', async ({ page }) => {
    // Mock change-password api
    let changePasswordCalled = false
    await page.route('**/api/classmate-auth/change-password', async route => {
      changePasswordCalled = true
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    await seedClassmateSession(page)
    await page.goto('./account/', { waitUntil: 'networkidle' })

    // 验证当前登录姓名
    await expect(page.locator('.user-name')).toHaveText('测试同学')

    // 测试新密码短于 8 位
    await page.locator('#old-password').fill('123456')
    await page.locator('#new-password').fill('123')
    await page.locator('#confirm-password').fill('123')
    await page.click('button[type="submit"]')
    await expect(page.locator('.error-msg')).toContainText('新密码长度不能少于 8 位')

    // 测试新密码不一致
    await page.locator('#new-password').fill('new-password-123')
    await page.locator('#confirm-password').fill('new-password-456')
    await page.click('button[type="submit"]')
    await expect(page.locator('.error-msg')).toContainText('两次输入的新密码不一致')

    // 正确修改密码
    await page.locator('#new-password').fill('new-password-123')
    await page.locator('#confirm-password').fill('new-password-123')
    await page.click('button[type="submit"]')
    await expect(page.locator('.success-msg')).toContainText('密码修改成功')
    expect(changePasswordCalled).toBe(true)
  })

  test('supports logout', async ({ page }) => {
    let logoutCalled = false
    await page.route('**/api/classmate-auth/logout', async route => {
      logoutCalled = true
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    await seedClassmateSession(page)
    await page.goto('./account/', { waitUntil: 'networkidle' })

    // 触发登出
    page.on('dialog', async dialog => {
      await dialog.accept()
    })
    await page.click('.logout-section button')

    await expect(page).toHaveURL(/\/$/, { timeout: 10000 })
    expect(logoutCalled).toBe(true)

    // 检查 sessionStorage 是否被清空
    const token = await page.evaluate(() => sessionStorage.getItem('classmate_account_token'))
    expect(token).toBeNull()
  })

  test('navigates to student page and triggers edit dialog via query params', async ({ page }) => {
    // Mock student profile fetch
    await page.route('**/api/students/test_init', async route => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            name: '测试同学',
            slug: 'test_init',
            avatarUrl: null,
            backgroundUrl: null,
            info: { visibility: {} },
          },
        }),
      })
    })

    await seedClassmateSession(page)
    await page.goto('./account/', { waitUntil: 'networkidle' })

    // 点击“编辑个人资料”
    await page.click('a[href*="edit=1"]')

    // 验证是否跳转到学生主页且包含 edit=1
    await expect(page).toHaveURL(/\/student\/test_init\/\?edit=1/)

    // 验证编辑弹窗已自动唤起
    const editor = page.locator('.editor-overlay')
    await expect(editor).toBeVisible()

    // 验证关闭编辑弹窗后 URL 清除了 edit=1 参数
    await page.click('.editor-close')
    await expect(page).toHaveURL(/\/student\/test_init\/$/)
  })
})
