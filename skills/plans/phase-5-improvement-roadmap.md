# Phase 5: 项目改进与产品升级路线图

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前同学录从“可用的纪念网站”提升为“稳定、可信、可持续运营、具有情感记忆感的班级数字纪念册”。

**Architecture:** 路线图按风险优先级拆分：先修复部署、CORS、认证、隐私和数据一致性，再提升内容体验、后台效率、静态站刷新、测试与运维。每个任务都应能独立交付，避免一次性大改。

**Tech Stack:** Astro 5 + Vue 3 islands + Vite + TypeScript + Cloudflare Workers (Hono) + D1 + R2 + GitHub Pages + Vitest + Cloudflare test pool

---

## Context：当前项目诊断

| 类别 | 现状 | 风险/机会 |
|---|---|---|
| 文档 | README/AGENTS 仍描述 `packages/site` Vue SPA | 新维护者会按过期架构操作 |
| 部署路径 | 说明提到 `/alumni-book-v2/`，Astro 当前 `base: '/'`，多处硬编码根路径 | GitHub Pages 子路径部署可能导航失效 |
| API 地址 | SSG 使用 `VITE_WORKER_URL`，客户端使用 `VITE_API_BASE_URL`，脚本又读 `VITE_API_BASE_URL` | 构建数据和运行时数据来源容易不一致 |
| CORS | 允许头缺少 `X-Classmate-Token` | 自助编辑/上传在跨域环境可能预检失败 |
| 管理会话 | `admin_sessions` 被写入，但普通 admin API 只验 JWT，不查 session | logout 不能真正吊销 token |
| 同学自助认证 | 通过姓名 + slug 获取编辑 token | 班级名单公开后容易被冒用 |
| 留言回复 | 页面主人回复只校验请求体 `authorName` | 可被伪造请求冒用主人身份 |
| 隐私 | `/api/students` 公开返回联系方式等完整 info | 手机、微信、地址等字段缺少可见性控制 |
| 数据模型 | `schema.sql` 未包含后续迁移字段和新表 | 本地初始化和测试迁移容易漂移 |
| 静态刷新 | Astro 构建时生成学生页，用户编辑后页面不会自动静态更新 | 自助编辑成功后公开页可能仍显示旧内容 |
| 后台 | Dashboard 仅显示三个计数 | 不能帮助运营审核、发现活跃内容和风险 |
| 测试 | Worker 测试能跑，但覆盖偏少 | CORS、权限、上传、base path 等关键风险未锁住 |

---

## Phase 5 总览

| # | Task | 类型 | 优先级 |
|---|---|---|---|
| 1 | 文档与架构说明同步 | 文档 | P0 |
| 2 | GitHub Pages base path 与链接统一 | 前端/部署 | P0 |
| 3 | API 地址配置收敛 | 构建/前端 | P0 |
| 4 | CORS 与自助编辑预检修复 | Worker | P0 |
| 5 | 管理员 session revocation 闭环 | Worker/安全 | P0 |
| 6 | 同学自助认证升级 | Worker/前端/安全 | P1 |
| 7 | 留言主人回复改用 token | Worker/前端/安全 | P1 |
| 8 | 联系方式隐私分级 | Worker/前端/后台 | P1 |
| 9 | 上传安全与资源治理 | Worker/R2 | P1 |
| 10 | 数据库 schema 与迁移一致性 | 数据库/测试 | P1 |
| 11 | 静态页数据刷新策略 | Astro/Worker | P1 |
| 12 | 后台运营驾驶舱升级 | Admin | P2 |
| 13 | 留言墙升级为明信片体验 | 产品/前端/后台 | P2 |
| 14 | 时间轴升级为班级记忆流 | 产品/前端/Worker | P2 |
| 15 | 同学主页模块化小传 | 产品/前端/数据 | P2 |
| 16 | 班级相册体验升级 | 产品/前端/R2 | P2 |
| 17 | 搜索、筛选与排行 | 产品/前端/Worker | P2 |
| 18 | 可访问性、移动端与性能打磨 | 前端 | P2 |
| 19 | 测试矩阵与 CI 质量门禁 | 测试/CI | P1 |
| 20 | 监控、备份与运营工具 | 运维 | P2 |
| 21 | 纪念册导出与分享玩法 | 产品/内容 | P3 |

---

## File Structure

预计新增或重点修改的文件：

