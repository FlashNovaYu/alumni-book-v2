# Cloudflare Pages 单应用整合实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 将正式生产链路收敛为一个直接绑定 D1/R2 的 Cloudflare Pages 应用，移除浏览器运行时和 Pages 运行时对公网 `workers.dev` 的依赖，同时保持全部业务功能不变。

**架构：** Astro 与 Vue Admin 继续生成静态资源，普通资源由 Pages Assets 免费提供；`/api/*` 由 Pages Function 复用现有 Hono 应用并直接访问 D1/R2；`/student/*` 仅为静态学生页缺失时提供模板回退。独立 Worker 保留为手动应急入口，但不参与正式流量。

**技术栈：** pnpm workspace、Astro 5、Vue 3、Hono 4、Cloudflare Pages Functions、D1、R2、Wrangler 3、Vitest、Playwright、GitHub Actions

---

## 文件结构

### 新建文件

- `workers/api/src/routes/files.ts`：R2 文件 GET/HEAD、ETag 与边缘缓存响应。
- `workers/api/tests/files.test.ts`：文件服务行为测试。
- `packages/site-astro/functions/api/[[path]].ts`：Pages 到现有 Hono 应用的唯一适配入口。
- `packages/site-astro/functions/student/[[path]].ts`：学生静态页面与通用模板回退。
- `packages/site-astro/tests/pages-functions.test.ts`：Pages Function 适配层单元测试。
- `packages/site-astro/tests/pages-deployment-static.test.ts`：部署配置、根路径和生产 API 地址静态约束。
- `packages/site-astro/public/_redirects`：旧 `/alumni-book-v2/*` 地址兼容跳转。
- `packages/site-astro/public/_headers`：哈希静态资源长期缓存。
- `wrangler.toml`：Pages 的 D1、R2 与非秘密变量配置。
- `scripts/prepare-pages-deploy.mjs`：跨平台组装 Pages 部署目录并编译 Functions。
- `scripts/smoke-pages.mjs`：部署后首页、D1、R2、Range 和旧路径烟雾检查。

### 修改文件

- `workers/api/src/index.ts`：增加绑定就绪检查、挂载文件路由并删除内联文件路由。
- `workers/api/tests/api.test.ts`：增加缺失绑定的 503 测试。
- `packages/site-astro/package.json`：加入 Hono、Workers 类型和新测试。
- `packages/site-astro/env.d.ts`、`packages/site-astro/tsconfig.json`：启用 Pages Function 类型。
- `packages/site-astro/astro.config.mjs`：生产构建数据源默认改为 Pages。
- `packages/site-astro/scripts/fetch-data.ts`：构建数据源默认改为 Pages。
- `packages/site-astro/src/pages/index.astro`、`album.astro`、`preface.astro`、`roster.astro`、`timeline.astro`、`yearbook.astro`、`student/[slug].astro`：SSG 回退数据源改为 Pages。
- `packages/site-astro/public/404.html`：根路径与 Admin 地址改为 `/` 和 `/admin/`。
- `packages/site-astro/tests/navigation.test.ts`：根路径部署断言。
- `packages/admin/vite.config.ts`：Admin 默认根路径和同源 API。
- `package.json`、`pnpm-lock.yaml`：部署脚本与依赖锁定。
- `.github/workflows/deploy-site.yml`：构建统一 Pages 产物、部署并烟雾检查。
- `.github/workflows/deploy-worker.yml`：改为仅手动应急部署。

### 删除文件

- `packages/site-astro/_worker.js`：删除硬编码公网 Worker 代理，由 Functions 构建产物替代。

---

### 任务 1：为 Cloudflare 绑定增加就绪检查

**文件：**

- 修改：`workers/api/tests/api.test.ts`
- 修改：`workers/api/src/index.ts:23-31,48-78`

- [ ] **步骤 1：编写缺失绑定时返回安全 503 的失败测试**

在 `workers/api/tests/api.test.ts` 的健康检查测试附近加入：

```ts
it('GET /api/health — 缺少生产绑定时返回安全的 503', async () => {
  const req = new Request('http://localhost/api/health')
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, { CORS_ORIGIN: '*' } as any, ctx)
  await waitOnExecutionContext(ctx)

  expect(res.status).toBe(503)
  const body = await res.json() as any
  expect(body.success).toBe(false)
  expect(body.message).toBe('服务配置不完整')
  expect(body.requestId).toBeTruthy()
  expect(JSON.stringify(body)).not.toContain('JWT_SECRET')
  expect(JSON.stringify(body)).not.toContain('DB')
  expect(JSON.stringify(body)).not.toContain('R2')
})
```

- [ ] **步骤 2：运行测试并确认当前实现失败**

运行：

