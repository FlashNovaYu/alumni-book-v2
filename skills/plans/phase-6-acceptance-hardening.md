# Phase 6 Acceptance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Phase 5 验收中发现的隐私、路由、子路径部署和构建清洁问题，让项目达到可上线验收状态。

**Architecture:** 本阶段以验收阻塞项为边界，不新增大功能。先用回归测试锁定问题，再做最小修复：Worker 侧收紧匿名 audience 和修复静态消息路由顺序；前端构建侧统一 admin base、404 跳转和生产 sourcemap；最后补齐 CI/验收命令，确保后续改动不会把这些边界再次打破。

**Tech Stack:** Astro 5 + Vue 3 + Vite + TypeScript + Cloudflare Workers (Hono) + D1 + R2 + Vitest + Cloudflare test pool + GitHub Pages

---

## Context：本阶段必须解决的验收问题

| 编号 | 严重级别 | 问题 | 影响 |
|---|---|---|---|
| A1 | P0 | 匿名 `/api/students` 默认返回 `classmates` 视角 | 静态构建和匿名访问可能泄露仅同学可见联系方式 |
| A2 | P0 | `/api/messages/approved` 被 `/api/messages/:slug` 抢先匹配 | 年鉴页无法拉到全站已审核留言 |
| A3 | P1 | Admin router base 仍硬编码 `/admin/` | GitHub Pages 子路径 `/alumni-book-v2/admin/` 部署存在路由基准不一致 |
| A4 | P1 | `404.html` 仍硬编码 `/admin/#/` | 后台深链接刷新或旧路由跳转到域名根路径 |
| A5 | P2 | Admin 生产 sourcemap 仍开启 | 管理后台源码映射暴露，构建产物体积偏大 |
| A6 | P2 | Astro config 留有调试日志 | CI 构建输出噪声，可能泄露环境解析细节 |
| A7 | P2 | 年鉴页源码留有实现过程注释 | 代码可维护性差，不符合最终交付状态 |

---

## File Structure

本计划预计修改以下文件：

- Modify: `workers/api/src/index.ts` - 修改 `determineAudience()` 默认视角，确保匿名请求是 `public`。
- Modify: `workers/api/src/routes/messages.ts` - 将 `/messages/approved` 注册到 `/messages/:slug` 之前。
- Modify: `workers/api/tests/security.test.ts` - 增加匿名隐私回归测试。
- Modify: `workers/api/tests/api.test.ts` - 增加 `/api/messages/approved` 路由回归测试。
- Modify: `packages/admin/src/main.ts` - `createWebHashHistory()` 使用真实 `import.meta.env.BASE_URL`。
- Modify: `packages/admin/vite.config.ts` - 生产关闭 sourcemap。
- Modify: `packages/site-astro/astro.config.mjs` - 删除构建调试日志，规范 `SITE_BASE` 尾斜杠。
- Modify: `packages/site-astro/public/404.html` - 改为 base-aware 的后台跳转。
- Modify: `packages/site-astro/src/pages/yearbook.astro` - 删除实现过程注释，改成稳定说明。
- Modify: `packages/site-astro/tests/navigation.test.ts` - 增加 404 和 admin base 检查。
- Modify: `.github/workflows/deploy-site.yml` - 如存在，加入验收测试命令。
- Modify: `.github/workflows/deploy-worker.yml` - 如存在，加入 Worker 安全测试命令。

---

### Task 1: 锁定匿名学生接口隐私回归

**Files:**
- Modify: `workers/api/tests/security.test.ts`
- Modify: `workers/api/src/index.ts`

- [ ] **Step 1: 写一个会失败的匿名隐私测试**

在 `workers/api/tests/security.test.ts` 的 `Privacy Level Filtering` 测试后新增：

