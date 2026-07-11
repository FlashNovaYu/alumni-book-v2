# 后台网络层加固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变后台视觉和业务功能的前提下，固化同源 API、统一网络请求，并增加安全的超时、幂等重试及防回退门禁。

**Architecture:** `packages/admin/src/api/network.ts` 提供无 Vue 依赖的请求原语；`client.ts` 叠加 Token 与 401 会话语义；路由守卫复用认证客户端。构建后由独立脚本扫描产物，禁止绝对 API 地址进入发布包。

**Tech Stack:** TypeScript、Vue 3、Vite 6、Node test runner、tsx、pnpm。

---

### Task 1: 建立可测试的网络请求原语

**Files:**
- Create: `packages/admin/src/api/network.ts`
- Create: `packages/admin/tests/network.test.ts`
- Modify: `packages/admin/package.json`

- [ ] **Step 1: 写 URL 拼接、GET 重试、写操作不重试、超时和错误解析的失败测试**

测试通过可控的 `fetchImpl` 记录调用次数，并让超时用例监听 `AbortSignal`。期望 API 为 `requestJson(path, options, policy)`，其中测试策略可以覆盖 `apiBase`、`timeoutMs` 和 `fetchImpl`。

- [ ] **Step 2: 运行测试并确认因 `network.ts` 尚不存在而失败**

Run: `pnpm --filter admin test:network`

Expected: FAIL，错误包含无法加载 `../src/api/network`。

- [ ] **Step 3: 实现最小网络模块**

实现 `ApiRequestError`、`requestJson`、15 秒默认超时、60 秒上传超时常量，以及仅 GET 对网络错误和 502/503/504 的一次重试。请求路径以显式 `apiBase` 拼接；空基址保持 `/api/...` 同源路径。

- [ ] **Step 4: 运行网络测试并确认通过**

Run: `pnpm --filter admin test:network`

Expected: 所有网络层测试 PASS。

- [ ] **Step 5: 提交网络原语**

```powershell
git add packages/admin/src/api/network.ts packages/admin/tests/network.test.ts packages/admin/package.json
git commit -m "refactor(admin): centralize resilient API requests"
```

### Task 2: 统一认证客户端和路由守卫

**Files:**
- Modify: `packages/admin/src/api/client.ts`
- Modify: `packages/admin/src/main.ts`
- Create: `packages/admin/tests/network-integration-static.mjs`
- Modify: `packages/admin/package.json`

- [ ] **Step 1: 写失败的静态契约测试**

断言 `client.ts` 使用 `requestJson`，登录与 Token 校验不再直接调用 `fetch`；断言 `main.ts` 调用 `verifyAdminToken` 且不包含直接 `fetch`。

- [ ] **Step 2: 运行测试并确认当前重复 `fetch` 导致失败**

Run: `pnpm --filter admin test`

Expected: FAIL，指出 `client.ts` 或 `main.ts` 仍包含直接 `fetch`。

- [ ] **Step 3: 用网络原语实现后台认证语义**

让 `adminFetch` 注入认证头并在 401 时清除 Token、跳转登录；让 `adminLogin` 使用同一请求原语但不在密码错误时跳转；新增 `verifyAdminToken`，供路由守卫验证现有 Token。FormData 请求使用 60 秒超时，其他请求使用默认超时。

- [ ] **Step 4: 运行后台测试、类型检查并确认通过**

Run: `pnpm --filter admin test && pnpm --filter admin typecheck`

Expected: 全部 PASS，无 TypeScript 错误。

- [ ] **Step 5: 提交认证客户端整合**

```powershell
git add packages/admin/src/api/client.ts packages/admin/src/main.ts packages/admin/tests/network-integration-static.mjs packages/admin/package.json
git commit -m "refactor(admin): reuse network client for authentication"
```

### Task 3: 固化同源 API 与构建防回退门禁

**Files:**
- Modify: `packages/admin/vite.config.ts`
- Create: `packages/admin/tests/dist-network.mjs`
- Modify: `packages/admin/package.json`
- Modify: `package.json`

- [ ] **Step 1: 写失败的源码及产物门禁**

测试要求 Vite 默认 API 基址为空；产物扫描递归读取 `dist` 中的 HTML、JS、CSS，发现 `workers.dev` 或 `https://.../api` 时退出 1。

- [ ] **Step 2: 使用未传环境变量的生产构建确认门禁失败**

Run: `pnpm --filter admin build && pnpm --filter admin verify:dist-network`

Expected: FAIL，指出产物含 `alumni-book-api.chenyuhao2263.workers.dev`。

- [ ] **Step 3: 将 Vite 默认 API 基址改为空字符串并接入根质量命令**

显式设置 `VITE_API_BASE_URL` 的本地开发能力保持不变；`verify:admin` 在构建后执行产物扫描。

- [ ] **Step 4: 重建并确认门禁通过**

Run: `pnpm verify:admin`

Expected: 测试、类型检查、构建和产物扫描全部 PASS。

- [ ] **Step 5: 提交同源配置与门禁**

```powershell
git add packages/admin/vite.config.ts packages/admin/tests/dist-network.mjs packages/admin/package.json package.json
git commit -m "ci(admin): prevent cross-origin API regressions"
```

### Task 4: 完整验证与非生产预览

**Files:**
- Modify only if verification exposes an in-scope defect.

- [ ] **Step 1: 运行全仓库门禁**

Run: `pnpm verify:all`

Expected: Worker、Admin、Site 全部 PASS。

- [ ] **Step 2: 检查改动范围与敏感信息**

Run: `git diff --check; git status --short; rg -n "workers\\.dev|JWT_SECRET|CLOUDFLARE_API_TOKEN" packages/admin/src packages/admin/dist`

Expected: diff 无空白错误；后台产物无 `workers.dev`；无新增密钥。

- [ ] **Step 3: 构建包含 Site 与 Admin 的 Pages 预览产物**

使用现有 Pages 打包流程生成 `deploy/`，保持生产基线与最新 UI，不修改生产分支。

- [ ] **Step 4: 发布唯一的非生产预览分支并执行 smoke**

Run: `pnpm --filter worker exec wrangler --cwd ../.. pages deploy deploy --project-name alumni-book --branch admin-network-hardening --commit-dirty=true`

Expected: 返回非生产预览 URL；首页、后台资源和 `/api/health` 均为 200。

- [ ] **Step 5: 浏览器检查网络和界面来源**

确认后台脚本来自本次预览提交、请求只访问预览域名 `/api`、无 `workers.dev`，并确认新界面关键资源仍存在。

- [ ] **Step 6: 记录验证结果并提交**

将命令结果、预览 URL、提交 SHA 与生产未变更声明写入 `docs/phase-admin-network-hardening-acceptance-report.md`，然后提交。

