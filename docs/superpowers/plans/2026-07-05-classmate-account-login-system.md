# Classmate Account Login System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前“输入姓名进入 + 修改个人主页时再输编辑口令”的过渡方案，升级为每位同学拥有独立账号、默认初始密码、首次登录强制改密、主题化登录界面的完整同学账号系统。

**Architecture:** 新增同学账号认证域，保留管理员 JWT 与公开访客浏览能力，但把“同学身份”“本人权限”“同学可见隐私数据”统一收敛到同学登录 token。数据库继续以 D1 为主，密码使用 PBKDF2 哈希存储，前台 Astro/Vue 负责纸张、书本、回忆主题的登录与首次设置体验。

**Tech Stack:** Cloudflare Workers + Hono + D1 + R2，Astro 5 + Vue islands，pnpm workspace，Vitest，Playwright。

---

## 本轮验收结论与需带入下一阶段的问题

本轮代码自动化验收通过：

- `pnpm verify:worker`：4 个测试文件、36 个测试通过。
- `pnpm verify:admin`：Vue 类型检查和 Vite 构建通过。
- `pnpm verify:site`：Vue 类型检查、Astro 构建、6 个 Vitest 文件、4 个 Playwright 网络性能用例通过。

仍需进入下一阶段处理的问题：

- 当前同学身份仍依赖 `sessionStorage.classmate_name`，只证明“输入的姓名在名单里”，无法证明是本人。
- 个人主页编辑仍依赖 `students.edit_secret_hash` 与 `/api/classmate/token`，这更像“编辑口令”，不是完整账号系统。
- `classmate_token_<slug>` 分散存储在多个前台组件中，留言、隐私字段、个人编辑的身份状态不统一。
- `privacy_level = classmates` 当前没有真正的“已登录同学会话”入口；未登录访客默认仍会被过滤为 `public`。
- `MainLayout.astro` 中的姓名门禁和未来账号登录会发生职责冲突，需要重构成统一会话守卫。
- 登录界面 `NameGate.vue` 仍是简单姓名输入，与“青春纪念馆 / 书本 / 纸张 / 回忆”主题不够一致。
- 首次登录引导仅在自助编辑弹窗中提示设置编辑口令，没有独立的首次登录流程、改密约束、完成状态。
- Worker 里 PBKDF2、HMAC classmate token 的实现分散在 `routes/classmate.ts` 与 `index.ts`，账号体系扩展时容易不一致。
- `workers/api/tests/db-helper.ts` 采用手写迁移数组，新增账号 schema 时必须同步，否则测试 schema 与真实迁移会漂移。
- `pnpm verify:site` 虽通过，但 Playwright mock 日志提示缺少 `packages/site-astro/public/data/timeline.json`，应补齐夹具或调整 mock。
- `pnpm verify:site` 末尾仍出现 npm unknown env config 警告，应定位为用户级 npm 配置或 pnpm/npm 交叉调用问题，避免长期污染验收日志。
- 动画跳变/重复加载已被上一阶段缓解，但当前测试只覆盖网络懒加载，不足以断言登录页、首次引导弹窗、页面切换动画无重复播放和卡顿。

## 文件结构规划

### Worker 与数据库

- Create: `workers/api/migrations/0010_classmate_accounts.sql`
  - 新增同学账号字段或独立表、会话表、首次登录状态字段。
- Modify: `workers/api/src/db/schema.sql`
  - 同步完整 schema，避免新部署和迁移部署不一致。
- Create: `workers/api/src/lib/password.ts`
  - 统一 PBKDF2 hash / verify，替代多处复制实现。
- Create: `workers/api/src/lib/classmateSession.ts`
  - 统一同学 token 生成、验证、TTL、会话记录校验。
- Create: `workers/api/src/routes/classmateAuth.ts`
  - 提供同学登录、获取当前账号、首次改密、登出、刷新会话接口。
- Modify: `workers/api/src/routes/classmate.ts`
  - 自助编辑改用登录后的同学账号会话，不再要求单独编辑口令。
- Modify: `workers/api/src/routes/students.ts`
  - 管理员创建/重置同学账号初始密码，保存账号状态。
- Modify: `workers/api/src/index.ts`
  - 挂载新认证路由，重构 `determineAudience()` 使用统一同学会话。
- Modify: `workers/api/tests/db-helper.ts`
  - 同步 `0010_classmate_accounts` 测试迁移。
- Modify: `workers/api/tests/api.test.ts`
  - 覆盖正常登录、首次改密、会话读取、隐私可见性。
- Modify: `workers/api/tests/security.test.ts`
  - 覆盖错误密码、跨账号编辑、旧编辑口令兼容、登出失效、默认密码状态。

### 共享类型与客户端工具

- Modify: `packages/shared/src/types.ts`
  - 增加 `ClassmateAccount`、`ClassmateSession`、`ClassmateLoginResponse` 等类型。
- Modify: `packages/shared/src/utils.ts`
  - 新增同学会话 token/name/slug 的读写清理工具，保留旧 `classmate_name` 兼容入口。
- Create: `packages/site-astro/src/api/classmateAuth.ts`
  - 前台同学登录、首次改密、登出、当前用户读取 API 客户端。

### 前台体验

- Create: `packages/site-astro/src/components/ClassmateLoginBook.vue`
  - 替代单一 `NameGate.vue` 的主题化登录组件，采用书本、纸张、手写卡片、纪念册元素。
