# 班级空间、导航与班级信箱整体重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增响应式班级空间，重构纸质目录导航，补全统一班级信箱与账号中心，同时保持登录后先进入前言和现有完整页面可用。

**Architecture:** Worker 新增两个小型只读聚合路由：公开的班级空间摘要和需同学会话的统一未读摘要；原留言、相册、时间轴、通知和邮件接口继续作为事实来源。Astro 负责页面壳与导航，Vue islands 负责留言、班级空间、信箱和账号交互，所有动画使用 CSS transform/opacity 并遵守现有 Astro 生命周期清理规则。

**Tech Stack:** pnpm workspace、Astro 5、Vue 3、TypeScript、Hono、Cloudflare Worker/D1、Vitest、Playwright、lucide-vue-next、CSS View Transitions。

---

## 0. 执行边界与文件结构

本计划覆盖四个相互关联但可独立提交的子系统。执行时必须按任务顺序推进；同一时间不要让两个代理修改 `TopNav.astro`、`postOffice.ts`、`PublicMessageBoard.vue` 或 `MailboxApp.vue`。

### 新建文件

- `workers/api/src/lib/timelineFeed.ts`：复用时间轴聚合查询。
- `workers/api/src/routes/classSpace.ts`：班级空间轻量摘要。
- `workers/api/src/routes/inbox.ts`：通知与邮件统一未读摘要。
- `workers/api/tests/class-space-inbox.test.ts`：两个新路由的 Worker 行为测试。
- `packages/site-astro/src/api/classSpace.ts`：班级空间 API 客户端。
- `packages/site-astro/src/composables/usePublicMessages.ts`：公共留言共享状态与操作。
- `packages/site-astro/src/components/MessageComposer.vue`：留言编辑器。
- `packages/site-astro/src/components/MessageCardGrid.vue`：留言展示与表情反应。
- `packages/site-astro/src/components/ClassSpaceMessageStage.vue`：班级空间留言舞台。
- `packages/site-astro/src/components/ClassSpaceAlbumRail.vue`：相册摘要横轨。
- `packages/site-astro/src/components/ClassSpaceTimelinePreview.vue`：响应式时间轴摘要。
- `packages/site-astro/src/components/ClassSpaceHub.vue`：班级空间状态编排。
- `packages/site-astro/src/pages/class-space.astro`：班级空间路由。
- `packages/site-astro/src/components/MailboxList.vue`：统一消息列表。
- `packages/site-astro/src/components/MailboxDetail.vue`：通知/信件详情与回复。
- `packages/site-astro/src/components/RecipientPicker.vue`：按姓名选择收件人。
- `packages/site-astro/src/components/MailComposer.vue`：新建信件表单。
- `packages/site-astro/src/components/AccountCenter.vue`：账号级操作。
- `packages/site-astro/src/pages/account.astro`：账号中心路由。
- `packages/site-astro/tests/class-space-navigation-static.test.ts`：新结构静态保护。
- `packages/site-astro/tests/class-space-flow.spec.ts`：班级空间与导航流程。
- `packages/site-astro/tests/mailbox-account-flow.spec.ts`：信箱与账号中心流程。
- `docs/phase-13-acceptance-report.md`：最终自动化与视觉验收记录。

### 修改文件

- `packages/shared/src/types.ts`：新增班级空间、统一未读和信件详情类型。
- `workers/api/src/routes/timeline.ts`：改用共享时间轴查询。
- `workers/api/src/index.ts`：挂载新路由并配置缓存/ETag。
- `packages/site-astro/src/api/postOffice.ts`：补齐反应、通知、详情、回复和摘要客户端。
- `packages/site-astro/src/api/classmateAuth.ts`：补齐当前账号查询。
- `packages/site-astro/src/components/PublicMessageBoard.vue`：改用共享留言组件。
- `packages/site-astro/src/components/AlbumGrid.vue`：为相册摘要深链接增加稳定锚点。
- `packages/site-astro/src/components/TopNav.astro`：新桌面导航、手机抽屉和统一信箱角标。
- `packages/site-astro/src/pages/preface.astro`：登录后序章提供同学档案与班级空间入口。
- `packages/site-astro/src/components/MailboxApp.vue`：编排统一信箱。
- `packages/site-astro/src/components/SelfEditPanel.vue`：支持账号中心直达编辑。
- `packages/site-astro/package.json`：加入静态/Playwright 测试及 Lucide Vue 图标依赖。
- `pnpm-lock.yaml`：依赖锁定。
- `packages/site-astro/tests/post-office-static.test.ts`：更新旧导航断言。
- `packages/site-astro/tests/post-office-flow.spec.ts`：更新旧文字入口断言。
- `packages/site-astro/tests/performance-network.spec.ts`：加入班级空间网络约束。
- `packages/site-astro/tests/public-site-major-redesign-visual.spec.ts`：扩大关键页面走查范围。

### 不修改文件

- 管理后台页面和管理后台 API 客户端。
- D1 schema 与 migrations；本阶段不需要数据迁移。
- 完整影像馆、时光轴和年度册的业务逻辑。
- 首页封面和登录表单布局；只增加登录落点保护测试。

---

### Task 1: 建立共享类型与班级空间摘要接口

**Files:**
- Modify: `packages/shared/src/types.ts`
- Create: `workers/api/src/lib/timelineFeed.ts`
- Create: `workers/api/src/routes/classSpace.ts`
- Modify: `workers/api/src/routes/timeline.ts`
- Modify: `workers/api/src/index.ts`
- Create: `workers/api/tests/class-space-inbox.test.ts`

- [ ] **Step 1: 写班级空间摘要的失败测试**

在 `workers/api/tests/class-space-inbox.test.ts` 写入测试初始化、测试数据和以下断言：

```ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR REPLACE INTO public_messages (id, author_slug, author_name, content, card_style, status, featured, pinned) VALUES ('pm_overview', 'test_init', '测试同学', '班级空间留言', 'paper', 'approved', 1, 1)"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO albums (id, title, description, frame_style, sort_order, featured) VALUES ('album_overview', '毕业相册', '毕业那天', 'polaroid', 0, 1)"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO photos (id, album_id, filename, caption, r2_key, sort_order) VALUES ('photo_overview', 'album_overview', 'cover.jpg', '合照', 'photos/cover.jpg', 0)"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO timeline_events (id, title, description, event_date, event_type) VALUES ('event_overview', '毕业典礼', '最后一次集合', '2026-06-20', 'graduation')"
    ),
  ])
})

describe('Class space overview API', () => {
  it('returns bounded message, album and timeline previews', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/class-space/overview'), env, ctx)
    await waitOnExecutionContext(ctx)
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.messages.length).toBeLessThanOrEqual(8)
    expect(body.data.albums.length).toBeLessThanOrEqual(4)
    expect(body.data.timeline.length).toBeLessThanOrEqual(8)
    expect(body.data.messages[0]).not.toHaveProperty('reviewReason')
    expect(body.data.albums[0]).not.toHaveProperty('photos')
    expect(body.data.albums[0].coverR2Key).toBe('photos/cover.jpg')
    expect(body.data.counts).toEqual(expect.objectContaining({ albums: expect.any(Number) }))
    expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate=300')
  })
})
```

- [ ] **Step 2: 运行 Worker 测试并确认失败**

Run: `pnpm --filter worker exec vitest run tests/class-space-inbox.test.ts`

Expected: FAIL，`GET /api/class-space/overview` 返回 404。

- [ ] **Step 3: 在共享包中定义稳定契约**

在 `packages/shared/src/types.ts` 末尾增加：

