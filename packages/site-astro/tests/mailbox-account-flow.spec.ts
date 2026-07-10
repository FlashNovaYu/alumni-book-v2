import { expect, test } from '@playwright/test'

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

test.describe('Classmate Mailbox Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock 未读摘要 API
    await page.route('**/api/inbox/summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            notificationUnread: 1,
            mailUnread: 1,
            totalUnread: 2
          }
        })
      })
    })

    // Mock 同学名册 API (写信时搜索)
    await page.route('**/api/classmates', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { name: '班长', slug: 'bz', avatarUrl: null, hasPage: true, motto: '大家好' },
            { name: '李四', slug: 'lisi', avatarUrl: null, hasPage: true, motto: '你好' },
            { name: '测试同学', slug: 'test_init', avatarUrl: null, hasPage: true, motto: '我自己' }
          ]
        })
      })
    })

    // Mock 获取通知列表 API
    await page.route('**/api/notifications', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [{
              id: 'notif_1',
              type: 'system',
              title: '系统升级公告',
              body: '班级系统已升级到 V2 版本。',
              readAt: null,
              createdAt: '2026-07-06T10:00:00.000Z'
            }]
          }
        })
      })
    })

    // Mock 标记通知已读 API
    await page.route('**/api/notifications/notif_1/read', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      })
    })

    // Mock 获取邮件列表及发送邮件 API
    await page.route('**/api/mailbox/threads', async (route, request) => {
      if (request.method() === 'POST') {
        const payload = request.postDataJSON()
        expect(payload.recipientSlug).toBe('lisi')
        expect(payload.subject).toBe('写信测试标题')
        expect(payload.body).toBe('写信测试正文内容')
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: 'thread_new',
              subject: '写信测试标题',
              threadType: 'private',
              senderName: '测试同学',
              preview: '写信测试正文内容',
              unread: false,
              updatedAt: new Date().toISOString()
            }
          })
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [{
              id: 'thread_1',
              subject: '这周末同学聚会邀请',
              threadType: 'private',
              senderName: '班长',
              preview: '大家有空聚一聚吗？',
              unread: true,
              allowReply: true,
              updatedAt: '2026-07-06T12:00:00.000Z'
            }]
          }
        })
      })
    })

    // Mock 获取特定邮件会话详情 API
    await page.route('**/api/mailbox/threads/thread_1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            thread: {
              id: 'thread_1',
              subject: '这周末同学聚会邀请',
              threadType: 'private',
              allowReply: true,
              updatedAt: '2026-07-06T12:00:00.000Z'
            },
            messages: [
              {
                id: 'msg_1',
                threadId: 'thread_1',
                senderType: 'student',
                senderSlug: 'bz',
                senderName: '班长',
                body: '大家有空聚一聚吗？',
                createdAt: '2026-07-06T12:00:00.000Z'
              }
            ]
          }
        })
      })
    })

    // Mock 邮件会话回复 API
    await page.route('**/api/mailbox/threads/thread_1/messages', async (route, request) => {
      expect(request.method()).toBe('POST')
      const payload = request.postDataJSON()
      expect(payload.body).toBe('我有空，周末见')
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      })
    })
  })

  test('aggregated list displays notifications and mails', async ({ page }) => {
    await seedClassmateSession(page)
    await page.goto('./mailbox/', { waitUntil: 'networkidle' })

    // 1. 验证通知和邮件合并在列表中展示
    await expect(page.locator('.mailbox-item').filter({ hasText: '系统升级公告' })).toBeVisible()
    await expect(page.locator('.mailbox-item').filter({ hasText: '这周末同学聚会邀请' })).toBeVisible()

    // 2. 验证未读状态高亮
    await expect(page.locator('.mailbox-item.unread').filter({ hasText: '系统升级公告' })).toBeVisible()
    await expect(page.locator('.mailbox-item.unread').filter({ hasText: '这周末同学聚会邀请' })).toBeVisible()
  })

  test('selecting notification displays detail and marks it read', async ({ page }) => {
    let readCalled = false
    await page.route('**/api/notifications/notif_1/read', async (route) => {
      readCalled = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })

    await seedClassmateSession(page)
    await page.goto('./mailbox/', { waitUntil: 'networkidle' })

    // 点击通知项
    await page.locator('.mailbox-item').filter({ hasText: '系统升级公告' }).click()

    // 验证通知详情正确加载
    await expect(page.locator('.detail-title')).toHaveText('系统升级公告')
    await expect(page.locator('.notification-body')).toContainText('班级系统已升级到 V2 版本')

    // 验证调用了标记已读 API
    expect(readCalled).toBe(true)
  })

  test('selecting mail displays detail and allows replying', async ({ page }) => {
    let detailLoaded = false
    await page.route('**/api/mailbox/threads/thread_1', async (route) => {
      detailLoaded = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            thread: { id: 'thread_1', subject: '这周末同学聚会邀请', threadType: 'private', allowReply: true, updatedAt: '2026-07-06T12:00:00.000Z' },
            messages: [{ id: 'msg_1', threadId: 'thread_1', senderType: 'student', senderSlug: 'bz', senderName: '班长', body: '大家有空聚一聚吗？', createdAt: '2026-07-06T12:00:00.000Z' }]
          }
        })
      })
    })

    let replySuccess = false
    await page.route('**/api/mailbox/threads/thread_1/messages', async (route) => {
      replySuccess = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    })

    await seedClassmateSession(page)
    await page.goto('./mailbox/', { waitUntil: 'networkidle' })

    // 点击邮件项
    await page.locator('.mailbox-item').filter({ hasText: '这周末同学聚会邀请' }).click()

    // 验证详情被加载
    expect(detailLoaded).toBe(true)
    await expect(page.locator('.detail-title')).toHaveText('这周末同学聚会邀请')
    await expect(page.locator('.message-body')).toContainText('大家有空聚一聚吗？')

    // 验证回复框已显示
    const textarea = page.locator('.reply-textarea')
    await expect(textarea).toBeVisible()

    // 写入回复并发送
    await textarea.fill('我有空，周末见')
    await page.locator('.btn-reply-submit').click()

    // 验证回复 API 被成功调用且文本框被清空
    expect(replySuccess).toBe(true)
    await expect(textarea).toHaveValue('')
  })

  test('can search recipient and compose a new mail', async ({ page }) => {
    let mailSent = false
    await page.route('**/api/mailbox/threads', async (route, request) => {
      if (request.method() === 'POST') {
        const data = request.postDataJSON()
        expect(data.recipientSlug).toBe('lisi')
        expect(data.subject).toBe('写信测试标题')
        expect(data.body).toBe('写信测试正文内容')
        mailSent = true
        
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: {} })
        })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { items: [] } }) })
    })

    await seedClassmateSession(page)
    await page.goto('./mailbox/', { waitUntil: 'networkidle' })

    // 切换到“写信”模式
    await page.getByRole('button', { name: '写信', exact: true }).click()

    // 搜索同学名册并选择收件人
    const pickerInput = page.getByPlaceholder('搜索收件人姓名或拼音...')
    await expect(pickerInput).toBeVisible()
    
    await pickerInput.fill('李')
    
    // 选择过滤出的收件人
    const classmateItem = page.locator('.dropdown-item').filter({ hasText: '李四' })
    await expect(classmateItem).toBeVisible()
    await classmateItem.click()

    // 验证已选中收件人卡片
    await expect(page.locator('.selected-recipient-card')).toContainText('李四')

    // 填充标题和正文
    await page.getByPlaceholder('给信件起个标题吧...').fill('写信测试标题')
    await page.getByPlaceholder('把想说的话写在这张信纸上...').fill('写信测试正文内容')

    // 提交
    await page.getByRole('button', { name: '寄出信件' }).click()

    // 验证发送成功
    expect(mailSent).toBe(true)
  })
})

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
