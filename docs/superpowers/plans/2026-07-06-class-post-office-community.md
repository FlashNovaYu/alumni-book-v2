# 班级邮局与社区互动系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一套贴合同学录复古纸张风格的导航、公共留言区、同学邮箱、系统通知和后台审核/发信能力。

**Architecture:** 继续复用现有 Astro + Vue 公开站点、Vue 管理后台、Hono Worker、D1 数据库和同学账号 session。公共留言、通知、邮箱分别建独立数据表和路由，但共享同学 token 鉴权、管理员 JWT 鉴权、审核回执与未读统计，避免把互动功能做成三套孤岛。

**Tech Stack:** Astro 5、Vue 3、TypeScript、Hono、Cloudflare Worker、D1、Vitest、Playwright、pnpm workspace。

---

## Scope Check

本规格包含导航视觉、公共留言、通知回执、邮箱、后台管理五个子系统。它们共享同一套登录态、未读统计和审核流，因此采用一份总计划，按任务边界分阶段交付。每个任务都必须能独立提交，且在进入下一任务前保持已有测试通过。

## File Structure

### 数据与 Worker

- Create: `workers/api/migrations/0011_post_office_community.sql`
  - 新增 `public_messages`、`content_reviews`、`notifications`、`mail_threads`、`mail_messages`、`mail_recipients`。
- Modify: `workers/api/src/db/schema.sql`
  - 同步完整 schema，保持本地迁移脚本和测试 schema 一致。
- Modify: `workers/api/tests/db-helper.ts`
  - 给 Worker 测试环境加入 0011 迁移。
- Create: `workers/api/src/lib/classmateGuard.ts`
  - 统一读取 `X-Classmate-Token` 并返回当前同学 slug 和账号状态。
- Create: `workers/api/src/lib/notificationService.ts`
  - 统一创建通知、未读统计、标记已读。
- Create: `workers/api/src/routes/publicMessages.ts`
  - 前台公共留言和后台公共留言审核接口。
- Create: `workers/api/src/routes/notifications.ts`
  - 前台通知列表、摘要、已读接口。
- Create: `workers/api/src/routes/mailbox.ts`
  - 前台邮箱收发信接口。
- Create: `workers/api/src/routes/adminMail.ts`
  - 管理员发信、群发、发信记录接口。
- Modify: `workers/api/src/index.ts`
  - 注册新路由、缓存策略、鉴权中间件。
- Modify: `workers/api/tests/api.test.ts`
  - 增加公共留言、通知、邮箱、后台发信 API 测试。

### 共享类型

- Modify: `packages/shared/src/types.ts`
  - 增加 `PublicMessage`、`NotificationItem`、`MailboxThread`、`MailboxMessage`、`MailboxSummary`。

### 公开站点

- Modify: `packages/site-astro/src/components/TopNav.astro`
  - 导航改为硫酸纸书签视觉，新增公共留言和班级邮局入口，显示未读邮戳。
- Create: `packages/site-astro/src/api/postOffice.ts`
  - 前台公共留言、通知、邮箱 API helper。
- Create: `packages/site-astro/src/components/PublicMessageBoard.vue`
  - 公共留言区主交互组件。
- Create: `packages/site-astro/src/components/MailboxApp.vue`
  - 收件箱、信件详情、写信交互组件。
- Create: `packages/site-astro/src/pages/messages.astro`
  - 公共留言页面。
- Create: `packages/site-astro/src/pages/mailbox.astro`
  - 班级邮局页面。
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
  - 增加“给 TA 写信”和“我的邮箱”入口。
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
  - 允许 `/messages` 与 `/mailbox` 走现有登录守卫，不额外放开未登录访问。
- Create: `packages/site-astro/tests/post-office-static.test.ts`
  - 静态约束：页面、导航、组件、无 lamp-glow。
- Create: `packages/site-astro/tests/post-office-flow.spec.ts`
  - Playwright 交互与移动端无横向滚动测试。
- Modify: `packages/site-astro/package.json`
  - 把新增 Vitest/Playwright 测试加入脚本。

### 管理后台

- Modify: `packages/admin/src/views/MessagesView.vue`
  - 加入个人留言/公共留言类型筛选和公共留言审核操作。
- Create: `packages/admin/src/views/MailView.vue`
  - 管理员写信、群发、发信记录。
- Modify: `packages/admin/src/main.ts`
  - 增加 `/mail` 后台路由。
- Modify: `packages/admin/src/views/AdminLayout.vue`
  - 增加“班级邮局”导航项。

---

## Task 1: 先写保护性测试，锁定范围

**Files:**
- Create: `packages/site-astro/tests/post-office-static.test.ts`
- Create: `packages/site-astro/tests/post-office-flow.spec.ts`
- Modify: `packages/site-astro/package.json`
- Modify: `workers/api/tests/api.test.ts`
- Modify: `workers/api/tests/db-helper.ts`

- [ ] **Step 1: 新增站点静态测试**

Create `packages/site-astro/tests/post-office-static.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const srcRoot = path.resolve(__dirname, '../src')

function read(relativePath: string) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf-8')
}

function exists(relativePath: string) {
  return fs.existsSync(path.join(srcRoot, relativePath))
}

describe('class post office static constraints', () => {
  it('replaces tubelight navigation with paper bookmark navigation', () => {
    const source = read('components/TopNav.astro')

    expect(source).toContain('paper-bookmark-nav')
    expect(source).toContain('ink-line')
    expect(source).toContain('mail-unread-stamp')
    expect(source).not.toContain('lamp-glow')
    expect(source).not.toContain('复古床头灯泡渐变光晕')
  })

  it('adds public message and mailbox public pages', () => {
    expect(exists('pages/messages.astro')).toBe(true)
    expect(exists('pages/mailbox.astro')).toBe(true)
    expect(exists('components/PublicMessageBoard.vue')).toBe(true)
    expect(exists('components/MailboxApp.vue')).toBe(true)
  })

  it('keeps post office pages in paper page shell', () => {
    const messages = read('pages/messages.astro')
    const mailbox = read('pages/mailbox.astro')

    for (const source of [messages, mailbox]) {
      expect(source).toContain('page-shell')
      expect(source).toContain('page-header')
      expect(source).toContain('paper-panel')
    }
  })

  it('adds profile write-mail entry without replacing profile message wall', () => {
    const source = read('components/StudentProfile.vue')

    expect(source).toContain('profile-mail-actions')
    expect(source).toContain('给 TA 写信')
    expect(source).toContain('MessageWall')
  })
})
```

- [ ] **Step 2: 新增 Playwright 流程测试**

Create `packages/site-astro/tests/post-office-flow.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

async function seedClassmateSession(page: any) {
  await page.goto('/')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({
      name: '测试同学',
      slug: 'test_init',
      avatarUrl: null,
    }))
  })
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/notifications/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { unreadCount: 2 } }),
    })
  })

  await page.route('**/api/public-messages**', async (route, request) => {
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'pm_test',
            status: 'pending',
            content: '测试公共留言',
          },
          message: '留言已提交，等待审核',
        }),
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
            id: 'pm_approved',
            authorName: '测试同学',
            content: '愿我们都前程似锦',
            cardStyle: 'paper',
            status: 'approved',
            featured: true,
            pinned: false,
            reactions: {},
            createdAt: '2026-07-06 12:00:00',
          }],
        },
      }),
    })
  })

  await page.route('**/api/mailbox/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          items: [{
            id: 'thread_1',
            subject: '欢迎来到班级邮局',
            threadType: 'system',
            senderName: '系统邮局',
            preview: '你的收件箱已经准备好了',
            unread: true,
            updatedAt: '2026-07-06 12:00:00',
          }],
        },
      }),
    })
  })
})

test('logged-in navigation exposes public messages and mailbox with unread stamp', async ({ page }) => {
  await seedClassmateSession(page)
  await page.goto('/roster/', { waitUntil: 'networkidle' })

  await expect(page.getByRole('link', { name: /公共留言/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /班级邮局/ })).toBeVisible()
  await expect(page.locator('.mail-unread-stamp')).toContainText('2')
})

test('public message page can submit a pending message', async ({ page }) => {
  await seedClassmateSession(page)
  await page.goto('/messages/', { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { name: /公共留言/ })).toBeVisible()
  await page.getByPlaceholder(/写一张便签/).fill('测试公共留言')
  await page.getByRole('button', { name: /提交留言/ }).click()
  await expect(page.getByText(/等待审核/)).toBeVisible()
})

test('mailbox page is usable on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedClassmateSession(page)
  await page.goto('/mailbox/', { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { name: /班级邮局/ })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})
```

- [ ] **Step 3: 把站点测试加入脚本**

Modify `packages/site-astro/package.json`:

```json
{
  "scripts": {
    "test": "vitest run tests/navigation.test.ts tests/privacy-static.test.ts tests/feature-static.test.ts tests/performance-static.test.ts tests/student-profile-lifecycle.test.ts tests/animation-ownership.test.ts tests/classmate-auth-static.test.ts tests/responsive-vintage-static.test.ts tests/public-site-major-redesign-static.test.ts tests/post-office-static.test.ts",
    "test:perf-network": "playwright test tests/performance-network.spec.ts tests/classmate-login-flow.spec.ts tests/homepage-cover-login.spec.ts tests/public-site-major-redesign-visual.spec.ts tests/post-office-flow.spec.ts"
  }
}
```

