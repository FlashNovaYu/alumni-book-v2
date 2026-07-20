# 阿里云正式商用运行链路与稳定性收敛 Implementation Plan

> **For agentic workers:** 本计划在当前会话内按任务逐项执行；每项先补测试或契约检查，再做最小实现并运行对应验证。

**Goal:** 让阿里云自托管成为正式商用链路、让 Cloudflare 仅作为显式开发测试链路，并提高 Node/SQLite 服务的并发与故障稳定性。

**Architecture:** 页面构建时使用通用的 `VITE_SSG_API_BASE` 显式指定数据源；浏览器端自托管始终使用同源空 API base，CF 开发通过工作流或 `.env` 显式注入测试地址。Node 运行时继续复用 Hono 路由，通过 SQLite 本地适配器和本地文件适配器提供 D1/R2 兼容接口，增加连接级并发参数和优雅关闭边界。

**Tech Stack:** Astro 7、Vue 3、Vite、Hono、`@hono/node-server`、better-sqlite3、Vitest、pnpm、Podman/Nginx 自托管脚本。

---

## 文件职责映射

- 构建 API 配置：`packages/site-astro/src/utils/ssgApiBase.ts`、`packages/site-astro/astro.config.mjs`、`packages/site-astro/scripts/fetch-data.ts`。
- 页面 SSG 数据源：`packages/site-astro/src/layouts/MainLayout.astro`，以及 `src/pages/index.astro`、`album.astro`、`preface.astro`、`roster.astro`、`timeline.astro`、`yearbook.astro`、`student/[slug].astro`。
- 环境注入：`.github/workflows/verify.yml`、`.github/workflows/deploy-production.yml`、`scripts/build-selfhosted.mjs`、`scripts/prepare-pages-deploy.mjs`。
- 自托管验收：`scripts/smoke-selfhosted.mjs`、`scripts/build-selfhosted.test.mjs`、`scripts/smoke-selfhosted.test.mjs`。
- Node 稳定性：`workers/api/src/runtime/sqlite.ts`、`workers/api/src/runtime/nodeEnv.ts`、`workers/api/src/db/init-local.ts`、`workers/api/src/node-server.ts`。
- HTTP 默认值和文件缓存：`workers/api/src/index.ts`、`workers/api/src/routes/files.ts`。
- 审计契约：`workers/api/tests/admin-rbac.test.ts` 及现有未提交的五个后台/路由改动文件。

### Task 1: 锁定双环境 API 配置契约

**Files:**
- Create: `packages/site-astro/src/utils/ssgApiBase.ts`
- Modify: `packages/site-astro/astro.config.mjs`
- Modify: `packages/site-astro/scripts/fetch-data.ts`
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
- Modify: `packages/site-astro/src/pages/index.astro`
- Modify: `packages/site-astro/src/pages/album.astro`
- Modify: `packages/site-astro/src/pages/preface.astro`
- Modify: `packages/site-astro/src/pages/roster.astro`
- Modify: `packages/site-astro/src/pages/timeline.astro`
- Modify: `packages/site-astro/src/pages/yearbook.astro`
- Modify: `packages/site-astro/src/pages/student/[slug].astro`
- Test: `packages/site-astro/tests/pages-deployment-static.test.ts`

- [ ] **Step 1: 写配置契约失败测试**

在 `pages-deployment-static.test.ts` 增加以下断言，先验证旧变量和平台回退必须消失：

```ts
it('使用显式的通用 SSG API 配置，不把 Cloudflare 作为应用默认值', () => {
  const files = [
    'packages/site-astro/astro.config.mjs',
    'packages/site-astro/scripts/fetch-data.ts',
    'packages/site-astro/src/layouts/MainLayout.astro',
    'packages/site-astro/src/pages/index.astro',
    'packages/site-astro/src/pages/album.astro',
    'packages/site-astro/src/pages/preface.astro',
    'packages/site-astro/src/pages/roster.astro',
    'packages/site-astro/src/pages/timeline.astro',
    'packages/site-astro/src/pages/yearbook.astro',
    'packages/site-astro/src/pages/student/[slug].astro',
  ]
  for (const file of files) {
    const source = read(file)
    expect(source, file).toContain('VITE_SSG_API_BASE')
    expect(source, file).not.toContain('VITE_WORKER_URL')
    expect(source, file).not.toContain('alumni-book.pages.dev')
  }
})
```

