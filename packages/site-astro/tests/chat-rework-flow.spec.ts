import { test, expect } from '@playwright/test'

test.describe('Class Space Group Chat Flow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // 1. 设置 session storage 以模拟已登录的同学账号
    await page.addInitScript(() => {
      sessionStorage.setItem('classmate_account_token', 'mock-classmate-token')
      sessionStorage.setItem(
        'classmate_account_student',
        JSON.stringify({
          name: '陈同学',
          slug: 'chenyuhao',
          avatarUrl: 'https://api.test/avatars/chen.png'
        })
      )
    })

    // 2. Mock 班级空间 overview 接口，包含群聊初始状态
    await page.route('**/api/class-space/overview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            chat: {
              items: [
                {
                  id: 'msg-1',
                  author: { name: '张同学', slug: 'zhang', avatarUrl: null },
                  content: '大家最近怎么样？',
                  status: 'visible',
                  replyTo: null,
                  reactionCounts: { '👍': 2 },
                  myReaction: null,
                  canRecall: false,
                  createdAt: '2026-07-10T12:00:00.000Z',
                  updatedAt: '2026-07-10T12:00:00.000Z'
                }
              ],
              cursor: 'cursor-1',
              mute: null
            },
            albums: [],
            timeline: [],
            counts: {
              groupMessages: 1,
              albums: 0,
              timelineItems: 0
            }
          }
        })
      })
    })

    // 3. Mock 消息同步接口以防轮询报错
    await page.route('**/api/group-chat/sync*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [],
            cursor: 'cursor-2',
            mute: null
          }
        })
      })
    })
  })

  test('should load group chat stage and display message wall items', async ({ page }) => {
    await page.goto('/class-space')

    // 确认群聊舞台加载完毕并正确显示初始消息
    const chatStage = page.locator('.group-chat-stage')
    await expect(chatStage).toBeVisible()

    const messageText = page.locator('.message-body')
    await expect(messageText).toHaveText('大家最近怎么样？')
  })

  test('should support sending a message with optimistic update and server replacement', async ({ page }) => {
    let requestCount = 0
    let lastRequestBody: any = null

    // Mock 发送消息 POST 接口
    await page.route('**/api/group-chat/messages', async (route) => {
      requestCount++
      const postData = route.request().postDataJSON()
      lastRequestBody = postData

      // 模拟服务端成功返回，真实 ID 替换乐观 ID
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'server-msg-id-999',
            author: { name: '陈同学', slug: 'chenyuhao', avatarUrl: 'https://api.test/avatars/chen.png' },
            content: postData.content,
            status: 'visible',
            replyTo: null,
            reactionCounts: {},
            myReaction: null,
            canRecall: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        })
      })
    })

    await page.goto('/class-space')

    // 输入框定位与发送
    const composer = page.locator('.composer-textarea')
    await composer.fill('我的第一条群聊消息！')
    
    const sendBtn = page.locator('.send-btn')
    await sendBtn.click()

    // 验证请求已被正确触发，且包含正确的 content 和 clientNonce
    await expect.poll(() => requestCount).toBe(1)
    expect(lastRequestBody.content).toBe('我的第一条群聊消息！')
    expect(lastRequestBody.clientNonce).not.toBeNull()

    // 验证消息列表已展示该发送的消息
    await expect(page.locator('.message-body').last()).toHaveText('我的第一条群聊消息！')
  })
})
