# 公开站点界面反馈修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 修复人物长廊分页与头像降级、收束纸本导航、替换装饰性 emoji，并让班级空间只显示策展大事与可加载的时间轴图片。

**Architecture:** 保持现有 Astro + Vue islands 边界。Worker 只为班级空间概览增加 curatedOnly 查询参数，独立时光轴不改变数据语义；Vue 组件负责 URL 规范化与纸本呈现。顶级目录仍由 TopNav.astro 的一个数组驱动，以保证桌面与移动端一致。

**Tech Stack:** Astro 5、Vue 3、TypeScript、Hono、Cloudflare D1、Vitest、Playwright。

---

### Task 1: 为班级空间策展时间轴建立 Worker 回归测试

**Files:**

- Create: workers/api/tests/timeline-feed.test.ts
- Modify: workers/api/src/lib/timelineFeed.ts
- Modify: workers/api/src/routes/classSpace.ts

- [ ] **Step 1: 写出失败的 Worker 测试，证明概览不能混入自动事件**

~~~ts
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { initTestDb } from './db-helper'
import { getTimelineFeed } from '../src/lib/timelineFeed'

beforeEach(async () => {
  await initTestDb(env.DB)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM timeline_events'),
    env.DB.prepare('DELETE FROM messages'),
    env.DB.prepare('DELETE FROM photos'),
    env.DB.prepare('DELETE FROM albums'),
    env.DB.prepare('DELETE FROM students'),
  ])
})

describe('class-space curated timeline', () => {
  it('returns only administrator-created events when curatedOnly is requested', async () => {
    await env.DB.prepare(
      'INSERT INTO timeline_events (id, title, description, event_date, photo_r2_key) VALUES (?, ?, ?, ?, ?)',
    ).bind('event-1', '毕业合影', '全班在操场留下合影。', '2026-07-01', 'photos/graduation.jpg').run()
    await env.DB.prepare(
      'INSERT INTO students (id, name, slug, info) VALUES (?, ?, ?, ?)',
    ).bind('student-1', '自动加入的同学', 'auto-student', '{}').run()
    await env.DB.prepare(
      'INSERT INTO messages (student_slug, author_name, content, is_approved, is_hidden) VALUES (?, ?, ?, 1, 0)',
    ).bind('auto-student', '自动加入的同学', '这不是班级大事').run()

    await expect(getTimelineFeed(env.DB, { curatedOnly: true, limit: 6 })).resolves.toEqual([
      expect.objectContaining({
        id: 'event-1', type: 'event', title: '毕业合影', photoUrl: '/api/files/photos/graduation.jpg',
      }),
    ])
  })
})
~~~

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm --filter worker exec vitest run tests/timeline-feed.test.ts

Expected: FAIL；结果中至少包含 message 或 join 类型，而不是只含 event-1。

- [ ] **Step 3: 以最小 API 扩展实现策展查询**

将函数选项改为：

~~~ts
export async function getTimelineFeed(
  db: D1Database,
  options: { type?: TimelineFeedType; limit?: number; curatedOnly?: boolean } = {},
): Promise<any[]> {
  const { type, limit = 100, curatedOnly = false } = options
  // 保留现有 event 查询。
  if (!curatedOnly && (!type || type === 'message')) { /* 现有 message 查询 */ }
  if (!curatedOnly && (!type || type === 'photo')) { /* 现有 photo 查询 */ }
  if (!curatedOnly && (!type || type === 'join')) { /* 现有 join 查询 */ }
}
~~~

在 workers/api/src/routes/classSpace.ts 中将概览调用精确改为：

~~~ts
getTimelineFeed(c.env.DB, { curatedOnly: true, limit: 6 }),
~~~

不得改动独立 /api/timeline 的调用，以保留完整时光轴已有的综合记录。

- [ ] **Step 4: 运行 Worker 测试并确认通过**

Run: pnpm --filter worker exec vitest run tests/timeline-feed.test.ts

Expected: PASS，列表只含 event 类型。

- [ ] **Step 5: 提交 Worker 数据边界**

~~~bash
git add workers/api/src/lib/timelineFeed.ts workers/api/src/routes/classSpace.ts workers/api/tests/timeline-feed.test.ts
git commit -m "fix: curate class space timeline events"
~~~