```powershell
pnpm --filter worker exec vitest run tests/api.test.ts
```

预期：新增用例失败，当前 `/api/health` 在缺少绑定时返回 200。

- [ ] **步骤 3：增加最小就绪中间件**

保持 `workers/api/src/index.ts` 现有绑定类型，并在 CORS 中间件之后加入：

```ts
type Bindings = {
  DB: D1Database
  R2: R2Bucket
  JWT_SECRET: string
  CORS_ORIGIN: string
}

app.use('/api/*', async (c, next) => {
  const missingBindings = [
    !c.env?.DB && 'DB',
    !c.env?.R2 && 'R2',
    !c.env?.JWT_SECRET && 'JWT_SECRET',
  ].filter(Boolean)

  if (missingBindings.length > 0) {
    const requestId = c.get('requestId') || 'unknown'
    console.error(`[Request ID: ${requestId}] Cloudflare bindings are incomplete`)
    return c.json({
      success: false,
      message: '服务配置不完整',
      requestId,
    }, 503)
  }

  return next()
})
```

不要把缺失绑定名称放进响应正文；名称只用于本地推理，不写入可能被用户看到的输出。

- [ ] **步骤 4：运行目标测试和完整 Worker 测试**

运行：

```powershell
pnpm --filter worker exec vitest run tests/api.test.ts
pnpm verify:worker
```

预期：全部通过；已有完整环境下的 `/api/health` 仍返回 200。

- [ ] **步骤 5：提交就绪检查**

```powershell
git add workers/api/src/index.ts workers/api/tests/api.test.ts
git commit -m "fix: validate Cloudflare runtime bindings"
```

---

### 任务 2：提取并增强 R2 文件服务

**文件：**

- 新建：`workers/api/tests/files.test.ts`
- 新建：`workers/api/src/routes/files.ts`
- 修改：`workers/api/src/index.ts:1-20,391-417,533-545`

- [ ] **步骤 1：编写文件 GET、HEAD、ETag 和 404 的失败测试**

创建 `workers/api/tests/files.test.ts`：

```ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

const key = 'photos/pages-file-route.jpg'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.R2.put(key, new Uint8Array([1, 2, 3, 4]), {
    httpMetadata: { contentType: 'image/jpeg' },
  })
})

async function dispatch(request: Request) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(request, env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

describe('R2 file delivery', () => {
  it('GET returns immutable metadata and full content', async () => {
    const response = await dispatch(new Request(`http://localhost/api/files/${key}`))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Content-Length')).toBe('4')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(response.headers.get('ETag')).toBeTruthy()
    expect(response.headers.get('Cache-Control')).toContain('immutable')
    expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toContain('31536000')
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3, 4])
  })

  it('HEAD returns the same metadata without a body', async () => {
    const response = await dispatch(new Request(`http://localhost/api/files/${key}`, {
      method: 'HEAD',
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Length')).toBe('4')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(await response.text()).toBe('')
  })

  it('If-None-Match returns 304', async () => {
    const first = await dispatch(new Request(`http://localhost/api/files/${key}`, {
      method: 'HEAD',
    }))
    const response = await dispatch(new Request(`http://localhost/api/files/${key}`, {
      headers: { 'If-None-Match': first.headers.get('ETag') || '' },
    }))

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
  })

  it('returns 404 for a missing object', async () => {
    const response = await dispatch(new Request('http://localhost/api/files/photos/missing.jpg'))
    expect(response.status).toBe(404)
  })
})
```

- [ ] **步骤 2：运行新测试并验证响应头断言失败**

运行：

```powershell
pnpm --filter worker exec vitest run tests/files.test.ts
```

预期：至少 `Content-Length`、`Accept-Ranges`、`HEAD` 或 CDN 缓存头断言失败。

- [ ] **步骤 3：创建专用文件路由**

创建 `workers/api/src/routes/files.ts`：

```ts
import { Hono } from 'hono'

type Bindings = {
  R2: R2Bucket
}

export const filesRoutes = new Hono<{ Bindings: Bindings }>()

function createHeaders(object: R2Object) {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
  headers.set('Content-Length', String(object.size))
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('Cloudflare-CDN-Cache-Control', 'max-age=31536000')
  if (object.httpEtag) headers.set('ETag', object.httpEtag)
  return headers
}

function createCacheKey(request: Request) {
  const headers = new Headers(request.headers)
  headers.delete('Range')
  headers.delete('If-None-Match')
  return new Request(request.url, { method: 'GET', headers })
}

filesRoutes.on(['GET', 'HEAD'], '/files/*', async (c) => {
  const key = c.req.param('*')
  if (!key) {
    return c.json({ success: false, message: '文件路径无效' }, 400)
  }

  const conditionalEtag = c.req.header('If-None-Match')
  if (c.req.method === 'HEAD' || conditionalEtag) {
    const object = await c.env.R2.head(key)
    if (!object) return c.json({ success: false, message: '文件不存在' }, 404)

    const headers = createHeaders(object)
    if (conditionalEtag && object.httpEtag === conditionalEtag) {
      return new Response(null, { status: 304, headers })
    }
    if (c.req.method === 'HEAD') {
      return new Response(null, { status: 200, headers })
    }
  }

  const cache = typeof caches === 'undefined' ? null : caches.default
  const cacheKey = createCacheKey(c.req.raw)
  if (cache) {
    const cached = await cache.match(cacheKey)
    if (cached) return cached
  }

  const object = await c.env.R2.get(key)
  if (!object) return c.json({ success: false, message: '文件不存在' }, 404)

  const response = new Response(object.body, { headers: createHeaders(object) })
  if (cache) {
    c.executionCtx.waitUntil(
      cache.put(cacheKey, response.clone()).catch((error) => {
        console.error('Failed to cache R2 file:', error)
      }),
    )
  }
  return response
})
```

- [ ] **步骤 4：在入口挂载新路由并删除内联实现**

在 `workers/api/src/index.ts` 导入：

```ts
import { filesRoutes } from './routes/files'
```

在公开路由区域挂载：

```ts
app.route('/api', filesRoutes)
```

完整删除原有 `app.get('/api/files/*', ...)` 内联路由，不改动其他路由顺序。

- [ ] **步骤 5：运行文件测试、类型检查与完整 Worker 测试**

运行：

```powershell
pnpm --filter worker exec vitest run tests/files.test.ts
pnpm --filter worker exec tsc --noEmit
pnpm verify:worker
```

预期：全部通过。

- [ ] **步骤 6：提交文件服务改造**

```powershell
git add workers/api/src/index.ts workers/api/src/routes/files.ts workers/api/tests/files.test.ts
git commit -m "feat: serve R2 files with edge cache metadata"
```

---

### 任务 3：增加 Pages Function 适配层

**文件：**

- 新建：`packages/site-astro/tests/pages-functions.test.ts`
- 新建：`packages/site-astro/functions/api/[[path]].ts`
- 新建：`packages/site-astro/functions/student/[[path]].ts`
- 修改：`packages/site-astro/package.json`
- 修改：`packages/site-astro/env.d.ts`
- 修改：`packages/site-astro/tsconfig.json`
- 修改：`pnpm-lock.yaml`

- [ ] **步骤 1：添加适配层失败测试并注册到测试脚本**

创建 `packages/site-astro/tests/pages-functions.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { onRequest as apiOnRequest } from '../functions/api/[[path]]'
import { onRequest as studentOnRequest } from '../functions/student/[[path]]'

function executionContext() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  }
}

describe('Pages Functions adapters', () => {
  it('dispatches /api requests to the existing Hono app', async () => {
    const response = await apiOnRequest({
      request: new Request('https://alumni-book.pages.dev/api/health'),
      env: {
        DB: {} as D1Database,
        R2: {} as R2Bucket,
        JWT_SECRET: 'test-secret',
        CORS_ORIGIN: 'https://alumni-book.pages.dev',
      },
      params: {},
      data: {},
      functionPath: '/api/[[path]]',
      next: vi.fn(),
      ...executionContext(),
    } as any)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true })
  })

  it('serves an existing student asset before using the template', async () => {
    const fetchAsset = vi.fn(async () => new Response('student page', { status: 200 }))
    const response = await studentOnRequest({
      request: new Request('https://alumni-book.pages.dev/student/zhangsan/'),
      env: { ASSETS: { fetch: fetchAsset } },
    } as any)

    expect(await response.text()).toBe('student page')
    expect(fetchAsset).toHaveBeenCalledTimes(1)
  })

  it('falls back to the shared student template after an asset 404', async () => {
    const fetchAsset = vi.fn(async (request: Request) => {
      const pathname = new URL(request.url).pathname
      return pathname === '/student/template/'
        ? new Response('template page', { status: 200 })
        : new Response('missing', { status: 404 })
    })
    const response = await studentOnRequest({
      request: new Request('https://alumni-book.pages.dev/student/new-student/'),
      env: { ASSETS: { fetch: fetchAsset } },
    } as any)

    expect(await response.text()).toBe('template page')
    expect(fetchAsset).toHaveBeenCalledTimes(2)
  })
})
```

将 `packages/site-astro/package.json` 的 `test` 命令追加 `tests/pages-functions.test.ts`。

- [ ] **步骤 2：运行新测试并确认模块不存在**

运行：

```powershell
pnpm --filter site-astro exec vitest run tests/pages-functions.test.ts
```

预期：失败并提示无法解析 `functions/api/[[path]]` 或 `functions/student/[[path]]`。

- [ ] **步骤 3：添加 Pages Function 所需的显式依赖和类型**

运行：

```powershell
pnpm --filter site-astro add hono@^4.6.0
pnpm --filter site-astro add -D @cloudflare/workers-types@^4.20241022.0
```

在 `packages/site-astro/env.d.ts` 追加：

```ts
/// <reference types="@cloudflare/workers-types" />
```

在 `packages/site-astro/tsconfig.json` 的 `types` 中加入：

```json
"@cloudflare/workers-types"
```

- [ ] **步骤 4：实现 API 适配器**

创建 `packages/site-astro/functions/api/[[path]].ts`：

```ts
import { handle } from 'hono/cloudflare-pages'
import app from '../../../../workers/api/src/index'