```ts
export interface ClassSpaceAlbumPreview {
  id: string
  title: string
  coverR2Key: string | null
  photoCount: number
  tags: string[]
}

export interface ClassSpaceTimelinePreview {
  id: string
  type: 'event' | 'message' | 'photo' | 'join'
  title: string
  description?: string
  date: string
  photoUrl?: string | null
  eventType?: string
}

export interface ClassSpaceOverview {
  messages: PublicMessage[]
  albums: ClassSpaceAlbumPreview[]
  timeline: ClassSpaceTimelinePreview[]
  counts: {
    approvedMessages: number
    albums: number
    timelineItems: number
  }
}

export interface InboxSummary {
  notificationUnread: number
  mailUnread: number
  totalUnread: number
}

export interface MailboxThreadDetail {
  thread: Pick<MailboxThread, 'id' | 'subject' | 'threadType' | 'allowReply' | 'updatedAt'>
  messages: MailboxMessage[]
}
```

- [ ] **Step 4: 提取可复用的时间轴聚合函数**

将 `workers/api/src/routes/timeline.ts` 中构造时间轴数组的查询移动到 `workers/api/src/lib/timelineFeed.ts`。必须保留现有 `messages` 数据源、ID 前缀、字段命名和 `type` 查询筛选；原 `/api/timeline` 调用 `getTimelineFeed(c.env.DB, { type, limit: 100 })`：

```ts
export type TimelineFeedType = 'event' | 'message' | 'photo' | 'join'

export async function getTimelineFeed(
  db: D1Database,
  options: { type?: TimelineFeedType; limit?: number } = {},
): Promise<any[]> {
  const { type, limit = 100 } = options
  const timeline: any[] = []
  const queries: Promise<unknown>[] = []

  if (!type || type === 'event') {
    queries.push(db.prepare('SELECT * FROM timeline_events ORDER BY event_date DESC, sort_order').all().then(({ results }) => {
      for (const row of results || []) timeline.push({
        type: 'event', id: (row as any).id, title: (row as any).title,
        description: (row as any).description, date: (row as any).event_date,
        photoUrl: (row as any).photo_r2_key ? `/api/files/${(row as any).photo_r2_key}` : null,
        isMilestone: !!(row as any).is_milestone,
        eventType: (row as any).event_type || 'class_event',
      })
    }))
  }

  if (!type || type === 'message') {
    queries.push(db.prepare("SELECT id, student_slug, author_name, content, created_at FROM messages WHERE is_approved = 1 AND is_hidden = 0 ORDER BY created_at DESC LIMIT 30").all().then(({ results }) => {
      for (const row of results || []) timeline.push({
        type: 'message', id: `msg_${(row as any).id}`,
        title: `${(row as any).author_name} 在同学录留言`,
        description: (row as any).content, date: (row as any).created_at,
        studentSlug: (row as any).student_slug,
      })
    }))
  }

  if (!type || type === 'photo') {
    queries.push(db.prepare('SELECT p.*, a.title AS album_title FROM photos p JOIN albums a ON p.album_id = a.id ORDER BY p.created_at DESC LIMIT 30').all().then(({ results }) => {
      for (const row of results || []) timeline.push({
        type: 'photo', id: `photo_${(row as any).id}`,
        title: `班级照片 · ${(row as any).album_title}`,
        description: (row as any).caption, date: (row as any).created_at,
        photoUrl: `/api/files/${(row as any).r2_key}`,
      })
    }))
  }

  if (!type || type === 'join') {
    queries.push(db.prepare('SELECT name, slug, avatar_url, created_at FROM students ORDER BY created_at DESC LIMIT 30').all().then(({ results }) => {
      for (const row of results || []) timeline.push({
        type: 'join', id: `join_${(row as any).slug}`,
        title: `${(row as any).name} 加入了同学录`,
        date: (row as any).created_at, slug: (row as any).slug,
        avatarUrl: (row as any).avatar_url,
      })
    }))
  }

  await Promise.all(queries)
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return timeline.slice(0, limit)
}
```

`timelineRoutes.get('/timeline')` 的读取部分替换为：

```ts
const requestedType = c.req.query('type') as TimelineFeedType | undefined
const timeline = await getTimelineFeed(c.env.DB, { type: requestedType, limit: 100 })
return c.json({ success: true, data: timeline })
```

- [ ] **Step 5: 实现班级空间摘要路由**

创建 `workers/api/src/routes/classSpace.ts`：

```ts
import { Hono } from 'hono'
import { getTimelineFeed } from '../lib/timelineFeed'

type Bindings = { DB: D1Database }
export const classSpaceRoutes = new Hono<{ Bindings: Bindings }>()

const parseJson = <T>(value: string | null, fallback: T): T => {
  try { return JSON.parse(value || '') as T } catch { return fallback }
}

classSpaceRoutes.get('/class-space/overview', async (c) => {
  const [messageRows, albumRows, messageCount, albumCount, timeline] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, author_slug, author_name, content, card_style, featured, pinned, reactions, created_at, reviewed_at FROM public_messages WHERE status = 'approved' ORDER BY pinned DESC, featured DESC, created_at DESC LIMIT 8"
    ).all(),
    c.env.DB.prepare(
      `SELECT a.id, a.title, a.tags,
        COALESCE(a.cover_r2_key, (SELECT p.r2_key FROM photos p WHERE p.album_id = a.id ORDER BY p.sort_order, p.created_at LIMIT 1)) AS cover_r2_key,
        (SELECT COUNT(*) FROM photos p WHERE p.album_id = a.id) AS photo_count
       FROM albums a ORDER BY a.featured DESC, a.sort_order, a.created_at DESC LIMIT 4`
    ).all(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM public_messages WHERE status = 'approved'").first(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM albums').first(),
    getTimelineFeed(c.env.DB, { limit: 8 }),
  ])

  const messages = (messageRows.results || []).map((row: any) => ({
    id: row.id,
    authorSlug: row.author_slug,
    authorName: row.author_name,
    content: row.content,
    cardStyle: row.card_style || 'paper',
    status: 'approved',
    featured: !!row.featured,
    pinned: !!row.pinned,
    reactions: parseJson(row.reactions, {}),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || null,
  }))
  const albums = (albumRows.results || []).map((row: any) => ({
    id: row.id,
    title: row.title,
    coverR2Key: row.cover_r2_key || null,
    photoCount: Number(row.photo_count || 0),
    tags: parseJson(row.tags, []),
  }))

  c.header('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300')
  return c.json({
    success: true,
    data: {
      messages,
      albums,
      timeline,
      counts: {
        approvedMessages: Number((messageCount as any)?.count || 0),
        albums: Number((albumCount as any)?.count || 0),
        timelineItems: timeline.length,
      },
    },
  })
})
```

- [ ] **Step 6: 挂载路由并保护专用缓存头**

在 `workers/api/src/index.ts` 导入并挂载 `classSpaceRoutes`，为该路径启用 ETag；在通用缓存中间件中先处理专用缓存：

```ts
import { classSpaceRoutes } from './routes/classSpace'

app.use('/api/class-space/overview', etag())

// 通用缓存中间件的 await next() 之后、其他分支之前
if (path === '/api/class-space/overview') {
  c.res.headers.set('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300')
  return
}

app.route('/api', classSpaceRoutes)
```

- [ ] **Step 7: 运行测试与类型检查**

Run: `pnpm --filter worker exec vitest run tests/class-space-inbox.test.ts tests/api.test.ts`

Expected: PASS，原 `/api/timeline` 测试也保持通过。