- Create: `packages/site-astro/src/components/FirstLoginPasswordGuide.vue`
  - 首次登录强制改密弹窗，包含初始密码说明、密码强度、确认密码、完成后进入站点。
- Modify: `packages/site-astro/src/components/NameGate.vue`
  - 改成兼容壳组件，只渲染 `ClassmateLoginBook`，不再包含姓名验证逻辑。
- Modify: `packages/site-astro/src/components/TopNav.astro`
  - 显示当前同学账号、退出按钮或“登录同学账号”入口。
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
  - 重构会话守卫：公开页允许浏览，需同学身份的页面或能力引导登录。
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
  - 改用统一同学账号 token；移除编辑口令验证弹窗；保留首次改密状态提醒。
- Modify: `packages/site-astro/src/components/MessageWall.vue`
  - 留言作者默认读取当前登录同学；本人操作和隐私读取统一用同学 token。
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
  - 请求学生详情时统一附加同学 token；隐私字段按登录身份正确显示。
- Modify: `packages/site-astro/src/styles/global.css`
  - 增加登录页纸张、翻页、墨迹、书签等轻量动画，遵守 `prefers-reduced-motion`。
- Create: `packages/site-astro/tests/classmate-auth-static.test.ts`
  - 静态检查不再依赖裸 `classmate_name` 作为权限判断。
- Create: `packages/site-astro/tests/classmate-login-flow.spec.ts`
  - Playwright 覆盖登录、首次改密、刷新后仍登录、登出。

### 管理后台

- Modify: `packages/admin/src/views/StudentEditView.vue`
  - 将“重置自助编辑口令”改为“账号与初始密码管理”。
- Modify: `packages/admin/src/views/StudentsView.vue`
  - 显示账号状态：未初始化、初始密码待修改、已激活、已锁定。
- Modify: `packages/admin/src/api/client.ts`
  - 如新增管理接口，补充类型化请求函数。

### 文档与验收

- Modify: `AGENTS.md`
  - 若账号体系取代姓名门禁，更新架构说明，避免未来执行者按旧机制开发。
- Modify: `README.md`
  - 更新本地开发登录说明、默认初始密码说明。
- Create: `docs/phase-12-account-login-acceptance-report.md`
  - 下一阶段完成后的验收记录。
- Modify: `packages/site-astro/tests/performance-network.spec.ts`
  - 补齐 `timeline.json` mock 或改为内联 fixture，消除通过但噪声日志。

---

### Task 1: 数据模型与迁移

**Files:**
- Create: `workers/api/migrations/0010_classmate_accounts.sql`
- Modify: `workers/api/src/db/schema.sql`
- Modify: `workers/api/tests/db-helper.ts`

- [ ] **Step 1: 编写失败测试，确认账号字段尚不存在**

在 `workers/api/tests/api.test.ts` 新增测试：

```ts
it('classmate account schema exposes first-login account fields', async () => {
  const row = await env.DB.prepare('PRAGMA table_info(students)').all() as any
  const names = row.results.map((item: any) => item.name)
  expect(names).toContain('account_password_hash')
  expect(names).toContain('account_initial_password_changed')
  expect(names).toContain('account_status')
})
```

Run: `pnpm verify:worker`

Expected: FAIL，提示 `account_password_hash` 等字段不存在。

- [ ] **Step 2: 新增真实迁移**

创建 `workers/api/migrations/0010_classmate_accounts.sql`：

```sql
-- 0010_classmate_accounts.sql
-- CCSwitch: 为每位同学增加独立账号状态、默认初始密码哈希、首次登录改密状态与会话表。
ALTER TABLE students ADD COLUMN account_password_hash TEXT;
ALTER TABLE students ADD COLUMN account_initial_password_changed INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN account_status TEXT DEFAULT 'pending';
ALTER TABLE students ADD COLUMN account_last_login_at TEXT;

CREATE TABLE IF NOT EXISTS classmate_sessions (
  token TEXT PRIMARY KEY,
  student_slug TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (student_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_classmate_sessions_slug ON classmate_sessions(student_slug);
CREATE INDEX IF NOT EXISTS idx_classmate_sessions_expires ON classmate_sessions(expires_at);
```

- [ ] **Step 3: 同步完整 schema**

在 `workers/api/src/db/schema.sql` 的 `students` 表加入：

```sql
  account_password_hash TEXT,
  account_initial_password_changed INTEGER DEFAULT 0,
  account_status TEXT DEFAULT 'pending',
  account_last_login_at TEXT,
```

并新增：

```sql
CREATE TABLE IF NOT EXISTS classmate_sessions (
  token TEXT PRIMARY KEY,
  student_slug TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (student_slug) REFERENCES students(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_classmate_sessions_slug ON classmate_sessions(student_slug);
CREATE INDEX IF NOT EXISTS idx_classmate_sessions_expires ON classmate_sessions(expires_at);
```

- [ ] **Step 4: 同步测试迁移 helper**

在 `workers/api/tests/db-helper.ts` 的 `testMigrations` 末尾加入 `0010_classmate_accounts`，内容与真实迁移一致。

- [ ] **Step 5: 运行验证**