运行：`pnpm --filter site-astro exec vitest run tests/pages-deployment-static.test.ts`。

预期：失败，指出页面仍包含 `VITE_WORKER_URL` 或 `pages.dev`。

- [ ] **Step 2: 添加通用 SSG API 解析器**

创建 `ssgApiBase.ts`：

```ts
export function normalizeApiBase(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function getSsgApiBase(): string {
  const base = normalizeApiBase(import.meta.env.VITE_SSG_API_BASE || '')
  if (!base && import.meta.env.MODE !== 'test') {
    throw new Error('缺少 VITE_SSG_API_BASE；请显式指定阿里云或 Cloudflare 开发 API 地址')
  }
  return base
}
```

将 Astro 配置改为只注入 `VITE_API_BASE_URL` 和 `VITE_SSG_API_BASE`，开发代理目标读取 `process.env.VITE_SSG_API_BASE || 'http://127.0.0.1:8787'`，不再写入任何 Cloudflare 公网默认值。页面的构建时请求统一改为 `getSsgApiBase()`；浏览器运行时继续保留 `VITE_API_BASE_URL || ''`。

- [ ] **Step 3: 迁移 Node SSG 数据脚本**

在 `fetch-data.ts` 使用：

```ts
const API_BASE = (process.env.VITE_SSG_API_BASE || '').trim().replace(/\/+$/, '')
if (!API_BASE && process.env.NODE_ENV !== 'test') {
  throw new Error('缺少 VITE_SSG_API_BASE，已拒绝使用未知环境构建静态站点')
}
```

保留现有 15 秒超时和指数退避，并把每个失败日志包含 API base、路径和最终错误；不恢复任何 `pages.dev` 回退。

- [ ] **Step 4: 更新 CF 开发和 Pages 验证环境**

在 `verify.yml` 与 `deploy-production.yml` 把 `VITE_WORKER_URL: 'https://alumni-book.pages.dev'` 改为 `VITE_SSG_API_BASE: 'https://alumni-book.pages.dev'`。CF Pages 工作流仍使用该显式测试地址，阿里云脚本则传入 IP/域名，不共用默认值。

- [ ] **Step 5: 运行配置测试**

运行：`pnpm --filter site-astro exec vitest run tests/pages-deployment-static.test.ts`。

预期：配置契约测试通过；旧 Pages 断言若仍与新边界冲突，只更新为“CF 工作流显式注入测试地址”，不删除 Pages Functions 测试。

### Task 2: 收敛自托管构建产物和 smoke

**Files:**
- Modify: `scripts/build-selfhosted.mjs`
- Modify: `scripts/prepare-pages-deploy.mjs`
- Modify: `scripts/smoke-selfhosted.mjs`
- Test: `scripts/build-selfhosted.test.mjs`
- Test: `scripts/smoke-selfhosted.test.mjs`

- [ ] **Step 1: 先补自托管产物断言**

在 `build-selfhosted.test.mjs` 增加：

```js
test('自托管构建要求显式 SSG API，并记录目标', () => {
  assert.throws(() => buildSelfHostedConfig({}), /SELF_HOST_API_BASE|--api-base/)
  assert.deepEqual(buildSelfHostedConfig({ apiBase: 'http://118.178.88.227/' }), {
    apiBase: 'http://118.178.88.227',
    clientApiBase: '',
    ssgApiBase: 'http://118.178.88.227',
  })
})
```

运行：`node --test scripts/build-selfhosted.test.mjs`，预期先失败。

- [ ] **Step 2: 实现显式构建配置**

在 `build-selfhosted.mjs` 导出 `buildSelfHostedConfig({ apiBase })`，仅接受命令行 `--api-base` 或非空 `SELF_HOST_API_BASE`；缺失时抛出中文错误。构建环境设置 `VITE_SSG_API_BASE: normalizedApiBase`、`VITE_API_BASE_URL: ''`，移除 `VITE_WORKER_URL`。`release.json` 写入 `{ source, target: 'aliyun-selfhosted', apiBase }`。

- [ ] **Step 3: 加强产物扫描和 smoke 断言**

扫描拒绝 `pages.dev`、`workers.dev` 和 `VITE_WORKER_URL` 字符串；`smoke-selfhosted.mjs` 在 `/release.json` 存在时解析并断言 `target === 'aliyun-selfhosted'`，继续检查 health、readiness、文件 404、首页和后台状态。CF Pages 的 `prepare-pages-deploy.mjs` 只扫描 Worker 公网地址，不复用自托管目标断言。