```ts
it('Anonymous student detail defaults to public audience and hides classmate-only fields', async () => {
  const info = {
    phone: '13900000000',
    wechat: 'private-wechat',
    email: 'public@example.com',
    visibility: {
      phone: 'owner',
      wechat: 'classmates',
      email: 'public',
    },
  }
  await env.DB.prepare(
    'UPDATE students SET info = ? WHERE slug = ?'
  ).bind(JSON.stringify(info), 'zhangsan').run()

  const req = new Request('http://localhost/api/students/zhangsan')
  const res = await worker.fetch(req, env, createExecutionContext())
  expect(res.status).toBe(200)
  const body = await res.json() as any

  expect(body.data.info.phone).toBeUndefined()
  expect(body.data.info.wechat).toBeUndefined()
  expect(body.data.info.email).toBe('public@example.com')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter worker exec vitest run workers/api/tests/security.test.ts -t "Anonymous student detail defaults"
```

Expected before fix: FAIL，因为当前 `determineAudience()` 默认返回 `classmates`，`wechat` 会被返回。

- [ ] **Step 3: 修复 `determineAudience()` 默认值**

在 `workers/api/src/index.ts` 中将：

```ts
const url = new URL(c.req.url)
if (url.searchParams.get('audience') === 'public') {
  return 'public'
}
return 'classmates'
```

替换为：

```ts
const url = new URL(c.req.url)
const requestedAudience = url.searchParams.get('audience')
if (requestedAudience === 'public') {
  return 'public'
}

return 'public'
```

说明：没有有效 `X-Classmate-Token` 或 admin session 的请求都按 public 处理。`classmates` 视角只能由有效同学 token 触发。

- [ ] **Step 4: 增加列表接口匿名隐私测试**

在同一测试文件新增：

```ts
it('Anonymous student list also hides classmate-only fields', async () => {
  const req = new Request('http://localhost/api/students')
  const res = await worker.fetch(req, env, createExecutionContext())
  expect(res.status).toBe(200)
  const body = await res.json() as any
  const zhangsan = body.data.find((s: any) => s.slug === 'zhangsan')

  expect(zhangsan.info.phone).toBeUndefined()
  expect(zhangsan.info.wechat).toBeUndefined()
  expect(zhangsan.info.email).toBe('public@example.com')
})
```

- [ ] **Step 5: 运行安全测试确认通过**

Run:

```bash
pnpm --filter worker exec vitest run workers/api/tests/security.test.ts
```

Expected after fix: PASS，且匿名详情和列表都不返回 `owner`/`classmates` 字段。

---

### Task 2: 修复已审核留言公开路由顺序

**Files:**
- Modify: `workers/api/src/routes/messages.ts`
- Modify: `workers/api/tests/api.test.ts`

- [ ] **Step 1: 写一个会失败的路由顺序测试**

在 `workers/api/tests/api.test.ts` 新增：

```ts
describe('Messages API', () => {
  it('GET /api/messages/approved returns global approved messages instead of slug messages', async () => {
    await env.DB.prepare(
      "INSERT INTO messages (id, student_slug, author_name, content, is_approved, is_hidden, card_style, pinned) VALUES (?, ?, ?, ?, 1, 0, 'paper', 0)"
    ).bind('msg_global_approved_1', 'zhangsan', '王五', '这是一条全站留言',).run()

    const req = new Request('http://localhost/api/messages/approved')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.data.some((m: any) => m.id === 'msg_global_approved_1')).toBe(true)
  })
})
```

如果 TypeScript 对尾逗号不接受，使用：

```ts
).bind('msg_global_approved_1', 'zhangsan', '王五', '这是一条全站留言').run()
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter worker exec vitest run workers/api/tests/api.test.ts -t "GET /api/messages/approved"
```

Expected before fix: FAIL，因为 `/messages/:slug` 抢先匹配，返回 slug=`approved` 的留言列表。

- [ ] **Step 3: 移动路由注册顺序**

在 `workers/api/src/routes/messages.ts` 中，将：

```ts
messagesRoutes.get('/messages/approved', async (c) => {
  ...
})
```

整段移动到：

```ts
// 公开获取留言（仅审核通过的）
messagesRoutes.get('/messages/:slug', async (c) => {
```

之前。

- [ ] **Step 4: 确认动态路由仍能工作**