Run: `pnpm verify:worker`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add workers/api/migrations/0010_classmate_accounts.sql workers/api/src/db/schema.sql workers/api/tests/db-helper.ts workers/api/tests/api.test.ts
git commit -m "feat(worker): add classmate account schema"
```

### Task 2: 统一密码与同学会话工具

**Files:**
- Create: `workers/api/src/lib/password.ts`
- Create: `workers/api/src/lib/classmateSession.ts`
- Modify: `workers/api/src/routes/auth.ts`
- Modify: `workers/api/src/routes/classmate.ts`
- Modify: `workers/api/src/routes/students.ts`
- Modify: `workers/api/src/index.ts`

- [ ] **Step 1: 写失败测试，约束会话失效行为**

在 `workers/api/tests/security.test.ts` 新增测试：

```ts
it('classmate session token stops working after logout', async () => {
  const login = await worker.fetch(new Request('http://localhost/api/classmate-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'zhangsan', password: '123456' }),
  }), env, createExecutionContext())
  expect(login.status).toBe(200)
  const body = await login.json() as any
  const token = body.data.token

  const logout = await worker.fetch(new Request('http://localhost/api/classmate-auth/logout', {
    method: 'POST',
    headers: { 'X-Classmate-Token': token },
  }), env, createExecutionContext())
  expect(logout.status).toBe(200)

  const me = await worker.fetch(new Request('http://localhost/api/classmate-auth/me', {
    headers: { 'X-Classmate-Token': token },
  }), env, createExecutionContext())
  expect(me.status).toBe(401)
})
```

Run: `pnpm verify:worker`

Expected: FAIL，路由尚不存在。

- [ ] **Step 2: 抽取密码工具**

创建 `workers/api/src/lib/password.ts`：

```ts
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256)
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)))
  const saltStr = btoa(String.fromCharCode(...salt))
  return `pbkdf2:${saltStr}:${hash}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false
  if (storedHash.startsWith('pbkdf2:')) {
    const [, saltStr, hash] = storedHash.split(':')
    const encoder = new TextEncoder()
    const salt = Uint8Array.from(atob(saltStr), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256)
    const computedHash = btoa(String.fromCharCode(...new Uint8Array(bits)))
    return computedHash === hash
  }
  const encoder = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(password))
  const computedHash = btoa(String.fromCharCode(...new Uint8Array(hash)))
  return computedHash === storedHash
}
```

替换 `routes/auth.ts`、`routes/classmate.ts`、`routes/students.ts` 中重复的密码函数。

- [ ] **Step 3: 创建同学会话工具**

创建 `workers/api/src/lib/classmateSession.ts`：

```ts
export const CLASSMATE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

function base64url(str: string): string {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return base64url(String.fromCharCode(...new Uint8Array(sig)))
}

export async function createClassmateSession(db: D1Database, slug: string, secret: string): Promise<string> {
  const nonce = crypto.randomUUID()
  const issuedAt = Date.now()
  const signature = await hmacSign(`${slug}:${issuedAt}:${nonce}`, secret)
  const token = `${base64url(slug)}.${issuedAt}.${nonce}.${signature}`
  await db.prepare(
    "INSERT INTO classmate_sessions (token, student_slug, expires_at) VALUES (?, ?, datetime('now', '+7 days'))"
  ).bind(token, slug).run()
  return token
}

export async function verifyClassmateSession(db: D1Database, token: string | null | undefined): Promise<string | null> {
  if (!token) return null
  const row = await db.prepare(
    "SELECT student_slug FROM classmate_sessions WHERE token = ? AND expires_at > datetime('now')"
  ).bind(token).first() as any
  return row?.student_slug || null
}

export async function deleteClassmateSession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM classmate_sessions WHERE token = ?').bind(token).run()
}
```

- [ ] **Step 4: 运行验证**

Run: `pnpm verify:worker`

Expected: 当前新增测试仍可能失败，因为路由还没实现；旧测试必须继续通过或只因新路由缺失失败。

- [ ] **Step 5: Commit**

```bash
git add workers/api/src/lib/password.ts workers/api/src/lib/classmateSession.ts workers/api/src/routes/auth.ts workers/api/src/routes/classmate.ts workers/api/src/routes/students.ts workers/api/src/index.ts workers/api/tests/security.test.ts
git commit -m "refactor(worker): centralize classmate password and session helpers"
```

### Task 3: 同学账号认证 API

**Files:**
- Create: `workers/api/src/routes/classmateAuth.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/tests/api.test.ts`
- Modify: `workers/api/tests/security.test.ts`

- [ ] **Step 1: 写登录与首次改密失败测试**

在 `workers/api/tests/api.test.ts` 新增：

```ts
async function testHashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = new Uint8Array(16)
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256)
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)))
  const saltStr = btoa(String.fromCharCode(...salt))
  return `pbkdf2:${saltStr}:${hash}`
}

it('POST /api/classmate-auth/login returns mustChangePassword for initial password', async () => {
  await env.DB.prepare(
    "UPDATE students SET account_password_hash = ?, account_initial_password_changed = 0, account_status = 'pending' WHERE slug = ?"
  ).bind(await testHashPassword('123456'), 'test_init').run()

  const req = new Request('http://localhost/api/classmate-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'test_init', password: '123456' }),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  const body = await res.json() as any

  expect(res.status).toBe(200)
  expect(body.data.token).toBeTruthy()
  expect(body.data.mustChangePassword).toBe(true)
  expect(body.data.student.slug).toBe('test_init')
})
```