Run: `pnpm --filter worker exec tsc --noEmit`

Expected: PASS。

- [ ] **Step 8: 提交 Task 1**

```bash
git add packages/shared/src/types.ts workers/api/src/lib/timelineFeed.ts workers/api/src/routes/classSpace.ts workers/api/src/routes/timeline.ts workers/api/src/index.ts workers/api/tests/class-space-inbox.test.ts
git commit -m "feat: add class space overview API"
```

---

### Task 2: 增加统一信箱未读摘要

**Files:**
- Create: `workers/api/src/routes/inbox.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/tests/class-space-inbox.test.ts`

- [ ] **Step 1: 写鉴权和合计失败测试**

在 `class-space-inbox.test.ts` 增加登录 helper 和测试：

```ts
async function loginClassmate(): Promise<string> {
  const salt = new Uint8Array(16)
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode('12345678'), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256)
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)))
  const stored = `pbkdf2:${btoa(String.fromCharCode(...salt))}:${hash}`
  await env.DB.prepare("UPDATE students SET account_password_hash = ?, account_initial_password_changed = 1, account_status = 'active' WHERE slug = 'test_init'").bind(stored).run()

  const ctx = createExecutionContext()
  const res = await worker.fetch(new Request('http://localhost/api/classmate-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'test_init', password: '12345678' }),
  }), env, ctx)
  await waitOnExecutionContext(ctx)
  return ((await res.json()) as any).data.token
}

describe('Inbox summary API', () => {
  it('requires a classmate session', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/inbox/summary'), env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })

  it('adds unread notifications and unread mail', async () => {
    const token = await loginClassmate()
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO notifications (id, recipient_slug, type, title, body) VALUES ('notice_unread', 'test_init', 'public_message_approved', '审核通过', '留言已展示')"),
      env.DB.prepare("INSERT OR REPLACE INTO mail_threads (id, subject, thread_type, created_by_type) VALUES ('thread_unread', '管理员来信', 'admin', 'admin')"),
      env.DB.prepare("INSERT OR REPLACE INTO mail_recipients (id, thread_id, recipient_slug) VALUES ('recipient_unread', 'thread_unread', 'test_init')"),
    ])
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/inbox/summary', { headers: { 'X-Classmate-Token': token } }), env, ctx)
    await waitOnExecutionContext(ctx)
    const body = await res.json() as any

    expect(body.data.notificationUnread).toBeGreaterThanOrEqual(1)
    expect(body.data.mailUnread).toBeGreaterThanOrEqual(1)
    expect(body.data.totalUnread).toBe(body.data.notificationUnread + body.data.mailUnread)
  })
})
```

- [ ] **Step 2: 运行测试并确认 404**

Run: `pnpm --filter worker exec vitest run tests/class-space-inbox.test.ts`

Expected: FAIL，summary 路由不存在。

- [ ] **Step 3: 实现 inbox summary**

创建 `workers/api/src/routes/inbox.ts`：

```ts
import { Hono } from 'hono'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'

type Bindings = { DB: D1Database }
export const inboxRoutes = new Hono<{ Bindings: Bindings }>()

inboxRoutes.get('/inbox/summary', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const [notifications, mail] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM notifications WHERE recipient_slug = ? AND read_at IS NULL').bind(identity.slug),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM mail_recipients WHERE recipient_slug = ? AND read_at IS NULL AND deleted_at IS NULL').bind(identity.slug),
  ])
  const notificationUnread = Number((notifications.results[0] as any)?.count || 0)
  const mailUnread = Number((mail.results[0] as any)?.count || 0)

  return c.json({
    success: true,
    data: { notificationUnread, mailUnread, totalUnread: notificationUnread + mailUnread },
  })
})
```

- [ ] **Step 4: 挂载、验证并提交**

在 `workers/api/src/index.ts` 导入 `inboxRoutes` 并增加 `app.route('/api', inboxRoutes)`。该路由必须保持现有 `no-store` 私密缓存策略。

Run: `pnpm --filter worker exec vitest run tests/class-space-inbox.test.ts`

Expected: PASS。

```bash
git add workers/api/src/routes/inbox.ts workers/api/src/index.ts workers/api/tests/class-space-inbox.test.ts
git commit -m "feat: add combined inbox unread summary"
```

---

### Task 3: 补齐公开站点 API 客户端

**Files:**
- Create: `packages/site-astro/src/api/classSpace.ts`
- Modify: `packages/site-astro/src/api/postOffice.ts`
- Modify: `packages/site-astro/src/api/classmateAuth.ts`
- Create: `packages/site-astro/tests/class-space-navigation-static.test.ts`
- Modify: `packages/site-astro/package.json`

- [ ] **Step 1: 写客户端静态失败测试**

创建 `class-space-navigation-static.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const src = resolve(__dirname, '../src')
const read = (path: string) => readFileSync(resolve(src, path), 'utf-8')

describe('class space and inbox contracts', () => {
  it('defines focused API clients', () => {
    expect(existsSync(resolve(src, 'api/classSpace.ts'))).toBe(true)
    expect(read('api/postOffice.ts')).toContain('/api/inbox/summary')
    expect(read('api/postOffice.ts')).toContain('/api/mailbox/threads/:id'.replace(':id', '${threadId}'))
    expect(read('api/postOffice.ts')).toContain('/api/notifications')
    expect(read('api/classmateAuth.ts')).toContain('/api/classmate-auth/me')
  })
})
```

将该测试文件加入 `packages/site-astro/package.json` 的 `test` 命令。

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm --filter site-astro test -- tests/class-space-navigation-static.test.ts`

Expected: FAIL，`api/classSpace.ts` 不存在。

- [ ] **Step 3: 实现班级空间客户端**

创建 `packages/site-astro/src/api/classSpace.ts`：

```ts
import type { ApiResponse, ClassSpaceOverview } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

export async function fetchClassSpaceOverview(apiBase: string): Promise<ClassSpaceOverview> {
  const res = await fetch(joinApiUrl(apiBase, '/api/class-space/overview'))
  const data = await res.json() as ApiResponse<ClassSpaceOverview>
  if (!res.ok || !data.success || !data.data) throw new Error(data.message || '班级空间加载失败')
  return data.data
}
```

- [ ] **Step 4: 补齐 post office 客户端**

在 `postOffice.ts` 保留现有函数并增加以下导出：

```ts
import type { ApiResponse, ClassmateEntry, InboxSummary, MailboxThreadDetail, NotificationItem } from '@alumni/shared'

async function parse<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json() as ApiResponse<T>
  if (!res.ok || !data.success || !data.data) throw new Error(data.message || fallback)
  return data.data
}

export async function reactToPublicMessage(apiBase: string, id: string, reaction: string) {
  const res = await fetch(joinApiUrl(apiBase, `/api/public-messages/${id}/react`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...classmateHeaders() },
    body: JSON.stringify({ reaction }),
  })
  return parse<{ reactions: Record<string, number> }>(res, '表情回应失败')
}

export async function fetchInboxSummary(apiBase: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/inbox/summary'), { headers: classmateHeaders() })
  return parse<InboxSummary>(res, '未读消息加载失败')
}

export async function fetchNotifications(apiBase: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/notifications'), { headers: classmateHeaders() })
  return parse<{ items: NotificationItem[] }>(res, '通知加载失败')
}

export async function markNotificationRead(apiBase: string, id: string) {
  const res = await fetch(joinApiUrl(apiBase, `/api/notifications/${id}/read`), { method: 'PUT', headers: classmateHeaders() })
  if (!res.ok) throw new Error('通知标记失败')
}