### Task 2: 修复班级空间照片 URL、时间线版式与章节目录

**Files:**

- Modify: packages/site-astro/src/components/ClassSpaceTimelineRail.vue
- Modify: packages/site-astro/src/components/ClassSpaceSectionNav.vue
- Modify: packages/site-astro/src/components/ClassSpaceHub.vue
- Modify: packages/site-astro/tests/class-space-flow.spec.ts
- Create: packages/site-astro/tests/public-ui-feedback-static.test.ts

- [ ] **Step 1: 为图片 URL 和目录语义添加失败测试**

在 class-space-flow.spec.ts 的 mockOverviewData.timeline 第一条增加：

~~~ts
photoUrl: '/api/files/photos/graduation.jpg',
~~~

并在已登录测试中加入：

~~~ts
await page.route('**/api/files/photos/graduation.jpg', route => route.fulfill({
  status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
}))
const timelineImage = page.locator('.timeline-rail-card img')
await expect(timelineImage).toHaveAttribute('src', /\/api\/files\/photos\/graduation\.jpg$/)
await expect(timelineImage).not.toHaveAttribute('src', /\/api\/files\/api\/files\//)
~~~

新建 public-ui-feedback-static.test.ts：

~~~ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf-8')

describe('公开站点界面反馈回归', () => {
  it('uses a curated preview and a URL-safe media resolver', () => {
    expect(read('components/ClassSpaceHub.vue')).toContain('班级大事')
    expect(read('components/ClassSpaceTimelineRail.vue')).toContain("value.startsWith('/api/files/')")
    expect(read('components/ClassSpaceTimelineRail.vue')).toContain('timeline-rail__track')
  })
})
~~~

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm --filter site-astro exec vitest run tests/public-ui-feedback-static.test.ts

Expected: FAIL，因为当前 URL 解析器会把 /api/files 再拼接一次，且当前组件没有 timeline-rail__track。

- [ ] **Step 3: 实现 URL 解析、连续时间线和目录卡**

将 ClassSpaceTimelineRail.vue 中的解析器替换为：

~~~ts
function photoUrl(value: string) {
  if (value.startsWith('http')) return value
  if (value.startsWith('/api/files/')) return joinApiUrl(props.apiBase, value)
  return joinApiUrl(props.apiBase, '/api/files/' + value.replace(/^\/+/, ''))
}
~~~

模板以 timeline-rail__track 包住事件；使用一条 1px 竖线、每条事件一个圆点和纸卡。卡片桌面端为 108px minmax(0, 1fr) 两列且最大 680px，图片使用 4 / 3 比例；768px 以下改为 72px minmax(0, 1fr)，不允许横向滚动。

ClassSpaceHub.vue 的 sections 精确改成：

~~~ts
const sections = computed(() => overviewData.value ? [
  { id: 'group-chat', index: '01', label: '班级群聊', description: '此刻的对话', count: overviewData.value.counts.groupMessages },
  { id: 'albums', index: '02', label: '精选影像', description: '值得翻看的照片', count: overviewData.value.counts.albums },
  { id: 'timeline', index: '03', label: '班级大事', description: '由我们郑重记下', count: overviewData.value.counts.timelineItems },
] : [])
~~~

扩充 ClassSpaceSectionNav.vue 的接口和模板，依次渲染 section-index、标题说明组与计数；保留锚点、活跃状态和 IntersectionObserver。桌面端使用带左侧活动线的纸页目录，移动端使用横向滚动目录卡。

- [ ] **Step 4: 运行静态与浏览器用例并确认通过**

Run: pnpm --filter site-astro exec vitest run tests/public-ui-feedback-static.test.ts && pnpm --filter site-astro exec playwright test tests/class-space-flow.spec.ts

Expected: PASS；浏览器只请求一次 /api/files/photos/graduation.jpg，390px 宽度无横向溢出。

- [ ] **Step 5: 提交班级空间显示修复**

~~~bash
git add packages/site-astro/src/components/ClassSpaceTimelineRail.vue packages/site-astro/src/components/ClassSpaceSectionNav.vue packages/site-astro/src/components/ClassSpaceHub.vue packages/site-astro/tests/class-space-flow.spec.ts packages/site-astro/tests/public-ui-feedback-static.test.ts
git commit -m "fix: refine class space timeline presentation"
~~~

### Task 3: 恢复九宫格人物长廊分页并锁定头像降级

**Files:**

- Modify: packages/site-astro/src/components/RosterWall.vue
- Modify: packages/site-astro/tests/public-ui-feedback-static.test.ts
- Create: packages/site-astro/tests/roster-pagination.spec.ts

- [ ] **Step 1: 写出失败的九宫格分页浏览器测试**

在 roster-pagination.spec.ts 用已有的 sessionStorage 同学会话夹具，拦截 /api/classmates 并返回 10 个不同 slug 的条目：

~~~ts
await expect(page.locator('.archive-card')).toHaveCount(9)
await page.getByRole('button', { name: '第 2 页' }).click()
await expect(page.locator('.archive-card')).toHaveCount(1)
await page.getByRole('textbox', { name: '档案检索' }).fill('同学 1')
await expect(page.getByRole('button', { name: '第 1 页', current: 'page' })).toBeVisible()
~~~

在 public-ui-feedback-static.test.ts 添加：

~~~ts
it('keeps the roster at nine cards per page with accessible page buttons', () => {
  const roster = read('components/RosterWall.vue')
  expect(roster).toContain('const PAGE_SIZE = 9')
  expect(roster).toContain('aria-label="第 \${page} 页"')
  expect(roster).toContain("aria-current=\"currentPage === page ? 'page' : undefined\"")
})
~~~

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm --filter site-astro exec vitest run tests/public-ui-feedback-static.test.ts

Expected: FAIL，因为当前 RosterWall.vue 没有 PAGE_SIZE 或页码控件。

- [ ] **Step 3: 以派生状态实现分页，不改变名单数据源**

~~~ts
const PAGE_SIZE = 9
const currentPage = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredClassmates.value.length / PAGE_SIZE)))
const paginatedClassmates = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredClassmates.value.slice(start, start + PAGE_SIZE)
})