说明：这里的 `testHashPassword()` 只服务测试种子数据，使用固定 0 salt 让测试稳定；生产密码仍由 `workers/api/src/lib/password.ts` 生成随机 salt。

- [ ] **Step 2: 实现路由**

创建 `workers/api/src/routes/classmateAuth.ts`，提供：

```ts
import { Hono } from 'hono'
import { hashPassword, verifyPassword } from '../lib/password'
import { createClassmateSession, deleteClassmateSession, verifyClassmateSession } from '../lib/classmateSession'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const classmateAuthRoutes = new Hono<{ Bindings: Bindings }>()

classmateAuthRoutes.post('/login', async (c) => {
  const { slug, password } = await c.req.json()
  if (!slug || !password) return c.json({ success: false, message: '账号和密码必填' }, 400)

  const student = await c.env.DB.prepare(
    'SELECT name, slug, avatar_url, account_password_hash, account_initial_password_changed, account_status FROM students WHERE slug = ?'
  ).bind(slug).first() as any

  if (!student || student.account_status === 'locked') {
    return c.json({ success: false, message: '账号或密码错误' }, 401)
  }
  if (!student.account_password_hash) {
    return c.json({ success: false, message: '账号尚未初始化，请联系管理员' }, 403)
  }

  const valid = await verifyPassword(password, student.account_password_hash)
  if (!valid) return c.json({ success: false, message: '账号或密码错误' }, 401)

  const token = await createClassmateSession(c.env.DB, student.slug, c.env.JWT_SECRET)
  await c.env.DB.prepare(
    "UPDATE students SET account_last_login_at = datetime('now'), account_status = CASE WHEN account_status = 'pending' THEN 'active' ELSE account_status END WHERE slug = ?"
  ).bind(student.slug).run()

  return c.json({
    success: true,
    data: {
      token,
      mustChangePassword: !student.account_initial_password_changed,
      student: { name: student.name, slug: student.slug, avatarUrl: student.avatar_url },
    },
  })
})

classmateAuthRoutes.get('/me', async (c) => {
  const token = c.req.header('X-Classmate-Token')
  const slug = await verifyClassmateSession(c.env.DB, token)
  if (!slug) return c.json({ success: false, message: '登录已失效' }, 401)
  const row = await c.env.DB.prepare(
    'SELECT name, slug, avatar_url, account_initial_password_changed, account_status FROM students WHERE slug = ?'
  ).bind(slug).first() as any
  return c.json({
    success: true,
    data: {
      student: { name: row.name, slug: row.slug, avatarUrl: row.avatar_url },
      mustChangePassword: !row.account_initial_password_changed,
    },
  })
})

classmateAuthRoutes.post('/change-password', async (c) => {
  const token = c.req.header('X-Classmate-Token')
  const slug = await verifyClassmateSession(c.env.DB, token)
  if (!slug) return c.json({ success: false, message: '登录已失效' }, 401)

  const { oldPassword, newPassword } = await c.req.json()
  if (!oldPassword || !newPassword) return c.json({ success: false, message: '原密码和新密码必填' }, 400)
  if (String(newPassword).length < 8) return c.json({ success: false, message: '新密码至少 8 位' }, 400)

  const row = await c.env.DB.prepare('SELECT account_password_hash FROM students WHERE slug = ?').bind(slug).first() as any
  const valid = await verifyPassword(oldPassword, row.account_password_hash)
  if (!valid) return c.json({ success: false, message: '原密码错误' }, 403)

  const nextHash = await hashPassword(newPassword)
  await c.env.DB.prepare(
    "UPDATE students SET account_password_hash = ?, account_initial_password_changed = 1, account_status = 'active', updated_at = datetime('now') WHERE slug = ?"
  ).bind(nextHash, slug).run()

  return c.json({ success: true, message: '密码已更新' })
})

classmateAuthRoutes.post('/logout', async (c) => {
  const token = c.req.header('X-Classmate-Token')
  if (token) await deleteClassmateSession(c.env.DB, token)
  return c.json({ success: true })
})
```

- [ ] **Step 3: 挂载路由**

在 `workers/api/src/index.ts` 导入并挂载：

```ts
import { classmateAuthRoutes } from './routes/classmateAuth'

app.route('/api/classmate-auth', classmateAuthRoutes)
```

并将 CORS `allowHeaders` 保持包含 `X-Classmate-Token`。

- [ ] **Step 4: 运行验证**

Run: `pnpm verify:worker`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add workers/api/src/routes/classmateAuth.ts workers/api/src/index.ts workers/api/tests/api.test.ts workers/api/tests/security.test.ts
git commit -m "feat(worker): add classmate account authentication"
```

### Task 4: 管理后台账号初始化与重置

**Files:**
- Modify: `workers/api/src/routes/students.ts`
- Modify: `packages/admin/src/views/StudentEditView.vue`
- Modify: `packages/admin/src/views/StudentsView.vue`
- Modify: `workers/api/tests/api.test.ts`

- [ ] **Step 1: 写管理员初始化账号测试**

在 `workers/api/tests/api.test.ts` 新增：

```ts
async function loginAsAdminForTest(): Promise<string> {
  const loginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin888' }),
  })
  const loginCtx = createExecutionContext()
  const loginRes = await worker.fetch(loginReq, env, loginCtx)
  await waitOnExecutionContext(loginCtx)
  const loginBody = await loginRes.json() as any
  return loginBody.data.token
}