export async function fetchMailboxThread(apiBase: string, threadId: string) {
  const res = await fetch(joinApiUrl(apiBase, `/api/mailbox/threads/${threadId}`), { headers: classmateHeaders() })
  return parse<MailboxThreadDetail>(res, '信件详情加载失败')
}

export async function replyMailboxThread(apiBase: string, threadId: string, body: string) {
  const res = await fetch(joinApiUrl(apiBase, `/api/mailbox/threads/${threadId}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...classmateHeaders() },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new Error(((await res.json()) as ApiResponse).message || '回复失败')
}

export async function fetchRecipientDirectory(apiBase: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/classmates'))
  return parse<ClassmateEntry[]>(res, '同学目录加载失败')
}
```

- [ ] **Step 5: 补齐当前账号客户端**

在 `classmateAuth.ts` 增加：

```ts
export async function fetchClassmateMe(apiBase: string) {
  const token = getClassmateToken()
  const res = await fetch(joinApiUrl(apiBase, '/api/classmate-auth/me'), {
    headers: token ? { 'X-Classmate-Token': token } : {},
  })
  const data = await res.json() as ApiResponse<{ student: ClassmateLoginResponse['student']; mustChangePassword: boolean }>
  if (!res.ok || !data.success || !data.data) throw new Error(data.message || '账号信息加载失败')
  return data.data
}
```

- [ ] **Step 6: 验证与提交**

Run: `pnpm --filter site-astro typecheck`

Expected: PASS。

Run: `pnpm --filter site-astro test -- tests/class-space-navigation-static.test.ts`

Expected: PASS。

```bash
git add packages/site-astro/src/api/classSpace.ts packages/site-astro/src/api/postOffice.ts packages/site-astro/src/api/classmateAuth.ts packages/site-astro/tests/class-space-navigation-static.test.ts packages/site-astro/package.json
git commit -m "feat: add class space and inbox clients"
```

---

### Task 4: 拆分并补全公共留言模块

**Files:**
- Create: `packages/site-astro/src/composables/usePublicMessages.ts`
- Create: `packages/site-astro/src/components/MessageComposer.vue`
- Create: `packages/site-astro/src/components/MessageCardGrid.vue`
- Modify: `packages/site-astro/src/components/PublicMessageBoard.vue`
- Modify: `packages/site-astro/tests/class-space-navigation-static.test.ts`
- Modify: `packages/site-astro/tests/post-office-flow.spec.ts`

- [ ] **Step 1: 增加失败断言**

在静态测试中增加：

```ts
it('splits the public message board into reusable units', () => {
  expect(existsSync(resolve(src, 'composables/usePublicMessages.ts'))).toBe(true)
  expect(existsSync(resolve(src, 'components/MessageComposer.vue'))).toBe(true)
  expect(existsSync(resolve(src, 'components/MessageCardGrid.vue'))).toBe(true)
  const grid = read('components/MessageCardGrid.vue')
  expect(grid).toContain("['❤️', '👍', '😂', '🎉']")
  expect(grid).toContain("emit('react'")
})
```

在 `post-office-flow.spec.ts` 的留言 mock 中增加 `PUT` 反应响应，并新增点击反应后计数更新的断言。

- [ ] **Step 2: 运行失败测试**

Run: `pnpm --filter site-astro test -- tests/class-space-navigation-static.test.ts`

Expected: FAIL，三个新模块不存在。

- [ ] **Step 3: 创建共享 composable**

`usePublicMessages.ts` 对外提供单一状态接口：

```ts
import { ref } from 'vue'
import type { PublicMessage } from '@alumni/shared'
import { fetchMyPublicMessages, fetchPublicMessages, reactToPublicMessage, submitPublicMessage } from '../api/postOffice'

export function usePublicMessages(apiBase: string, initial: PublicMessage[] = []) {
  const approved = ref<PublicMessage[]>(initial)
  const mine = ref<PublicMessage[]>([])
  const loading = ref(initial.length === 0)
  const submitting = ref(false)
  const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null)

  async function loadApproved() {
    loading.value = true
    try {
      const data = await fetchPublicMessages(apiBase)
      if (data.success) approved.value = data.data?.items || []
    } finally { loading.value = false }
  }
  async function loadMine() {
    loading.value = true
    try {
      const data = await fetchMyPublicMessages(apiBase)
      if (data.success) mine.value = data.data?.items || []
    } finally { loading.value = false }
  }
  async function submit(content: string, cardStyle: string) {
    submitting.value = true
    notice.value = null
    try {
      const data = await submitPublicMessage(apiBase, content, cardStyle)
      if (!data.success) throw new Error(data.message || '提交失败')
      notice.value = { type: 'success', text: data.message || '留言已提交，等待审核' }
      await loadMine()
      return true
    } catch (error) {
      notice.value = { type: 'error', text: error instanceof Error ? error.message : '网络错误，请稍后重试' }
      return false
    } finally { submitting.value = false }
  }
  async function react(id: string, reaction: string) {
    const result = await reactToPublicMessage(apiBase, id, reaction)
    const target = approved.value.find((item) => item.id === id)
    if (target) target.reactions = result.reactions
  }
  return { approved, mine, loading, submitting, notice, loadApproved, loadMine, submit, react }
}
```

- [ ] **Step 4: 创建编辑器和留言网格**

`MessageComposer.vue` 必须通过 `submit` 事件提交 `{ content, cardStyle }`，并通过 `defineExpose({ reset })` 暴露明确的清空方法：

```ts
const content = ref('')
const cardStyle = ref('paper')
const emit = defineEmits<{ submit: [payload: { content: string; cardStyle: string }] }>()

function submit() {
  const value = content.value.trim()
  if (value) emit('submit', { content: value, cardStyle: cardStyle.value })
}

function reset() {
  content.value = ''
  cardStyle.value = 'paper'
}

defineExpose({ reset })
```

父容器只在 API 成功后调用 `composer.value?.reset()`；失败时保留原输入。`MessageCardGrid.vue` 必须使用下面的反应按钮结构：

```vue
<button
  v-for="reaction in ['❤️', '👍', '😂', '🎉']"
  :key="reaction"
  class="reaction-button"
  :aria-label="`用 ${reaction} 回应`"
  @click="emit('react', message.id, reaction)"
>
  <span aria-hidden="true">{{ reaction }}</span>
  <span>{{ message.reactions[reaction] || 0 }}</span>
</button>
```

移动端样式必须取消卡片旋转：

```css
@media (max-width: 768px) {
  .message-card { transform: none !important; }
  .reaction-button { min-width: 44px; min-height: 44px; }
}
```

- [ ] **Step 5: 重写 PublicMessageBoard 编排**

保留“公共留言/我的提交”两个 tab，改用新 composable、`MessageComposer` 和 `MessageCardGrid`。`onMounted(loadApproved)` 只执行一次；提交成功后切换到“我的提交”，调用 composer 暴露的 `reset()`，不得重置整个组件 key。

```vue
<MessageComposer :submitting="submitting" :notice="notice" @submit="handleSubmit" />
<MessageCardGrid :messages="tab === 'approved' ? approved : mine" :loading="loading" @react="react" />
```

- [ ] **Step 6: 验证与提交**

Run: `pnpm --filter site-astro typecheck`

Run: `pnpm --filter site-astro test -- tests/class-space-navigation-static.test.ts tests/post-office-static.test.ts`

Expected: 全部 PASS。

```bash
git add packages/site-astro/src/composables/usePublicMessages.ts packages/site-astro/src/components/MessageComposer.vue packages/site-astro/src/components/MessageCardGrid.vue packages/site-astro/src/components/PublicMessageBoard.vue packages/site-astro/tests/class-space-navigation-static.test.ts packages/site-astro/tests/post-office-flow.spec.ts
git commit -m "feat: make public messages reusable and reactive"
```

---

### Task 5: 构建响应式班级空间

**Files:**
- Create: `packages/site-astro/src/components/ClassSpaceMessageStage.vue`
- Create: `packages/site-astro/src/components/ClassSpaceAlbumRail.vue`
- Create: `packages/site-astro/src/components/ClassSpaceTimelinePreview.vue`
- Create: `packages/site-astro/src/components/ClassSpaceHub.vue`
- Create: `packages/site-astro/src/pages/class-space.astro`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/tests/class-space-navigation-static.test.ts`
- Create: `packages/site-astro/tests/class-space-flow.spec.ts`
- Modify: `packages/site-astro/package.json`

- [ ] **Step 1: 写页面存在、模块边界和移动端失败测试**

静态测试增加：

```ts
it('adds a focused class space page', () => {
  const page = read('pages/class-space.astro')
  expect(page).toContain('ClassSpaceHub')
  expect(page).toContain('page-shell')
  expect(read('components/ClassSpaceHub.vue')).toContain('class-space-overview')
  expect(read('components/ClassSpaceHub.vue')).not.toContain('AlbumGrid')
  expect(read('components/ClassSpaceHub.vue')).not.toContain('ScrollTrigger')
})
```

创建 `class-space-flow.spec.ts`，写入可独立运行的 mock 与断言：

```ts
import { expect, test } from '@playwright/test'

async function seedSession(page: any) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'class-space-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学', slug: 'test_init', avatarUrl: null }))
  })
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/class-space/overview', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data: {
        messages: [{ id: 'pm_1', authorSlug: 'test_init', authorName: '测试同学', content: '毕业快乐', cardStyle: 'paper', status: 'approved', featured: true, pinned: false, reactions: {}, createdAt: '2026-07-10' }],
        albums: [{ id: 'album_1', title: '毕业相册', coverR2Key: null, photoCount: 12, tags: ['毕业'] }],
        timeline: [{ id: 'event_1', type: 'event', title: '毕业典礼', description: '最后一次集合', date: '2026-06-20' }],
        counts: { approvedMessages: 1, albums: 1, timelineItems: 1 },
      },
    }),
  }))
})