watch([keyword, filteredClassmates], () => {
  currentPage.value = Math.min(currentPage.value, totalPages.value)
  if (keyword.value.trim()) currentPage.value = 1
})
~~~

将循环改为 paginatedClassmates。在网格之后放置 nav.roster-pagination，上一页和下一页使用内联 SVG 而非 emoji 箭头；数字按钮拥有 aria-label 和 aria-current。页码算法沿用 0528292 的首尾页、当前页邻近页和省略号策略，但固定每页 9 张。不要删除 ArchiveRosterCard.vue 的 @error 首字降级，新增测试断言坏 URL 不会露出破图。

- [ ] **Step 4: 运行分页与头像相关测试**

Run: pnpm --filter site-astro exec vitest run tests/public-ui-feedback-static.test.ts tests/public-state-regressions.test.ts && pnpm --filter site-astro exec playwright test tests/roster-pagination.spec.ts

Expected: PASS；10 条数据首屏 9 张，切页 1 张，搜索回到第 1 页，坏头像显示姓名首字。

- [ ] **Step 5: 提交人物长廊修复**

~~~bash
git add packages/site-astro/src/components/RosterWall.vue packages/site-astro/tests/public-ui-feedback-static.test.ts packages/site-astro/tests/roster-pagination.spec.ts
git commit -m "fix: restore nine-card roster pagination"
~~~

### Task 4: 收束全局目录并添加更多功能页

**Files:**

- Modify: packages/site-astro/src/components/TopNav.astro
- Modify: packages/site-astro/src/scripts/navRuntime.ts
- Create: packages/site-astro/src/pages/more.astro
- Modify: packages/site-astro/tests/public-ui-feedback-static.test.ts
- Modify: packages/site-astro/tests/navigation.test.ts

- [ ] **Step 1: 写出失败的导航结构和方向测试**

~~~ts
it('keeps media pages under more and records the active-marker direction', () => {
  const nav = read('components/TopNav.astro')
  const runtime = read('scripts/navRuntime.ts')
  expect(nav).toContain("{ href: '/more', label: '更多' }")
  expect(nav).not.toContain("{ href: '/album', label: '影像馆' }")
  expect(nav).not.toContain("{ href: '/timeline', label: '时光轴' }")
  expect(runtime).toContain('directory.dataset.navDirection')
  expect(runtime).toContain('previousActiveLeft')
})
~~~