it('admin can set classmate initial password and mark account pending', async () => {
  const token = await loginAsAdminForTest()
  const req = new Request('http://localhost/api/students/test_init', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: '测试同学',
      accountInitialPassword: 'init-123456',
    }),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  expect(res.status).toBe(200)

  const row = await env.DB.prepare(
    'SELECT account_password_hash, account_initial_password_changed, account_status FROM students WHERE slug = ?'
  ).bind('test_init').first() as any
  expect(row.account_password_hash).toMatch(/^pbkdf2:/)
  expect(row.account_initial_password_changed).toBe(0)
  expect(row.account_status).toBe('pending')
})
```

- [ ] **Step 2: Worker 支持管理员设置初始密码**

在 `studentsRoutes.put('/students/:slug')` 中支持：

```ts
if (body.accountInitialPassword !== undefined && body.accountInitialPassword !== null && body.accountInitialPassword !== '') {
  const hash = await hashPassword(body.accountInitialPassword)
  fields.push('account_password_hash = ?')
  values.push(hash)
  fields.push('account_initial_password_changed = 0')
  fields.push("account_status = 'pending'")
}
```

不要把 `account_password_hash` 通过 GET API 返回给前台或后台。

- [ ] **Step 3: 后台编辑页改造**

在 `packages/admin/src/views/StudentEditView.vue`：

- 将“重置自助编辑口令”标题改为“同学账号与初始密码”。
- 字段名从 `tempEditSecret` 改为 `tempInitialPassword`。
- 保存 payload 使用 `accountInitialPassword`。
- 帮助文案明确：“保存后该同学下次使用此初始密码登录，并会被要求立即设置自己的密码。”

- [ ] **Step 4: 学生列表显示账号状态**

在 `packages/admin/src/views/StudentsView.vue` 中为每位同学增加账号状态展示：

- `pending`：待首次改密。
- `active`：已激活。
- `locked`：已锁定。
- 无密码：未初始化。

- [ ] **Step 5: 运行验证**

Run:

```bash
pnpm verify:worker
pnpm verify:admin
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add workers/api/src/routes/students.ts workers/api/tests/api.test.ts packages/admin/src/views/StudentEditView.vue packages/admin/src/views/StudentsView.vue
git commit -m "feat(admin): manage classmate account passwords"
```

### Task 5: 前台会话工具与主题化登录界面

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/utils.ts`
- Create: `packages/site-astro/src/api/classmateAuth.ts`
- Create: `packages/site-astro/src/components/ClassmateLoginBook.vue`
- Modify: `packages/site-astro/src/components/NameGate.vue`
- Modify: `packages/site-astro/src/pages/index.astro`
- Modify: `packages/site-astro/src/styles/global.css`

- [ ] **Step 1: 写静态失败测试，禁止新登录仍只写 classmate_name**

创建 `packages/site-astro/tests/classmate-auth-static.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('classmate account login frontend', () => {
  it('uses account token storage instead of name-only session as primary auth', () => {
    const loginPath = path.resolve(__dirname, '../src/components/ClassmateLoginBook.vue')
    const source = fs.readFileSync(loginPath, 'utf-8')
    expect(source).toContain('setClassmateSession')
    expect(source).not.toContain("sessionStorage.setItem('classmate_name'")
  })
})
```

将该测试加入 `packages/site-astro/package.json` 的 `test` 脚本。

- [ ] **Step 2: 共享类型与 session 工具**

在 `packages/shared/src/types.ts` 加：

```ts
export interface ClassmateSessionStudent {
  name: string
  slug: string
  avatarUrl: string | null
}

export interface ClassmateLoginResponse {
  token: string
  mustChangePassword: boolean
  student: ClassmateSessionStudent
}
```

在 `packages/shared/src/utils.ts` 加：

```ts
const CLASSMATE_TOKEN_KEY = 'classmate_account_token'
const CLASSMATE_STUDENT_KEY = 'classmate_account_student'

export function getClassmateToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage.getItem(CLASSMATE_TOKEN_KEY)
}

export function setClassmateSession(token: string, student: unknown): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(CLASSMATE_TOKEN_KEY, token)
  sessionStorage.setItem(CLASSMATE_STUDENT_KEY, JSON.stringify(student))
  if (student && typeof student === 'object' && 'name' in student) {
    sessionStorage.setItem('classmate_name', String((student as any).name))
  }
}

export function getClassmateStudent<T = unknown>(): T | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(CLASSMATE_STUDENT_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

export function clearClassmateSession(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(CLASSMATE_TOKEN_KEY)
  sessionStorage.removeItem(CLASSMATE_STUDENT_KEY)
  sessionStorage.removeItem('classmate_name')
}
```

- [ ] **Step 3: 创建前台 API 客户端**

创建 `packages/site-astro/src/api/classmateAuth.ts`：

```ts
import { getClassmateToken, type ApiResponse, type ClassmateLoginResponse } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

export async function classmateLogin(apiBase: string, slug: string, password: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/classmate-auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, password }),
  })
  const data = await res.json() as ApiResponse<ClassmateLoginResponse>
  if (!res.ok || !data.success || !data.data) throw new Error(data.message || '登录失败')
  return data.data
}

export async function changeClassmatePassword(apiBase: string, oldPassword: string, newPassword: string) {
  const token = getClassmateToken()
  const res = await fetch(joinApiUrl(apiBase, '/api/classmate-auth/change-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Classmate-Token': token } : {}) },
    body: JSON.stringify({ oldPassword, newPassword }),
  })
  const data = await res.json() as ApiResponse
  if (!res.ok || !data.success) throw new Error(data.message || '修改密码失败')
  return data
}
```