test('class space presents messages, album and timeline previews', async ({ page }) => {
  await seedSession(page)
  await page.goto('./class-space/', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: '公共留言板' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '班级相册' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '时间轴' })).toBeVisible()
  await expect(page.getByRole('link', { name: /完整影像馆/ })).toHaveAttribute('href', /album/)
  await expect(page.getByRole('link', { name: /完整时光轴/ })).toHaveAttribute('href', /timeline/)
})

test('class space has no mobile horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedSession(page)
  await page.goto('./class-space/', { waitUntil: 'networkidle' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})
```

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm --filter site-astro test -- tests/class-space-navigation-static.test.ts`

Expected: FAIL，班级空间页面不存在。

- [ ] **Step 3: 创建三个展示模块**

`ClassSpaceMessageStage.vue` 复用 `usePublicMessages`、`MessageComposer` 和 `MessageCardGrid`，初始只展示最多 8 条 approved 留言。

`ClassSpaceAlbumRail.vue` 接收 `albums`、`apiBase`、`albumHref`，封面地址必须这样生成：

```ts
const coverUrl = (key: string | null) => key
  ? `${props.apiBase}/api/files/${key.replace(/^\/+/, '')}`
  : ''

const albumLink = (id: string) => `${props.albumHref}#album-${encodeURIComponent(id)}`
```

在 `AlbumGrid.vue` 的相册循环容器增加稳定锚点：

```vue
<div v-for="album in filteredAlbums" :id="`album-${album.id}`" :key="album.id" class="album-section">
```

相册轨道必须使用稳定尺寸：

```css
.album-rail { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(220px, 1fr); overflow-x: auto; scroll-snap-type: x proximity; }
.album-cover { aspect-ratio: 4 / 3; width: 100%; object-fit: cover; }
@media (max-width: 768px) { .album-rail { grid-auto-columns: minmax(72vw, 1fr); } }
```

`ClassSpaceTimelinePreview.vue` 桌面端为横向刻度，手机端切为单侧竖线；节点使用 `<time :datetime="item.date">`。

- [ ] **Step 4: 创建 Hub 的加载与错误边界**

`ClassSpaceHub.vue` 只发起一次 overview 请求：

```ts
const overview = ref<ClassSpaceOverview | null>(null)
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try { overview.value = await fetchClassSpaceOverview(props.apiBase) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '班级空间加载失败' }
  finally { loading.value = false }
}

onMounted(load)
```

模板包含稳定 `.class-space-skeleton`，错误状态提供 `@click="load"` 的“重新展开”按钮。左侧目录链接使用 `#messages`、`#albums`、`#timeline`；在 `max-width: 1023px` 下改为横向分段条。

- [ ] **Step 5: 创建 Astro 页面**

`pages/class-space.astro`：

```astro
---
import MainLayout from '../layouts/MainLayout.astro'
import ClassSpaceHub from '../components/ClassSpaceHub.vue'
const base = process.env.SITE_BASE || import.meta.env.BASE_URL || '/'
const apiBase = import.meta.env.VITE_API_BASE_URL || (base.endsWith('/') ? base.slice(0, -1) : base)
---

<MainLayout>
  <section class="class-space-page page-shell">
    <ClassSpaceHub client:load apiBase={apiBase} siteBase={base} />
  </section>
</MainLayout>
```

- [ ] **Step 6: 加入 Playwright 脚本并验证**

将 `tests/class-space-flow.spec.ts` 加入 `test:perf-network`。

Run: `pnpm --filter site-astro typecheck`

Run: `pnpm --filter site-astro test:with-build`

Run: `pnpm --filter site-astro exec playwright test tests/class-space-flow.spec.ts`

Expected: 三组命令全部 PASS；若直接 Playwright 缺少 preview server，则使用 `pnpm --filter site-astro test:perf-network`。

- [ ] **Step 7: 提交 Task 5**

```bash
git add packages/site-astro/src/components/ClassSpaceMessageStage.vue packages/site-astro/src/components/ClassSpaceAlbumRail.vue packages/site-astro/src/components/ClassSpaceTimelinePreview.vue packages/site-astro/src/components/ClassSpaceHub.vue packages/site-astro/src/components/AlbumGrid.vue packages/site-astro/src/pages/class-space.astro packages/site-astro/tests/class-space-navigation-static.test.ts packages/site-astro/tests/class-space-flow.spec.ts packages/site-astro/package.json
git commit -m "feat: add responsive class space"
```

---

### Task 6: 重构纸质目录导航并迁移信箱入口

**Files:**
- Modify: `packages/site-astro/src/components/TopNav.astro`
- Modify: `packages/site-astro/src/pages/preface.astro`
- Modify: `packages/site-astro/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/site-astro/tests/class-space-navigation-static.test.ts`
- Modify: `packages/site-astro/tests/post-office-static.test.ts`
- Modify: `packages/site-astro/tests/post-office-flow.spec.ts`
- Modify: `packages/site-astro/tests/homepage-cover-login.spec.ts`

- [ ] **Step 1: 安装 Vue 版 Lucide 图标**

Run: `pnpm --filter site-astro add lucide-vue-next`

Expected: `packages/site-astro/package.json` 和 `pnpm-lock.yaml` 只增加 `lucide-vue-next` 依赖。

