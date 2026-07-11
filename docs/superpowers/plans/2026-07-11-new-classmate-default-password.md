# 新增同学默认账号初始化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增同学时自动创建初始密码为 `123456`、首次登录必须改密的账号，并在后台明确提示管理员。

**Architecture:** Worker 的创建路由复用已有 PBKDF2 `hashPassword`，在同一条 INSERT 中写入账号哈希与待改密状态。后台不新增密码输入，只在创建成功后显示固定初始密码说明。测试从管理员创建请求出发，验证持久化账号状态和首次登录响应。

**Tech Stack:** Hono、Cloudflare D1、Vitest、Vue 3、Node 静态契约测试。

---

### Task 1: 保护 Worker 创建账号契约

**Files:**
- Modify: `workers/api/tests/api.test.ts`
- Modify: `workers/api/src/routes/students.ts`

- [ ] **Step 1: 写失败的端到端 Worker 测试**

在 `Admin Student API & Message Submission` 测试组中新增测试。先用 `loginAsAdminForTest()` 获取 JWT，再发送：

```ts
const req = new Request('http://localhost/api/students', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ name: '新建账号同学', slug: 'new-account-student' }),
})
```

断言创建响应为 200，数据库行满足：

```ts
expect(row.account_password_hash).toMatch(/^pbkdf2:/)
expect(row.account_password_hash).not.toContain('123456')
expect(row.account_initial_password_changed).toBe(0)
expect(row.account_status).toBe('pending')
```

继续调用 `/api/classmate-auth/login`，传入 `new-account-student` 和 `123456`，断言状态 200 且 `mustChangePassword === true`。

- [ ] **Step 2: 确认测试因缺少自动初始化而失败**

Run: `pnpm --filter worker exec vitest run tests/api.test.ts`

Expected: 新测试失败，`account_password_hash` 为 `null` 或登录返回 401；既有测试不应作为失败原因。

- [ ] **Step 3: 在创建路由中最小化写入账号字段**

在 `studentsRoutes.post('/students')` 中，在构造 `info` 后调用：

```ts
const initialPasswordHash = await hashPassword('123456')
```

将 INSERT 扩展为：

```ts
INSERT INTO students (
  id, name, slug, info,
  account_password_hash,
  account_initial_password_changed,
  account_status
) VALUES (?, ?, ?, ?, ?, 0, 'pending')
```

绑定 `initialPasswordHash`。响应中不返回密码或哈希。

- [ ] **Step 4: 运行 Worker 测试确认通过**

Run: `pnpm --filter worker exec vitest run tests/api.test.ts`

Expected: 所有 API 测试通过，新学生可使用 `123456` 首次登录且被要求改密。

- [ ] **Step 5: 提交 Worker 变更**

```bash
git add workers/api/src/routes/students.ts workers/api/tests/api.test.ts
git commit -m "feat: initialize new classmate accounts"
```

### Task 2: 明确后台创建成功反馈

**Files:**
- Modify: `packages/admin/src/views/StudentsView.vue`
- Modify: `packages/admin/tests/community-static.mjs`

- [ ] **Step 1: 写失败的后台静态契约测试**

在 `community-static.mjs` 中读取 `StudentsView.vue`，断言它包含以下固定反馈文案：

```js
assert.match(studentsView, /初始密码为 123456/)
assert.match(studentsView, /首次登录后修改/)
```

- [ ] **Step 2: 确认静态测试失败**

Run: `pnpm --filter admin test`

Expected: 因 `StudentsView.vue` 尚无初始密码提示而失败。

- [ ] **Step 3: 添加创建成功提示，不改变表单字段**

在 `StudentsView.vue` 中新增一个短暂成功状态。创建请求成功后设置：

```ts
createSuccess.value = '已创建同学账号，初始密码为 123456，请通知同学首次登录后修改。'
```

把该文本显示在新建对话框中，关闭或重新打开对话框时清除。不得把密码加入请求体，不得新增编辑表单字段。

- [ ] **Step 4: 运行后台测试、类型检查和构建**

Run: `pnpm verify:admin`

Expected: 静态契约、`vue-tsc --noEmit` 和 Vite 生产构建全部通过。

- [ ] **Step 5: 提交后台变更**

```bash
git add packages/admin/src/views/StudentsView.vue packages/admin/tests/community-static.mjs
git commit -m "feat: show new classmate initial password"
```

### Task 3: 全量验证与发布

**Files:**
- Modify: `docs/phase-14-chat-rework-acceptance-report.md`（仅追加实际发布结果）

- [ ] **Step 1: 运行整库门禁**

Run: `pnpm verify:all`

Expected: Worker、后台、站点全部通过。

- [ ] **Step 2: 部署 Worker 并检查健康接口**

Run: `pnpm deploy:worker`

Expected: Wrangler 返回新版本 ID。

Run: `GET https://alumni-book-api.chenyuhao2263.workers.dev/api/health`

Expected: HTTP 200。

- [ ] **Step 3: 以 `SITE_BASE=/alumni-book-v2/` 构建并部署 Pages**

构建 site 与 admin，组装 `deploy/` 并发布到 Cloudflare Pages `alumni-book` 的 `main` 分支。部署后检查：

```text
https://alumni-book.pages.dev/alumni-book-v2/
https://alumni-book.pages.dev/alumni-book-v2/admin/
https://alumni-book.pages.dev/alumni-book-v2/api/health
```

Expected: 三个 URL 都返回 HTTP 200。

- [ ] **Step 4: 记录实际发布信息并提交**

把 Worker 版本、Pages URL、健康检查结果和整库验证结果追加到验收报告；不记录令牌或带签名的备份 URL。

```bash
git add docs/phase-14-chat-rework-acceptance-report.md
git commit -m "docs: record account initialization deployment"
```

## 自检

- 覆盖已确认的服务端初始化、首次改密、后台反馈和不返回明文密码四项需求。
- 不包含自定义初始密码、批量导入或旧账号批量重置等非目标。
- 每个行为先有失败测试，再有最小实现和精确验证命令。