- Modify: `README.md` - 更新真实架构、命令、部署路径、环境变量说明。
- Modify: `AGENTS.md` - 更新 agent 工作约定，删除过期 `packages/site` 描述。
- Modify: `packages/site-astro/astro.config.mjs` - 统一 base path 与 API define。
- Modify: `packages/site-astro/src/components/TopNav.astro` - 导航链接改为 base-aware。
- Modify: `packages/site-astro/src/pages/*.astro` - 页面内链接、redirect、静态数据来源统一。
- Modify: `packages/site-astro/src/components/*.vue` - 自助编辑、留言、搜索、相册交互升级。
- Modify: `packages/admin/src/api/client.ts` - 登录校验、会话失效、API base 处理升级。
- Modify: `packages/admin/src/views/*.vue` - Dashboard、留言、学生、相册、配置页升级。
- Modify: `workers/api/src/index.ts` - CORS、JWT/session middleware、公开/私有响应边界。
- Modify: `workers/api/src/routes/auth.ts` - session 验证、logout、verify 语义收敛。
- Modify: `workers/api/src/routes/classmate.ts` - 同学 token 与编辑权限升级。
- Modify: `workers/api/src/routes/messages.ts` - 留言回复权限、审核和互动升级。
- Modify: `workers/api/src/routes/upload.ts` - 文件类型、大小、R2 key、清理策略升级。
- Modify: `workers/api/src/routes/students.ts` - 隐私分级、公开字段裁剪、模块化 profile。
- Modify: `workers/api/src/routes/timeline.ts` - 记忆流聚合、过滤和分页。
- Modify: `workers/api/src/db/schema.sql` - 同步最新迁移后的完整 schema。
- Create: `workers/api/migrations/0007_security_privacy.sql` - 同学口令/隐私字段/审计字段。
- Create: `workers/api/migrations/0008_profile_modules.sql` - 小传模块、相册增强、运营数据字段。
- Modify: `workers/api/tests/api.test.ts` - 扩展核心 API 测试。
- Create: `workers/api/tests/security.test.ts` - CORS、token、session、隐私测试。
- Create: `workers/api/tests/upload.test.ts` - 上传校验测试。
- Create: `packages/site-astro/tests/navigation.test.ts` - base path 和关键页面导航测试。

---

### Task 1: 文档与架构说明同步

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新项目结构说明**

将所有 `packages/site`、`Vue SPA` 的公开站描述改为：

```md
- `packages/site-astro` — 面向访客的 Astro 5 SSG 站点，交互部分使用 Vue islands
- `packages/admin` — 管理后台 Vue 3 SPA
- `packages/shared` — 类型定义、API 工具、图片压缩工具和设计令牌
- `workers/api` — Cloudflare Worker API，框架为 Hono，绑定 D1 和 R2
```

- [ ] **Step 2: 更新常用命令**

```bash
pnpm install
pnpm dev:site
pnpm dev:admin
pnpm dev:worker
pnpm build:site
pnpm build:admin
pnpm --filter worker exec vitest run
```

- [ ] **Step 3: 明确 API 环境变量语义**

文档中写清：

```md
- `VITE_API_BASE_URL`：客户端运行时 API 地址。
- `VITE_WORKER_URL`：Astro SSG 构建时拉取数据的 Worker 地址。
- 本地联调 Worker 时，两者都应指向本地 Worker；只改一个会造成静态数据和交互数据不一致。
```

- [ ] **Step 4: 验证文档不再出现过期路径**

Run:

```bash
rg "packages/site\\b|pnpm --filter site\\b|Vue 3 SPA" README.md AGENTS.md CLAUDE.md
```

Expected: 没有命中过期公开站描述。

---

### Task 2: GitHub Pages base path 与链接统一

**Files:**
- Modify: `packages/site-astro/astro.config.mjs`
- Modify: `packages/site-astro/src/components/TopNav.astro`
- Modify: `packages/site-astro/src/pages/preface.astro`
- Modify: `packages/site-astro/src/pages/roster.astro`
- Modify: `packages/site-astro/src/pages/timeline.astro`
- Modify: `packages/site-astro/src/pages/student/[slug].astro`
- Modify: `packages/site-astro/public/404.html`
- Modify: `packages/admin/vite.config.ts`
- Modify: `packages/admin/src/api/client.ts`

- [ ] **Step 1: 定义单一 public base**

在 `astro.config.mjs` 中通过环境变量控制：

```js
const siteBase = process.env.SITE_BASE ?? '/'

export default defineConfig({
  base: siteBase,
  integrations: [vue()],
  vite: {
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(
        process.env.VITE_API_BASE_URL ?? 'https://alumni-book-api.chenyuhao2263.workers.dev'
      ),
      'import.meta.env.VITE_WORKER_URL': JSON.stringify(
        process.env.VITE_WORKER_URL ?? 'https://alumni-book-api.chenyuhao2263.workers.dev'
      ),
    },
  },
  build: {
    assets: 'assets',
  },
})
```