export const onRequest = handle(app)
```

该文件只能导入现有 Hono 应用，不得复制任何 API 路由。

- [ ] **步骤 5：实现学生模板回退适配器**

创建 `packages/site-astro/functions/student/[[path]].ts`：

```ts
type StudentPagesEnv = {
  ASSETS: Fetcher
}

export const onRequest: PagesFunction<StudentPagesEnv> = async ({ request, env }) => {
  const assetResponse = await env.ASSETS.fetch(request)
  if (assetResponse.status !== 404) return assetResponse

  const templateUrl = new URL('/student/template/', request.url)
  return env.ASSETS.fetch(new Request(templateUrl, request))
}
```

- [ ] **步骤 6：运行适配层测试和站点类型检查**

运行：

```powershell
pnpm --filter site-astro exec vitest run tests/pages-functions.test.ts
pnpm --filter site-astro typecheck
```

预期：全部通过。

- [ ] **步骤 7：提交 Pages 适配层**

```powershell
git add packages/site-astro/functions packages/site-astro/tests/pages-functions.test.ts packages/site-astro/package.json packages/site-astro/env.d.ts packages/site-astro/tsconfig.json pnpm-lock.yaml
git commit -m "feat: run Hono API inside Pages Functions"
```

---

### 任务 4：切换根路径和生产构建数据源

**文件：**

- 新建：`packages/site-astro/tests/pages-deployment-static.test.ts`
- 修改：`packages/site-astro/astro.config.mjs`
- 修改：`packages/site-astro/scripts/fetch-data.ts`
- 修改：`packages/site-astro/src/pages/index.astro`
- 修改：`packages/site-astro/src/pages/album.astro`
- 修改：`packages/site-astro/src/pages/preface.astro`
- 修改：`packages/site-astro/src/pages/roster.astro`
- 修改：`packages/site-astro/src/pages/timeline.astro`
- 修改：`packages/site-astro/src/pages/yearbook.astro`
- 修改：`packages/site-astro/src/pages/student/[slug].astro`
- 修改：`packages/site-astro/public/404.html`
- 修改：`packages/site-astro/tests/navigation.test.ts:76-96`
- 修改：`packages/site-astro/package.json`
- 修改：`packages/admin/vite.config.ts`

- [ ] **步骤 1：编写根路径与生产地址失败测试**

创建 `packages/site-astro/tests/pages-deployment-static.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const siteRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(siteRoot, '../..')
const pagesHost = 'https://alumni-book.pages.dev'
const publicWorkerHost = 'https://alumni-book-api.chenyuhao2263.workers.dev'

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('Pages production deployment contract', () => {
  it('uses Pages as the production SSG data source', () => {
    const files = [
      'packages/site-astro/astro.config.mjs',
      'packages/site-astro/scripts/fetch-data.ts',
      'packages/site-astro/src/pages/index.astro',
      'packages/site-astro/src/pages/album.astro',
      'packages/site-astro/src/pages/preface.astro',
      'packages/site-astro/src/pages/roster.astro',
      'packages/site-astro/src/pages/timeline.astro',
      'packages/site-astro/src/pages/yearbook.astro',
      'packages/site-astro/src/pages/student/[slug].astro',
    ]

    for (const file of files) {
      expect(read(file), file).toContain(pagesHost)
    }
    expect(read('packages/site-astro/scripts/fetch-data.ts')).not.toContain(publicWorkerHost)
  })

  it('defaults the admin build to /admin/ with a same-origin API', () => {
    const config = read('packages/admin/vite.config.ts')
    expect(config).toContain("process.env.SITE_BASE ?? '/'")
    expect(config).toContain("process.env.VITE_API_BASE_URL ?? ''")
  })

  it('uses root paths in the static 404 page', () => {
    const notFound = read('packages/site-astro/public/404.html')
    expect(notFound).toContain('href="/"')
    expect(notFound).toContain('href="/admin/"')
    expect(notFound).toContain("var siteBase = '/';")
  })
})
```

把该文件加入 `packages/site-astro/package.json` 的 `test` 命令。

- [ ] **步骤 2：运行测试并确认旧 Worker 地址与旧路径导致失败**

运行：

```powershell
pnpm --filter site-astro exec vitest run tests/pages-deployment-static.test.ts
```

预期：生产数据源、Admin 默认路径和 404 根路径断言失败。

- [ ] **步骤 3：将所有 SSG 生产回退地址切换到 Pages**

在本任务列出的 Astro 页面和 `scripts/fetch-data.ts` 中，将：

```ts
'https://alumni-book-api.chenyuhao2263.workers.dev'
```

替换为：

```ts
'https://alumni-book.pages.dev'
```

在 `packages/site-astro/astro.config.mjs` 中把 `VITE_WORKER_URL` 的默认值改为 Pages 地址。保留 Vite 本地开发代理指向独立 Worker，因为本地开发代理不进入生产构建产物。

- [ ] **步骤 4：把 Admin 默认部署改为根路径同源模式**

将 `packages/admin/vite.config.ts` 的默认配置改为：

```ts
const siteBase = process.env.SITE_BASE ?? '/'
```

以及：

```ts
'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL ?? ''),
```

`adminBase` 的现有计算逻辑会由此生成 `/admin/`，不需要重写。

- [ ] **步骤 5：更新 404 与导航测试的根路径断言**

将 `packages/site-astro/public/404.html` 的首页、Admin 和脚本基础路径分别改为 `/`、`/admin/` 和 `/`。

将 `packages/site-astro/tests/navigation.test.ts` 的 Admin 断言改为：

```ts
expect(content).toContain('/admin/assets/')
expect(content).not.toContain('/alumni-book-v2/admin/assets/')
```

将 404 断言改为：

```ts
expect(content).toContain('href="/admin/"')
expect(content).toContain("siteBase + 'admin/#/'")
expect(content).not.toContain('/alumni-book-v2/admin/')
```

- [ ] **步骤 6：运行静态测试、站点构建和 Admin 构建**

运行：

```powershell
pnpm --filter site-astro build
pnpm --filter admin build
pnpm --filter site-astro exec vitest run tests/pages-deployment-static.test.ts tests/navigation.test.ts
```

预期：全部通过；`packages/site-astro/dist/index.html` 使用 `/assets/`，`packages/admin/dist/index.html` 使用 `/admin/assets/`。

- [ ] **步骤 7：提交根路径与数据源切换**

```powershell
git add packages/site-astro/astro.config.mjs packages/site-astro/scripts/fetch-data.ts packages/site-astro/src/pages packages/site-astro/public/404.html packages/site-astro/tests/navigation.test.ts packages/site-astro/tests/pages-deployment-static.test.ts packages/site-astro/package.json packages/admin/vite.config.ts
git commit -m "feat: target Pages root deployment"
```

---

### 任务 5：生成可重复的 Pages 部署产物

**文件：**

- 新建：`wrangler.toml`
- 新建：`packages/site-astro/public/_redirects`
- 新建：`packages/site-astro/public/_headers`
- 新建：`scripts/prepare-pages-deploy.mjs`
- 修改：`package.json`

- [ ] **步骤 1：扩展部署静态测试并验证配置缺失**

在 `packages/site-astro/tests/pages-deployment-static.test.ts` 增加：

```ts
it('declares direct Pages bindings and legacy redirects', () => {
  const config = read('wrangler.toml')
  expect(config).toContain('pages_build_output_dir = "./deploy"')
  expect(config).toContain('binding = "DB"')
  expect(config).toContain('binding = "R2"')
  expect(config).not.toContain('JWT_SECRET')

  const redirects = read('packages/site-astro/public/_redirects')
  expect(redirects).toContain('/alumni-book-v2/* /:splat 302')

  const headers = read('packages/site-astro/public/_headers')
  expect(headers).toContain('max-age=31536000')
  expect(headers).toContain('immutable')
})
```

运行：

```powershell
pnpm --filter site-astro exec vitest run tests/pages-deployment-static.test.ts
```

预期：因三个配置文件不存在而失败。

- [ ] **步骤 2：创建 Pages Wrangler 配置**

创建根目录 `wrangler.toml`：

```toml
name = "alumni-book"
pages_build_output_dir = "./deploy"
compatibility_date = "2024-10-22"