- [ ] **Step 4: 主题化登录组件**

创建 `packages/site-astro/src/components/ClassmateLoginBook.vue`，核心交互：

- 账号选择使用同学名单下拉/搜索，值为 `slug`。
- 密码输入为纸张卡片上的“入馆凭证”。
- 登录成功调用 `setClassmateSession(token, student)`。
- `mustChangePassword` 为 true 时显示 `FirstLoginPasswordGuide`。
- 登录成功且无需改密时跳转 `/preface`。

视觉要求：

- 主体像一本打开的纪念册，而不是普通登录卡片。
- 背景使用纸张纹理、书脊阴影、书签、淡淡墨迹线条。
- 动画只做一次进入，不重复挂载播放。
- 移动端不出现按钮文字溢出或表单遮挡。

- [ ] **Step 5: 替换首页入口**

在 `packages/site-astro/src/pages/index.astro` 中将 `MuseumHero` 内部旧 `NameGate` 的使用路径改为新组件，或让 `NameGate.vue` 内部只代理 `ClassmateLoginBook`。

- [ ] **Step 6: 运行验证**

Run:

```bash
pnpm verify:site
```

Expected: PASS，且不再有登录静态测试失败。

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/utils.ts packages/site-astro/src/api/classmateAuth.ts packages/site-astro/src/components/ClassmateLoginBook.vue packages/site-astro/src/components/NameGate.vue packages/site-astro/src/pages/index.astro packages/site-astro/src/styles/global.css packages/site-astro/tests/classmate-auth-static.test.ts packages/site-astro/package.json
git commit -m "feat(site): add themed classmate account login"
```

### Task 6: 首次登录强制改密引导

**Files:**
- Create: `packages/site-astro/src/components/FirstLoginPasswordGuide.vue`
- Modify: `packages/site-astro/src/components/ClassmateLoginBook.vue`
- Modify: `packages/site-astro/tests/classmate-login-flow.spec.ts`

- [ ] **Step 1: 写 Playwright 首次改密流程测试**

创建 `packages/site-astro/tests/classmate-login-flow.spec.ts`：

```ts
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
  await page.getByLabel('选择同学账号').selectOption('test_init')
  await page.getByLabel('初始密码').fill('123456')
  await page.getByRole('button', { name: '进入同学录' }).click()
  await expect(page.getByRole('dialog')).toContainText('第一次登录')
  await page.getByLabel('新密码').fill('new-pass-123')
  await page.getByLabel('确认新密码').fill('new-pass-123')
  await page.getByRole('button', { name: '设置并进入' }).click()
  await expect(page).toHaveURL(/\/preface/)
})
```

- [ ] **Step 2: 创建首次登录弹窗**

创建 `FirstLoginPasswordGuide.vue`：

- props: `apiBase`, `oldPassword`
- emits: `completed`, `cancel`
- 校验：新密码至少 8 位、两次输入一致、不能等于初始密码。
- 成功后提示“密码已装订进你的纪念册”，再 emit completed。

- [ ] **Step 3: 接入登录组件**

在 `ClassmateLoginBook.vue` 中：

- 登录成功且 `mustChangePassword` 为 true 时保持在首页，打开 `FirstLoginPasswordGuide`。
- 改密完成后跳转 `/preface`。
- 弹窗关闭不能绕过强制改密；关闭只回到登录态清理后的首页。

- [ ] **Step 4: 运行验证**

Run:

```bash
pnpm --filter site-astro test:perf-network
pnpm verify:site
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/site-astro/src/components/FirstLoginPasswordGuide.vue packages/site-astro/src/components/ClassmateLoginBook.vue packages/site-astro/tests/classmate-login-flow.spec.ts
git commit -m "feat(site): require first-login password change"
```

### Task 7: 权限、隐私与自助编辑统一到同学账号

**Files:**
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/src/routes/classmate.ts`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/site-astro/src/components/MessageWall.vue`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `workers/api/tests/security.test.ts`

- [ ] **Step 1: 写跨账号编辑失败测试**

在 `workers/api/tests/security.test.ts` 新增：

```ts
async function seedClassmateForTest(slug: string, name: string, password: string) {
  await env.DB.prepare(
    'INSERT OR REPLACE INTO students (id, name, slug, account_password_hash, account_initial_password_changed, account_status, info) VALUES (?, ?, ?, ?, 1, ?, ?)'
  ).bind(
    `stu_${slug}`,
    name,
    slug,
    await testHashPassword(password),
    'active',
    JSON.stringify({ name, visibility: { phone: 'owner', wechat: 'classmates' } })
  ).run()
}

async function loginAsClassmateForTest(slug: string, password: string): Promise<string> {
  const loginReq = new Request('http://localhost/api/classmate-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, password }),
  })
  const loginCtx = createExecutionContext()
  const loginRes = await worker.fetch(loginReq, env, loginCtx)
  await waitOnExecutionContext(loginCtx)
  const loginBody = await loginRes.json() as any
  return loginBody.data.token
}

