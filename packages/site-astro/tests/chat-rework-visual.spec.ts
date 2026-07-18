import { expect, test } from '@playwright/test'
import { mockClassmateAdminEntry, mockClassmateInboxSummary } from './classmate-session-mocks'

const overview = {
  success: true,
  data: {
    chat: {
      items: [{
        id: 'visual-chat-1',
        author: { name: '班长', slug: 'monitor', avatarUrl: null },
        content: '这里是班级群聊的第一条消息。',
        status: 'visible',
        replyTo: null,
        reactionCounts: {},
        myReaction: null,
        canRecall: false,
        createdAt: '2026-07-10T08:00:00.000Z',
        updatedAt: '2026-07-10T08:00:00.000Z',
      }],
      cursor: 'visual-cursor',
      mute: null,
    },
    albums: [
      { id: 'album-visual-1', title: '毕业那天', coverR2Key: null, photoCount: 18, tags: ['毕业', '操场'] },
      { id: 'album-visual-2', title: '运动会', coverR2Key: null, photoCount: 9, tags: ['热烈'] },
    ],
    timeline: [
      { id: 'timeline-3', type: 'photo', title: '毕业合影', description: '把最后一次集体合影留在这里。', date: '2026-07-03' },
      { id: 'timeline-1', type: 'event', title: '初见', description: '我们在九月的教室里相遇。', date: '2023-09-01' },
      { id: 'timeline-2', type: 'message', title: '春游', description: '一起走过湖边的午后。', date: '2025-04-18' },
    ],
    counts: { groupMessages: 1, albums: 2, timelineItems: 3 },
  },
}

async function seedClassmateSession(page: any) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学', slug: 'test_init', avatarUrl: null }))
  })
}

test.beforeEach(async ({ page }) => {
  await mockClassmateAdminEntry(page)
  await mockClassmateInboxSummary(page)
})

test('班级空间在三种视口保持分区结构、纵向时间线和无页面横向溢出', async ({ page }) => {
  await page.route('**/api/class-space/overview', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(overview),
  }))

  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ]

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await seedClassmateSession(page)
    await page.goto('./class-space/', { waitUntil: 'networkidle' })

    const sectionNav = page.locator('.class-space-section-nav')
    await expect(sectionNav).toBeVisible()
    await expect(page.locator('.timeline-rail')).toBeVisible()
    await expect(page.locator('.album-rail-card')).toHaveCount(2)
    await expect(page.locator('.timeline-rail-card')).toHaveCount(3)
    await expect(page.locator('.timeline-rail-card').first()).toContainText('毕业合影')

    const layout = await page.evaluate(() => {
      const widthOf = (selector: string) => Math.round(document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().width || 0)
      const inspect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element) return null
        const style = getComputedStyle(element)
        return `${selector}[width=${Math.round(element.getBoundingClientRect().width)},scroll=${element.scrollWidth},min=${style.minWidth},grid=${style.gridTemplateColumns}]`
      }
      const overflow = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1)
      const rawOverflow = overflow
        .slice(0, 8)
        .map(element => `${element.className}:${Math.round(element.getBoundingClientRect().right)}`)
      const uncontainedOverflow = overflow
        .filter(element => !element.closest('.class-space-section-nav, .album-rail-viewport, .timeline-rail, .alumni-ambient-bg'))
        .slice(0, 8)
        .map(element => `${element.className}:${Math.round(element.getBoundingClientRect().right)}`)

      return {
        viewport: window.innerWidth,
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        container: widthOf('.container'),
        page: widthOf('.class-space-page'),
        workbench: widthOf('.class-space-workbench'),
        hierarchy: [
          'body',
          '.class-space-page',
          '.container',
          '.class-space-hub',
          '.class-space-workbench',
          '.class-space-main',
          '#group-chat',
          '.group-chat-stage',
          '.group-chat-composer',
          '.composer-row',
          '.composer-row textarea',
        ].map(inspect).filter(Boolean),
        rawOverflow,
        uncontainedOverflow,
      }
    })
    expect(layout.scroll, `${viewport.name} 页面横向溢出；viewport=${layout.viewport}，client=${layout.client}，scroll=${layout.scroll}，container=${layout.container}，page=${layout.page}，workbench=${layout.workbench}；层级=${layout.hierarchy.join('，')}`).toBeLessThanOrEqual(layout.client + 1)
    expect(layout.uncontainedOverflow, `${viewport.name} 非横滑轨道内容溢出：${layout.uncontainedOverflow.join(', ')}；允许的轨道内容：${layout.rawOverflow.join(', ')}`).toEqual([])

    if (viewport.name === 'desktop') {
      await expect(sectionNav).toHaveCSS('position', 'sticky')
    } else {
      await expect(sectionNav).toHaveCSS('overflow-x', 'auto')
    }

    if (viewport.name === 'mobile') {
      const timelineCards = page.locator('.timeline-rail-card')
      await expect(page.locator('.timeline-rail__track')).toHaveCSS('display', 'grid')
      expect(await timelineCards.nth(1).evaluate((card) => card.getBoundingClientRect().top))
        .toBeGreaterThan(await timelineCards.nth(0).evaluate((card) => card.getBoundingClientRect().top))
    }

    await page.screenshot({ path: `test-results/chat-rework/class-space-${viewport.name}.png`, fullPage: true })
  }
})