- [ ] **Step 4: 运行脚本测试**

运行：`node --test scripts/build-selfhosted.test.mjs scripts/smoke-selfhosted.test.mjs`。

预期：全部通过，并且不改写用户已有未提交文件。

### Task 3: 为 SQLite 适配器增加商用并发参数

**Files:**
- Modify: `workers/api/src/runtime/sqlite.ts`
- Test: `workers/api/src/runtime/node-runtime.test.ts`

- [ ] **Step 1: 添加连接参数失败测试**

在“本地 SQLite D1 适配器”测试中增加：

```ts
it('启用 WAL、busy timeout 和外键约束', async () => {
  const database = createSqliteDatabase(':memory:')
  openDatabases.push(database)
  expect(await database.prepare('PRAGMA busy_timeout').first<{ timeout: number }>()).toEqual({ timeout: 5000 })
  expect(await database.prepare('PRAGMA foreign_keys').first<{ foreign_keys: number }>()).toEqual({ foreign_keys: 1 })
})
```

运行：`pnpm --filter worker exec vitest run src/runtime/node-runtime.test.ts`，预期先失败。

- [ ] **Step 2: 设置 SQLite PRAGMA**

在 `createSqliteDatabase` 创建连接后执行：

```ts
database.pragma('busy_timeout = 5000')
database.pragma('foreign_keys = ON')
database.pragma('synchronous = NORMAL')
if (filename !== ':memory:') database.pragma('journal_mode = WAL')
```

保持现有 D1 兼容方法签名和 batch 原子事务不变；不修改迁移 SQL。

- [ ] **Step 3: 验证 Node 运行时**

运行：`pnpm --filter worker exec vitest run src/runtime/node-runtime.test.ts`。

预期：原有适配器、迁移、文件存储、readiness 测试与新增 PRAGMA 测试全部通过。

### Task 4: 收敛迁移启动、CORS、readiness 和文件缓存

**Files:**
- Modify: `workers/api/src/db/init-local.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/src/routes/files.ts`
- Test: `workers/api/src/runtime/node-runtime.test.ts`
- Test: `workers/api/tests/observability.test.ts`

- [ ] **Step 1: 写默认值和文件缓存失败测试**

增加断言：Node 环境不含 `pages.dev` 默认 CORS；文件响应包含 `Cache-Control`、ETag 和 Range 头，但不依赖 `Cloudflare-CDN-Cache-Control`。

- [ ] **Step 2: 删除 Cloudflare 运行时默认值**

将 `DEFAULT_CORS_ORIGIN` 改为无平台默认：只有显式 `CORS_ORIGIN` 或本地开发 origin 才允许跨域；配置缺失日志改为“运行时依赖不完整”。保留 Cloudflare Worker 的显式 `wrangler.toml` 配置，不在通用入口硬编码 Pages 域名。

- [ ] **Step 3: 稳定迁移和 readiness**

迁移过程继续使用单连接 `BEGIN/COMMIT/ROLLBACK`，在每次迁移前明确检查已应用记录；失败时保留原始错误作为 cause 文本。readiness 对 SQLite 执行 `SELECT 1`，对本地存储执行 `list({ limit: 1 })`，缺少任一依赖返回 503 和 checks，不把 health 当作依赖就绪。

- [ ] **Step 4: 移除文件路由的 Cloudflare 专用响应头**

保留标准 `Cache-Control: public, max-age=31536000, immutable`、ETag、`Accept-Ranges`、`Content-Range` 和 304/206 行为，删除 `Cloudflare-CDN-Cache-Control` 设置。

- [ ] **Step 5: 运行目标测试**

运行：`pnpm --filter worker exec vitest run src/runtime/node-runtime.test.ts tests/observability.test.ts tests/files.test.ts`。

预期：Node readiness、请求日志、文件 Range/缓存和配置缺失测试通过。

### Task 5: 让 Node HTTP 入口可重复优雅关闭

**Files:**
- Modify: `workers/api/src/node-server.ts`
- Test: `workers/api/src/runtime/node-runtime.test.ts`

- [ ] **Step 1: 添加重复关闭测试**

通过导出的关闭函数或可注入 server mock 验证 SIGINT/SIGTERM 只触发一次 `server.close` 和 `runtime.close`；请求级异常仍由 Hono `onError` 转成 JSON，不导致测试进程退出。

- [ ] **Step 2: 实现幂等 shutdown**