it('logged-in classmate cannot edit another student profile', async () => {
  await seedClassmateForTest('zhangsan', '张三', '12345678')
  await seedClassmateForTest('lisi', '李四', '12345678')
  const token = await loginAsClassmateForTest('zhangsan', '12345678')
  const req = new Request('http://localhost/api/classmate/students/lisi', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Classmate-Token': token },
    body: JSON.stringify({ info: { nickname: '越权修改' } }),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  expect(res.status).toBe(403)
})
```

- [ ] **Step 2: 重构 audience 判断**

在 `workers/api/src/index.ts`：

- `determineAudience()` 使用 `verifyClassmateSession(c.env.DB, token)`。
- token 对应当前 slug 时返回 `owner`。
- token 有效但不是当前 slug 时返回 `classmates`。
- 无 token 且 `audience=public` 返回 `public`。
- 不再使用旧 HMAC token 解析逻辑。

- [ ] **Step 3: 自助编辑路由使用会话表**

在 `workers/api/src/routes/classmate.ts`：

- `/classmate/token` 标记为兼容旧入口，并在 `docs/phase-12-account-login-acceptance-report.md` 记录下一阶段删除条件。
- `PUT /classmate/students/:slug` 使用 `verifyClassmateSession()`。
- `POST /classmate/upload` 使用 `verifyClassmateSession()`。
- 移除编辑口令必填逻辑；保留 `edit_secret_hash` 只作为迁移兼容字段，不再作为主路径。

- [ ] **Step 4: 前台组件统一 token**

修改：

- `SelfEditPanel.vue`：从 `getClassmateToken()` 获取 token，不再调用 `/api/classmate/token`。
- `MessageWall.vue`：留言作者默认来自 `getClassmateStudent()`，涉及本人能力时统一附加 token。
- `StudentProfile.vue`：详情请求统一附加 `X-Classmate-Token`。

- [ ] **Step 5: 运行验证**

Run:

```bash
pnpm verify:worker
pnpm verify:site
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add workers/api/src/index.ts workers/api/src/routes/classmate.ts workers/api/tests/security.test.ts packages/site-astro/src/components/SelfEditPanel.vue packages/site-astro/src/components/MessageWall.vue packages/site-astro/src/components/StudentProfile.vue
git commit -m "feat(auth): unify privacy and self-edit around classmate sessions"
```

### Task 8: 页面守卫、导航状态与退出

**Files:**
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
- Modify: `packages/site-astro/src/components/TopNav.astro`
- Create: `packages/site-astro/src/scripts/classmateNav.ts`
- Modify: `packages/site-astro/tests/navigation.test.ts`

- [ ] **Step 1: 写导航静态测试**

在 `packages/site-astro/tests/navigation.test.ts` 增加：

```ts
it('top nav exposes classmate account state and logout hook', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/components/TopNav.astro'), 'utf-8')
  expect(source).toContain('data-classmate-account')
  expect(source).toContain('data-classmate-logout')
})
```

- [ ] **Step 2: MainLayout 会话守卫重构**

在 `MainLayout.astro` 中：

- 保留 `.js` class 初始化。
- 不再仅用 `classmate_name` 判断整站跳转。
- 对需要登录的页面，使用 `classmate_account_token` 判断。
- 首页、404、admin 始终不拦截。
- 旧 `classmate_name` 只作为显示兼容，不作为权限依据。

- [ ] **Step 3: TopNav 增加登录状态**

`TopNav.astro` 增加：

- 未登录：显示“同学登录”链接到首页。
- 已登录：显示同学姓名、头像小圆点、退出按钮。
- 退出按钮调用脚本，清理 session 并请求 `/api/classmate-auth/logout`。

- [ ] **Step 4: 创建导航脚本**

创建 `packages/site-astro/src/scripts/classmateNav.ts`：

```ts
import { clearClassmateSession, getClassmateStudent, getClassmateToken } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

export function initClassmateNav(apiBase: string) {
  const accountEl = document.querySelector<HTMLElement>('[data-classmate-account]')
  const logoutBtn = document.querySelector<HTMLButtonElement>('[data-classmate-logout]')
  const student = getClassmateStudent<{ name: string }>()
  if (accountEl && student?.name) accountEl.textContent = student.name

  logoutBtn?.addEventListener('click', async () => {
    const token = getClassmateToken()
    if (token) {
      await fetch(joinApiUrl(apiBase, '/api/classmate-auth/logout'), {
        method: 'POST',
        headers: { 'X-Classmate-Token': token },
      }).catch(() => undefined)
    }
    clearClassmateSession()
    window.location.href = '/'
  })
}
```

- [ ] **Step 5: 运行验证**

Run: `pnpm verify:site`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/site-astro/src/layouts/MainLayout.astro packages/site-astro/src/components/TopNav.astro packages/site-astro/src/scripts/classmateNav.ts packages/site-astro/tests/navigation.test.ts
git commit -m "feat(site): add classmate account nav state"
```

### Task 9: 清理本轮遗留验收噪声与动画覆盖缺口

**Files:**
- Modify: `packages/site-astro/tests/performance-network.spec.ts`
- Modify: `packages/site-astro/tests/animation-ownership.test.ts`
- Modify: `docs/animation-audit.md`

- [ ] **Step 1: 消除 Playwright timeline mock 噪声**

在 `packages/site-astro/tests/performance-network.spec.ts` 中把 `/api/timeline` mock 改成内联 fixture，避免依赖 `packages/site-astro/public/data/timeline.json`。示例：

