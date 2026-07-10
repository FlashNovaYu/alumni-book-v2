import { expect, test } from '@playwright/test'

async function seedClassmateSession(page: any) {
  // 必须先访问一个页面来初始化 sessionStorage 的 origin 上下文
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({
      name: '测试同学',
      slug: 'test_init',
      avatarUrl: null,
    }))
  })
}

const mockOverviewData = {
  success: true,
  data: {
    messages: [
      {
        id: 'msg-1',
        authorSlug: 'zhangsan',
        authorName: '张三',
        content: '张三的精美留言',
        cardStyle: 'paper',
        status: 'approved',
        reactions: { '❤️': 2 },
        createdAt: '2026-07-10T12:00:00.000Z'
      },
      {
        id: 'msg-2',
        authorSlug: 'lisi',
        authorName: '李四',
        content: '李四的黑板便签',
        cardStyle: 'chalkboard',
        status: 'approved',
        reactions: { '👍': 1 },
        createdAt: '2026-07-10T12:01:00.000Z'
      }
    ],
    albums: [
      {
        id: 'album-1',
        title: '青春毕业照',
        coverR2Key: 'photos/cover.jpg',
        photoCount: 15,
        tags: ['回忆', '毕业']
      }
    ],
    timeline: [
      {
        id: 'tl-1',
        type: 'event',
        title: '班级空间大事件',
        description: '今日班级空间系统正式上线啦！',
        date: '2026-07-10'
      }
    ],
    counts: {
      approvedMessages: 2,
      albums: 1,
      timelineItems: 1
    }
  }
}

test.describe('Class Space Flow', () => {
  test('unauthenticated user is redirected back to homepage', async ({ page }) => {
    await page.goto('./class-space/')
    // 未登录时会被重定向守卫重定向回首页
    await expect(page).toHaveURL(/\/$/)
  })

  test('authenticated user can load class space and view all preview segments', async ({ page }) => {
    // 拦截班级空间 overview 请求
    await page.route('**/api/class-space/overview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockOverviewData),
      })
    })

    await seedClassmateSession(page)
    await page.goto('./class-space/', { waitUntil: 'networkidle' })

    // 验证页面基本元素
    await expect(page.getByRole('heading', { name: '班级空间', exact: true })).toBeVisible()
    
    // 验证侧边导航
    await expect(page.locator('.sidebar-nav-card')).toBeVisible()
    await expect(page.getByRole('link', { name: /留言/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /影像/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /时间/ })).toBeVisible()

    // 验证留言卡片内容
    await expect(page.getByText('张三的精美留言')).toBeVisible()
    await expect(page.getByText('李四的黑板便签')).toBeVisible()

    // 验证相册轨道
    await expect(page.getByText('青春毕业照')).toBeVisible()
    await expect(page.getByText('15 张')).toBeVisible()
    // 链接带有 #album-
    const albumLink = page.locator('a.album-rail-card')
    await expect(albumLink).toHaveAttribute('href', '/album#album-album-1')

    // 验证时间轴预览
    await expect(page.getByText('班级空间大事件')).toBeVisible()
    await expect(page.getByText('今日班级空间系统正式上线啦！')).toBeVisible()
    await expect(page.locator('time')).toContainText('2026年7月10日')
  })

  test('mobile layout displays without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    
    await page.route('**/api/class-space/overview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockOverviewData),
      })
    })

    await seedClassmateSession(page)
    await page.goto('./class-space/', { waitUntil: 'networkidle' })

    // 断言移动端没有出现页面横向溢出
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)

    // 验证移动端下，侧边栏变为顶部水平导航，没有了标题
    await expect(page.locator('.nav-title')).toBeHidden()
  })

  test('error state and retry button functionality', async ({ page }) => {
    let callCount = 0
    await page.route('**/api/class-space/overview', async (route) => {
      callCount++
      if (callCount === 1) {
        // 第一回请求失败，进入错误态
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: '服务器开小差了' }),
        })
      } else {
        // 第二回成功
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockOverviewData),
        })
      }
    })

    await seedClassmateSession(page)
    await page.goto('./class-space/', { waitUntil: 'networkidle' })

    // 第一回应该显示错误卡片和重试按钮
    await expect(page.locator('.hub-error')).toBeVisible()
    await expect(page.getByText('服务器开小差了')).toBeVisible()
    
    const retryBtn = page.locator('.retry-btn')
    await expect(retryBtn).toBeVisible()

    // 点击重试
    await retryBtn.click()

    // 应该重新加载并加载成功，展示数据
    await expect(page.locator('.hub-error')).toBeHidden()
    await expect(page.getByText('张三的精美留言')).toBeVisible()
  })
})