- [ ] **Step 2: 建立 base-aware 链接 helper**

在 Astro 页面中统一使用：

```ts
const base = import.meta.env.BASE_URL
const href = (path: string) => `${base}${path.replace(/^\/+/, '')}`
```

将 `/preface`、`/roster`、`/album`、`/timeline`、`/student/${slug}` 改为 `href('preface')` 等形式。

- [ ] **Step 3: 修复 redirect**

将：

```ts
return Astro.redirect('/roster')
```

改为：

```ts
return Astro.redirect(`${import.meta.env.BASE_URL}roster`)
```

- [ ] **Step 4: 修复 admin 登录跳转**

在 `packages/admin/src/api/client.ts` 中避免写死 `/admin/#/login`，改为：

```ts
const adminBase = import.meta.env.BASE_URL || '/admin/'
window.location.href = `${adminBase}#/login`
```

- [ ] **Step 5: 验证所有根路径链接**

Run:

```bash
rg 'href="/|Astro.redirect\\('/ packages/site-astro/src packages/site-astro/public packages/admin/src
```

Expected: 只保留明确需要跳转域名根的链接；站内导航均为 base-aware。

---

### Task 3: API 地址配置收敛

**Files:**
- Modify: `packages/site-astro/astro.config.mjs`
- Modify: `packages/site-astro/scripts/fetch-data.ts`
- Modify: `packages/site-astro/src/pages/*.astro`
- Modify: `packages/shared/src/utils.ts`

- [ ] **Step 1: 统一构建脚本读取顺序**

`fetch-data.ts` 中改为：

```ts
const API_BASE =
  process.env.VITE_WORKER_URL ||
  process.env.VITE_API_BASE_URL ||
  'https://alumni-book-api.chenyuhao2263.workers.dev'
```

- [ ] **Step 2: 在构建日志输出两个地址**

```ts
console.log(`Fetching SSG data from ${API_BASE}`)
console.log(`Client API base will be ${process.env.VITE_API_BASE_URL || '(default worker)'}`)
```

- [ ] **Step 3: 公开页面只在 SSG 读取 `VITE_WORKER_URL`**

Astro frontmatter 的服务端 fetch 保持：

```ts
const API_BASE = import.meta.env.VITE_WORKER_URL || 'https://alumni-book-api.chenyuhao2263.workers.dev'
```

Vue islands 客户端 fetch 保持：

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
```

- [ ] **Step 4: 添加环境变量文档和构建示例**

```bash
$env:SITE_BASE='/alumni-book-v2/'
$env:VITE_WORKER_URL='https://alumni-book-api.example.workers.dev'
$env:VITE_API_BASE_URL='https://alumni-book-api.example.workers.dev'
pnpm build:site
```

---

### Task 4: CORS 与自助编辑预检修复

**Files:**
- Modify: `workers/api/src/index.ts`
- Test: `workers/api/tests/security.test.ts`

- [ ] **Step 1: 扩展允许请求头**

将 CORS 配置改为：

```ts
allowHeaders: ['Content-Type', 'Authorization', 'X-Classmate-Token'],
```

- [ ] **Step 2: 收紧生产 CORS origin**

`wrangler.toml` 中将：

```toml
CORS_ORIGIN = "*"
```

改为生产站点域名，例如：

```toml
CORS_ORIGIN = "https://flashnovayu.github.io"
```

本地开发用 `.dev.vars` 覆盖：

```env
CORS_ORIGIN=http://localhost:4321
```

- [ ] **Step 3: 添加预检测试**

Create `workers/api/tests/security.test.ts`：

```ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import worker from '../src/index'

describe('CORS', () => {
  it('OPTIONS allows X-Classmate-Token for self-service requests', async () => {
    const req = new Request('http://localhost/api/classmate/students/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:4321',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type,x-classmate-token',
      },
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-classmate-token')
  })
})
```

- [ ] **Step 4: 验证测试通过**

Run:

```bash
pnpm --filter worker exec vitest run workers/api/tests/security.test.ts
```

Expected: PASS。

---

### Task 5: 管理员 session revocation 闭环

**Files:**
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/src/routes/auth.ts`
- Modify: `packages/admin/src/main.ts`
- Modify: `packages/admin/src/api/client.ts`
- Test: `workers/api/tests/security.test.ts`

- [ ] **Step 1: 新增 admin session guard**

在 `index.ts` 中新增：

```ts
function adminGuard(secret: string) {
  const mw = createJwtMiddleware(secret)
  return async (c: any, next: any) => {
    try {
      await mw(c, async () => {
        const authHeader = c.req.header('Authorization')
        const token = authHeader?.replace('Bearer ', '')
        if (!token) return c.json({ success: false, message: '未授权' }, 401)

        const session = await c.env.DB.prepare(
          "SELECT token FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')"
        ).bind(token).first()

        if (!session) {
          return c.json({ success: false, message: '登录已失效' }, 401)
        }

        return next()
      })
    } catch (e) {
      if (e instanceof HTTPException) return e.getResponse()
      throw e
    }
  }
}
```

- [ ] **Step 2: admin API 改用 `adminGuard`**

将 `/api/admin/*`、`/api/upload`、写操作路由的 admin JWT 保护从 `jwtGuard` 替换为 `adminGuard`。公开 GET 不变。

- [ ] **Step 3: 前端路由守卫调用 verify**

`packages/admin/src/main.ts` 的 `beforeEach` 从“只检查 sessionStorage token”升级为“有 token 时调用 `/api/auth/verify`”。失败则清 token 并跳登录页。

- [ ] **Step 4: logout 调用 API**

`adminLogout()` 改为先请求：

```ts
await adminFetch('/api/auth/logout', { method: 'POST' })
```

然后清理 token。

- [ ] **Step 5: 添加 logout 后 token 失效测试**

测试流程：

1. 登录拿 token。
2. `GET /api/admin/stats` 返回 200。
3. `POST /api/auth/logout`。
4. 再次 `GET /api/admin/stats` 返回 401。

---

### Task 6: 同学自助认证升级

**Files:**
- Create: `workers/api/migrations/0007_security_privacy.sql`
- Modify: `workers/api/src/routes/classmate.ts`
- Modify: `packages/site-astro/src/components/NameGate.vue`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/admin/src/views/StudentEditView.vue`
- Test: `workers/api/tests/security.test.ts`

- [ ] **Step 1: 增加同学编辑口令字段**

Migration:

```sql
ALTER TABLE students ADD COLUMN edit_secret_hash TEXT;
ALTER TABLE students ADD COLUMN edit_secret_updated_at TEXT;
ALTER TABLE students ADD COLUMN privacy_level TEXT DEFAULT 'classmates';
```

- [ ] **Step 2: token 获取接口要求编辑口令**

`POST /api/classmate/token` body 从：

```json
{ "name": "张三", "slug": "zhangsan" }
```

升级为：

```json
{ "name": "张三", "slug": "zhangsan", "editSecret": "本人设置的口令" }
```

- [ ] **Step 3: 管理后台支持重置同学口令**

在学生编辑页添加“生成临时编辑口令”按钮。管理员生成后只显示一次，保存 PBKDF2 hash，不保存明文。

- [ ] **Step 4: 首次迁移兼容**

没有 `edit_secret_hash` 的学生仍可通过旧姓名验证拿 token，但后台显示风险提示：

```text
该同学尚未设置编辑口令，任何知道姓名的人都可能冒用编辑。
```

- [ ] **Step 5: 添加认证测试**

覆盖：

- 无口令旧账号兼容。
- 设置口令后，错误口令返回 403。
- 设置口令后，正确口令返回 token。
- A 同学 token 不能编辑 B 同学。

---

### Task 7: 留言主人回复改用 token

**Files:**
- Modify: `workers/api/src/routes/messages.ts`
- Modify: `packages/site-astro/src/components/MessageWall.vue`
- Test: `workers/api/tests/security.test.ts`

- [ ] **Step 1: 回复接口读取 `X-Classmate-Token`**

`PUT /api/messages/:id/reply` 不再信任 body 中的 `authorName`。改为：

```ts
const authedSlug = await authClassmate(c, await getClassmateSecret(c.env.JWT_SECRET))
if (!authedSlug) {
  return c.json({ success: false, message: '未授权' }, 401)
}
if (authedSlug !== (msg as any).student_slug) {
  return c.json({ success: false, message: '只有页面主人可以回复' }, 403)
}
```

- [ ] **Step 2: MessageWall 回复前获取 token**

页面主人点击回复时，复用 `SelfEditPanel` 的 token 获取逻辑，或抽出 shared composable：

```ts
async function getClassmateToken(slug: string, name: string): Promise<string>
```

- [ ] **Step 3: 删除前端 `authorName` 伪认证**

回复请求 body 只传：

```json
{ "reply": "谢谢你的留言" }
```

- [ ] **Step 4: 添加冒用测试**

覆盖：

- 无 token 回复返回 401。
- 其他同学 token 回复返回 403。
- 页面主人 token 回复返回 200。

---

### Task 8: 联系方式隐私分级

**Files:**
- Create: `workers/api/migrations/0007_security_privacy.sql`
- Modify: `workers/api/src/routes/students.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `packages/site-astro/src/pages/student/[slug].astro`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/admin/src/views/StudentEditView.vue`
- Test: `workers/api/tests/security.test.ts`

- [ ] **Step 1: 定义字段级隐私模型**

在 `students.info` 中新增：

```json
{
  "visibility": {
    "phone": "owner",
    "wechat": "classmates",
    "email": "classmates",
    "address": "owner",
    "qq": "classmates",
    "weibo": "public"
  }
}
```

可选值：

- `public`：未验证访客可见。
- `classmates`：通过姓名门控的同学可见。
- `owner`：本人和管理员可见。
- `hidden`：仅管理员可见。

- [ ] **Step 2: Worker 增加公开字段裁剪**

新增 helper：

```ts
function filterStudentForAudience(student: any, audience: 'public' | 'classmate' | 'owner' | 'admin') {
  const info = { ...student.info }
  const visibility = info.visibility || {}
  for (const key of ['qq', 'wechat', 'phone', 'email', 'address', 'weibo']) {
    const level = visibility[key] || 'classmates'
    if (level === 'owner' && audience !== 'owner' && audience !== 'admin') delete info[key]
    if (level === 'hidden' && audience !== 'admin') delete info[key]
    if (level === 'classmates' && audience === 'public') delete info[key]
  }
  return { ...student, info }
}
```

- [ ] **Step 3: API 明确 audience**

新增查询参数或 token 判断：

- `/api/students/:slug?audience=public` 默认公开。
- 有 `classmate_name` 只能影响前端显示，不作为后端强认证。
- 有 classmate token 且 slug 匹配时返回 owner 视图。
- admin token 返回 admin 视图。

- [ ] **Step 4: 前端自助编辑增加隐私控件**

联系方式字段旁增加选择：

```text
所有访客可见 / 仅同学可见 / 仅本人可见 / 隐藏
```

- [ ] **Step 5: 测试隐私裁剪**

覆盖同一个学生在 public、owner、admin 三种模式下返回字段不同。

---

### Task 9: 上传安全与资源治理

**Files:**
- Modify: `workers/api/src/routes/upload.ts`
- Modify: `workers/api/src/routes/classmate.ts`
- Modify: `packages/shared/src/imageUtils.ts`
- Modify: `packages/admin/src/utils/image.ts`
- Test: `workers/api/tests/upload.test.ts`

- [ ] **Step 1: 添加大小限制**

规则：

| 类型 | 最大大小 |
|---|---:|
| avatar | 2 MB |
| background | 5 MB |
| photo | 8 MB |
| music | 15 MB |

Worker 检查：

```ts
if (file.size > maxBytes) {
  return c.json({ success: false, message: '文件过大' }, 413)
}
```

- [ ] **Step 2: 添加 MIME 白名单**

```ts
const allowedTypes = {
  avatar: ['image/jpeg', 'image/png', 'image/webp'],
  background: ['image/jpeg', 'image/png', 'image/webp'],
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  music: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg'],
}
```

- [ ] **Step 3: R2 URL 存相对路径**

数据库中存：

```text
/api/files/avatars/slug_123.webp
```

避免存完整 `https://...workers.dev/api/files/...`，减少环境迁移问题。

- [ ] **Step 4: 上传替换时清理旧文件**

头像、背景、音乐被替换时：

1. 从旧 URL 解析 R2 key。
2. `await r2.delete(oldKey)`。
3. 更新 DB。

- [ ] **Step 5: 添加上传测试**

覆盖：

- 非白名单 MIME 返回 400。
- 超大小返回 413。
- 合法图片返回 200。
- 非本人 token 上传返回 403。

---

### Task 10: 数据库 schema 与迁移一致性

**Files:**
- Modify: `workers/api/src/db/schema.sql`
- Modify: `workers/api/tests/api.test.ts`
- Create: `workers/api/tests/schema.test.ts`

- [ ] **Step 1: 将完整 schema 补齐到 `schema.sql`**

包含迁移 0001-0006 已有内容：

- `students.custom_html`
- `students.mbti`
- `students.graduation_year`
- `students.school`
- `students.class_name`
- `students.visit_count`
- `messages`
- `timeline_events`
- `messages.reactions`
- `messages.reply`
- `messages.reply_at`

- [ ] **Step 2: 测试迁移不再手写内联 SQL**

将 `api.test.ts` 中的大段 migration SQL 改为读取 `workers/api/migrations/*.sql` 文件并应用。

- [ ] **Step 3: 添加 schema smoke test**

测试最新 schema 初始化后：

```sql
SELECT custom_html, mbti, graduation_year, class_name, visit_count FROM students LIMIT 1;
SELECT reactions, reply, reply_at FROM messages LIMIT 1;
SELECT event_date, is_milestone FROM timeline_events LIMIT 1;
```

Expected: SQL 编译通过。

---

### Task 11: 静态页数据刷新策略

**Files:**
- Modify: `packages/site-astro/src/pages/student/[slug].astro`
- Modify: `packages/site-astro/src/components/StudentLiveRefresh.vue`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `workers/api/src/routes/students.ts`

- [ ] **Step 1: 新增学生页客户端补拉**

Create `StudentLiveRefresh.vue`，挂载后请求：

```ts
fetch(`${API_BASE}/api/students/${slug}`)
```

对头像、背景、基础信息、浏览数、照片墙做轻量更新。

- [ ] **Step 2: 自助编辑成功后广播刷新**

`SelfEditPanel.vue` 保存成功后：

```ts
window.dispatchEvent(new CustomEvent('student-profile-updated', { detail: { slug: props.studentSlug } }))
```

- [ ] **Step 3: 页面监听并刷新**

`StudentLiveRefresh.vue` 监听事件后重新拉取当前学生数据。

- [ ] **Step 4: 后续可选：后台触发 Pages rebuild**

后台配置页增加“重新构建公开站点”按钮，调用 GitHub Actions repository dispatch。此项作为后续增强，不阻塞客户端补拉。

---

### Task 12: 后台运营驾驶舱升级

**Files:**
- Modify: `workers/api/src/index.ts`
- Modify: `packages/admin/src/views/DashboardView.vue`
- Modify: `packages/admin/src/views/AdminLayout.vue`
- Test: `workers/api/tests/api.test.ts`

- [ ] **Step 1: 扩展 `/api/admin/stats`**

返回：

```ts
{
  studentCount: number,
  albumCount: number,
  photoCount: number,
  pendingMessageCount: number,
  approvedMessageCount: number,
  totalVisitCount: number,
  recentStudents: Array<{ name: string; slug: string; updatedAt: string }>,
  topVisited: Array<{ name: string; slug: string; visitCount: number }>,
  recentMessages: Array<{ id: string; authorName: string; studentSlug: string; createdAt: string }>
}
```

- [ ] **Step 2: Dashboard 布局升级**

区域：

- 顶部关键指标。
- 待审核留言快捷入口。
- 最近更新同学。
- 访问排行。
- 内容完整度提醒。

- [ ] **Step 3: 内容完整度算法**

按字段给每个学生计算：

```ts
avatarUrl + motto + contact + memory + future + photos
```

后台显示“资料较空”的同学列表，便于提醒补充。

---

### Task 13: 留言墙升级为明信片体验

**Files:**
- Modify: `workers/api/src/routes/messages.ts`
- Modify: `packages/site-astro/src/components/MessageWall.vue`
- Modify: `packages/admin/src/views/MessagesView.vue`
- Create: `workers/api/migrations/0008_profile_modules.sql`

- [ ] **Step 1: 留言增加风格字段**

Migration:

```sql
ALTER TABLE messages ADD COLUMN card_style TEXT DEFAULT 'paper';
ALTER TABLE messages ADD COLUMN pinned INTEGER DEFAULT 0;
```

- [ ] **Step 2: 前端留言表单增加明信片风格**

选项：

- 纸张
- 黑板
- 照片背面
- 信笺

- [ ] **Step 3: 管理后台支持置顶**

留言管理加“置顶/取消置顶”，公开留言排序：

```sql
ORDER BY pinned DESC, created_at DESC
```

- [ ] **Step 4: 增加批量审核**

MessagesView 支持多选，批量通过、批量隐藏、批量删除。

---

### Task 14: 时间轴升级为班级记忆流

**Files:**
- Modify: `workers/api/src/routes/timeline.ts`
- Modify: `packages/site-astro/src/pages/timeline.astro`
- Modify: `packages/admin/src/views/TimelineEventsView.vue`

- [ ] **Step 1: 增加 timeline filters**

`GET /api/timeline?type=event|message|photo|join&page=1&pageSize=20`

- [ ] **Step 2: 前端增加筛选 tabs**

Tabs:

- 全部
- 班级大事
- 新留言
- 新照片
- 新同学页

- [ ] **Step 3: 管理后台支持大事件封面图上传**

事件表单增加图片上传，保存 `photo_r2_key`。

- [ ] **Step 4: 里程碑视觉升级**

`isMilestone` 事件展示更大的时间节点，可放标题图和长描述。

---

### Task 15: 同学主页模块化小传

**Files:**
- Create: `workers/api/migrations/0008_profile_modules.sql`
- Modify: `workers/api/src/routes/students.ts`
- Modify: `packages/site-astro/src/pages/student/[slug].astro`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/admin/src/views/StudentEditView.vue`

- [ ] **Step 1: 定义 profile modules JSON**

在 `students.info.profileModules` 中支持：

```json
[
  { "type": "status", "title": "现在的我", "content": "最近在准备..." },
  { "type": "memory", "title": "最想保存的一天", "content": "..." },
  { "type": "futureLetter", "title": "写给十年后的自己", "content": "..." },
  { "type": "quote", "title": "一句话", "content": "..." }
]
```

- [ ] **Step 2: 学生页按模块渲染**

旧字段继续显示；如果 `profileModules` 存在，则在基础信息后展示“个人小传”。

- [ ] **Step 3: 自助编辑支持模块增删排序**

控件：

- 新增模块
- 删除模块
- 上移/下移
- 标题和正文编辑

- [ ] **Step 4: 后台学生编辑页同样支持模块**

管理员能代为编辑和排序。

---

### Task 16: 班级相册体验升级

**Files:**
- Modify: `workers/api/src/routes/albums.ts`
- Modify: `workers/api/src/routes/upload.ts`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/admin/src/views/AlbumsView.vue`

- [ ] **Step 1: 相册增加封面和标签**

DB 增加：

```sql
ALTER TABLE albums ADD COLUMN cover_r2_key TEXT;
ALTER TABLE albums ADD COLUMN tags TEXT DEFAULT '[]';
```

- [ ] **Step 2: 前端相册支持标签筛选**

标签例子：

- 毕业照
- 运动会
- 课堂
- 旅行
- 日常

- [ ] **Step 3: 图片灯箱增加上下张预加载**

打开图片时预加载前后图片，提高浏览流畅度。

- [ ] **Step 4: 后台支持拖拽排序**

相册和照片都支持拖拽排序，保存 `sort_order`。

---

### Task 17: 搜索、筛选与排行

**Files:**
- Modify: `workers/api/src/index.ts`
- Modify: `packages/site-astro/src/pages/roster.astro`
- Modify: `packages/site-astro/src/components/RosterSearch.vue`
- Create: `packages/site-astro/src/components/RankingsPanel.vue`

- [ ] **Step 1: 扩展 `/api/rankings`**

支持：

```text
/api/rankings?metric=visits|messages|reactions
```

- [ ] **Step 2: 同学录搜索支持多字段**

搜索范围：

- 姓名
- 昵称
- motto
- 学校
- 班级
- 兴趣字段

- [ ] **Step 3: 新增排行面板**

展示：

- 最常被访问
- 留言最多
- 最近更新

---

### Task 18: 可访问性、移动端与性能打磨

**Files:**
- Modify: `packages/site-astro/src/styles/global.css`
- Modify: `packages/site-astro/src/styles/tokens.css`
- Modify: `packages/admin/src/styles/admin.css`
- Modify: `packages/site-astro/src/components/*.vue`
- Modify: `packages/site-astro/src/pages/*.astro`

- [ ] **Step 1: 全局 focus-visible**

所有按钮、链接、输入框有清晰焦点态。

- [ ] **Step 2: prefers-reduced-motion**

所有动画尊重：

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 3: 图片尺寸稳定**

所有头像、相册、时间轴图片设置明确 `aspect-ratio`，避免布局跳动。

- [ ] **Step 4: 移动端表单优化**

自助编辑 modal 在移动端改为全屏 sheet，底部保存按钮 sticky。

- [ ] **Step 5: SEO 和分享卡**

每个学生页增加：

- `<title>{student.name} · 同学录</title>`
- `description`
- Open Graph image，优先头像或背景图。

---

### Task 19: 测试矩阵与 CI 质量门禁

**Files:**
- Modify: `workers/api/tests/api.test.ts`
- Create: `workers/api/tests/security.test.ts`
- Create: `workers/api/tests/upload.test.ts`
- Create: `packages/site-astro/tests/navigation.test.ts`
- Modify: `.github/workflows/deploy-site.yml`
- Modify: `.github/workflows/deploy-worker.yml`

- [ ] **Step 1: Worker 测试覆盖矩阵**

覆盖：

- auth login/logout/verify
- admin session revocation
- CORS preflight
- classmate token
- owner reply
- privacy filter
- upload validation
- visit counter
- rankings

- [ ] **Step 2: 前端构建检查**

CI 中运行：

```bash
pnpm --filter admin typecheck
pnpm --filter worker exec vitest run
pnpm build:site
pnpm build:admin
```

- [ ] **Step 3: base path smoke test**

构建后检查 `deploy` 中链接不误指域名根：

```bash
rg 'href="/(preface|roster|album|timeline|student)' deploy
```

Expected: 没有命中。

- [ ] **Step 4: sourcemap 策略**

生产 admin 当前 `sourcemap: true`。评估后改为：

```ts
sourcemap: process.env.NODE_ENV !== 'production'
```

---

### Task 20: 监控、备份与运营工具

**Files:**
- Modify: `workers/api/src/index.ts`
- Create: `scripts/backup-d1.ts`
- Create: `scripts/audit-content.ts`
- Modify: `package.json`

- [ ] **Step 1: API 增加 request id**

Worker 每个响应加：

```ts
X-Request-Id: crypto.randomUUID()
```

错误日志带 request id，方便排查。

- [ ] **Step 2: D1 备份脚本**

新增：

```bash
pnpm backup:d1
```

导出关键表：

- students
- site_config
- albums
- photos
- messages
- timeline_events

- [ ] **Step 3: 内容审计脚本**

检查：

- 空头像
- 空 motto
- 公开联系方式
- 无编辑口令
- 破损 R2 文件 URL
- 未审核留言堆积

- [ ] **Step 4: 后台暴露运营提醒**

Dashboard 显示审计结果摘要。

---

### Task 21: 纪念册导出与分享玩法

**Files:**
- Create: `packages/site-astro/src/pages/yearbook.astro`
- Create: `packages/site-astro/src/components/YearbookBuilder.vue`
- Create: `scripts/export-yearbook.ts`
- Modify: `workers/api/src/routes/students.ts`
- Modify: `workers/api/src/routes/messages.ts`

- [ ] **Step 1: 班级纪念册页面**

`/yearbook` 汇总：

- 班级前言
- 同学头像墙
- 每人一句话
- 精选留言
- 精选照片
- 时间轴大事

- [ ] **Step 2: 生成可打印版**

CSS 增加 `@media print`，支持浏览器打印为 PDF。

- [ ] **Step 3: 个人分享卡**

每个学生页提供“生成分享卡”按钮，包含：

- 头像
- 姓名
- motto
- 访问二维码

- [ ] **Step 4: 记忆年度报告**

统计：

- 总留言数
- 总照片数
- 最热留言
- 最活跃页面
- 最近更新的人

用温柔的文案生成一页“我们的数字同学录报告”。

---

## Recommended Execution Order

1. P0 稳定性修复：Task 1-5。
2. P1 安全与数据边界：Task 6-11、19。
3. P2 产品体验升级：Task 12-18、20。
4. P3 情感玩法：Task 21。

---

## Verification Checklist

- [ ] `README.md`、`AGENTS.md`、`CLAUDE.md` 与真实 Astro 架构一致。
- [ ] 子路径部署时导航、redirect、admin 登录跳转正常。
- [ ] 自助编辑跨域预检通过。
- [ ] logout 后旧 admin token 无法访问 admin API。
- [ ] 页面主人回复留言必须使用 classmate token。
- [ ] 联系方式默认不会裸露给公开 API。
- [ ] 上传接口拒绝超大小和非法 MIME 文件。
- [ ] `schema.sql` 与 migrations 语义一致。
- [ ] 自助编辑成功后页面能看到最新资料，或有明确刷新机制。
- [ ] Worker 核心安全测试和上传测试进入 CI。
- [ ] 后台能看到待审核、访问排行、最近更新和内容完整度。
- [ ] 公开站移动端无明显布局溢出，图片加载无大幅跳动。

---

## Open Decisions

| 问题 | 推荐选择 | 原因 |
|---|---|---|
| 公开站 base path | `SITE_BASE` 环境变量控制 | 本地 `/` 和 GitHub Pages `/alumni-book-v2/` 都能兼容 |
| 自助认证 | 姓名 + 个人编辑口令 | 足够轻量，同时比“只知道姓名”可靠 |
| 联系方式默认可见性 | `classmates` 或 `owner` | 避免把手机号、微信、地址暴露给公开 API |
| 静态刷新 | 先客户端补拉，后续再触发 Pages rebuild | 小改动解决真实问题，不先引入复杂发布链路 |
| 相册图片 URL | DB 存相对 `/api/files/...` | 环境迁移更稳，避免 Worker origin 固化 |