```ts
const apiFixtures: Record<string, unknown> = {
  '/api/timeline': [],
}

if (url.includes('/api/timeline')) {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: apiFixtures['/api/timeline'] }),
  })
  return
}
```

Run: `pnpm --filter site-astro test:perf-network`

Expected: PASS，且不再出现 `Failed to read timeline.json`。

- [ ] **Step 2: 定位 npm unknown env config 警告**

Run:

```powershell
npm config list
pnpm config list
```

检查是否有这些键：

- `only-built-dependencies`
- `recursive`
- `verify-deps-before-run`
- `_jsr-registry`
- `npm-globalconfig`

若来自用户级 npm config，不在项目内直接改全局配置；记录到 `docs/phase-12-account-login-acceptance-report.md`，由用户确认是否清理。若来自项目 `.npmrc`，移除不被 npm 支持的项。

- [ ] **Step 3: 增加登录动画所有权测试**

在 `animation-ownership.test.ts` 增加断言：

- 登录组件没有引入 GSAP。
- 首次登录弹窗没有重复创建全局 IntersectionObserver。
- 登录页动画受 `prefers-reduced-motion` 控制。

- [ ] **Step 4: 更新动画审计文档**

在 `docs/animation-audit.md` 新增“账号登录阶段”小节：

- 登录页允许的动画：纸张淡入、书页轻翻、按钮按压。
- 禁止的动画：重复全屏 loading、重复页面跳转 fade、未登录和首次改密弹窗同时播放入场。

- [ ] **Step 5: 运行验证**

Run:

```bash
pnpm verify:site
```

Expected: PASS，日志无 timeline mock 缺失。

- [ ] **Step 6: Commit**

```bash
git add packages/site-astro/tests/performance-network.spec.ts packages/site-astro/tests/animation-ownership.test.ts docs/animation-audit.md
git commit -m "test(site): cover classmate login animation stability"
```

### Task 10: 文档、兼容策略与最终验收

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Create: `docs/phase-12-account-login-acceptance-report.md`
- Modify: `docs/feature-field-matrix.md`

- [ ] **Step 1: 更新项目架构说明**

在 `AGENTS.md` 中将“公开站点的会话认证”改为：

- 公开浏览仍可展示非敏感内容。
- 同学身份使用 `/api/classmate-auth/login`。
- token 存储在 `sessionStorage.classmate_account_token`。
- 首次登录必须修改初始密码。
- `classmate_name` 仅作为迁移兼容显示字段，不作为权限依据。

- [ ] **Step 2: 更新 README**

补充：

- 管理员如何给同学设置初始密码。
- 同学如何首次登录。
- 忘记密码如何由管理员重置。
- 本地开发如何验证账号流程。

- [ ] **Step 3: 更新字段矩阵**

在 `docs/feature-field-matrix.md` 加入：

- `students.account_password_hash`
- `students.account_initial_password_changed`
- `students.account_status`
- `students.account_last_login_at`
- `classmate_sessions`

- [ ] **Step 4: 写验收报告**

创建 `docs/phase-12-account-login-acceptance-report.md`，包含：

- 变更摘要。
- 数据迁移检查。
- 自动化验证命令与结果。
- 手动验收清单。
- 已知遗留风险。

- [ ] **Step 5: 全量验证**

Run:

```bash
pnpm verify:all
git status --short
```

Expected:

- Worker/Admin/Site 全部通过。
- `git status --short` 只包含本阶段有意修改。

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md README.md docs/phase-12-account-login-acceptance-report.md docs/feature-field-matrix.md
git commit -m "docs: document classmate account login system"
```

---

## 手动验收清单

- 管理员能为任意同学设置初始密码。
- 同学使用 slug/姓名选择 + 初始密码登录成功。
- 首次登录后必须修改密码，不改密不能进入主站能力区。
- 新密码少于 8 位、两次不一致、等于初始密码时均有明确提示。
- 改密后刷新页面仍保持登录状态。
- 退出后不能再访问本人隐私字段和编辑入口。
- A 同学不能编辑 B 同学主页。
- 已登录同学能看到 `classmates` 可见联系方式，未登录访客不能看到。
- 本人能看到 `owner` 可见联系方式，其他同学不能看到。
- 登录界面在桌面和手机上都有书本/纸张/回忆主题，不像后台管理登录页。
- 登录页、首次登录弹窗、页面跳转不会出现重复 loading、重复淡入、闪白、卡顿跳变。

## 回滚与兼容策略

- 数据库新增字段不删除旧 `edit_secret_hash`，首版上线保留旧自助编辑口令兼容入口。
- 前台保留 `classmate_name` 写入，但只用于展示和兼容旧页面，不再作为权限凭证。
- 若同学账号系统上线后出现严重问题，可临时在前台恢复 `NameGate.vue` 姓名入口，但 Worker 权限接口仍应优先使用 token。
- 管理员 JWT 登录体系不与同学账号合并，避免后台和同学身份边界混乱。

## 计划自检

- 覆盖用户要求：独立账号、默认初始密码、首次登录强制设置密码、首次登录引导弹窗、主题化登录界面均已拆入任务。
- 覆盖本轮验收问题：姓名门禁、编辑口令、隐私权限、测试 schema 漂移、timeline mock 噪声、npm config 警告、动画覆盖缺口均已进入计划。
- 无占位任务：每个任务包含具体文件、命令、期望结果和提交点。