在 navigation.test.ts 的重要链接断言中加入 more，确保子路径部署的链接带正确 base。

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm --filter site-astro exec vitest run tests/public-ui-feedback-static.test.ts tests/navigation.test.ts

Expected: FAIL，因为当前导航仍列出影像馆和时光轴，也没有 /more。

- [ ] **Step 3: 实现统一导航数组、方向感知标记和占位页**

TopNav.astro 中的唯一数组必须为：

~~~ts
const navItems = [
  { href: '/preface', label: '前言' },
  { href: '/roster', label: '同学档案' },
  { href: '/class-space', label: '班级空间' },
  { href: '/yearbook', label: '年度册' },
  { href: '/more', label: '更多' },
]
~~~

navRuntime.ts 维护 let previousActiveLeft: number | null = null。首次 updateActiveInk 只测量位置；后续比较 left < previousActiveLeft，向目录写入 data-nav-direction 的 backward 或 forward，再更新 previousActiveLeft。销毁时清理 ResizeObserver，不改变现有抽屉键盘处理。TopNav.astro 增加：

~~~css
.nav-directory[data-nav-direction='backward'] .nav-active-ink { transform-origin: right center; }
.nav-directory[data-nav-direction='forward'] .nav-active-ink { transform-origin: left center; }
~~~

more.astro 使用 MainLayout 和 page-shell，显示“更多功能”“新的章节正在整理，敬请期待。”，并以两张纸本目录链接提供 /album 的“影像馆”和 /timeline 的“时光轴”。不得把它们重新加入顶部导航。

- [ ] **Step 4: 运行导航测试并做交互确认**

Run: pnpm --filter site-astro exec vitest run tests/public-ui-feedback-static.test.ts tests/navigation.test.ts && pnpm --filter site-astro typecheck

Expected: PASS；桌面与移动抽屉都显示“更多”而无“影像馆”“时光轴”，墨线按实际移动方向收放。

- [ ] **Step 5: 提交导航信息架构**

~~~bash
git add packages/site-astro/src/components/TopNav.astro packages/site-astro/src/scripts/navRuntime.ts packages/site-astro/src/pages/more.astro packages/site-astro/tests/public-ui-feedback-static.test.ts packages/site-astro/tests/navigation.test.ts
git commit -m "feat: streamline public navigation"
~~~

### Task 5: 清除装饰性 emoji，改用纸本图形与文字层级

**Files:**

- Modify: packages/site-astro/src/pages/yearbook.astro
- Modify: packages/site-astro/src/components/AccountCenter.vue
- Modify: packages/site-astro/src/components/RankingsPanel.vue
- Modify: packages/site-astro/src/components/StudentMusicPlayer.vue
- Modify: packages/site-astro/src/components/StudentShareCard.vue
- Modify: packages/site-astro/tests/public-ui-feedback-static.test.ts

- [ ] **Step 1: 写出失败的装饰 emoji 扫描测试**

~~~ts
it('does not render hard-coded decorative emoji in public UI controls', () => {
  const files = [
    'pages/yearbook.astro', 'components/AccountCenter.vue', 'components/RankingsPanel.vue',
    'components/StudentMusicPlayer.vue', 'components/StudentShareCard.vue',
  ]
  for (const file of files) expect(read(file)).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u)
})
~~~

- [ ] **Step 2: 运行测试并确认失败**

Run: pnpm --filter site-astro exec vitest run tests/public-ui-feedback-static.test.ts

Expected: FAIL，指出年度册、账号中心、榜单、音乐和分享组件中的装饰性 emoji。

- [ ] **Step 3: 逐个替换为单色 SVG 或文本，不改反应协议**

每个图形使用 viewBox 0 0 24 24、fill none、stroke currentColor、stroke-width 1.8 和 aria-hidden true。年度册的打印、数据、榜单、名录、影像、留言各换为对应线框图形；账号中心把用户和成功提示改为线框人像和细线状态；榜单标题改为 RANKING / 班级风云榜；音乐按钮使用唱片 SVG；分享组件使用关闭、链环和成功勾选 SVG。删除只为 emoji 服务的间距。

不得修改 GroupChatMessage.vue 或 MessageWall.vue 的 reaction 值，它们是持久化互动数据而不是装饰性 UI。