Keep the rest of the file unchanged.

- [ ] **Step 4: 给 Worker 测试环境加入 0011 测试迁移**

Modify `workers/api/tests/db-helper.ts` by appending this migration object to `testMigrations` after `0010_classmate_accounts`:

```ts
  { name: '0011_post_office_community', queries: [
    `CREATE TABLE IF NOT EXISTS public_messages (
      id TEXT PRIMARY KEY,
      author_slug TEXT NOT NULL,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      card_style TEXT DEFAULT 'paper',
      status TEXT DEFAULT 'pending',
      review_reason TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      featured INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0,
      reactions TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_public_messages_status ON public_messages(status, pinned, featured, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_public_messages_author ON public_messages(author_slug, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS content_reviews (
      id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      content_id TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      admin_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_slug TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      related_type TEXT,
      related_id TEXT,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_slug, read_at, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS mail_threads (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      thread_type TEXT DEFAULT 'private',
      created_by_type TEXT NOT NULL,
      created_by_slug TEXT,
      allow_reply INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS mail_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_slug TEXT,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (thread_id) REFERENCES mail_threads(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS mail_recipients (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      recipient_slug TEXT NOT NULL,
      read_at TEXT,
      archived_at TEXT,
      deleted_at TEXT,
      FOREIGN KEY (thread_id) REFERENCES mail_threads(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_mail_recipients_slug ON mail_recipients(recipient_slug, read_at)`,
    `CREATE INDEX IF NOT EXISTS idx_mail_messages_thread ON mail_messages(thread_id, created_at)`,
  ]}
```

- [ ] **Step 5: 写 Worker API 失败测试**

Append to `workers/api/tests/api.test.ts`:

```ts
async function loginAsClassmateForTest(slug = 'test_init'): Promise<string> {
  const hash = await testHashPassword('123456')
  await env.DB.prepare(
    "UPDATE students SET account_password_hash = ?, account_initial_password_changed = 1, account_status = 'active' WHERE slug = ?"
  ).bind(hash, slug).run()

  const req = new Request('http://localhost/api/classmate-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, password: '123456' }),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  const body = await res.json() as any
  return body.data.token
}

describe('Post Office Community API', () => {
  it('POST /api/public-messages requires classmate token', async () => {
    const req = new Request('http://localhost/api/public-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '未登录留言' }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })

  it('classmate can submit public message and admin approval creates notification', async () => {
    const classmateToken = await loginAsClassmateForTest()
    const submitReq = new Request('http://localhost/api/public-messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Classmate-Token': classmateToken,
      },
      body: JSON.stringify({ content: '愿我们顶峰相见', cardStyle: 'letter' }),
    })
    const submitCtx = createExecutionContext()
    const submitRes = await worker.fetch(submitReq, env, submitCtx)
    await waitOnExecutionContext(submitCtx)
    expect(submitRes.status).toBe(200)
    const submitBody = await submitRes.json() as any
    expect(submitBody.data.status).toBe('pending')

    const adminToken = await loginAsAdminForTest()
    const approveReq = new Request(`http://localhost/api/admin/public-messages/${submitBody.data.id}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const approveCtx = createExecutionContext()
    const approveRes = await worker.fetch(approveReq, env, approveCtx)
    await waitOnExecutionContext(approveCtx)
    expect(approveRes.status).toBe(200)

    const summaryReq = new Request('http://localhost/api/notifications/summary', {
      headers: { 'X-Classmate-Token': classmateToken },
    })
    const summaryCtx = createExecutionContext()
    const summaryRes = await worker.fetch(summaryReq, env, summaryCtx)
    await waitOnExecutionContext(summaryCtx)
    const summaryBody = await summaryRes.json() as any
    expect(summaryBody.data.unreadCount).toBeGreaterThanOrEqual(1)
  })

  it('non-recipient cannot read mailbox thread', async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO students (id, name, slug, account_status) VALUES ('stu_other', '其他同学', 'other', 'active')").run()
    const ownerToken = await loginAsClassmateForTest('test_init')
    const otherToken = await loginAsClassmateForTest('other')

    const createReq = new Request('http://localhost/api/mailbox/threads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Classmate-Token': ownerToken,
      },
      body: JSON.stringify({ recipientSlug: 'other', subject: '一封测试信', body: '你好，未来见。' }),
    })
    const createCtx = createExecutionContext()
    const createRes = await worker.fetch(createReq, env, createCtx)
    await waitOnExecutionContext(createCtx)
    const createBody = await createRes.json() as any

    const outsiderReq = new Request(`http://localhost/api/mailbox/threads/${createBody.data.id}`, {
      headers: { 'X-Classmate-Token': otherToken },
    })
    const outsiderCtx = createExecutionContext()
    const outsiderRes = await worker.fetch(outsiderReq, env, outsiderCtx)
    await waitOnExecutionContext(outsiderCtx)
    expect(outsiderRes.status).toBe(200)

    await env.DB.prepare("INSERT OR IGNORE INTO students (id, name, slug, account_status) VALUES ('stu_third', '第三同学', 'third', 'active')").run()
    const thirdToken = await loginAsClassmateForTest('third')
    const forbiddenReq = new Request(`http://localhost/api/mailbox/threads/${createBody.data.id}`, {
      headers: { 'X-Classmate-Token': thirdToken },
    })
    const forbiddenCtx = createExecutionContext()
    const forbiddenRes = await worker.fetch(forbiddenReq, env, forbiddenCtx)
    await waitOnExecutionContext(forbiddenCtx)
    expect(forbiddenRes.status).toBe(403)
  })
})
```

- [ ] **Step 6: 运行测试确认失败**

Run:

```powershell
pnpm --filter site-astro test
pnpm --filter worker exec vitest run tests/api.test.ts
```

Expected:

- Site static tests fail because `TopNav.astro` still contains `lamp-glow` and new pages/components do not exist.
- Worker tests fail because new routes do not exist.

- [ ] **Step 7: 提交失败测试**

```powershell
git add packages/site-astro/tests/post-office-static.test.ts packages/site-astro/tests/post-office-flow.spec.ts packages/site-astro/package.json workers/api/tests/api.test.ts workers/api/tests/db-helper.ts
git commit -m "test: add post office community coverage"
```

---

## Task 2: 建立 D1 数据模型与共享类型

**Files:**
- Create: `workers/api/migrations/0011_post_office_community.sql`
- Modify: `workers/api/src/db/schema.sql`
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: 新增 D1 migration**

Create `workers/api/migrations/0011_post_office_community.sql`:

```sql
CREATE TABLE IF NOT EXISTS public_messages (
  id TEXT PRIMARY KEY,
  author_slug TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  card_style TEXT DEFAULT 'paper',
  status TEXT DEFAULT 'pending',
  review_reason TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  featured INTEGER DEFAULT 0,
  pinned INTEGER DEFAULT 0,
  reactions TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (author_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_public_messages_status
  ON public_messages(status, pinned, featured, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_messages_author
  ON public_messages(author_slug, created_at DESC);

CREATE TABLE IF NOT EXISTS content_reviews (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  admin_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_slug TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  related_type TEXT,
  related_id TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (recipient_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications(recipient_slug, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS mail_threads (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  thread_type TEXT DEFAULT 'private',
  created_by_type TEXT NOT NULL,
  created_by_slug TEXT,
  allow_reply INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mail_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  sender_slug TEXT,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (thread_id) REFERENCES mail_threads(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mail_recipients (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  recipient_slug TEXT NOT NULL,
  read_at TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (thread_id) REFERENCES mail_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mail_recipients_slug
  ON mail_recipients(recipient_slug, read_at);

CREATE INDEX IF NOT EXISTS idx_mail_messages_thread
  ON mail_messages(thread_id, created_at);
```

- [ ] **Step 2: 同步完整 schema**

Append the same SQL table and index definitions to `workers/api/src/db/schema.sql` after `classmate_sessions` indexes.

- [ ] **Step 3: 增加共享类型**

Append to `packages/shared/src/types.ts`:

```ts
export type PublicMessageStatus = 'pending' | 'approved' | 'rejected' | 'hidden'

export interface PublicMessage {
  id: string
  authorSlug: string
  authorName: string
  content: string
  cardStyle: 'paper' | 'chalkboard' | 'photoback' | 'letter'
  status: PublicMessageStatus
  reviewReason?: string | null
  featured: boolean
  pinned: boolean
  reactions: Record<string, number>
  createdAt: string
  reviewedAt?: string | null
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  relatedType?: string | null
  relatedId?: string | null
  readAt?: string | null
  createdAt: string
}

export interface NotificationSummary {
  unreadCount: number
}

export type MailThreadType = 'private' | 'admin' | 'system'

export interface MailboxThread {
  id: string
  subject: string
  threadType: MailThreadType
  senderName: string
  preview: string
  unread: boolean
  allowReply: boolean
  updatedAt: string
}

export interface MailboxMessage {
  id: string
  threadId: string
  senderType: 'student' | 'admin' | 'system'
  senderSlug?: string | null
  senderName: string
  body: string
  createdAt: string
}

export interface MailboxSummary {
  unreadCount: number
}
```

- [ ] **Step 4: 运行类型检查**

Run:

```powershell
pnpm --filter worker exec tsc --noEmit
pnpm --filter site-astro typecheck
pnpm --filter admin typecheck
```

Expected: typecheck passes, Worker API tests still fail because routes are not implemented.

- [ ] **Step 5: 提交数据模型**

```powershell
git add workers/api/migrations/0011_post_office_community.sql workers/api/src/db/schema.sql packages/shared/src/types.ts
git commit -m "feat: add post office data model"
```

---

## Task 3: 实现通知服务和公共留言 API

**Files:**
- Create: `workers/api/src/lib/classmateGuard.ts`
- Create: `workers/api/src/lib/notificationService.ts`
- Create: `workers/api/src/routes/publicMessages.ts`
- Create: `workers/api/src/routes/notifications.ts`
- Modify: `workers/api/src/index.ts`
- Test: `workers/api/tests/api.test.ts`

- [ ] **Step 1: 新增同学鉴权工具**

Create `workers/api/src/lib/classmateGuard.ts`:

```ts
import { verifyClassmateSession } from './classmateSession'

export type ClassmateIdentity = {
  slug: string
  name: string
  accountStatus: string
  mustChangePassword: boolean
}

export async function requireClassmate(c: any): Promise<ClassmateIdentity | Response> {
  const token = c.req.header('X-Classmate-Token')
  const slug = await verifyClassmateSession(c.env.DB, token)
  if (!slug) {
    return c.json({ success: false, message: '未授权，请先登录同学账号' }, 401)
  }

  const row = await c.env.DB.prepare(
    'SELECT name, slug, account_status, account_initial_password_changed FROM students WHERE slug = ?'
  ).bind(slug).first() as any

  if (!row || row.account_status === 'locked') {
    return c.json({ success: false, message: '账号不可用，请联系管理员' }, 403)
  }

  return {
    slug: row.slug,
    name: row.name,
    accountStatus: row.account_status || 'active',
    mustChangePassword: !row.account_initial_password_changed,
  }
}

export function isClassmateResponse(value: ClassmateIdentity | Response): value is Response {
  return value instanceof Response
}
```

- [ ] **Step 2: 新增通知服务**

Create `workers/api/src/lib/notificationService.ts`:

```ts
export type CreateNotificationInput = {
  recipientSlug: string
  type: string
  title: string
  body: string
  relatedType?: string
  relatedId?: string
}

export async function createNotification(db: D1Database, input: CreateNotificationInput) {
  const id = `ntf_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  await db.prepare(
    `INSERT INTO notifications
      (id, recipient_slug, type, title, body, related_type, related_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    input.recipientSlug,
    input.type,
    input.title,
    input.body,
    input.relatedType || null,
    input.relatedId || null,
  ).run()
  return id
}

export async function getUnreadNotificationCount(db: D1Database, slug: string) {
  const row = await db.prepare(
    'SELECT COUNT(*) AS count FROM notifications WHERE recipient_slug = ? AND read_at IS NULL'
  ).bind(slug).first() as any
  return Number(row?.count || 0)
}
```

- [ ] **Step 3: 实现公共留言路由**

Create `workers/api/src/routes/publicMessages.ts`:

```ts
import { Hono } from 'hono'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'
import { createNotification } from '../lib/notificationService'

type Bindings = {
  DB: D1Database
}

const ALLOWED_STYLES = ['paper', 'chalkboard', 'photoback', 'letter']

export const publicMessagesRoutes = new Hono<{ Bindings: Bindings }>()

function formatPublicMessage(row: any) {
  return {
    id: row.id,
    authorSlug: row.author_slug,
    authorName: row.author_name,
    content: row.content,
    cardStyle: row.card_style || 'paper',
    status: row.status || 'pending',
    reviewReason: row.review_reason || null,
    featured: !!row.featured,
    pinned: !!row.pinned,
    reactions: JSON.parse(row.reactions || '{}'),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || null,
  }
}

publicMessagesRoutes.get('/public-messages', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM public_messages
     WHERE status = 'approved'
     ORDER BY pinned DESC, featured DESC, created_at DESC
     LIMIT 20`
  ).all()

  return c.json({ success: true, data: { items: (results || []).map(formatPublicMessage) } })
})

publicMessagesRoutes.get('/public-messages/mine', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM public_messages
     WHERE author_slug = ?
     ORDER BY created_at DESC
     LIMIT 50`
  ).bind(identity.slug).all()

  return c.json({ success: true, data: { items: (results || []).map(formatPublicMessage) } })
})

publicMessagesRoutes.post('/public-messages', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  if (identity.mustChangePassword) {
    return c.json({ success: false, message: '首次登录请先修改密码后再提交留言' }, 403)
  }

  const body = await c.req.json()
  const content = String(body.content || '').trim()
  if (!content || content.length > 500) {
    return c.json({ success: false, message: '留言内容必须在 1-500 字之间' }, 400)
  }

  const cardStyle = ALLOWED_STYLES.includes(body.cardStyle) ? body.cardStyle : 'paper'
  const id = `pm_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`

  await c.env.DB.prepare(
    `INSERT INTO public_messages
      (id, author_slug, author_name, content, card_style, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).bind(id, identity.slug, identity.name, content, cardStyle).run()

  return c.json({
    success: true,
    message: '留言已提交，等待审核',
    data: { id, status: 'pending', content, cardStyle },
  })
})

publicMessagesRoutes.put('/public-messages/:id/react', async (c) => {
  const id = c.req.param('id')
  const { reaction } = await c.req.json()
  const allowed = ['❤️', '👍', '😂', '🎉']
  if (!allowed.includes(reaction)) {
    return c.json({ success: false, message: '不支持的表情' }, 400)
  }

  const path = `$.${reaction}`
  await c.env.DB.prepare(
    `UPDATE public_messages SET reactions = json_set(
      COALESCE(reactions, '{}'),
      ?,
      COALESCE(CAST(json_extract(COALESCE(reactions, '{}'), ?) AS INTEGER), 0) + 1
    ) WHERE id = ? AND status = 'approved'`
  ).bind(path, path, id).run()

  const row = await c.env.DB.prepare('SELECT reactions FROM public_messages WHERE id = ?').bind(id).first() as any
  if (!row) return c.json({ success: false, message: '留言不存在' }, 404)
  return c.json({ success: true, data: { reactions: JSON.parse(row.reactions || '{}') } })
})

publicMessagesRoutes.get('/admin/public-messages', async (c) => {
  const status = c.req.query('status')
  const binds: string[] = []
  let sql = 'SELECT * FROM public_messages WHERE 1=1'
  if (status) {
    sql += ' AND status = ?'
    binds.push(status)
  }
  sql += ' ORDER BY pinned DESC, featured DESC, created_at DESC LIMIT 100'

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ success: true, data: (results || []).map(formatPublicMessage) })
})

publicMessagesRoutes.put('/admin/public-messages/:id/approve', async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT author_slug FROM public_messages WHERE id = ?').bind(id).first() as any
  if (!row) return c.json({ success: false, message: '留言不存在' }, 404)

  await c.env.DB.prepare(
    "UPDATE public_messages SET status = 'approved', reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run()
  await c.env.DB.prepare(
    "INSERT INTO content_reviews (id, content_type, content_id, action) VALUES (?, 'public_message', ?, 'approve')"
  ).bind(`cr_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, id).run()
  await createNotification(c.env.DB, {
    recipientSlug: row.author_slug,
    type: 'public_message_approved',
    title: '公共留言已通过审核',
    body: '你提交的公共留言已经展示在班级留言墙。',
    relatedType: 'public_message',
    relatedId: id,
  })

  return c.json({ success: true, message: '已审核通过' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/reject', async (c) => {
  const id = c.req.param('id')
  const { reason } = await c.req.json()
  const reviewReason = String(reason || '').trim()
  if (!reviewReason) return c.json({ success: false, message: '请填写退回原因' }, 400)

  const row = await c.env.DB.prepare('SELECT author_slug FROM public_messages WHERE id = ?').bind(id).first() as any
  if (!row) return c.json({ success: false, message: '留言不存在' }, 404)

  await c.env.DB.prepare(
    "UPDATE public_messages SET status = 'rejected', review_reason = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).bind(reviewReason, id).run()
  await c.env.DB.prepare(
    "INSERT INTO content_reviews (id, content_type, content_id, action, reason) VALUES (?, 'public_message', ?, 'reject', ?)"
  ).bind(`cr_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, id, reviewReason).run()
  await createNotification(c.env.DB, {
    recipientSlug: row.author_slug,
    type: 'public_message_rejected',
    title: '公共留言未通过审核',
    body: reviewReason,
    relatedType: 'public_message',
    relatedId: id,
  })

  return c.json({ success: true, message: '已退回留言' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/hide', async (c) => {
  const id = c.req.param('id')
  const { hidden } = await c.req.json()
  await c.env.DB.prepare(
    "UPDATE public_messages SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(hidden ? 'hidden' : 'approved', id).run()
  return c.json({ success: true, message: hidden ? '已隐藏' : '已取消隐藏' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/pin', async (c) => {
  const id = c.req.param('id')
  const { pinned } = await c.req.json()
  await c.env.DB.prepare('UPDATE public_messages SET pinned = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(pinned ? 1 : 0, id).run()
  return c.json({ success: true, message: pinned ? '已置顶' : '已取消置顶' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/feature', async (c) => {
  const id = c.req.param('id')
  const { featured } = await c.req.json()
  await c.env.DB.prepare('UPDATE public_messages SET featured = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(featured ? 1 : 0, id).run()
  return c.json({ success: true, message: featured ? '已精选' : '已取消精选' })
})

publicMessagesRoutes.delete('/admin/public-messages/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM public_messages WHERE id = ?').bind(id).run()
  return c.json({ success: true, message: '已删除' })
})
```

- [ ] **Step 4: 实现通知路由**

Create `workers/api/src/routes/notifications.ts`:

```ts
import { Hono } from 'hono'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'
import { getUnreadNotificationCount } from '../lib/notificationService'

type Bindings = {
  DB: D1Database
}

export const notificationsRoutes = new Hono<{ Bindings: Bindings }>()

function formatNotification(row: any) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    relatedType: row.related_type || null,
    relatedId: row.related_id || null,
    readAt: row.read_at || null,
    createdAt: row.created_at,
  }
}

notificationsRoutes.get('/notifications/summary', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const unreadCount = await getUnreadNotificationCount(c.env.DB, identity.slug)
  return c.json({ success: true, data: { unreadCount } })
})

notificationsRoutes.get('/notifications', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notifications WHERE recipient_slug = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(identity.slug).all()

  return c.json({ success: true, data: { items: (results || []).map(formatNotification) } })
})

notificationsRoutes.put('/notifications/:id/read', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  await c.env.DB.prepare(
    "UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ? AND recipient_slug = ?"
  ).bind(c.req.param('id'), identity.slug).run()

  return c.json({ success: true, message: '已读' })
})

notificationsRoutes.put('/notifications/read-all', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  await c.env.DB.prepare(
    "UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')) WHERE recipient_slug = ?"
  ).bind(identity.slug).run()

  return c.json({ success: true, message: '已全部标记已读' })
})
```

- [ ] **Step 5: 注册路由与缓存策略**

Modify `workers/api/src/index.ts`:

```ts
import { publicMessagesRoutes } from './routes/publicMessages'
import { notificationsRoutes } from './routes/notifications'
```

Add to `PUBLIC_REVALIDATED_GET_PREFIXES`:

```ts
'/api/public-messages',
```

Add admin guards before route registration:

```ts
app.use('/api/admin/public-messages', async (c, next) => {
  return adminGuard(c.env.JWT_SECRET)(c, next)
})

app.use('/api/admin/public-messages/:id', async (c, next) => {
  return adminGuard(c.env.JWT_SECRET)(c, next)
})
```

Register routes near existing `app.route('/api', messagesRoutes)`:

```ts
app.route('/api', publicMessagesRoutes)
app.route('/api', notificationsRoutes)
```

- [ ] **Step 6: 运行 Worker 测试**

Run:

```powershell
pnpm --filter worker exec vitest run tests/api.test.ts
```

Expected:

- Public message and notification tests pass.
- Mailbox test still fails because mailbox routes are not implemented.

- [ ] **Step 7: 提交公共留言和通知 API**

```powershell
git add workers/api/src/lib/classmateGuard.ts workers/api/src/lib/notificationService.ts workers/api/src/routes/publicMessages.ts workers/api/src/routes/notifications.ts workers/api/src/index.ts
git commit -m "feat: add public message notifications api"
```

---

## Task 4: 实现邮箱和管理员发信 API

**Files:**
- Create: `workers/api/src/routes/mailbox.ts`
- Create: `workers/api/src/routes/adminMail.ts`
- Modify: `workers/api/src/index.ts`
- Test: `workers/api/tests/api.test.ts`

- [ ] **Step 1: 实现前台邮箱路由**

Create `workers/api/src/routes/mailbox.ts`:

```ts
import { Hono } from 'hono'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'

type Bindings = {
  DB: D1Database
}

export const mailboxRoutes = new Hono<{ Bindings: Bindings }>()

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
}

function trimText(value: unknown, max: number) {
  const text = String(value || '').trim()
  return text.length > max ? text.slice(0, max) : text
}

mailboxRoutes.get('/mailbox/summary', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM mail_recipients
     WHERE recipient_slug = ? AND read_at IS NULL AND deleted_at IS NULL`
  ).bind(identity.slug).first() as any

  return c.json({ success: true, data: { unreadCount: Number(row?.count || 0) } })
})

mailboxRoutes.get('/mailbox/threads', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const { results } = await c.env.DB.prepare(
    `SELECT
      t.id, t.subject, t.thread_type, t.allow_reply, t.updated_at,
      r.read_at,
      m.body AS preview,
      m.sender_type,
      COALESCE(s.name, CASE WHEN m.sender_type = 'admin' THEN '管理员' ELSE '系统邮局' END) AS sender_name
     FROM mail_recipients r
     JOIN mail_threads t ON t.id = r.thread_id
     LEFT JOIN mail_messages m ON m.id = (
       SELECT id FROM mail_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1
     )
     LEFT JOIN students s ON s.slug = m.sender_slug
     WHERE r.recipient_slug = ? AND r.deleted_at IS NULL
     ORDER BY t.updated_at DESC
     LIMIT 50`
  ).bind(identity.slug).all()

  return c.json({
    success: true,
    data: {
      items: (results || []).map((row: any) => ({
        id: row.id,
        subject: row.subject,
        threadType: row.thread_type,
        senderName: row.sender_name,
        preview: trimText(row.preview, 80),
        unread: !row.read_at,
        allowReply: !!row.allow_reply,
        updatedAt: row.updated_at,
      })),
    },
  })
})

mailboxRoutes.get('/mailbox/threads/:id', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const threadId = c.req.param('id')
  const recipient = await c.env.DB.prepare(
    'SELECT thread_id FROM mail_recipients WHERE thread_id = ? AND recipient_slug = ? AND deleted_at IS NULL'
  ).bind(threadId, identity.slug).first()
  const creator = await c.env.DB.prepare(
    "SELECT id FROM mail_threads WHERE id = ? AND created_by_type = 'student' AND created_by_slug = ?"
  ).bind(threadId, identity.slug).first()

  if (!recipient && !creator) return c.json({ success: false, message: '无权查看这封信' }, 403)

  await c.env.DB.prepare(
    "UPDATE mail_recipients SET read_at = COALESCE(read_at, datetime('now')) WHERE thread_id = ? AND recipient_slug = ?"
  ).bind(threadId, identity.slug).run()

  const thread = await c.env.DB.prepare('SELECT * FROM mail_threads WHERE id = ?').bind(threadId).first() as any
  const { results } = await c.env.DB.prepare(
    `SELECT m.*, COALESCE(s.name, CASE WHEN m.sender_type = 'admin' THEN '管理员' ELSE '系统邮局' END) AS sender_name
     FROM mail_messages m
     LEFT JOIN students s ON s.slug = m.sender_slug
     WHERE m.thread_id = ?
     ORDER BY m.created_at`
  ).bind(threadId).all()

  return c.json({
    success: true,
    data: {
      thread: {
        id: thread.id,
        subject: thread.subject,
        threadType: thread.thread_type,
        allowReply: !!thread.allow_reply,
        updatedAt: thread.updated_at,
      },
      messages: (results || []).map((row: any) => ({
        id: row.id,
        threadId: row.thread_id,
        senderType: row.sender_type,
        senderSlug: row.sender_slug || null,
        senderName: row.sender_name,
        body: row.body,
        createdAt: row.created_at,
      })),
    },
  })
})

mailboxRoutes.post('/mailbox/threads', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  if (identity.mustChangePassword) {
    return c.json({ success: false, message: '首次登录请先修改密码后再写信' }, 403)
  }

  const body = await c.req.json()
  const recipientSlug = String(body.recipientSlug || '').trim()
  const subject = trimText(body.subject, 80)
  const messageBody = trimText(body.body, 2000)

  if (!recipientSlug || !subject || !messageBody) {
    return c.json({ success: false, message: '收件人、标题和正文必填' }, 400)
  }
  if (recipientSlug === identity.slug) {
    return c.json({ success: false, message: '不能给自己写信' }, 400)
  }

  const recipient = await c.env.DB.prepare(
    "SELECT slug FROM students WHERE slug = ? AND account_status != 'locked'"
  ).bind(recipientSlug).first()
  if (!recipient) return c.json({ success: false, message: '收件人不存在或账号不可用' }, 404)

  const threadId = id('mail')
  const messageId = id('mailmsg')
  const recipientId = id('mailrcp')

  await c.env.DB.prepare(
    `INSERT INTO mail_threads
      (id, subject, thread_type, created_by_type, created_by_slug, allow_reply)
     VALUES (?, ?, 'private', 'student', ?, 1)`
  ).bind(threadId, subject, identity.slug).run()
  await c.env.DB.prepare(
    `INSERT INTO mail_messages
      (id, thread_id, sender_type, sender_slug, body)
     VALUES (?, ?, 'student', ?, ?)`
  ).bind(messageId, threadId, identity.slug, messageBody).run()
  await c.env.DB.prepare(
    `INSERT INTO mail_recipients
      (id, thread_id, recipient_slug)
     VALUES (?, ?, ?)`
  ).bind(recipientId, threadId, recipientSlug).run()

  return c.json({ success: true, message: '信件已投递', data: { id: threadId } })
})

mailboxRoutes.post('/mailbox/threads/:id/messages', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const threadId = c.req.param('id')
  const body = await c.req.json()
  const messageBody = trimText(body.body, 2000)
  if (!messageBody) return c.json({ success: false, message: '正文不能为空' }, 400)

  const thread = await c.env.DB.prepare('SELECT * FROM mail_threads WHERE id = ? AND allow_reply = 1').bind(threadId).first() as any
  if (!thread) return c.json({ success: false, message: '信件不存在或不允许回复' }, 404)

  const isCreator = thread.created_by_type === 'student' && thread.created_by_slug === identity.slug
  const isRecipient = await c.env.DB.prepare(
    'SELECT thread_id FROM mail_recipients WHERE thread_id = ? AND recipient_slug = ? AND deleted_at IS NULL'
  ).bind(threadId, identity.slug).first()
  if (!isCreator && !isRecipient) return c.json({ success: false, message: '无权回复这封信' }, 403)

  const messageId = id('mailmsg')
  await c.env.DB.prepare(
    "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body) VALUES (?, ?, 'student', ?, ?)"
  ).bind(messageId, threadId, identity.slug, messageBody).run()
  await c.env.DB.prepare("UPDATE mail_threads SET updated_at = datetime('now') WHERE id = ?").bind(threadId).run()
  await c.env.DB.prepare(
    "UPDATE mail_recipients SET read_at = NULL WHERE thread_id = ? AND recipient_slug != ?"
  ).bind(threadId, identity.slug).run()

  return c.json({ success: true, message: '回复已寄出', data: { id: messageId } })
})
```

- [ ] **Step 2: 实现管理员发信路由**

Create `workers/api/src/routes/adminMail.ts`:

```ts
import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
}

export const adminMailRoutes = new Hono<{ Bindings: Bindings }>()

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
}

function normalizeBody(value: unknown, max: number) {
  const text = String(value || '').trim()
  return text.length > max ? text.slice(0, max) : text
}

async function sendAdminMail(db: D1Database, recipientSlug: string, subject: string, body: string, allowReply: boolean) {
  const threadId = id('mail')
  await db.prepare(
    `INSERT INTO mail_threads
      (id, subject, thread_type, created_by_type, allow_reply)
     VALUES (?, ?, 'admin', 'admin', ?)`
  ).bind(threadId, subject, allowReply ? 1 : 0).run()
  await db.prepare(
    `INSERT INTO mail_messages
      (id, thread_id, sender_type, body)
     VALUES (?, ?, 'admin', ?)`
  ).bind(id('mailmsg'), threadId, body).run()
  await db.prepare(
    `INSERT INTO mail_recipients
      (id, thread_id, recipient_slug)
     VALUES (?, ?, ?)`
  ).bind(id('mailrcp'), threadId, recipientSlug).run()
  return threadId
}

adminMailRoutes.post('/admin/mail/send', async (c) => {
  const { recipientSlug, subject, body, allowReply } = await c.req.json()
  const cleanSubject = normalizeBody(subject, 80)
  const cleanBody = normalizeBody(body, 2000)
  const cleanRecipient = String(recipientSlug || '').trim()

  if (!cleanRecipient || !cleanSubject || !cleanBody) {
    return c.json({ success: false, message: '收件人、标题和正文必填' }, 400)
  }

  const recipient = await c.env.DB.prepare('SELECT slug FROM students WHERE slug = ?').bind(cleanRecipient).first()
  if (!recipient) return c.json({ success: false, message: '收件人不存在' }, 404)

  const threadId = await sendAdminMail(c.env.DB, cleanRecipient, cleanSubject, cleanBody, !!allowReply)
  return c.json({ success: true, message: '信件已发送', data: { id: threadId } })
})

adminMailRoutes.post('/admin/mail/broadcast', async (c) => {
  const { subject, body, allowReply } = await c.req.json()
  const cleanSubject = normalizeBody(subject, 80)
  const cleanBody = normalizeBody(body, 2000)

  if (!cleanSubject || !cleanBody) {
    return c.json({ success: false, message: '标题和正文必填' }, 400)
  }

  const { results } = await c.env.DB.prepare(
    "SELECT slug FROM students WHERE COALESCE(account_status, 'active') != 'locked'"
  ).all()

  const sent: string[] = []
  for (const row of results || []) {
    const slug = (row as any).slug
    const threadId = await sendAdminMail(c.env.DB, slug, cleanSubject, cleanBody, !!allowReply)
    sent.push(threadId)
  }

  return c.json({ success: true, message: '群发完成', data: { sentCount: sent.length } })
})

adminMailRoutes.get('/admin/mail/threads', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT
      t.id, t.subject, t.thread_type, t.allow_reply, t.updated_at,
      COUNT(r.id) AS recipient_count,
      SUM(CASE WHEN r.read_at IS NOT NULL THEN 1 ELSE 0 END) AS read_count
     FROM mail_threads t
     LEFT JOIN mail_recipients r ON r.thread_id = t.id
     WHERE t.created_by_type = 'admin'
     GROUP BY t.id
     ORDER BY t.updated_at DESC
     LIMIT 100`
  ).all()

  return c.json({ success: true, data: results || [] })
})
```

- [ ] **Step 3: 注册邮箱路由和后台保护**

Modify `workers/api/src/index.ts`:

```ts
import { mailboxRoutes } from './routes/mailbox'
import { adminMailRoutes } from './routes/adminMail'
```

Add guards:

```ts
app.use('/api/admin/mail/*', async (c, next) => {
  return adminGuard(c.env.JWT_SECRET)(c, next)
})
```

Register:

```ts
app.route('/api', mailboxRoutes)
app.route('/api', adminMailRoutes)
```

- [ ] **Step 4: 运行 Worker 测试**

Run:

```powershell
pnpm --filter worker exec vitest run tests/api.test.ts
```

Expected: Post Office Community API tests pass.

- [ ] **Step 5: 提交邮箱 API**

```powershell
git add workers/api/src/routes/mailbox.ts workers/api/src/routes/adminMail.ts workers/api/src/index.ts
git commit -m "feat: add class mailbox api"
```

---

## Task 5: 重构导航为流动纸页书签

**Files:**
- Modify: `packages/site-astro/src/components/TopNav.astro`
- Test: `packages/site-astro/tests/post-office-static.test.ts`

- [ ] **Step 1: 修改导航 markup**

In `packages/site-astro/src/components/TopNav.astro`, replace each `lamp-glow` active marker with:

```astro
{currentPath.startsWith(href('/preface')) && <span class="ink-line" transition:name="active-ink-line"></span>}
```

Apply the same `ink-line` marker to all active links. Add links for messages and mailbox after roster:

```astro
<a href={href('/messages')} class={`nav-link nav-link--community ${currentPath.startsWith(href('/messages')) ? 'active' : ''}`} aria-current={currentPath.startsWith(href('/messages')) ? 'page' : undefined}>
  <span class="link-text">公共留言</span>
  {currentPath.startsWith(href('/messages')) && <span class="ink-line" transition:name="active-ink-line"></span>}
</a>
<a href={href('/mailbox')} class={`nav-link nav-link--mail ${currentPath.startsWith(href('/mailbox')) ? 'active' : ''}`} aria-current={currentPath.startsWith(href('/mailbox')) ? 'page' : undefined}>
  <span class="link-text">班级邮局</span>
  <span id="mail-unread-stamp" class="mail-unread-stamp" hidden></span>
  {currentPath.startsWith(href('/mailbox')) && <span class="ink-line" transition:name="active-ink-line"></span>}
</a>
```

Add `paper-bookmark-nav` to nav class:

```astro
<nav class={`top-nav paper-bookmark-nav ${isHome ? 'top-nav--home' : ''}`}>
```

- [ ] **Step 2: 增加未读数原生脚本**

Inside the existing inline script, after `syncNavSession()`, add:

```js
async function syncMailUnread() {
  try {
    const token = sessionStorage.getItem('classmate_account_token');
    const stamp = document.getElementById('mail-unread-stamp');
    if (!stamp || !token) return;
    const res = await fetch(CLIENT_API_BASE + '/api/notifications/summary', {
      headers: { 'X-Classmate-Token': token }
    });
    if (!res.ok) return;
    const data = await res.json();
    const count = data && data.data ? Number(data.data.unreadCount || 0) : 0;
    stamp.hidden = count <= 0;
    stamp.textContent = count > 99 ? '99+' : String(count);
  } catch (e) {}
}

syncMailUnread();
document.addEventListener('astro:page-load', syncMailUnread);
```

- [ ] **Step 3: 替换导航 CSS**

In the `<style>` block, remove `.lamp-glow` and add:

```css
.paper-bookmark-nav {
  border-radius: 18px 18px 16px 16px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-paper-card) 92%, transparent), color-mix(in srgb, var(--color-paper-card) 82%, transparent)),
    repeating-linear-gradient(90deg, rgba(112, 86, 55, 0.05) 0 1px, transparent 1px 8px);
  border-color: color-mix(in srgb, var(--color-paper-border) 82%, var(--color-paper-brown));
  box-shadow: 0 14px 34px rgba(74, 50, 29, 0.12), inset 0 1px 0 rgba(255,255,255,0.55);
}

.paper-bookmark-nav::before {
  content: '';
  position: absolute;
  left: 22px;
  right: 22px;
  bottom: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(117, 77, 40, 0.28), transparent);
  pointer-events: none;
}

.ink-line {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 4px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, var(--color-paper-brown), var(--color-paper-stamp-red), transparent);
  transform-origin: center;
  animation: inkLineFlow 2.8s ease-in-out infinite;
}

.mail-unread-stamp {
  position: absolute;
  top: -8px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  line-height: 1;
  color: #fffaf2;
  background: var(--color-paper-stamp-red);
  box-shadow: 0 2px 8px rgba(130, 42, 33, 0.24);
}

.mail-unread-stamp[hidden] {
  display: none;
}

@keyframes inkLineFlow {
  0%, 100% { opacity: 0.72; transform: scaleX(0.88); }
  50% { opacity: 1; transform: scaleX(1); }
}

@media (prefers-reduced-motion: reduce) {
  .ink-line {
    animation: none;
  }
}
```

- [ ] **Step 4: 运行静态测试**

Run:

```powershell
pnpm --filter site-astro test -- tests/post-office-static.test.ts
```

Expected: navigation test passes; page/component tests still fail until Task 6 and 7.

- [ ] **Step 5: 提交导航重构**

```powershell
git add packages/site-astro/src/components/TopNav.astro
git commit -m "feat: restyle nav as paper bookmark"
```

---

## Task 6: 实现公开站点公共留言页

**Files:**
- Create: `packages/site-astro/src/api/postOffice.ts`
- Create: `packages/site-astro/src/components/PublicMessageBoard.vue`
- Create: `packages/site-astro/src/pages/messages.astro`
- Test: `packages/site-astro/tests/post-office-static.test.ts`

- [ ] **Step 1: 新增前台 API helper**

Create `packages/site-astro/src/api/postOffice.ts`:

```ts
import { getClassmateToken } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

function classmateHeaders() {
  const token = getClassmateToken()
  return token ? { 'X-Classmate-Token': token } : {}
}

export async function fetchPublicMessages(apiBase: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/public-messages'))
  return res.json()
}

export async function fetchMyPublicMessages(apiBase: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/public-messages/mine'), {
    headers: classmateHeaders(),
  })
  return res.json()
}

export async function submitPublicMessage(apiBase: string, content: string, cardStyle: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/public-messages'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...classmateHeaders(),
    },
    body: JSON.stringify({ content, cardStyle }),
  })
  return res.json()
}

export async function fetchMailboxThreads(apiBase: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/mailbox/threads'), {
    headers: classmateHeaders(),
  })
  return res.json()
}

export async function sendMailboxThread(apiBase: string, payload: { recipientSlug: string; subject: string; body: string }) {
  const res = await fetch(joinApiUrl(apiBase, '/api/mailbox/threads'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...classmateHeaders(),
    },
    body: JSON.stringify(payload),
  })
  return res.json()
}
```

- [ ] **Step 2: 新增公共留言组件**

Create `packages/site-astro/src/components/PublicMessageBoard.vue` with this structure:

```vue
<template>
  <section class="public-message-board paper-panel">
    <div class="public-message-board__composer">
      <textarea
        v-model="content"
        class="paper-textarea"
        placeholder="写一张便签，贴到全班的留言墙上..."
        maxlength="500"
      />
      <div class="public-message-board__tools">
        <select v-model="cardStyle" class="paper-select" aria-label="便签样式">
          <option value="paper">复古纸张</option>
          <option value="letter">横格信笺</option>
          <option value="photoback">拍立得背面</option>
          <option value="chalkboard">黑板便签</option>
        </select>
        <span class="char-count">{{ content.length }}/500</span>
        <button class="btn-primary" :disabled="submitting || !content.trim()" @click="submit">
          {{ submitting ? '投递中...' : '提交留言' }}
        </button>
      </div>
      <p v-if="notice" :class="['board-notice', notice.type]">{{ notice.text }}</p>
    </div>

    <div class="public-message-board__tabs" role="tablist" aria-label="留言筛选">
      <button :class="{ active: tab === 'approved' }" @click="tab = 'approved'">公共留言</button>
      <button :class="{ active: tab === 'mine' }" @click="loadMine">我的提交</button>
    </div>

    <div v-if="loading" class="board-loading">正在展开留言墙...</div>
    <div v-else-if="visibleMessages.length === 0" class="board-empty">这里还没有便签。</div>
    <div v-else class="public-message-list">
      <article v-for="msg in visibleMessages" :key="msg.id" :class="['public-message-card', `style-${msg.cardStyle}`]">
        <div class="message-card-meta">
          <span>{{ msg.authorName }}</span>
          <span>{{ formatDate(msg.createdAt) }}</span>
        </div>
        <p>{{ msg.content }}</p>
        <span v-if="msg.status === 'pending'" class="status-stamp">待审核</span>
        <span v-if="msg.status === 'rejected'" class="status-stamp rejected">未通过</span>
        <p v-if="msg.reviewReason" class="review-reason">{{ msg.reviewReason }}</p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchMyPublicMessages, fetchPublicMessages, submitPublicMessage } from '../api/postOffice'

type PublicMessage = {
  id: string
  authorName: string
  content: string
  cardStyle: string
  status: string
  reviewReason?: string | null
  createdAt: string
}

const props = defineProps<{ apiBase: string }>()

const tab = ref<'approved' | 'mine'>('approved')
const approvedMessages = ref<PublicMessage[]>([])
const myMessages = ref<PublicMessage[]>([])
const loading = ref(true)
const submitting = ref(false)
const content = ref('')
const cardStyle = ref('paper')
const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const visibleMessages = computed(() => tab.value === 'mine' ? myMessages.value : approvedMessages.value)

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

async function loadApproved() {
  loading.value = true
  try {
    const data = await fetchPublicMessages(props.apiBase)
    if (data.success) approvedMessages.value = data.data?.items || []
  } finally {
    loading.value = false
  }
}

async function loadMine() {
  tab.value = 'mine'
  loading.value = true
  try {
    const data = await fetchMyPublicMessages(props.apiBase)
    if (data.success) myMessages.value = data.data?.items || []
  } finally {
    loading.value = false
  }
}

async function submit() {
  submitting.value = true
  notice.value = null
  try {
    const data = await submitPublicMessage(props.apiBase, content.value.trim(), cardStyle.value)
    if (data.success) {
      content.value = ''
      notice.value = { type: 'success', text: data.message || '留言已提交，等待审核' }
      await loadMine()
    } else {
      notice.value = { type: 'error', text: data.message || '提交失败' }
    }
  } catch {
    notice.value = { type: 'error', text: '网络错误，请稍后重试' }
  } finally {
    submitting.value = false
  }
}

onMounted(loadApproved)
</script>
```

Add scoped styles in the same file:

```vue
<style scoped>
.public-message-board {
  display: grid;
  gap: var(--spacing-xl);
}
.public-message-board__composer {
  padding: var(--spacing-lg);
  border: 1px dashed var(--color-paper-border);
  background: color-mix(in srgb, var(--color-paper-card) 88%, #fffaf2);
}
.paper-textarea {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
  color: var(--color-paper-ink);
  padding: var(--spacing-md);
  font: inherit;
}
.public-message-board__tools {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
  flex-wrap: wrap;
}
.paper-select {
  min-height: 40px;
  border: 1px solid var(--color-paper-border);
  background: var(--color-paper-card);
  border-radius: var(--rounded-md);
  color: var(--color-paper-ink);
  padding: 0 var(--spacing-sm);
}
.char-count {
  margin-left: auto;
  color: var(--color-paper-muted);
  font-size: var(--type-caption-size);
}
.board-notice.success { color: var(--color-success); }
.board-notice.error { color: var(--color-error); }
.public-message-board__tabs {
  display: flex;
  gap: var(--spacing-xs);
  overflow-x: auto;
}
.public-message-board__tabs button {
  min-height: 40px;
  padding: 0 var(--spacing-md);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-pill);
  background: var(--color-paper-card);
  color: var(--color-paper-muted);
}
.public-message-board__tabs button.active {
  color: var(--color-paper-brown);
  border-color: var(--color-paper-brown);
}
.public-message-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--spacing-lg);
}
.public-message-card {
  position: relative;
  padding: var(--spacing-lg);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
  box-shadow: var(--shadow-paper-card);
}
.message-card-meta {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-sm);
  color: var(--color-paper-muted);
  font-size: var(--type-caption-size);
}
.status-stamp {
  display: inline-flex;
  margin-top: var(--spacing-sm);
  color: var(--color-paper-stamp-red);
  font-size: var(--type-caption-size);
  border: 1px solid currentColor;
  border-radius: var(--rounded-sm);
  padding: 2px 8px;
}
.review-reason {
  color: var(--color-error);
  font-size: var(--type-body-sm-size);
}
@media (max-width: 768px) {
  .public-message-list { grid-template-columns: 1fr; }
  .char-count { margin-left: 0; }
  .public-message-board__tools .btn-primary { width: 100%; }
}
</style>
```

- [ ] **Step 3: 新增页面**

Create `packages/site-astro/src/pages/messages.astro`:

```astro
---
import MainLayout from '../layouts/MainLayout.astro'
import PublicMessageBoard from '../components/PublicMessageBoard.vue'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
---

<MainLayout>
  <section class="messages-page page-shell">
    <header class="page-header">
      <span class="page-kicker">CLASS NOTICE WALL</span>
      <h1>公共留言</h1>
      <p>把想对全班说的话写成一张便签，等管理员审核后贴到这里。</p>
    </header>

    <div class="content-grid">
      <PublicMessageBoard client:load apiBase={API_BASE} />
    </div>
  </section>
</MainLayout>
```

- [ ] **Step 4: 运行测试**

Run:

```powershell
pnpm --filter site-astro test -- tests/post-office-static.test.ts
```

Expected: messages page and component assertions pass; mailbox assertions still fail until Task 7.

- [ ] **Step 5: 提交公共留言前台**

```powershell
git add packages/site-astro/src/api/postOffice.ts packages/site-astro/src/components/PublicMessageBoard.vue packages/site-astro/src/pages/messages.astro
git commit -m "feat: add public message board page"
```

---

## Task 7: 实现公开站点邮箱页与个人主页入口

**Files:**
- Create: `packages/site-astro/src/components/MailboxApp.vue`
- Create: `packages/site-astro/src/pages/mailbox.astro`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Test: `packages/site-astro/tests/post-office-static.test.ts`
- Test: `packages/site-astro/tests/post-office-flow.spec.ts`

- [ ] **Step 1: 新增邮箱组件**

Create `packages/site-astro/src/components/MailboxApp.vue`:

```vue
<template>
  <section class="mailbox-app paper-panel">
    <div class="mailbox-toolbar">
      <button :class="{ active: mode === 'inbox' }" @click="mode = 'inbox'">收件箱</button>
      <button :class="{ active: mode === 'compose' }" @click="mode = 'compose'">写信</button>
    </div>

    <form v-if="mode === 'compose'" class="mail-compose" @submit.prevent="send">
      <input v-model="draft.recipientSlug" class="paper-input" placeholder="收件同学 slug" />
      <input v-model="draft.subject" class="paper-input" placeholder="信件标题" maxlength="80" />
      <textarea v-model="draft.body" class="paper-textarea" placeholder="把想说的话写在这张信纸上..." maxlength="2000" />
      <button class="btn-primary" :disabled="sending || !canSend">{{ sending ? '投递中...' : '寄出信件' }}</button>
      <p v-if="notice" :class="['mail-notice', notice.type]">{{ notice.text }}</p>
    </form>

    <div v-else class="mailbox-list">
      <div v-if="loading" class="mailbox-empty">正在整理信箱...</div>
      <article v-for="thread in threads" :key="thread.id" :class="['mail-thread', { unread: thread.unread }]">
        <div class="mail-thread__stamp">{{ thread.threadType === 'system' ? '系统' : '信件' }}</div>
        <div>
          <h2>{{ thread.subject }}</h2>
          <p>{{ thread.preview }}</p>
          <span>{{ thread.senderName }} · {{ formatDate(thread.updatedAt) }}</span>
        </div>
      </article>
      <div v-if="!loading && threads.length === 0" class="mailbox-empty">暂时没有信件。</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { fetchMailboxThreads, sendMailboxThread } from '../api/postOffice'

type MailThread = {
  id: string
  subject: string
  threadType: string
  senderName: string
  preview: string
  unread: boolean
  updatedAt: string
}

const props = defineProps<{ apiBase: string; defaultRecipient?: string }>()

const mode = ref<'inbox' | 'compose'>(props.defaultRecipient ? 'compose' : 'inbox')
const loading = ref(false)
const sending = ref(false)
const threads = ref<MailThread[]>([])
const notice = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const draft = reactive({
  recipientSlug: props.defaultRecipient || '',
  subject: '',
  body: '',
})

const canSend = computed(() => draft.recipientSlug.trim() && draft.subject.trim() && draft.body.trim())

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

async function loadThreads() {
  loading.value = true
  try {
    const data = await fetchMailboxThreads(props.apiBase)
    if (data.success) threads.value = data.data?.items || []
  } finally {
    loading.value = false
  }
}

async function send() {
  sending.value = true
  notice.value = null
  try {
    const data = await sendMailboxThread(props.apiBase, {
      recipientSlug: draft.recipientSlug.trim(),
      subject: draft.subject.trim(),
      body: draft.body.trim(),
    })
    if (data.success) {
      notice.value = { type: 'success', text: '信件已寄出' }
      draft.subject = ''
      draft.body = ''
      mode.value = 'inbox'
      await loadThreads()
    } else {
      notice.value = { type: 'error', text: data.message || '发送失败' }
    }
  } catch {
    notice.value = { type: 'error', text: '网络错误，请稍后重试' }
  } finally {
    sending.value = false
  }
}

onMounted(loadThreads)
</script>
```

Add scoped styles:

```vue
<style scoped>
.mailbox-app {
  display: grid;
  gap: var(--spacing-lg);
}
.mailbox-toolbar {
  display: flex;
  gap: var(--spacing-xs);
  border-bottom: 1px solid var(--color-paper-border);
  padding-bottom: var(--spacing-sm);
}
.mailbox-toolbar button {
  min-height: 40px;
  padding: 0 var(--spacing-md);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-pill);
  background: var(--color-paper-card);
  color: var(--color-paper-muted);
}
.mailbox-toolbar button.active {
  border-color: var(--color-paper-brown);
  color: var(--color-paper-brown);
}
.mail-compose {
  display: grid;
  gap: var(--spacing-sm);
}
.paper-input,
.paper-textarea {
  width: 100%;
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
  color: var(--color-paper-ink);
  padding: var(--spacing-sm) var(--spacing-md);
  font: inherit;
}
.paper-textarea {
  min-height: 180px;
  resize: vertical;
}
.mailbox-list {
  display: grid;
  gap: var(--spacing-sm);
}
.mail-thread {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
  background: var(--color-paper-card);
}
.mail-thread.unread {
  border-color: var(--color-paper-stamp-red);
}
.mail-thread__stamp {
  display: inline-flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-paper-stamp-red);
  color: var(--color-paper-stamp-red);
  border-radius: 50%;
  font-size: 12px;
}
.mail-thread h2 {
  font-size: var(--type-body-md-size);
  margin: 0;
}
.mail-thread p {
  color: var(--color-paper-muted);
  margin: 4px 0;
}
.mail-thread span,
.mailbox-empty {
  color: var(--color-paper-muted);
  font-size: var(--type-caption-size);
}
.mail-notice.success { color: var(--color-success); }
.mail-notice.error { color: var(--color-error); }
@media (max-width: 768px) {
  .mailbox-toolbar { overflow-x: auto; }
  .mail-thread { grid-template-columns: 1fr; }
}
</style>
```

- [ ] **Step 2: 新增邮箱页面**

Create `packages/site-astro/src/pages/mailbox.astro`:

```astro
---
import MainLayout from '../layouts/MainLayout.astro'
import MailboxApp from '../components/MailboxApp.vue'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const defaultRecipient = Astro.url.searchParams.get('to') || ''
---

<MainLayout>
  <section class="mailbox-page page-shell">
    <header class="page-header">
      <span class="page-kicker">CLASS POST OFFICE</span>
      <h1>班级邮局</h1>
      <p>收下同学、管理员和系统寄来的信，也把想说的话认真寄出去。</p>
    </header>

    <div class="content-grid">
      <MailboxApp client:load apiBase={API_BASE} defaultRecipient={defaultRecipient} />
    </div>
  </section>
</MainLayout>
```

- [ ] **Step 3: 增加个人主页入口**

Modify `packages/site-astro/src/components/StudentProfile.vue` in the hero/actions area by adding:

```vue
<div class="profile-mail-actions">
  <a class="btn-secondary" :href="`/mailbox/?to=${studentSlug}`">给 TA 写信</a>
  <a v-if="isCurrentOwner" class="btn-secondary" href="/mailbox/">查看我的邮箱</a>
</div>
```

If `isCurrentOwner` does not exist, add:

```ts
const isCurrentOwner = computed(() => {
  const current = getClassmateStudent<{ slug: string }>()
  return current?.slug === props.studentSlug
})
```

Add CSS:

```css
.profile-mail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}
```

- [ ] **Step 4: 运行站点测试**

Run:

```powershell
pnpm --filter site-astro test -- tests/post-office-static.test.ts
pnpm --filter site-astro exec playwright test tests/post-office-flow.spec.ts
```

Expected: post office static and flow tests pass.

- [ ] **Step 5: 提交邮箱前台**

```powershell
git add packages/site-astro/src/components/MailboxApp.vue packages/site-astro/src/pages/mailbox.astro packages/site-astro/src/components/StudentProfile.vue
git commit -m "feat: add class mailbox page"
```

---

## Task 8: 增强管理后台留言审核与邮局管理

**Files:**
- Modify: `packages/admin/src/views/MessagesView.vue`
- Create: `packages/admin/src/views/MailView.vue`
- Modify: `packages/admin/src/main.ts`
- Modify: `packages/admin/src/views/AdminLayout.vue`

- [ ] **Step 1: 扩展留言审核类型筛选**

In `packages/admin/src/views/MessagesView.vue`, add state:

```ts
const messageType = ref<'profile' | 'public'>('profile')
const publicMessages = ref<any[]>([])
```

Update load:

```ts
async function load() {
  loading.value = true
  try {
    if (messageType.value === 'public') {
      const res = await adminFetch<{ success: boolean; data: any[] }>('/api/admin/public-messages')
      publicMessages.value = res.data || []
    } else {
      const res = await adminFetch<{ success: boolean; data: Message[] }>('/api/admin/messages')
      if (res.data) messages.value = res.data
    }
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    loading.value = false
  }
}
```

Add type buttons near filter tabs:

```vue
<div class="filter-tabs">
  <button :class="['tab-btn', { active: messageType === 'profile' }]" @click="messageType = 'profile'; load()">个人留言</button>
  <button :class="['tab-btn', { active: messageType === 'public' }]" @click="messageType = 'public'; load()">公共留言</button>
</div>
```

- [ ] **Step 2: 增加公共留言审核方法**

Add to `MessagesView.vue` script:

```ts
async function approvePublicMessage(id: string) {
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/approve`, { method: 'PUT' })
    const msg = publicMessages.value.find(m => m.id === id)
    if (msg) msg.status = 'approved'
    showToast('success', '已审核通过')
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    processing.value = false
  }
}

async function rejectPublicMessage(id: string) {
  const reason = prompt('请输入退回原因')
  if (!reason || !reason.trim()) return
  processing.value = true
  try {
    await adminFetch(`/api/admin/public-messages/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    })
    const msg = publicMessages.value.find(m => m.id === id)
    if (msg) {
      msg.status = 'rejected'
      msg.reviewReason = reason
    }
    showToast('success', '已退回')
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    processing.value = false
  }
}
```

Render a public message list when `messageType === 'public'`:

```vue
<div v-if="messageType === 'public'" class="msg-list">
  <div v-for="msg in publicMessages" :key="msg.id" class="msg-card card">
    <div class="msg-meta">
      <span>提交者: {{ msg.authorName }}</span>
      <span>状态: {{ msg.status }}</span>
      <span>{{ msg.createdAt }}</span>
    </div>
    <p class="msg-content">{{ msg.content }}</p>
    <p v-if="msg.reviewReason" class="msg-reply-inline">退回原因：{{ msg.reviewReason }}</p>
    <div class="msg-actions">
      <button v-if="msg.status === 'pending'" class="btn-primary btn-sm" @click="approvePublicMessage(msg.id)" :disabled="processing">审核通过</button>
      <button v-if="msg.status === 'pending'" class="btn-secondary btn-sm" @click="rejectPublicMessage(msg.id)" :disabled="processing">退回</button>
    </div>
  </div>
</div>
```

Keep the existing personal message list under `v-else`.

- [ ] **Step 3: 新增管理员邮局页面**

Create `packages/admin/src/views/MailView.vue`:

```vue
<template>
  <div class="mail-admin-page">
    <div class="page-header">
      <h1 class="page-title">班级邮局</h1>
    </div>

    <form class="card mail-form" @submit.prevent="send">
      <label>
        收件人 slug
        <input v-model="form.recipientSlug" class="text-input" placeholder="留空时使用群发" />
      </label>
      <label>
        标题
        <input v-model="form.subject" class="text-input" maxlength="80" />
      </label>
      <label>
        正文
        <textarea v-model="form.body" class="text-input mail-body" maxlength="2000" />
      </label>
      <label class="checkbox-row">
        <input v-model="form.allowReply" type="checkbox" />
        允许同学回复
      </label>
      <div class="actions">
        <button class="btn-primary" :disabled="sending || !form.subject.trim() || !form.body.trim()">发送</button>
        <button class="btn-secondary" type="button" :disabled="sending || !form.subject.trim() || !form.body.trim()" @click="broadcast">群发全班</button>
      </div>
      <p v-if="toast" :class="'toast-inline ' + toast.type">{{ toast.message }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { adminFetch } from '@/api/client'

const sending = ref(false)
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const form = reactive({
  recipientSlug: '',
  subject: '',
  body: '',
  allowReply: false,
})

function showToast(type: 'success' | 'error', message: string) {
  toast.value = { type, message }
  setTimeout(() => { toast.value = null }, 3000)
}

async function send() {
  if (!form.recipientSlug.trim()) {
    showToast('error', '单发请输入收件人 slug')
    return
  }
  sending.value = true
  try {
    await adminFetch('/api/admin/mail/send', {
      method: 'POST',
      body: JSON.stringify(form),
    })
    showToast('success', '信件已发送')
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    sending.value = false
  }
}

async function broadcast() {
  if (!confirm('确认向全班群发这封信？')) return
  sending.value = true
  try {
    const res = await adminFetch<{ success: boolean; data: { sentCount: number } }>('/api/admin/mail/broadcast', {
      method: 'POST',
      body: JSON.stringify(form),
    })
    showToast('success', `群发完成，共 ${res.data?.sentCount || 0} 位收件人`)
  } catch (e: any) {
    showToast('error', e.message)
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.mail-form {
  display: grid;
  gap: var(--spacing-md);
  max-width: 760px;
}
.mail-form label {
  display: grid;
  gap: var(--spacing-xs);
  color: var(--color-muted);
  font-size: var(--type-body-sm-size);
}
.mail-body {
  min-height: 180px;
  resize: vertical;
}
.checkbox-row {
  display: flex !important;
  grid-template-columns: none;
  align-items: center;
  gap: var(--spacing-xs);
}
.actions {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}
.toast-inline.success { color: var(--color-success); }
.toast-inline.error { color: var(--color-error); }
</style>
```

- [ ] **Step 4: 注册后台路由**

Modify `packages/admin/src/main.ts` child routes:

```ts
{ path: 'mail', name: 'mail', component: () => import('./views/MailView.vue') },
```

- [ ] **Step 5: 增加后台侧栏入口**

Modify `packages/admin/src/views/AdminLayout.vue` inside `.sidebar-nav`:

```vue
<router-link to="/mail" class="nav-item">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/></svg>
  班级邮局
</router-link>
```

- [ ] **Step 6: 运行后台验证**

Run:

```powershell
pnpm --filter admin typecheck
pnpm --filter admin build
```

Expected: both pass.

- [ ] **Step 7: 提交后台管理功能**

```powershell
git add packages/admin/src/views/MessagesView.vue packages/admin/src/views/MailView.vue packages/admin/src/main.ts packages/admin/src/views/AdminLayout.vue
git commit -m "feat: add admin post office tools"
```

---

## Task 9: 性能、移动端和全量回归收口

**Files:**
- Modify: `packages/site-astro/tests/performance-network.spec.ts`
- Test-only verification across repo.

- [ ] **Step 1: 增加首页不请求邮局接口的 Playwright 断言**

Modify `packages/site-astro/tests/performance-network.spec.ts` in home page test after existing `/api/classmates` assertion:

```ts
expect(requests.some(url => url.toLowerCase().includes('/api/public-messages'))).toBe(false)
expect(requests.some(url => url.toLowerCase().includes('/api/mailbox'))).toBe(false)
expect(requests.some(url => url.toLowerCase().includes('/api/notifications'))).toBe(false)
```

- [ ] **Step 2: 运行站点验证**

Run:

```powershell
pnpm verify:site
```

Expected:

- Static tests pass.
- Build passes.
- Playwright tests pass.
- Home page still does not request `/api/classmates`、`/api/public-messages`、`/api/mailbox`、`/api/notifications` on first load.

- [ ] **Step 3: 运行 Worker 验证**

Run:

```powershell
pnpm verify:worker
```

Expected: Worker Vitest suite passes.

- [ ] **Step 4: 运行后台验证**

Run:

```powershell
pnpm verify:admin
```

Expected: admin typecheck and build pass.

- [ ] **Step 5: 运行整库验证**

Run:

```powershell
pnpm verify:all
```

Expected: all verification commands pass.

- [ ] **Step 6: 手动视觉 QA**

Start preview with a local address that avoids proxy interception:

```powershell
pnpm --filter site-astro preview -- --host 127.0.0.1
```

Check these pages at desktop `1440x900` and mobile `390x844`:

- `http://127.0.0.1:<port>/`
- `http://127.0.0.1:<port>/roster/`
- `http://127.0.0.1:<port>/messages/`
- `http://127.0.0.1:<port>/mailbox/`
- `http://127.0.0.1:<port>/student/template/`

Acceptance:

- 导航像纸页书签，不再像玻璃灯管。
- 邮箱未读邮戳不挤压导航文字。
- 公共留言页桌面端有公告栏/便签墙气质。
- 公共留言页手机端无横向滚动。
- 邮箱页手机端为单列，不出现三栏压缩。
- 首页首屏不被新增功能拖慢。

- [ ] **Step 7: 提交收口测试**

```powershell
git add packages/site-astro/tests/performance-network.spec.ts
git commit -m "test: guard post office performance"
```

---

## Final Review Checklist

- [ ] `pnpm verify:all` passes.
- [ ] `TopNav.astro` no longer contains `lamp-glow`.
- [ ] `/messages` and `/mailbox` exist and use `page-shell`、`page-header`、`paper-panel`.
- [ ] Public messages require `X-Classmate-Token` for writes.
- [ ] Public message approval creates a notification.
- [ ] Rejection reason is visible only to the submitter and admin.
- [ ] Mailbox thread detail rejects unrelated classmates with 403.
- [ ] Admin can send single mail and broadcast mail.
- [ ] Home page first load does not request public message, mailbox, or notification APIs.
- [ ] Mobile pages have no horizontal overflow.

## Execution Notes

- The current working tree may contain unrelated user changes. Before each commit, run `git status --short` and stage only the files listed in that task.
- Do not revert unrelated changes in `packages/admin/src/views/StudentEditView.vue`、`packages/site-astro/src/components/SelfEditPanel.vue`、`packages/admin/src/components/CalendarDatePicker.vue`、`packages/site-astro/src/components/CalendarDatePicker.vue` or other files unless the user explicitly asks.
- If a task changes the same file as unrelated user work, read that file first and preserve the user changes.
- Use `127.0.0.1` for local preview links because the user previously hit proxy blocking on localhost.