在同一个 describe 中新增：

```ts
it('GET /api/messages/:slug still returns messages for a student slug', async () => {
  const req = new Request('http://localhost/api/messages/zhangsan')
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)

  expect(res.status).toBe(200)
  const body = await res.json() as any
  expect(body.success).toBe(true)
  expect(Array.isArray(body.data)).toBe(true)
})
```

- [ ] **Step 5: 运行消息相关测试**

Run:

```bash
pnpm --filter worker exec vitest run workers/api/tests/api.test.ts workers/api/tests/security.test.ts
```

Expected after fix: PASS。

---

### Task 3: 统一 Admin 子路径路由基准

**Files:**
- Modify: `packages/admin/src/main.ts`
- Modify: `packages/admin/vite.config.ts`
- Modify: `packages/site-astro/tests/navigation.test.ts`

- [ ] **Step 1: 修改 Vue Router base**

在 `packages/admin/src/main.ts` 中将：

```ts
history: createWebHashHistory('/admin/'),
```

替换为：

```ts
const adminBase = import.meta.env.BASE_URL || '/admin/'

const router = createRouter({
  history: createWebHashHistory(adminBase),
  routes: [
```

确保 `adminBase` 声明位于 `createRouter()` 之前。

- [ ] **Step 2: 确认 admin logout 和 401 跳转共用 BASE_URL**

检查 `packages/admin/src/api/client.ts` 中已经存在：