- [ ] **Step 2: 写新导航失败断言**

静态测试增加：

```ts
it('uses class space navigation and a dedicated mailbox icon', () => {
  const nav = read('components/TopNav.astro')
  expect(nav).toContain("href('/class-space')")
  expect(nav).toContain("href('/account')")
  expect(nav).toContain('nav-mailbox-button')
  expect(nav).toContain('/api/inbox/summary')
  expect(nav).toContain('更多功能')
  expect(nav).not.toContain('<span class="link-text">公共留言</span>')
  expect(nav).not.toContain('<span class="link-text">班级邮局</span>')
})

it('keeps both normal and first-login flows on preface', () => {
  const login = read('components/ClassmateLoginBook.vue')
  expect(login.match(/\$\{prefix\}preface/g)?.length).toBe(2)
})
```

更新旧测试：删除“必须显示公共留言和班级邮局文字链接”的断言，改为班级空间链接和 `.nav-mailbox-button`。

- [ ] **Step 3: 重写桌面导航结构**

`TopNav.astro` 的登录后主结构固定为：

```astro
<a href={href('/preface')} class:list={['nav-link', { active: currentPath.startsWith(href('/preface')) }]}>前言</a>
<a href={href('/roster')} class:list={['nav-link', { active: currentPath.startsWith(href('/roster')) || currentPath.startsWith(href('/student')) }]}>同学档案</a>
<a href={href('/class-space')} class:list={['nav-link', { active: currentPath.startsWith(href('/class-space')) }]}>班级空间</a>
<details class="nav-more">
  <summary>更多功能</summary>
  <div class="nav-more-menu">
    <a href={href('/album')}>影像馆</a>
    <a href={href('/timeline')}>时光轴</a>
    <a href={href('/yearbook')}>年度册</a>
  </div>
</details>
<a href={href('/account')} class="nav-account-link">账号管理</a>
<a href={href('/mailbox')} class="nav-mailbox-button" aria-label="班级信箱">
  <Mail :size={20} aria-hidden="true" />
  <span id="mail-unread-stamp" class="mail-unread-stamp" hidden></span>
</a>
```

从 `lucide-vue-next` 导入 `Mail`、`Menu` 和 `ChevronDown`。整个导航 DOM 只渲染一个 `.nav-mailbox-button` 和一个 `#mail-unread-stamp`，通过 CSS grid 在桌面和手机布局中复用同一元素，禁止复制两个相同 ID。图标按钮保持 `44px × 44px`，未读角标绝对定位且不参与布局。

- [ ] **Step 4: 实现移动端应用式顶部栏与抽屉**

移动端固定三列：菜单按钮、当前标题、信箱按钮。抽屉打开时给 `document.documentElement` 添加 `nav-open`；关闭、点击链接和 `astro:page-load` 时移除。

```ts
function initNavInteractions() {
  const controller = new AbortController()
  const toggle = document.querySelector<HTMLInputElement>('#menu-toggle')
  const close = () => {
    if (toggle) toggle.checked = false
    document.documentElement.classList.remove('nav-open')
  }
  toggle?.addEventListener('change', () => {
    document.documentElement.classList.toggle('nav-open', !!toggle.checked)
  }, { signal: controller.signal })
  document.querySelectorAll('.nav-drawer a').forEach((link) => link.addEventListener('click', close, { signal: controller.signal }))
  return () => { controller.abort(); close() }
}
```

模块级保存 cleanup，每次 `astro:page-load` 先调用旧 cleanup，再初始化。CSS 使用：

```css
html.nav-open { overflow: hidden; }
.mobile-nav-bar { grid-template-columns: 44px minmax(0, 1fr) 44px; }
.mobile-page-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

- [ ] **Step 5: 改用统一未读摘要并广播更新**

将角标请求改为 `/api/inbox/summary`，读取 `data.data.totalUnread`。页面监听 `alumni:inbox-changed` 后重新请求；请求失败时保留当前角标，不显示错误数字。

```ts
window.addEventListener('alumni:inbox-changed', syncInboxUnread, { signal: controller.signal })
```

- [ ] **Step 6: 更新前言页的下一步入口**

前言仍是登录后默认落点，将底部两个入口调整为同学档案和班级空间，避免新用户直接跳进完整相册：

```astro
<a href={href('/roster')} class="btn-primary">进入同学档案</a>
<a href={href('/class-space')} class="btn-secondary">前往班级空间</a>
```

- [ ] **Step 7: 保留首页极简和纸质滑片动画**

未登录首页继续隐藏完整链接与菜单按钮。当前项滑片只动画化 transform/opacity：

```css
.nav-link::after { transform: scaleX(0); opacity: 0; transition: transform 260ms var(--ease-out-quart), opacity 180ms ease; }
.nav-link.active::after { transform: scaleX(1); opacity: 1; }
@media (prefers-reduced-motion: reduce) { .nav-link::after, .nav-drawer { transition: none; } }
```

- [ ] **Step 8: 验证并提交**

Run: `pnpm --filter site-astro typecheck`

Run: `pnpm --filter site-astro test -- tests/class-space-navigation-static.test.ts tests/post-office-static.test.ts`

Run: `pnpm --filter site-astro test:perf-network`

Expected: 登录仍进入 `/preface`；桌面和移动导航测试通过；首页未登录状态仍极简。

```bash
git add packages/site-astro/src/components/TopNav.astro packages/site-astro/src/pages/preface.astro packages/site-astro/package.json pnpm-lock.yaml packages/site-astro/tests/class-space-navigation-static.test.ts packages/site-astro/tests/post-office-static.test.ts packages/site-astro/tests/post-office-flow.spec.ts packages/site-astro/tests/homepage-cover-login.spec.ts
git commit -m "feat: rebuild navigation as a paper directory"
```

---

### Task 7: 补全统一班级信箱

**Files:**
- Create: `packages/site-astro/src/components/MailboxList.vue`
- Create: `packages/site-astro/src/components/MailboxDetail.vue`
- Create: `packages/site-astro/src/components/RecipientPicker.vue`
- Create: `packages/site-astro/src/components/MailComposer.vue`
- Modify: `packages/site-astro/src/components/MailboxApp.vue`
- Create: `packages/site-astro/tests/mailbox-account-flow.spec.ts`
- Modify: `packages/site-astro/tests/class-space-navigation-static.test.ts`
- Modify: `packages/site-astro/package.json`

- [ ] **Step 1: 写信箱失败测试**

`mailbox-account-flow.spec.ts` 顶部先定义会话 helper：

```ts
import { expect, test } from '@playwright/test'

async function seedClassmateSession(page: any) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'mailbox-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学', slug: 'test_init', avatarUrl: null }))
  })
}
```

随后 mock 通知列表、信件列表、信件详情、已读、回复、同学目录和写信接口，覆盖：

```ts
test('mailbox merges notifications and mail, opens details, replies and selects recipients by name', async ({ page }) => {
  await seedClassmateSession(page)
  await page.goto('./mailbox/', { waitUntil: 'networkidle' })
  await expect(page.getByText('留言审核通过')).toBeVisible()
  await expect(page.getByText('同学来信')).toBeVisible()
  await page.getByText('同学来信').click()
  await expect(page.getByText('完整信件正文')).toBeVisible()
  await page.getByPlaceholder('写下回复').fill('收到，谢谢你')
  await page.getByRole('button', { name: '寄出回复' }).click()
  await page.getByRole('button', { name: '写信' }).click()
  await page.getByPlaceholder('搜索同学姓名').fill('李同学')
  await page.getByRole('option', { name: /李同学/ }).click()
  await expect(page.getByText('李同学')).toBeVisible()
  await expect(page.getByPlaceholder(/slug/i)).toHaveCount(0)
})
```

静态测试断言四个子组件存在，并且 `MailboxApp.vue` 引用它们。

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm --filter site-astro test -- tests/class-space-navigation-static.test.ts`