在 `startNodeServer` 内维护 `shuttingDown` 布尔值，信号处理器重复触发时直接返回；关闭回调中只调用一次 runtime.close，并记录关闭错误。保留现有 `waitUntil` 后台任务 catch 日志。

- [ ] **Step 3: 验证 Node 入口**

运行：`pnpm --filter worker exec vitest run src/runtime/node-runtime.test.ts`，再运行 `pnpm --filter worker run typecheck`。

预期：测试和类型检查通过。

### Task 6: 对齐删除/隐藏审计测试与现有未提交改动

**Files:**
- Modify: `workers/api/tests/admin-rbac.test.ts`
- Verify only: `packages/admin/src/views/AlbumsView.vue`、`packages/admin/src/views/TimelineEventsView.vue`、`workers/api/src/routes/albums.ts`、`messages.ts`、`publicMessages.ts`、`students.ts`、`timeline.ts`

- [ ] **Step 1: 调整失败断言为可选原因契约**

在现有“requires reasons”测试中，把没有 reason 的隐藏请求预期从 400 改为 200；断言对应审计记录的 `reason` 为 `null`，再保留非空 reason 的审计断言。取消 `prompt` 仍不得发起请求的前端行为由现有后台测试覆盖。

- [ ] **Step 2: 运行审计测试**

运行：`pnpm --filter worker exec vitest run tests/admin-rbac.test.ts`。

预期：测试通过，且上述用户未提交文件的业务改动保持不变。

### Task 7: 文档、全量门禁与自托管构建验证

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/deployment-runbook.md`
- Modify: `docs/alibaba-ecs-selfhosted-acceptance.md`
- Modify: `README.md`（仅更新入口说明，不删除 CF 开发章节）

- [ ] **Step 1: 更新命令和环境变量说明**

自托管示例统一使用：

```powershell
$env:RELEASE_SHA=(git rev-parse HEAD).Trim()
pnpm build:selfhosted -- --api-base http://118.178.88.227
Remove-Item Env:RELEASE_SHA
```

CF 开发示例明确设置 `VITE_SSG_API_BASE`；删除把 `VITE_WORKER_URL` 描述为通用应用配置的文字。敏感变量、数据库和上传目录约束保持原样。

- [ ] **Step 2: 运行分层验证**

依次运行：

```powershell
node --test scripts/build-selfhosted.test.mjs scripts/smoke-selfhosted.test.mjs
pnpm verify:worker
pnpm verify:shared
pnpm verify:admin
pnpm verify:site
```

预期：所有命令退出码为 0；若站点 Playwright 需要本地 API，使用已有测试启动脚本，不改生产地址回退。

- [ ] **Step 3: 构建并扫描自托管产物**

运行：`pnpm build:selfhosted -- --api-base http://118.178.88.227`。检查 `deploy/selfhosted/release.json` 的 `target` 为 `aliyun-selfhosted`，并运行：`rg -n -i "pages\.dev|workers\.dev|VITE_WORKER_URL" deploy/selfhosted`。

预期：扫描无输出；站点和后台静态文件存在，API 请求路径为 `/api/...`。

- [ ] **Step 4: 运行本地 Node smoke**

使用显式 `JWT_SECRET`、临时 `DATABASE_PATH` 和 `UPLOAD_ROOT` 启动 `pnpm --filter worker run dev:node`，再运行：

```powershell
node scripts/smoke-selfhosted.mjs --base-url http://127.0.0.1:8787 --api-only
```

预期：health 200、readiness 200 且 `ready=true`、缺失文件 404，响应正文不含 Cloudflare 地址。

- [ ] **Step 5: 只读核对 ECS 发布条件**

具备权限时运行 `node scripts/smoke-selfhosted.mjs --base-url http://118.178.88.227`；只核对 release、health、readiness、页面和文件 404，不执行数据库删除、迁移回滚或目录清理。

## 提交节奏

每个任务完成后只暂存该任务涉及的新增/修改文件，提交信息使用：

- `fix: make ssg api target explicit`
- `fix: harden self-hosted artifact checks`
- `fix: tune sqlite runtime for self-hosting`
- `fix: remove cloudflare runtime defaults`
- `fix: make node shutdown idempotent`
- `test: align optional audit reasons`
- `docs: document aliyun as commercial target`

提交前再次运行 `git status --short`，确认用户原有未提交的 8 个文件没有被暂存或覆盖。