```ts
const adminBase = import.meta.env.BASE_URL || '/admin/'
window.location.href = `${adminBase}#/login`
```

如果没有，补上。

- [ ] **Step 3: 添加构建产物检查**

在 `packages/site-astro/tests/navigation.test.ts` 中增加一个辅助测试，用于检查 admin 构建产物：

```ts
it('admin build uses the nested SITE_BASE admin asset prefix', () => {
  const adminIndex = resolve(__dirname, '../../admin/dist/index.html')
  expect(existsSync(adminIndex)).toBe(true)
  const content = readFileSync(adminIndex, 'utf-8')
  expect(content).toContain('/alumni-book-v2/admin/assets/')
  expect(content).not.toContain('src="/admin/assets/')
})
```

注意：这个测试依赖先构建 admin。若当前测试文件只构建 site，需要在 CI 验收命令中先运行：

```bash
$env:SITE_BASE='/alumni-book-v2/'; pnpm --filter admin build
```

- [ ] **Step 4: 子路径构建验证**

Run:

```bash
$env:SITE_BASE='/alumni-book-v2/'; pnpm --filter admin build
```

Expected: PASS，`packages/admin/dist/index.html` 中资源前缀为 `/alumni-book-v2/admin/assets/`。

---

### Task 4: 修复 GitHub Pages 404 后台跳转

**Files:**
- Modify: `packages/site-astro/public/404.html`
- Modify: `packages/site-astro/tests/navigation.test.ts`

- [ ] **Step 1: 在 404 页面声明站点 base**

在 `packages/site-astro/public/404.html` 的脚本中增加：

```js
var siteBase = '/alumni-book-v2/';
```

如果未来需要支持本地根路径，可改为通过构建脚本生成；本项目生产目标是 GitHub Pages `/alumni-book-v2/`。

- [ ] **Step 2: 修复按钮链接**

将：

```html
<a href="/" class="btn">回到首页</a>
<a href="/admin/" class="btn btn-secondary">管理后台</a>
```

改为：

```html
<a href="/alumni-book-v2/" class="btn">回到首页</a>
<a href="/alumni-book-v2/admin/" class="btn btn-secondary">管理后台</a>
```

- [ ] **Step 3: 修复 admin 深链接重定向**

将：

```js
window.location.replace('/admin/#/' + adminPath + window.location.search);
```

改为：

```js
window.location.replace(siteBase + 'admin/#/' + adminPath + window.location.search);
```

- [ ] **Step 4: 添加 404 静态检查**

在 `packages/site-astro/tests/navigation.test.ts` 中新增：

```ts
it('404 page routes admin links through the GitHub Pages base path', () => {
  const notFoundPath = join(distDir, '404.html')
  expect(existsSync(notFoundPath)).toBe(true)
  const content = readFileSync(notFoundPath, 'utf-8')
  expect(content).toContain('href="/alumni-book-v2/admin/"')
  expect(content).toContain("siteBase + 'admin/#/'")
  expect(content).not.toContain("window.location.replace('/admin/#/'")
})
```

- [ ] **Step 5: 运行导航测试**

Run:

```bash
pnpm --filter site-astro exec vitest run tests/navigation.test.ts
```

Expected: PASS。

---

### Task 5: 关闭生产 sourcemap 并清理构建调试日志

**Files:**
- Modify: `packages/admin/vite.config.ts`
- Modify: `packages/site-astro/astro.config.mjs`
- Modify: `packages/site-astro/tests/navigation.test.ts`

- [ ] **Step 1: 生产关闭 admin sourcemap**

在 `packages/admin/vite.config.ts` 中将：

```ts
sourcemap: true,
```

替换为：

```ts
sourcemap: process.env.NODE_ENV !== 'production',
```

- [ ] **Step 2: 删除 Astro config 调试输出**

在 `packages/site-astro/astro.config.mjs` 删除：

```js
console.log(`--- [PID: ${process.pid}] Astro Config: process.env.SITE_BASE is`, process.env.SITE_BASE)
console.log(`--- [PID: ${process.pid}] Astro Config: siteBase resolved to`, siteBase)
```

- [ ] **Step 3: 规范 SITE_BASE 尾斜杠**

将 `siteBase` 定义改为：

```js
const rawSiteBase = process.env.SITE_BASE ?? '/'
const siteBase = rawSiteBase.endsWith('/') ? rawSiteBase : `${rawSiteBase}/`
```

- [ ] **Step 4: 添加 sourcemap 检查**

在 `packages/site-astro/tests/navigation.test.ts` 中新增：

```ts
it('admin production build does not emit source maps', () => {
  const adminAssets = resolve(__dirname, '../../admin/dist/assets')
  expect(existsSync(adminAssets)).toBe(true)
  const maps = readdirSync(adminAssets).filter((name) => name.endsWith('.map'))
  expect(maps).toEqual([])
})
```

- [ ] **Step 5: 运行生产构建并确认无 map**

Run:

```bash
$env:SITE_BASE='/alumni-book-v2/'; pnpm --filter admin build
Get-ChildItem packages/admin/dist/assets -Filter *.map
```

Expected: 构建 PASS，第二条命令无输出。

---

### Task 6: 清理年鉴页实现过程注释并补强数据来源

**Files:**
- Modify: `packages/site-astro/src/pages/yearbook.astro`
- Modify: `workers/api/tests/api.test.ts`

- [ ] **Step 1: 删除实现过程注释**

在 `packages/site-astro/src/pages/yearbook.astro` 删除第 60-65 行这类过程性注释：

```ts
// 提取所有留言，因为没有单独的公开 message 列表，我们可以通过 `/api/admin/messages` (需要鉴权)
// 或者对于公开纪念册，可以直接从后台 API 或者是通过每个学生的留言汇总？
// 等等！为了能在无需 admin token 的情况下在服务端拉取留言，我们可以在后端 messages 路由增加一个公开的 `GET /api/messages/approved` 接口！
// 这样不仅安全，还更加符合 SSG 静态页面渲染的架构！
// 让我们一并去 `workers/api/src/routes/messages.ts` 加上这个公开获取已通过留言的路由。
// 这里先假设该接口 `/api/messages/approved` 已经实现并拉取。
```

替换为：

```ts
// 年鉴只展示审核通过且未隐藏的公开留言。
```

- [ ] **Step 2: 确保年鉴拉取 public 学生视角**

将：

```ts
fetch(`${API_BASE}/api/students`)
```

改为：

```ts
fetch(`${API_BASE}/api/students?audience=public`)
```

- [ ] **Step 3: 确保学生详情 SSG 拉取 public 视角**

在 `packages/site-astro/src/pages/student/[slug].astro` 中将：

```ts
fetch(`${API_BASE}/api/students/${slug}`)
```

改为：

```ts
fetch(`${API_BASE}/api/students/${slug}?audience=public`)
```

保留客户端补拉逻辑：只有带 `X-Classmate-Token` 时才能得到 owner 视角。

- [ ] **Step 4: 确保 getStaticPaths 不需要私密字段**

`getStaticPaths()` 可继续请求 `/api/students`，但更推荐只用公开列表：

```ts
const res = await fetch(`${API_BASE}/api/classmates`)
```

并基于 `data.data` 生成 slug。

- [ ] **Step 5: 运行 site 构建**

Run:

```bash
$env:SITE_BASE='/alumni-book-v2/'; pnpm --filter site-astro build
```

Expected: PASS，年鉴页仍生成，学生页仍生成。

---

### Task 7: 补齐 CI 验收矩阵

**Files:**
- Modify: `.github/workflows/deploy-site.yml`
- Modify: `.github/workflows/deploy-worker.yml`
- Modify: `package.json`
- Modify: `packages/site-astro/package.json`

- [ ] **Step 1: 增加根级验收脚本**

在根 `package.json` 添加：

```json
{
  "scripts": {
    "verify:worker": "pnpm --filter worker exec vitest run",
    "verify:admin": "pnpm --filter admin typecheck && pnpm --filter admin build",
    "verify:site": "pnpm --filter site-astro build && pnpm --filter site-astro exec vitest run tests/navigation.test.ts",
    "verify:all": "pnpm verify:worker && pnpm verify:admin && pnpm verify:site"
  }
}
```

保留已有 scripts，不要覆盖其它命令。

- [ ] **Step 2: site 包增加 test 脚本**

在 `packages/site-astro/package.json` 添加：

```json
{
  "scripts": {
    "test": "vitest run tests/navigation.test.ts"
  }
}
```

保留已有 `dev/build/preview/build:data`。

- [ ] **Step 3: deploy-site workflow 加入验收命令**

在构建部署前加入：

```yaml
- name: Verify Worker tests
  run: pnpm verify:worker