- [ ] **Step 4: 运行静态、类型和无障碍检查**

Run: pnpm --filter site-astro exec vitest run tests/public-ui-feedback-static.test.ts tests/ui-reliability-static.test.ts && pnpm --filter site-astro typecheck

Expected: PASS；扫描文件无 emoji，按钮仍有可访问名称，类型检查无报错。

- [ ] **Step 5: 提交图形语言修复**

~~~bash
git add packages/site-astro/src/pages/yearbook.astro packages/site-astro/src/components/AccountCenter.vue packages/site-astro/src/components/RankingsPanel.vue packages/site-astro/src/components/StudentMusicPlayer.vue packages/site-astro/src/components/StudentShareCard.vue packages/site-astro/tests/public-ui-feedback-static.test.ts
git commit -m "style: replace decorative emoji with graphic UI"
~~~

### Task 6: 完整验证与交付

**Files:**

- Modify: docs/superpowers/specs/2026-07-12-public-ui-feedback-design.md
- Modify: docs/superpowers/plans/2026-07-12-public-ui-feedback-refinements.md

- [ ] **Step 1: 运行与本改动对应的完整验证链**

~~~bash
pnpm --filter worker exec vitest run tests/timeline-feed.test.ts
pnpm --filter worker exec tsc --noEmit
pnpm --filter site-astro typecheck
pnpm --filter site-astro exec vitest run tests/public-ui-feedback-static.test.ts tests/public-state-regressions.test.ts tests/ui-reliability-static.test.ts tests/navigation.test.ts
pnpm --filter site-astro exec playwright test tests/class-space-flow.spec.ts tests/roster-pagination.spec.ts
pnpm build:admin
pnpm --filter site-astro build
~~~

Expected: 所有命令通过。若站点构建因外部 Worker 的 /api/students 不可达，或全量 Worker 测试仍因测试环境未设置 JWT_SECRET 失败，只记录为已有环境阻断，不修改密钥或生产配置。

- [ ] **Step 2: 进行两种视口的最终目视回归**

使用 Playwright 对 /roster/、/class-space/、/more/ 取 1433px 和 390px 宽度的截图；核对九宫格、目录卡、连续时间线、图片、顶部书签和“更多”页都没有横向溢出或破图。

- [ ] **Step 3: 更新实施状态并提交文档**

将已完成复选框打勾，写入每条验证命令的结果与任何外部阻断；只提交本轮新增或修改的两份文档。

~~~bash
git add docs/superpowers/specs/2026-07-12-public-ui-feedback-design.md docs/superpowers/plans/2026-07-12-public-ui-feedback-refinements.md
git commit -m "docs: record public UI feedback verification"
~~~

## Execution record

已于 2026-07-12 在 `codex/ui-feedback-refinements` 隔离工作区完成全部功能任务。

- 班级空间概览仅显示管理员维护的 6 条大事，独立完整时光轴保留综合记录；`/api/files/...` 时间轴图片不再被重复拼接。
- 人物长廊恢复每页 9 张卡片的分页；损坏头像即使在 Vue hydration 之前已完成加载失败，也会通过 `naturalWidth === 0` 回退为姓名首字。
- 顶部目录已收束为前言、同学档案、班级空间、年度册、更多；影像馆和时光轴在“更多”页保留入口。切换时暂存一次书签位置，向左切换会使用正确的反向动画原点。
- 班级空间目录和时间线已按纸本章节与连续事件线重做；公共界面的装饰性 emoji 已替换为 SVG 或文字层级，互动反应协议未改动。

验证通过：

~~~text
pnpm --filter worker exec vitest run tests/timeline-feed.test.ts tests/class-space-inbox.test.ts  # 5 passed
pnpm --filter worker exec tsc --noEmit
pnpm --filter site-astro typecheck
pnpm build:admin
pnpm --filter site-astro build
pnpm --filter site-astro exec vitest run tests/public-ui-feedback-static.test.ts tests/public-state-regressions.test.ts tests/ui-reliability-static.test.ts tests/navigation.test.ts  # 33 passed
PLAYWRIGHT_PORT=4324 pnpm --filter site-astro exec playwright test tests/class-space-flow.spec.ts tests/roster-pagination.spec.ts tests/navigation-marker-direction.spec.ts --workers=1  # 6 passed
~~~