Expected: FAIL，信箱子组件不存在。

- [ ] **Step 3: 定义统一列表项并实现 MailboxList**

在 `MailboxApp.vue` 内定义：

```ts
type InboxListItem = {
  key: string
  source: 'notification' | 'mail'
  category: 'admin' | 'private' | 'review'
  id: string
  title: string
  preview: string
  senderName: string
  unread: boolean
  updatedAt: string
}
```

通知按 `type.startsWith('public_message_')` 映射为 `review`，其他通知映射为 `admin`；邮件 `threadType === 'private'` 映射为 `private`，其余映射为 `admin`。合并后按 `updatedAt` 倒序。

`MailboxList.vue` 提供“全部、管理员、同学私信、留言消息”筛选，点击时 emit `select`，未读项使用文本与印章共同表达。

- [ ] **Step 4: 实现详情与回复**

`MailboxDetail.vue` 接收选中项、通知详情或 `MailboxThreadDetail`。只有 `source === 'mail' && detail.thread.allowReply` 时显示回复框：

```vue
<form v-if="canReply" class="reply-paper" @submit.prevent="emit('reply', replyBody)">
  <textarea v-model="replyBody" placeholder="写下回复" maxlength="2000" />
  <button class="btn-primary" :disabled="replying || !replyBody.trim()">寄出回复</button>
</form>
```

发送成功后清空回复框，并重新读取当前线程。

- [ ] **Step 5: 实现按姓名选择收件人**

`RecipientPicker.vue` 仅在写信面板打开时由父组件传入目录；排除当前登录 slug，按姓名和 slug 搜索，但界面只显示头像与姓名。选择后 emit 完整 `ClassmateEntry`。

`MailComposer.vue` 不渲染 slug 输入，提交时从已选同学读取 `recipient.slug`：

```ts
emit('send', {
  recipientSlug: recipient.value.slug,
  subject: subject.value.trim(),
  body: body.value.trim(),
})
```

- [ ] **Step 6: 重写 MailboxApp 状态编排**

初始并行请求通知和邮件：

```ts
async function loadInbox() {
  loading.value = true
  error.value = ''
  try {
    const [noticeData, mailData] = await Promise.all([
      fetchNotifications(props.apiBase),
      fetchMailboxThreads(props.apiBase),
    ])
    notifications.value = noticeData.items
    threads.value = mailData.success ? mailData.data?.items || [] : []
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '班级信箱加载失败'
  } finally { loading.value = false }
}
```

打开通知调用 `markNotificationRead`；打开邮件调用 `fetchMailboxThread`。成功后执行：

```ts
window.dispatchEvent(new CustomEvent('alumni:inbox-changed'))
```

桌面 `min-width: 769px` 使用 `minmax(280px, 38%) minmax(0, 1fr)` 双栏；手机只显示列表或详情之一，详情顶部提供“返回信箱”。

- [ ] **Step 7: 验证并提交**

将新 Playwright 文件加入 `test:perf-network`。

Run: `pnpm --filter site-astro typecheck`

Run: `pnpm --filter site-astro test:with-build`

Run: `pnpm --filter site-astro test:perf-network`

Expected: 信箱详情、回复、按姓名写信、手机无横向溢出全部 PASS。

```bash
git add packages/site-astro/src/components/MailboxList.vue packages/site-astro/src/components/MailboxDetail.vue packages/site-astro/src/components/RecipientPicker.vue packages/site-astro/src/components/MailComposer.vue packages/site-astro/src/components/MailboxApp.vue packages/site-astro/tests/mailbox-account-flow.spec.ts packages/site-astro/tests/class-space-navigation-static.test.ts packages/site-astro/package.json
git commit -m "feat: complete the unified class inbox"
```

---

### Task 8: 新增轻量账号中心

**Files:**
- Create: `packages/site-astro/src/components/AccountCenter.vue`
- Create: `packages/site-astro/src/pages/account.astro`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/site-astro/tests/class-space-navigation-static.test.ts`
- Modify: `packages/site-astro/tests/mailbox-account-flow.spec.ts`

- [ ] **Step 1: 写账号中心失败测试**

静态测试增加：

```ts
it('adds a real account center and direct profile editing entry', () => {
  expect(existsSync(resolve(src, 'pages/account.astro'))).toBe(true)
  expect(read('pages/account.astro')).toContain('AccountCenter')
  expect(read('components/AccountCenter.vue')).toContain('changeClassmatePassword')
  expect(read('components/SelfEditPanel.vue')).toContain("searchParams.get('edit') === '1'")
})
```

在 `mailbox-account-flow.spec.ts` 增加账号信息、个人主页、编辑资料和修改密码流程：

```ts
test('account center exposes profile, direct edit and password change', async ({ page }) => {
  await page.route('**/api/classmate-auth/me', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: { student: { name: '测试同学', slug: 'test_init', avatarUrl: null }, mustChangePassword: false } }),
  }))
  await page.route('**/api/classmate-auth/change-password', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: '密码已更新' }),
  }))
  await seedClassmateSession(page)
  await page.goto('./account/', { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { name: '账号管理' })).toBeVisible()
  await expect(page.getByRole('link', { name: '查看个人主页' })).toHaveAttribute('href', /student\/test_init/)
  await expect(page.getByRole('link', { name: '编辑个人资料' })).toHaveAttribute('href', /student\/test_init\?edit=1/)
  await page.getByLabel('原密码').fill('12345678')
  await page.getByLabel('新密码').fill('new-pass-123')
  await page.getByLabel('确认新密码').fill('new-pass-123')
  await page.getByRole('button', { name: '修改密码' }).click()
  await expect(page.getByText('密码已更新')).toBeVisible()
})
```

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm --filter site-astro test -- tests/class-space-navigation-static.test.ts`

Expected: FAIL，账号页面不存在。

- [ ] **Step 3: 创建账号中心组件和页面**

`AccountCenter.vue` 从 `getClassmateStudent()` 立即显示本地身份，再用 `fetchClassmateMe()` 校验；提供以下链接：

```ts
const profileHref = computed(() => `${normalizedBase.value}student/${student.value?.slug || ''}`)
const editHref = computed(() => `${profileHref.value}?edit=1`)
```

修改密码表单校验新密码至少 8 位且两次一致，再调用 `changeClassmatePassword`。退出调用 `logoutClassmate`，无论网络结果如何都执行 `clearClassmateSession()` 并跳转站点 base。

`pages/account.astro` 使用 `MainLayout`、`page-shell`、`page-header` 和 `AccountCenter client:load`。

- [ ] **Step 4: 支持直达个人资料编辑**

修改 `SelfEditPanel.vue` 的 `onMounted`：

```ts
onMounted(() => {
  isMounted.value = true
  const searchParams = new URLSearchParams(window.location.search)
  if (isOwner.value && searchParams.get('edit') === '1') {
    void openEditor()
  }
})
```

关闭编辑器时使用 `history.replaceState` 移除 `edit=1`，避免刷新后再次自动打开：