- name: Verify Admin build
  run: pnpm verify:admin
  env:
    SITE_BASE: /alumni-book-v2/

- name: Verify Site build and navigation
  run: pnpm verify:site
  env:
    SITE_BASE: /alumni-book-v2/
    VITE_WORKER_URL: ${{ secrets.VITE_API_BASE_URL }}
    VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}
```

- [ ] **Step 4: deploy-worker workflow 加入 Worker tests**

在 deploy 前加入：

```yaml
- name: Run Worker tests
  run: pnpm verify:worker
```

- [ ] **Step 5: 本地完整验证**

Run:

```bash
$env:SITE_BASE='/alumni-book-v2/'
pnpm verify:all
```

Expected: Worker tests、admin typecheck/build、site build/navigation tests 全部 PASS。

---

### Task 8: 添加上线前静态隐私扫描

**Files:**
- Modify: `scripts/audit-content.ts`
- Create: `packages/site-astro/tests/privacy-static.test.ts`
- Modify: `packages/site-astro/package.json`

- [ ] **Step 1: 新增静态 HTML 隐私扫描测试**

Create `packages/site-astro/tests/privacy-static.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const distDir = resolve(__dirname, '../dist')

function getAllHtmlFiles(dir: string, filesList: string[] = []): string[] {
  if (!existsSync(dir)) return filesList
  for (const file of readdirSync(dir)) {
    const full = join(dir, file)
    if (statSync(full).isDirectory()) getAllHtmlFiles(full, filesList)
    else if (full.endsWith('.html')) filesList.push(full)
  }
  return filesList
}