[vars]
CORS_ORIGIN = "https://alumni-book.pages.dev"

[[d1_databases]]
binding = "DB"
database_name = "alumni-book-db"
database_id = "7068f542-0b92-482f-9fa4-37971ceffa63"

[[r2_buckets]]
binding = "R2"
bucket_name = "alumni-book-assets"
```

不要把 `JWT_SECRET` 写入该文件。

- [ ] **步骤 3：创建旧地址跳转和静态缓存规则**

创建 `packages/site-astro/public/_redirects`：

```text
/alumni-book-v2 / 302
/alumni-book-v2/* /:splat 302
```

创建 `packages/site-astro/public/_headers`：

```text
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/admin/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

- [ ] **步骤 4：实现跨平台部署产物组装脚本**

创建 `scripts/prepare-pages-deploy.mjs`：

```js
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const siteDist = join(rootDir, 'packages/site-astro/dist')
const adminDist = join(rootDir, 'packages/admin/dist')
const functionsDir = join(rootDir, 'packages/site-astro/functions')
const deployDir = join(rootDir, 'deploy')
const workerOut = join(deployDir, '_worker.js')
const routesOut = join(deployDir, '_routes.json')
const pnpmCli = process.env.npm_execpath

if (!existsSync(siteDist) || !existsSync(adminDist)) {
  throw new Error('缺少 Site 或 Admin 构建产物，请先完成两个构建')
}
if (!pnpmCli) throw new Error('无法定位 pnpm CLI，请通过 pnpm prepare:pages 运行')

rmSync(deployDir, { recursive: true, force: true })
mkdirSync(deployDir, { recursive: true })
cpSync(siteDist, deployDir, { recursive: true })
mkdirSync(join(deployDir, 'admin'), { recursive: true })
cpSync(adminDist, join(deployDir, 'admin'), { recursive: true })

execFileSync(process.execPath, [
  pnpmCli,
  '--filter', 'worker',
  'exec', 'wrangler',
  'pages', 'functions', 'build',
  functionsDir,
  '--outdir', workerOut,
  '--output-routes-path', routesOut,
  '--project-directory', join(rootDir, 'packages/site-astro'),
  '--compatibility-date', '2024-10-22',
  '--minify',
], { cwd: rootDir, stdio: 'inherit' })

const routes = JSON.parse(readFileSync(routesOut, 'utf8'))
for (const route of ['/api/*', '/student/*']) {
  if (!routes.include.includes(route)) {
    throw new Error(`Pages Function 路由缺少 ${route}`)
  }
}

const forbiddenHost = 'alumni-book-api.chenyuhao2263.workers.dev'
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.txt', '.xml'])

function scan(directory) {
  for (const name of readdirSync(directory)) {
    const file = join(directory, name)
    if (statSync(file).isDirectory()) {
      scan(file)
      continue
    }
    if (!textExtensions.has(extname(file)) && name !== '_worker.js') continue
    if (readFileSync(file, 'utf8').includes(forbiddenHost)) {
      throw new Error(`生产产物仍包含公开 Worker 地址：${file}`)
    }
  }
}

scan(deployDir)
console.log(`Pages deployment prepared at ${deployDir}`)
```

- [ ] **步骤 5：增加根级部署与验证命令**

在根 `package.json` 的 `scripts` 中加入：

```json
"prepare:pages": "node scripts/prepare-pages-deploy.mjs",
"verify:pages": "pnpm verify:all && pnpm prepare:pages",
"smoke:pages": "node scripts/smoke-pages.mjs"
```

本步骤先加入 `smoke:pages` 命令；对应脚本在任务 6 创建，在任务 6 完成前不要运行该命令。

- [ ] **步骤 6：构建并验证部署目录**

运行：

```powershell
pnpm --filter site-astro build
pnpm --filter admin build
pnpm prepare:pages
Get-Content -Raw deploy/_routes.json
rg -n "alumni-book-api\.chenyuhao2263\.workers\.dev" deploy
```

预期：`_routes.json` 包含 `/api/*` 和 `/student/*`；最后一个 `rg` 无匹配并返回退出码 1。

- [ ] **步骤 7：运行部署静态测试并提交**

```powershell
pnpm --filter site-astro exec vitest run tests/pages-deployment-static.test.ts
git add wrangler.toml packages/site-astro/public/_redirects packages/site-astro/public/_headers scripts/prepare-pages-deploy.mjs package.json
git commit -m "build: assemble direct Pages deployment"
```

---

### 任务 6：更新 CI 并增加生产烟雾检查

**文件：**

- 新建：`scripts/smoke-pages.mjs`
- 修改：`.github/workflows/deploy-site.yml`
- 修改：`.github/workflows/deploy-worker.yml`
- 修改：`packages/site-astro/tests/pages-deployment-static.test.ts`

- [ ] **步骤 1：为工作流行为添加失败断言**

在 `packages/site-astro/tests/pages-deployment-static.test.ts` 增加：

```ts
it('deploys the unified Pages app and keeps Worker deployment manual', () => {
  const pagesWorkflow = read('.github/workflows/deploy-site.yml')
  expect(pagesWorkflow).toContain('pnpm prepare:pages')
  expect(pagesWorkflow).toContain('pnpm smoke:pages')
  expect(pagesWorkflow).toContain('wrangler --cwd ../.. pages deploy deploy')
  expect(pagesWorkflow).toContain("VITE_WORKER_URL: 'https://alumni-book.pages.dev'")

  const workerWorkflow = read('.github/workflows/deploy-worker.yml')
  expect(workerWorkflow).toContain('workflow_dispatch:')
  expect(workerWorkflow).not.toContain('push:')
})
```

运行：

```powershell
pnpm --filter site-astro exec vitest run tests/pages-deployment-static.test.ts
```

预期：工作流断言失败。

- [ ] **步骤 2：实现带重试的生产烟雾脚本**

创建 `scripts/smoke-pages.mjs`：

```js
const baseUrl = (process.env.PAGES_BASE_URL || 'https://alumni-book.pages.dev').replace(/\/$/, '')

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function request(path, init = {}, attempts = 6) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        redirect: init.redirect || 'follow',
        ...init,
        signal: AbortSignal.timeout(15000),
      })
      if (response.status >= 400) throw new Error(`HTTP ${response.status}`)
      return response
    } catch (error) {
      lastError = error
      if (attempt < attempts) await sleep(attempt * 2000)
    }
  }
  throw lastError
}

function expectStatus(response, expected, label) {
  if (!expected.includes(response.status)) {
    throw new Error(`${label} 返回 ${response.status}，预期 ${expected.join('/')}`)
  }
}

const home = await request('/')
expectStatus(home, [200], '首页')
const homeHtml = await home.text()
if (homeHtml.includes('alumni-book-api.chenyuhao2263.workers.dev')) {
  throw new Error('首页仍包含公开 Worker 地址')
}

const health = await request('/api/health')
expectStatus(health, [200], '健康检查')

const classmates = await request('/api/classmates')
expectStatus(classmates, [200], '同学列表')

const albumsResponse = await request('/api/albums')
expectStatus(albumsResponse, [200], '相册 API')
const albumsBody = await albumsResponse.json()
const albums = albumsBody.data || []
const r2Key = albums
  .flatMap(album => [album.coverR2Key, ...(album.photos || []).map(photo => photo.r2Key)])
  .find(Boolean)
if (!r2Key) throw new Error('线上相册没有可用于 R2 烟雾测试的文件')

const encodedKey = String(r2Key).split('/').map(encodeURIComponent).join('/')
const filePath = `/api/files/${encodedKey}`
const head = await request(filePath, { method: 'HEAD' })
expectStatus(head, [200], 'R2 HEAD')
for (const header of ['content-type', 'content-length', 'etag', 'accept-ranges', 'cache-control']) {
  if (!head.headers.get(header)) throw new Error(`R2 HEAD 缺少 ${header}`)
}

await request(filePath, { headers: { Range: 'bytes=0-0' } })
const range = await request(filePath, { headers: { Range: 'bytes=0-0' } })
expectStatus(range, [206], 'R2 Range')
if (!range.headers.get('content-range')) throw new Error('R2 Range 缺少 Content-Range')
if (range.headers.get('content-length') !== '1') throw new Error('R2 Range 分段长度不是 1')

const legacy = await request('/alumni-book-v2/roster/', { redirect: 'manual' })
expectStatus(legacy, [301, 302, 307, 308], '旧路径跳转')
if (!legacy.headers.get('location')?.endsWith('/roster/')) {
  throw new Error('旧路径没有映射到 /roster/')
}

const admin = await request('/admin/')
expectStatus(admin, [200], '管理后台')

console.log(`Pages smoke checks passed for ${baseUrl}`)
```

- [ ] **步骤 3：把 Pages 工作流切换到统一构建**

修改 `.github/workflows/deploy-site.yml`：

1. `paths` 增加 `workers/api/**`、`wrangler.toml`、`scripts/prepare-pages-deploy.mjs`、`scripts/smoke-pages.mjs`、根 `package.json` 和 `pnpm-lock.yaml`。
2. 全局 `VITE_WORKER_URL` 改为 `https://alumni-book.pages.dev`。
3. Site 与 Admin 验证步骤的 `SITE_BASE` 改为 `/`。
4. 用以下步骤替换手写复制命令：

```yaml
      - name: Prepare unified Pages deployment
        run: pnpm prepare:pages

      - name: Deploy to Cloudflare Pages
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: pnpm --filter worker exec wrangler --cwd ../.. pages deploy deploy --project-name alumni-book --branch main --commit-dirty=true

      - name: Smoke test production Pages deployment
        env:
          PAGES_BASE_URL: https://alumni-book.pages.dev
        run: pnpm smoke:pages
```

- [ ] **步骤 4：将独立 Worker 工作流改为手动应急模式**

把 `.github/workflows/deploy-worker.yml` 的触发器完整替换为：

```yaml
on:
  workflow_dispatch:
```

保留测试与部署步骤本身，确保需要时仍能手动发布应急 Worker。

- [ ] **步骤 5：验证脚本语法与工作流静态约束**

运行：

```powershell
node --check scripts/smoke-pages.mjs
pnpm --filter site-astro exec vitest run tests/pages-deployment-static.test.ts
```

预期：全部通过。

- [ ] **步骤 6：提交 CI 与烟雾检查**

```powershell
git add scripts/smoke-pages.mjs .github/workflows/deploy-site.yml .github/workflows/deploy-worker.yml packages/site-astro/tests/pages-deployment-static.test.ts
git commit -m "ci: deploy and verify unified Pages app"
```

---

### 任务 7：完整验证、配置秘密并部署

**文件：**

- 验证：本计划中所有已修改文件
- 不提交：`deploy/`、`.dev.vars`、任何秘密值

- [ ] **步骤 1：运行完整质量门禁**

运行：

```powershell
pnpm verify:pages
```

预期：Worker 测试、Admin 类型检查与构建、Site 类型检查与测试、Playwright 网络测试、Pages Functions 编译和部署产物扫描全部通过。

- [ ] **步骤 2：检查产物规模与运行时地址**

运行：

```powershell
$files = Get-ChildItem deploy -Recurse -File
$files.Count
[math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 2)
rg -n "alumni-book-api\.chenyuhao2263\.workers\.dev" deploy
Get-Content -Raw deploy/_routes.json
```

预期：文件数远低于 20,000，总体积远低于 Pages 限制，`rg` 无匹配，路由只包含 `/api/*` 和 `/student/*`。

- [ ] **步骤 3：在 Pages 项目写入现有生产 JWT 密钥**

运行以下交互式命令，并在提示中输入现有生产 `JWT_SECRET`；终端和日志中不要回显密钥：

```powershell
pnpm --filter worker exec wrangler pages secret put JWT_SECRET --project-name alumni-book
```

预期：Wrangler 报告 `JWT_SECRET` 已成功上传到 `alumni-book` Pages 项目。若无法取得现有值，停止部署并由用户决定是否同时轮换 Worker 与 Pages 密钥；不得自行生成并替换生产密钥。

- [ ] **步骤 4：部署统一 Pages 应用**

运行：

```powershell
pnpm --filter worker exec wrangler --cwd ../.. pages deploy deploy --project-name alumni-book --branch main --commit-dirty=true
```

预期：Wrangler 返回新的 Pages 部署 URL，现有生产地址切换到新版本。

- [ ] **步骤 5：运行生产烟雾检查**

运行：

```powershell
$env:PAGES_BASE_URL = 'https://alumni-book.pages.dev'
pnpm smoke:pages
Remove-Item Env:PAGES_BASE_URL
```

预期：输出 `Pages smoke checks passed`；首页、D1、R2、Range、旧路径和 Admin 全部通过。

- [ ] **步骤 6：执行浏览器人工验收**

依次验证：

1. 同学账号登录并进入名册。
2. 打开学生资料、照片和音乐。
3. 修改自己的资料并重新读取。
4. 发送留言或信件并刷新确认。
5. 管理员登录、查看学生和相册。
6. 上传一张测试图片并确认可下载。
7. 浏览器网络面板过滤 `workers.dev`，结果必须为空。

预期：现有功能行为不变，运行时没有公开 Worker 请求。

- [ ] **步骤 7：确认工作区只保留用户原有未提交修改**

运行：

```powershell
git status --short
git log --oneline -8
```

预期：本计划修改均已按任务提交；`deploy/` 仍被忽略；任务开始前已有的 `AGENTS.md`、`CLAUDE.md`、`DESIGN-claude.md`、`README.md`、`packages/site-astro/.astro/types.d.ts`、`workers/api/tests/class-space-inbox.test.ts` 和 `.tmp-ui-audit.mjs` 状态未被误提交。

---

## 计划自审结论

- 设计文档中的正式 Pages 单入口、直接 D1/R2、静态路由豁免、学生模板回退、旧路径兼容、文件缓存、手动 Worker 回退和生产烟雾检查均有对应任务。
- 所有代码步骤均提供了目标文件、具体实现、运行命令和预期结果。
- `JWT_SECRET` 使用交互式秘密写入，不在计划、仓库或日志中出现真实值。
- 本计划不修改用户当前已经改动的文件，也不包含页面重构或无关代码清理。
- 后续代码质量治理在本部署计划完成并稳定后单独进行。