```ts
const url = new URL(window.location.href)
url.searchParams.delete('edit')
history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`)
```

- [ ] **Step 5: 验证并提交**

Run: `pnpm --filter site-astro typecheck`

Run: `pnpm --filter site-astro test:with-build`

Run: `pnpm --filter site-astro test:perf-network`

Expected: 账号中心和直达编辑流程通过，未登录仍由 `MainLayout` 守卫送回首页。

```bash
git add packages/site-astro/src/components/AccountCenter.vue packages/site-astro/src/pages/account.astro packages/site-astro/src/components/SelfEditPanel.vue packages/site-astro/tests/class-space-navigation-static.test.ts packages/site-astro/tests/mailbox-account-flow.spec.ts
git commit -m "feat: add classmate account center"
```

---

### Task 9: 锁定性能、动画生命周期与响应式回归

**Files:**
- Modify: `packages/site-astro/tests/performance-network.spec.ts`
- Modify: `packages/site-astro/tests/animation-ownership.test.ts`
- Modify: `packages/site-astro/tests/public-site-major-redesign-visual.spec.ts`
- Modify: `packages/site-astro/tests/class-space-flow.spec.ts`
- Modify: `packages/site-astro/tests/mailbox-account-flow.spec.ts`

- [ ] **Step 1: 增加班级空间网络失败断言**

在 `performance-network.spec.ts` 增加：

```ts
test('class space loads one overview without full gallery, timeline or heavy animation chunks', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url().toLowerCase()))
  await seedClassmateSession(page)
  await page.goto('./class-space/', { waitUntil: 'networkidle' })

  expect(requests.filter((url) => url.includes('/api/class-space/overview'))).toHaveLength(1)
  expect(requests.some((url) => url.includes('/api/albums'))).toBe(false)
  expect(requests.some((url) => url.includes('/api/timeline'))).toBe(false)
  for (const token of ['gsap', 'scrolltrigger', 'albumgrid']) {
    expect(hasRequestedChunk(requests, token)).toBe(false)
  }
})
```

- [ ] **Step 2: 增加生命周期静态断言**

`animation-ownership.test.ts` 断言导航存在 AbortController cleanup、班级空间不引用 GSAP/ScrollTrigger、三个新组件包含 reduced motion 样式。

- [ ] **Step 3: 扩大响应式视觉矩阵**

在视觉测试中将关键页面扩大为：

```ts
const responsivePages = ['./preface/', './roster/', './class-space/', './mailbox/', './account/', './album/', './timeline/']
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]
```

每个组合断言 `document.documentElement.scrollWidth <= document.documentElement.clientWidth`，并保存截图到 `test-results/phase-13/`。

- [ ] **Step 4: 验证 reduced motion 与菜单释放**

Playwright 使用 `page.emulateMedia({ reducedMotion: 'reduce' })`，断言班级空间卡片计算样式没有持续 animation；打开手机菜单后导航至班级空间，断言 `document.documentElement.classList.contains('nav-open')` 为 false。

- [ ] **Step 5: 运行站点完整门禁并提交**

Run: `pnpm verify:site`

Expected: typecheck、build、静态测试和所有 Playwright 测试通过。

```bash
git add packages/site-astro/tests/performance-network.spec.ts packages/site-astro/tests/animation-ownership.test.ts packages/site-astro/tests/public-site-major-redesign-visual.spec.ts packages/site-astro/tests/class-space-flow.spec.ts packages/site-astro/tests/mailbox-account-flow.spec.ts
git commit -m "test: lock class space responsive performance"
```

---

### Task 10: 整库验收、人工视觉 QA 与交付记录

**Files:**
- Create: `docs/phase-13-acceptance-report.md`

- [ ] **Step 1: 运行 Worker 门禁**

Run: `pnpm verify:worker`

Expected: 全部 Worker Vitest 测试 PASS。

- [ ] **Step 2: 运行后台门禁**

Run: `pnpm verify:admin`

Expected: 后台 typecheck 与 build PASS，确认公开站点改动没有破坏后台工作区。

- [ ] **Step 3: 运行站点门禁**

Run: `pnpm verify:site`

Expected: 站点 typecheck、构建、静态测试、性能与流程 Playwright 全部 PASS。

- [ ] **Step 4: 运行整库门禁**

Run: `pnpm verify:all`

Expected: 命令退出码为 0。

- [ ] **Step 5: 启动 preview 并进行人工视觉走查**

Run: `pnpm --filter site-astro preview --host 127.0.0.1 --port 4323`

逐一检查以下场景：

1. 1440x900：前言、同学档案、班级空间、信箱、账号中心。
2. 768x1024：更多功能菜单、班级空间横向目录、信箱双栏降级。
3. 390x844：手机顶部栏、抽屉、留言输入、相册横滑、时间轴、信箱列表/详情、写信、账号中心。
4. 慢速网络：班级空间 skeleton 高度稳定，图片加载后不跳变。
5. reduced motion：导航、留言卡和时间轴没有持续动画。
6. 空数据与接口失败：每个模块可重试，页面不空白。

- [ ] **Step 6: 写验收报告**

创建 `docs/phase-13-acceptance-report.md`，使用以下完整结构记录实际结果：

```markdown
# Phase 13 班级空间与导航重构验收报告

日期：2026-07-10

## 自动化门禁

| 门禁 | 结果 | 备注 |
| --- | --- | --- |
| `pnpm verify:worker` | 通过 | 班级空间摘要与统一未读测试通过 |
| `pnpm verify:admin` | 通过 | 后台无回归 |
| `pnpm verify:site` | 通过 | 静态、类型、构建和 Playwright 通过 |
| `pnpm verify:all` | 通过 | 整库退出码 0 |

## 功能验收

- 登录后进入前言。
- 班级空间展示留言、相册摘要和时间轴摘要。
- 导航包含班级空间、更多功能、账号管理和信箱按钮。
- 信箱支持通知、私信、详情、已读、回复和按姓名写信。
- 账号中心支持个人主页、编辑资料、改密和退出。

## 视觉与响应式验收

- 1440x900：通过。
- 768x1024：通过。
- 390x844：通过。
- 无横向溢出、遮挡和明显布局跳变。
- reduced motion 降级通过。

## 已知限制

- `/messages` 继续作为兼容入口保留。
- 通知和邮件数据库保持分离，由前端统一呈现。
```

若任何项目未通过，不得写“通过”；修复并重跑相应门禁后再更新报告。

- [ ] **Step 7: 检查工作区与提交验收报告**

Run: `git status --short`

Expected: 只显示验收报告和明确属于本阶段的测试截图；测试截图不提交，除非仓库已有快照策略。

```bash
git add docs/phase-13-acceptance-report.md
git commit -m "docs: record class space redesign acceptance"
```

---

## 最终完成标准

- [ ] 登录与首次改密完成后都进入 `/preface`。
- [ ] 桌面导航为品牌、前言、同学档案、班级空间、更多功能、账号管理和信箱按钮。
- [ ] 手机导航为菜单、当前标题和信箱按钮，抽屉关闭后不残留滚动锁。
- [ ] 班级空间只请求一次 overview，展示留言、相册摘要和时间轴摘要。
- [ ] `/messages`、`/album`、`/timeline`、`/yearbook` 等旧入口继续可用。
- [ ] 信箱角标等于通知未读与邮件未读之和。
- [ ] 信箱支持列表、分类、详情、已读、回复和按姓名写信。
- [ ] 账号中心支持个人主页、直达编辑、修改密码和退出。
- [ ] 390x844、768x1024、1440x900 无横向溢出、遮挡和文字挤压。
- [ ] 不新增 GSAP/ScrollTrigger 首屏依赖，不出现重复动画监听。
- [ ] `pnpm verify:all` 通过并形成 Phase 13 验收报告。