describe('Static privacy smoke test', () => {
  it('does not render obvious private contact labels with values in generated student pages', () => {
    const htmlFiles = getAllHtmlFiles(join(distDir, 'student'))
    expect(htmlFiles.length).toBeGreaterThan(0)

    const suspiciousPatterns = [
      /手机<\/span>\s*<span[^>]*>\s*1[3-9]\d{9}/,
      /微信<\/span>\s*<span[^>]*>\s*[^<]{3,}/,
      /常住地<\/span>\s*<span[^>]*>\s*[^<]{2,}/,
    ]

    const violations: string[] = []
    for (const file of htmlFiles) {
      const content = readFileSync(file, 'utf-8')
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(content)) {
          violations.push(`${file} matched ${pattern}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
```

- [ ] **Step 2: 将隐私扫描加入 site test**

`packages/site-astro/package.json` 中：

```json
"test": "vitest run tests/navigation.test.ts tests/privacy-static.test.ts"
```

- [ ] **Step 3: 先构建再测试**

Run:

```bash
$env:SITE_BASE='/alumni-book-v2/'
pnpm --filter site-astro build
pnpm --filter site-astro test
```

Expected: PASS。

---

### Task 9: 验收前完整复查清单

**Files:**
- Modify: `skills/plans/phase-6-acceptance-hardening.md`

- [ ] **Step 1: 运行 Worker 全量测试**

Run:

```bash
pnpm --filter worker exec vitest run
```

Expected:

```text
Test Files  3 passed (3)
Tests       21+ passed
```

实际测试数可能随新增用例增加，但不得有 failure。

- [ ] **Step 2: 运行 admin 类型检查与构建**

Run:

```bash
pnpm --filter admin typecheck
$env:SITE_BASE='/alumni-book-v2/'; pnpm --filter admin build
```

Expected: 两条命令 exit code 0，`packages/admin/dist/assets` 无 `.map` 文件。

- [ ] **Step 3: 运行 site 子路径构建与测试**

Run:

```bash
$env:SITE_BASE='/alumni-book-v2/'; pnpm --filter site-astro build
pnpm --filter site-astro test
```

Expected: build PASS，navigation/privacy tests PASS。

- [ ] **Step 4: 检查硬编码根路径**

Run:

```bash
rg 'href="/(preface|roster|album|timeline|student|admin)|window.location.replace\('/admin/#/' packages/site-astro/dist packages/site-astro/public -n
```

Expected: 无命中。

- [ ] **Step 5: 检查构建调试日志**

Run:

```bash
rg 'Astro Config|process.env.SITE_BASE is|siteBase resolved' packages/site-astro/astro.config.mjs packages/site-astro/dist -n
```

Expected: 无命中。

- [ ] **Step 6: 检查动态路由顺序**

Run:

```bash
rg "messagesRoutes.get\\('/messages/(approved|:slug)'" workers/api/src/routes/messages.ts -n
```

Expected: `/messages/approved` 的行号小于 `/messages/:slug`。

---

## Acceptance Criteria

- [ ] 匿名 `/api/students` 与 `/api/students/:slug` 默认只返回 public 字段。
- [ ] 有效其他同学 token 才能获得 `classmates` 字段。
- [ ] 有效本人 token 才能获得 `owner` 字段。
- [ ] `/api/messages/approved` 返回全站已审核留言，不被 slug 路由抢占。
- [ ] `/api/messages/:slug` 仍能返回指定学生页留言。
- [ ] Admin 构建资源前缀与 `SITE_BASE=/alumni-book-v2/` 一致。
- [ ] 404 后台跳转使用 `/alumni-book-v2/admin/#/...`。
- [ ] 生产 admin 构建不输出 sourcemap。
- [ ] Astro config 不再输出调试日志。
- [ ] 年鉴页无过程性实现注释，构建时使用 public 数据源。
- [ ] Worker、Admin、Site 全量验收命令通过。

---

## Recommended Execution Order

1. Task 1：先修隐私默认视角。
2. Task 2：再修消息路由顺序。
3. Task 3-4：修子路径部署。
4. Task 5-6：清理构建与代码状态。
5. Task 7-8：补 CI 与静态隐私扫描。
6. Task 9：跑完整验收。

