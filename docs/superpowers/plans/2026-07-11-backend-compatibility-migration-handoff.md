# 班级聊天返工后端兼容、迁移与发布准备实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不修改任何前端或视觉代码的前提下，完成旧公共留言与旧信箱写接口的后端兼容收口，验证旧邮件数据迁移和通知同步事件，形成可审计的后端发布准备报告。

**Architecture:** 新旧接口共用同一个群聊创建服务，数据库只保存新状态 `visible`，旧接口边界把它映射为 `approved`。旧信箱 GET 暂时保留读取能力，所有旧信箱 POST 在完成同学身份校验后固定返回 `410 Gone`，不再写入 `mail_*` 表。所有迁移只允许在测试数据库和本地 D1 演练；生产 D1、Worker 和 Pages 部署必须等待前端与视觉阶段完成后再由人工解锁。

**Tech Stack:** TypeScript、Hono、Cloudflare Workers、D1 SQLite、Vitest、Wrangler、pnpm workspace。

---

## 0. 给执行模型的强制说明

本计划专门面向能力较弱、没有视觉理解能力的执行模型。必须机械地按顺序执行，不得自行扩大范围，不得为了“顺手优化”重构相邻模块。

### 0.1 已完成基线

- Task 1 至 Task 5 已完成：聊天数据库、公共群聊、管理员治理、固定双人私聊。
- Task 6 已完成并提交：统一信箱同步、管理员通知、`rowid` 高水位、通知同步事件、流式 JSON 限长。
- Task 8 已完成：带同学身份的班级空间概览接口。
- Task 7 的数据迁移核心已完成，尚缺旧接口兼容层和最终本地演练。
- Task 9 至 Task 16 中涉及前端、界面、排版、动效和视觉的部分全部暂缓。

执行前必须确认提交 `556f5b3` 是当前 `HEAD` 的祖先：

```powershell
git merge-base --is-ancestor 556f5b3 HEAD
if ($LASTEXITCODE -ne 0) { throw '当前分支缺少 Task 6 基线提交 556f5b3' }
```

### 0.2 绝对禁止事项

- 禁止修改 `packages/site-astro/**`。
- 禁止修改 `packages/admin/**`。
- 禁止新增或调整 CSS、Vue、Astro、图片、截图、Playwright 视觉断言。
- 禁止修改导航、班级空间布局、群聊舞台、信箱界面、后台界面。
- 禁止运行任何包含 `--remote` 的 Wrangler D1 命令。
- 禁止运行 `wrangler deploy`、`wrangler pages deploy` 或 GitHub 推送。
- 禁止执行 `git reset --hard`、`git checkout --`、递归删除或覆盖用户改动。
- 禁止修改已经通过验收的 `0012_chat_rework.sql` 和 `0013_notification_sync_events.sql`，除非新失败测试证明迁移本身确实错误。
- 禁止删除旧 `mail_*` 表。它们在兼容读取和生产迁移完成前仍是数据来源。
- 禁止创建新的 `pending` 公共投稿。
- 禁止让旧接口把数据库状态重新写成 `approved`。

### 0.3 允许修改范围

默认只允许修改或创建以下文件：

```text
workers/api/src/lib/groupChatCreate.ts                 新建，共享群聊创建服务
workers/api/src/routes/groupChat.ts                    改为调用共享创建服务
workers/api/src/routes/publicMessages.ts               旧公共留言兼容层
workers/api/src/routes/mailbox.ts                      旧信箱只读兼容与 410
workers/api/src/index.ts                               移除旧公共留言公开缓存分类
workers/api/tests/legacy-chat-compat.test.ts           新建，兼容契约测试
workers/api/tests/api.test.ts                          更新被 410 取代的旧测试
workers/api/tests/chat-migration.test.ts               补通知同步事件断言
scripts/lib/chatMigration.ts                           仅在测试证明报告错误时修改
scripts/migrate-chat-data.ts                           仅在测试证明 runner 错误时修改
docs/api/legacy-chat-compatibility.md                  新建，接口兼容说明
docs/phase-14-backend-compatibility-acceptance-report.md 新建，实际验收记录
```

发现必须修改列表外文件时，立即停止，不要自行决定。先在交付报告中说明原因。

### 0.4 完成定义

只有同时满足以下条件，才允许报告“后端阶段完成”：

1. 匿名访问 `GET /api/public-messages` 返回 `401`。
2. 有效同学会话访问旧公共留言 GET，只看到数据库中的 `visible` 消息，响应状态映射为 `approved`。
3. 旧公共留言 POST 复用新群聊的改密、禁言、限流、幂等写入和引用校验，不再创建 `pending`。
4. 历史 `pending` 和 `rejected` 数据仍可被管理员查询；批准历史 `pending` 后数据库写入 `visible`。
5. 旧 reaction 接口可以作用于 `visible` 消息，不再查询废弃的 `approved`。
6. 旧信箱三个 GET 保持同学会话隔离；两个 POST 返回 `410`，并且 `mail_threads`、`mail_messages`、`mail_recipients` 数量不变。
7. 迁移脚本执行两次仍幂等；私聊、消息和管理员通知的目标数量完全匹配，`anomalies` 为 0。
8. 迁移生成的管理员通知拥有 `notification_sync_events` 记录。
9. `pnpm verify:worker` 全绿，无未处理 Promise、D1 警告和生命周期警告。
10. 只生成后端验收报告，不执行生产迁移或部署。

---

## 1. 固定接口契约

执行模型不得重新设计以下契约。

| 接口 | 身份要求 | 完成后的行为 |
|---|---|---|
| `GET /api/public-messages` | 同学 Session | 查询 `visible`，响应映射为旧 `approved` |
| `GET /api/public-messages/mine` | 同学 Session | 保留本人历史；`visible` 映射为 `approved` |
| `POST /api/public-messages` | 同学 Session | 调用共享群聊创建服务，数据库写 `visible` |
| `PUT /api/public-messages/:id/react` | 同学 Session | 只允许对 `visible` 消息操作 |
| `GET /api/admin/public-messages?status=pending` | 管理 JWT | 继续读取历史待审核内容 |
| `GET /api/admin/public-messages?status=rejected` | 管理 JWT | 继续读取历史未通过内容 |
| `GET /api/admin/public-messages?status=approved` | 管理 JWT | 查询数据库 `visible`，响应映射 `approved` |
| `PUT /api/admin/public-messages/:id/approve` | 管理 JWT | 只把历史 `pending` 改为 `visible` |
| `PUT /api/admin/public-messages/:id/reject` | 管理 JWT | 保持写入 `rejected` 和原因 |
| `GET /api/mailbox/summary` | 同学 Session | 保留旧未读摘要读取 |
| `GET /api/mailbox/threads` | 同学 Session | 保留旧线程列表读取 |
| `GET /api/mailbox/threads/:id` | 同学 Session | 保留参与者授权和旧详情读取；允许保留“读取即标记已读”的既有行为 |
| `POST /api/mailbox/threads` | 同学 Session | 固定 `410 Gone`，不解析 JSON，不写库 |
| `POST /api/mailbox/threads/:id/messages` | 同学 Session | 固定 `410 Gone`，不解析 JSON，不写库 |

旧公共留言响应状态映射固定如下：

```ts
function legacyPublicStatus(status: string) {
  if (status === 'visible') return 'approved'
  if (status === 'recalled_by_author' || status === 'recalled_by_admin') return 'hidden'
  return status
}
```

数据库中不得出现新的 `approved`。`approved` 只存在于旧 API 的响应边界。

---

## 2. 文件职责映射

### `workers/api/src/lib/groupChatCreate.ts`

唯一职责：接收已经验证的同学身份和原始创建参数，执行与当前 `/group-chat/messages` 完全相同的输入校验、首次改密限制、幂等查询、禁言校验、引用校验、30 秒/1 小时限流、原子插入和格式化。

不得导入 Hono，不得返回 `Response`，不得读取请求头。

导出接口固定为：

```ts
import type { GroupChatMessage } from '../../../../packages/shared/src/types'

export interface GroupChatCreatorIdentity {
  slug: string
  name: string
  mustChangePassword: boolean
}

export interface CreateGroupChatMessageInput {
  content?: unknown
  clientNonce?: unknown
  replyToId?: unknown
  cardStyle?: unknown
}

export type CreateGroupChatMessageResult =
  | { ok: true; created: boolean; message: GroupChatMessage; cardStyle: string }
  | { ok: false; status: 400 | 403 | 429; message: string; retryAfter?: number }

export function createGroupChatMessage(
  db: D1Database,
  identity: GroupChatCreatorIdentity,
  input: CreateGroupChatMessageInput,
): Promise<CreateGroupChatMessageResult>
```

### `workers/api/src/routes/groupChat.ts`

保留列表、同步、回应和撤回路由。只把现有 POST 创建逻辑替换为共享服务调用，HTTP 响应必须与重构前一致。

### `workers/api/src/routes/publicMessages.ts`

作为旧客户端兼容边界。不得复制群聊创建 SQL；不得继续创建待审核记录。

### `workers/api/src/routes/mailbox.ts`

保留三个 GET。删除两个 POST 内部的 JSON 解析和 D1 写入，替换为统一 `410` handler。

### `workers/api/tests/legacy-chat-compat.test.ts`

只测试旧接口兼容行为。不要测试视觉、DOM 或前端组件。

### `docs/phase-14-backend-compatibility-acceptance-report.md`

只记录实际执行结果。不得预先填写“通过”，不得写没有运行过的命令。

---

## Task 0：保护工作树并建立可复现基线

**Files:** 无文件修改。

- [ ] **Step 1：确认分支和基线提交**

```powershell
git branch --show-current
git merge-base --is-ancestor 556f5b3 HEAD
git log -5 --oneline
```

Expected:

- 当前分支不是 `master` 或 `main`。
- `git merge-base` 退出码为 0。
- 日志中可以看到 `556f5b3 fix: harden inbox synchronization`。

- [ ] **Step 2：确认工作树干净**

```powershell
git status --short
```

Expected: 无输出。

若出现用户未提交改动，停止执行，不得 stash、revert 或覆盖。

- [ ] **Step 3：运行后端基线**

```powershell
pnpm --filter worker exec tsc --noEmit
pnpm verify:worker
```

Expected:

- TypeScript 退出码 0。
- Worker 测试全部通过。
- 基线至少包含 11 个测试文件和 121 项测试；数量可以增加，不得减少。

- [ ] **Step 4：记录基线，不提交**

把分支、`git rev-parse HEAD`、测试数量保存在执行日志中，后续写入验收报告。本步骤不创建文件、不提交。

---

## Task 1：增加旧接口兼容失败测试

**Files:**

- Create: `workers/api/tests/legacy-chat-compat.test.ts`
- Modify: `workers/api/tests/api.test.ts`

- [ ] **Step 1：创建独立测试文件和固定数据清理**

测试文件必须复用 `initTestDb`，并定义三个互不相同的同学：

```ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

const A = { id: 'legacy-compat-a-id', slug: 'legacy-compat-a', name: '兼容同学甲' }
const B = { id: 'legacy-compat-b-id', slug: 'legacy-compat-b', name: '兼容同学乙' }
const C = { id: 'legacy-compat-c-id', slug: 'legacy-compat-c', name: '兼容同学丙' }

async function request(path: string, options: RequestInit = {}) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(new Request(`http://localhost${path}`, options), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

function classmateHeaders(token: string) {
  return { 'Content-Type': 'application/json', 'X-Classmate-Token': token }
}

function adminHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}
```

`beforeEach` 必须删除测试前缀的以下数据，并按外键依赖顺序执行：

```sql
DELETE FROM group_chat_reactions WHERE message_id LIKE 'legacy-compat-%';
DELETE FROM content_reviews WHERE content_id LIKE 'legacy-compat-%';
DELETE FROM notifications WHERE recipient_slug IN ('legacy-compat-a','legacy-compat-b','legacy-compat-c');
DELETE FROM public_messages WHERE id LIKE 'legacy-compat-%';
DELETE FROM mail_recipients WHERE thread_id LIKE 'legacy-compat-%';
DELETE FROM mail_messages WHERE thread_id LIKE 'legacy-compat-%';
DELETE FROM mail_threads WHERE id LIKE 'legacy-compat-%';
DELETE FROM group_chat_mutes WHERE student_slug IN ('legacy-compat-a','legacy-compat-b','legacy-compat-c');
DELETE FROM classmate_sessions WHERE student_slug IN ('legacy-compat-a','legacy-compat-b','legacy-compat-c');
DELETE FROM students WHERE slug IN ('legacy-compat-a','legacy-compat-b','legacy-compat-c');
```

随后插入三个 `account_status='active'`、`account_initial_password_changed=1` 的同学。

- [ ] **Step 2：增加旧公共 GET 身份与状态映射测试**

测试名固定为：

```ts
it('requires a classmate session and maps visible public messages to approved')
```

步骤和断言：

1. 插入一条 `visible`、一条 `pending`、一条 `rejected`。
2. 匿名 GET 断言 `401`。
3. 使用 A 的 token GET。
4. 断言只返回 `visible` 对应项。
5. 断言响应 `status === 'approved'`。
6. 断言响应头 `Cache-Control` 包含 `no-store`。

核心断言：

```ts
expect(anonymous.status).toBe(401)
expect(response.status).toBe(200)
expect(body.data.items).toEqual([
  expect.objectContaining({ id: 'legacy-compat-visible', status: 'approved' }),
])
expect(response.headers.get('Cache-Control')).toContain('no-store')
```

- [ ] **Step 3：增加旧 POST 转新群聊语义测试**

测试名固定为：

```ts
it('creates visible group-chat data through the legacy public message endpoint')
```

发送：

```ts
{
  content: '旧入口发出的新群聊消息',
  cardStyle: 'letter'
}
```

必须断言：

```ts
expect(response.status).toBe(200)
expect(body.data).toEqual(expect.objectContaining({
  status: 'approved',
  content: '旧入口发出的新群聊消息',
  cardStyle: 'letter',
}))
```

数据库断言：

```ts
expect(row.status).toBe('visible')
expect(row.client_nonce).toMatch(/^legacy:/)
expect(row.card_style).toBe('letter')
expect(await count("SELECT COUNT(*) FROM public_messages WHERE status = 'pending' AND author_slug = ?", A.slug)).toBe(0)
```

再插入 A 的永久禁言记录，重复 POST，断言 `403` 且消息数不增加。

- [ ] **Step 4：增加消息驱动接口一致性测试**

测试名：

```ts
it('keeps the new group-chat endpoint behavior unchanged after service extraction')
```

使用同一 `clientNonce` 连续 POST `/api/group-chat/messages` 两次，断言：

- 第一次 `201`。
- 第二次 `200`。
- 两次响应 ID 相同。
- 数据库只有一行。

- [ ] **Step 5：增加旧 reaction 对 visible 生效测试**

插入 `visible` 消息，调用：

```text
PUT /api/public-messages/legacy-compat-visible/react
```

请求体：

```json
{ "reaction": "👍" }
```

断言 `200`，响应计数为 1，数据库 `reactions` JSON 中 `👍` 为 1。

- [ ] **Step 6：增加历史审核兼容测试**

测试名：

```ts
it('reviews historical pending messages without restoring the approved database status')
```

必须覆盖：

- `pending` 批准后数据库状态为 `visible`。
- 管理 GET `status=approved` 可以查询该记录，响应状态为 `approved`。
- `rejected` 历史记录通过 `status=rejected` 仍可查询。
- 新批准操作创建一条通知和至少一条 `notification_sync_events`。
- 再次批准同一条非 pending 内容不得重复创建通知；返回 `409` 或保持幂等 `200`，二者必须在实现前选择。此计划固定选择 `409`。

- [ ] **Step 7：增加旧信箱写入 410 测试**

测试名：

```ts
it('returns 410 for every legacy mailbox write without parsing or writing the payload')
```

在请求前后分别查询三个旧表数量。两个 POST 均使用故意无效的文本 body：

```ts
body: '这不是 JSON，接口也不应该解析它'
```

必须断言：

```ts
expect(create.status).toBe(410)
expect(reply.status).toBe(410)
expect((await create.json() as any).message).toContain('已停用')
expect(afterCounts).toEqual(beforeCounts)
```

- [ ] **Step 8：增加旧信箱 GET 授权测试**

直接用 SQL 插入一个旧线程，不得通过即将停用的 POST 创建测试数据。断言：

- 匿名访问三个 GET 均为 `401`。
- 收件人可以访问列表和详情。
- 创建人可以访问详情。
- 第三人访问详情返回 `403`。
- 收件人读取详情后，旧 `mail_recipients.read_at` 可以被写入；这是明确保留的既有兼容行为。

- [ ] **Step 9：更新 `api.test.ts` 中冲突的旧测试**

找到测试：

```text
non-recipient cannot read mailbox thread
```

删除它对 `POST /api/mailbox/threads` 成功的依赖，改为 SQL 种入线程、消息和收件人。保留收件人 200、第三人 403 的原始目的。

找到测试：

```text
classmate can submit public message and admin approval creates notification
```

改为断言旧 POST 立即返回 `approved`，数据库为 `visible`；历史审核行为由新文件中的独立测试负责。

- [ ] **Step 10：运行并确认 RED**

```powershell
pnpm --filter worker exec vitest run tests/legacy-chat-compat.test.ts tests/api.test.ts
```

Expected: FAIL，至少包含以下原因：

- 匿名 GET 当前仍为 200。
- GET 当前查询 `approved` 而不是 `visible`。
- 旧 POST 当前写入 `pending`。
- 旧信箱 POST 当前仍写库而不是 410。

若测试直接语法错误，先修测试，直到它因为缺少目标行为而失败。

- [ ] **Step 11：提交仅测试的 RED 检查点**

```powershell
git add workers/api/tests/legacy-chat-compat.test.ts workers/api/tests/api.test.ts
git commit -m "test: define legacy chat compatibility contracts"
```

---

## Task 2：抽取共享群聊创建服务

**Files:**

- Create: `workers/api/src/lib/groupChatCreate.ts`
- Modify: `workers/api/src/routes/groupChat.ts`
- Test: `workers/api/tests/legacy-chat-compat.test.ts`
- Existing regression: `workers/api/tests/group-chat.test.ts`

- [ ] **Step 1：创建服务类型和纯输入归一化**

在 `groupChatCreate.ts` 中定义本计划第 2 节指定的接口，并增加：

```ts
const ALLOWED_CARD_STYLES = ['paper', 'chalkboard', 'photoback', 'letter'] as const

function normalizeInput(input: CreateGroupChatMessageInput) {
  const content = typeof input.content === 'string' ? input.content.trim() : ''
  const clientNonce = typeof input.clientNonce === 'string' ? input.clientNonce.trim() : ''
  const replyToId = typeof input.replyToId === 'string' && input.replyToId ? input.replyToId : null
  const cardStyle = typeof input.cardStyle === 'string' && ALLOWED_CARD_STYLES.includes(input.cardStyle as any)
    ? input.cardStyle
    : 'paper'
  return { content, clientNonce, replyToId, cardStyle }
}
```

- [ ] **Step 2：移动限流时间计算函数**

把 `groupChat.ts` 现有 `retryAfterSeconds` 原样移到服务文件。不要改变公式和 SQLite Julian day 逻辑。

- [ ] **Step 3：移动创建算法，保持判断顺序**

服务内判断顺序必须固定：

1. `mustChangePassword` 返回 `403`。
2. 内容 1 至 500 字、nonce 1 至 128 字；失败返回 `400`。
3. 先查 `(author_slug, client_nonce)` 幂等记录；存在就返回 `ok: true, created: false`。
4. 查询有效禁言；存在返回 `403` 和治理原因。
5. 有引用 ID 时验证目标存在；不存在返回 `400`。
6. 查询 30 秒 6 条和 1 小时 60 条限制；超限返回 `429` 和 `retryAfter`。
7. 执行原子 `INSERT ... SELECT ... WHERE NOT EXISTS ... ON CONFLICT DO NOTHING`。
8. 按 `(author_slug, client_nonce)` 重新查询目标行。
9. 查不到时重新判断禁言和限流；如果均不成立才抛出内部错误。
10. 用 `formatGroupMessage` 返回新格式消息。

原子 INSERT 必须增加 `card_style` 列，但其余条件不得删除：

```sql
INSERT INTO public_messages (
  id, author_slug, author_name, content, card_style, status,
  reply_to_id, client_nonce, created_at, updated_at
)
SELECT ?, ?, ?, ?, ?, 'visible', ?, ?, ?, ?
WHERE NOT EXISTS (
  SELECT 1 FROM group_chat_mutes
  WHERE student_slug = ?
    AND (muted_until IS NULL OR julianday(muted_until) > julianday('now'))
)
AND (
  SELECT COUNT(*) FROM public_messages
  WHERE author_slug = ?
    AND status IN ('visible', 'recalled_by_author', 'recalled_by_admin')
    AND julianday(created_at) >= julianday('now', '-30 seconds')
) < 6
AND (
  SELECT COUNT(*) FROM public_messages
  WHERE author_slug = ?
    AND status IN ('visible', 'recalled_by_author', 'recalled_by_admin')
    AND julianday(created_at) >= julianday('now', '-1 hour')
) < 60
ON CONFLICT(author_slug, client_nonce) WHERE client_nonce IS NOT NULL DO NOTHING
```

- [ ] **Step 4：让新群聊 POST 只负责 HTTP 映射**

`groupChat.ts` POST 应缩减为：

```ts
groupChatRoutes.post('/group-chat/messages', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const input = await c.req.json().catch(() => null) as any
  const result = await createGroupChatMessage(c.env.DB, identity, input || {})
  if (!result.ok) {
    const headers = result.retryAfter ? { 'Retry-After': String(result.retryAfter) } : undefined
    return c.json({ success: false, message: result.message }, result.status, headers)
  }
  return c.json(
    { success: true, data: result.message },
    result.created ? 201 : 200,
  )
})
```

如果 TypeScript 对 Hono 的联合状态码或 headers 重载报错，只允许增加局部类型收窄，不得改成固定 200。

- [ ] **Step 5：运行新接口回归**

```powershell
pnpm --filter worker exec vitest run tests/group-chat.test.ts tests/legacy-chat-compat.test.ts
pnpm --filter worker exec tsc --noEmit
```

Expected:

- 原群聊测试全部通过。
- 兼容测试仍有旧 public/mailbox 相关失败，但“新群聊行为不变”测试通过。

- [ ] **Step 6：提交服务抽取**

```powershell
git add workers/api/src/lib/groupChatCreate.ts workers/api/src/routes/groupChat.ts
git commit -m "refactor: share group chat creation service"
```

---

## Task 3：实现旧公共留言兼容层

**Files:**

- Modify: `workers/api/src/routes/publicMessages.ts`
- Modify: `workers/api/src/index.ts`
- Test: `workers/api/tests/legacy-chat-compat.test.ts`

- [ ] **Step 1：增加旧状态映射函数**

使用第 1 节固定的 `legacyPublicStatus`。`formatPublicMessage` 的 `status` 必须来自该函数，不得直接返回数据库值。

- [ ] **Step 2：给旧公共 GET 加同学身份门控**

`GET /public-messages` 的第一行行为必须是：

```ts
const identity = await requireClassmate(c)
if (isClassmateResponse(identity)) return identity
```

查询固定为：

```sql
SELECT * FROM public_messages
WHERE status = 'visible'
ORDER BY pinned DESC, featured DESC, created_at DESC
LIMIT 20
```

不要返回 `pending`、`rejected`、`hidden` 或撤回消息。

- [ ] **Step 3：把旧 POST 接到共享服务**

旧 POST 仍先调用 `requireClassmate`。读取 JSON 失败时使用空对象。调用服务时固定生成旧入口 nonce：

```ts
const result = await createGroupChatMessage(c.env.DB, identity, {
  content: body?.content,
  cardStyle: body?.cardStyle,
  clientNonce: `legacy:${crypto.randomUUID()}`,
})
```

错误结果必须保留服务状态码和 `Retry-After`。成功响应固定保持旧形状和 HTTP 200：

```ts
return c.json({
  success: true,
  message: '留言已发布',
  data: {
    id: result.message.id,
    status: 'approved',
    content: result.message.content,
    cardStyle: result.cardStyle,
  },
})
```

不得在此文件复制群聊 INSERT SQL。

- [ ] **Step 4：修复旧 reaction 状态条件**

把 reaction UPDATE 和随后 SELECT 中的 `status = 'approved'` 都改为 `status = 'visible'`。保持旧 JSON 计数响应形状，不修改新 `group_chat_reactions` 表。

- [ ] **Step 5：保留历史审核但禁止恢复 approved**

管理员批准 SQL 固定为：

```sql
UPDATE public_messages
SET status = 'visible', reviewed_at = datetime('now'), updated_at = datetime('now')
WHERE id = ? AND status = 'pending'
```

`meta.changes !== 1` 时：

- ID 不存在返回 404。
- ID 存在但不是 `pending` 返回 409。
- 不创建 `content_reviews` 和通知。

只有更新成功后才能创建 review 和通知。

管理员筛选映射：

```ts
const databaseStatus = status === 'approved' ? 'visible' : status
```

取消隐藏必须写 `visible`，不得写 `approved`。

- [ ] **Step 6：移除公开缓存分类**

在 `workers/api/src/index.ts` 的 `PUBLIC_REVALIDATED_GET_PREFIXES` 中删除：

```ts
'/api/public-messages',
```

不得给门控后的接口添加 ETag。完成后该 GET 应走现有默认：

```text
Cache-Control: no-store, must-revalidate
```

- [ ] **Step 7：运行兼容测试**

```powershell
pnpm --filter worker exec vitest run tests/legacy-chat-compat.test.ts tests/group-chat.test.ts tests/api.test.ts
pnpm --filter worker exec tsc --noEmit
```

Expected:

- public GET、POST、reaction、历史审核测试通过。
- mailbox 410 测试仍失败，等待 Task 4。

- [ ] **Step 8：静态检查废弃状态写入**

```powershell
rg -n "status\s*=\s*'approved'|'approved'\)" workers/api/src/routes/publicMessages.ts
```

Expected: 只允许在响应映射或请求筛选映射中出现 `approved`；不得出现在 INSERT/UPDATE 的数据库目标值中。

- [ ] **Step 9：提交**

```powershell
git add workers/api/src/routes/publicMessages.ts workers/api/src/index.ts workers/api/tests/legacy-chat-compat.test.ts
git commit -m "feat: preserve legacy public message contracts"
```

---

## Task 4：冻结旧信箱写入并保留授权读取

**Files:**

- Modify: `workers/api/src/routes/mailbox.ts`
- Modify: `workers/api/tests/api.test.ts`
- Test: `workers/api/tests/legacy-chat-compat.test.ts`

- [ ] **Step 1：增加统一 410 handler**

在 `mailbox.ts` 中增加：

```ts
async function legacyMailboxWriteGone(c: any) {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  c.header('Deprecation', 'true')
  return c.json({
    success: false,
    message: '旧信箱写入接口已停用，请升级到同学私聊',
  }, 410)
}
```

身份验证必须保留，所以匿名写入仍返回 401；有效同学才得到 410。

- [ ] **Step 2：替换两个 POST handler**

替换为：

```ts
mailboxRoutes.post('/mailbox/threads', legacyMailboxWriteGone)
mailboxRoutes.post('/mailbox/threads/:id/messages', legacyMailboxWriteGone)
```

删除因此不再使用的 `id` helper。`trimText` 仍被 GET preview 使用，不得删除。

POST handler 中不得保留：

- `c.req.json()`
- `INSERT INTO mail_threads`
- `INSERT INTO mail_messages`
- `INSERT INTO mail_recipients`
- `UPDATE mail_threads`
- `UPDATE mail_recipients`

- [ ] **Step 3：保持三个 GET 原样**

除测试证明授权漏洞外，不重构三个 GET。详情 GET 更新旧 `read_at` 的行为明确保留，不把它误判为“写接口”。

- [ ] **Step 4：运行信箱兼容测试**

```powershell
pnpm --filter worker exec vitest run tests/legacy-chat-compat.test.ts tests/api.test.ts
```

Expected: 全部通过。

- [ ] **Step 5：静态确认旧写 SQL 已消失**

```powershell
rg -n "INSERT INTO mail_|UPDATE mail_threads|UPDATE mail_recipients SET read_at = NULL" workers/api/src/routes/mailbox.ts
```

Expected: 无输出。

允许详情 GET 的以下 SQL 继续存在：

```text
UPDATE mail_recipients SET read_at = COALESCE(...)
```

- [ ] **Step 6：提交**

```powershell
git add workers/api/src/routes/mailbox.ts workers/api/tests/api.test.ts workers/api/tests/legacy-chat-compat.test.ts
git commit -m "feat: make legacy mailbox APIs read only"
```

---

## Task 5：补齐迁移与通知同步事件核对

**Files:**

- Modify: `workers/api/tests/chat-migration.test.ts`
- Review only: `scripts/lib/chatMigration.ts`
- Review only: `scripts/migrate-chat-data.ts`
- Review only: `workers/api/migrations/0012_chat_rework.sql`
- Review only: `workers/api/migrations/0013_notification_sync_events.sql`

- [ ] **Step 1：为迁移通知增加同步事件断言**

在成功迁移管理员通知的测试中，取得通知 ID 后增加：

```ts
const syncEvents = await env.DB.prepare(
  'SELECT notification_id, recipient_slug FROM notification_sync_events WHERE notification_id = ?'
).bind(notif.id).all()

expect(syncEvents.results).toEqual([
  expect.objectContaining({
    notification_id: notif.id,
    recipient_slug: STUDENT_A,
  }),
])
```

- [ ] **Step 2：增加第二次迁移不重复通知事件断言**

在第二次执行迁移语句后：

```ts
const eventCount = await env.DB.prepare(
  'SELECT COUNT(*) AS count FROM notification_sync_events WHERE notification_id = ?'
).bind(notif.id).first() as any

expect(Number(eventCount.count)).toBe(1)
```

原因：迁移使用 `INSERT OR IGNORE`；忽略的通知不得触发 AFTER INSERT。

- [ ] **Step 3：运行迁移测试**

```powershell
pnpm --filter worker exec vitest run tests/chat-migration.test.ts
```

Expected: PASS。

- [ ] **Step 4：检查 SQL 单一来源**

```powershell
rg -n "legacyChatMigrationStatements" scripts workers/api
```

Expected:

- 定义只在 `scripts/lib/chatMigration.ts`。
- 测试和 runner 只导入它，不复制迁移 SQL。

- [ ] **Step 5：检查迁移 runner 目标选择**

```powershell
pnpm --filter worker exec vitest run tests/chat-migration.test.ts -t "selects exactly one explicit D1 target"
```

Expected:

- 无参数默认 `--local`。
- `--local`、`--remote` 各自可解析。
- 同时提供两者会抛错。

- [ ] **Step 6：应用本地结构迁移**

只允许 local：

```powershell
pnpm --filter worker exec wrangler d1 migrations apply alumni-book-db --local
```

Expected:

- `0012_chat_rework.sql` 和 `0013_notification_sync_events.sql` 均显示已应用或此前已应用。
- 无 SQL 错误。

若输出中出现 remote，立即停止。

- [ ] **Step 7：运行本地数据迁移演练**

```powershell
New-Item -ItemType Directory -Force .artifacts | Out-Null
pnpm migrate:chat-data -- --local 2>&1 | Tee-Object -FilePath .artifacts/local-chat-migration.txt
```

Expected:

- 进程退出码 0。
- 输出最后包含 JSON。
- `anomalies` 为 0。
- 空本地数据库允许所有源计数为 0。
- 非空数据库要求 `missingDirectConversations=0`、`missingDirectMessages=0`、`missingNotifications=0`，这些由 runner 内部断言保证。

`.artifacts/` 不得提交。

- [ ] **Step 8：再次运行本地数据迁移验证幂等**

```powershell
pnpm migrate:chat-data -- --local 2>&1 | Tee-Object -FilePath .artifacts/local-chat-migration-second-run.txt
```

Expected: 再次退出 0，计数不增长，`anomalies` 仍为 0。

- [ ] **Step 9：提交测试改动**

```powershell
git add workers/api/tests/chat-migration.test.ts
git commit -m "test: verify migrated notification sync events"
```

不要提交 `.artifacts/`。

---

## Task 6：编写旧接口兼容文档

**Files:**

- Create: `docs/api/legacy-chat-compatibility.md`

- [ ] **Step 1：写明兼容期限和数据来源**

文档必须明确：

- `public_messages` 是旧公共留言和新群聊的共同底表。
- 数据库存储状态为 `visible`，旧响应映射为 `approved`。
- `mail_*` 仅用于旧数据读取和迁移来源。
- 新私聊使用 `direct_conversations`、`direct_messages`。
- 管理员与系统消息使用 `notifications`。
- `notification_sync_events` 负责通知创建与已读变化的增量同步。

- [ ] **Step 2：写完整接口矩阵**

复制本计划第 1 节接口表，并增加每个接口的典型状态码：

```text
200 读取或兼容成功
201 新群聊接口首次创建成功
400 输入无效
401 缺少或无效同学会话
403 首次密码未改、禁言或无权访问
404 目标不存在
409 历史内容状态冲突
410 旧信箱写接口已停用
429 群聊发送过于频繁
```

- [ ] **Step 3：写删除条件**

旧兼容路由只有满足以下全部条件后才能删除：

1. 公开站点不再引用 `/api/public-messages` 和 `/api/mailbox/*`。
2. 生产迁移报告无异常。
3. 至少一个完整发布周期没有旧写入请求。
4. 管理后台已迁移历史 pending/rejected 审核入口。
5. 删除操作另立计划并重新走测试优先流程。

- [ ] **Step 4：检查文档没有错误承诺**

```powershell
rg -n "WebSocket|图片私聊|已读回执|已经部署|生产已迁移" docs/api/legacy-chat-compatibility.md
```

Expected: 无输出。第一阶段没有这些能力，也尚未生产部署。

- [ ] **Step 5：提交文档**

```powershell
git add docs/api/legacy-chat-compatibility.md
git commit -m "docs: document legacy chat compatibility"
```

---

## Task 7：执行后端质量门禁并写验收报告

**Files:**

- Create: `docs/phase-14-backend-compatibility-acceptance-report.md`

- [ ] **Step 1：运行定向测试**

```powershell
pnpm --filter worker exec vitest run tests/legacy-chat-compat.test.ts tests/group-chat.test.ts tests/direct-conversations.test.ts tests/inbox-sync.test.ts tests/chat-migration.test.ts tests/api.test.ts
```

Expected: 所有指定文件通过。

- [ ] **Step 2：运行 TypeScript 检查**

```powershell
pnpm --filter worker exec tsc --noEmit
```

Expected: 退出码 0，无诊断。

- [ ] **Step 3：运行 Worker 全量测试**

```powershell
pnpm verify:worker
```

Expected:

- 所有 Worker 测试通过。
- 测试文件不少于 12 个。
- 测试数量不少于 121 项。
- 无未处理 Promise、D1 batch 警告、Worker 500 或控制台错误。

- [ ] **Step 4：运行差异检查**

```powershell
git diff --check
git status --short
git diff --name-only 556f5b3..HEAD
```

Expected:

- `git diff --check` 无错误。
- 工作树干净。
- 改动文件全部位于本计划允许范围。
- 输出不得包含 `packages/site-astro/` 或 `packages/admin/`。

- [ ] **Step 5：检查没有新 approved 数据写入**

```powershell
rg -n "SET status = 'approved'|VALUES \([^\n]*'approved'|status,?\s*\).*approved" workers/api/src scripts
```

Expected: 无数据库写入匹配。响应映射字符串可以存在。

- [ ] **Step 6：检查旧信箱写入已冻结**

```powershell
rg -n "mailboxRoutes\.post" workers/api/src/routes/mailbox.ts
rg -n "INSERT INTO mail_|UPDATE mail_threads" workers/api/src/routes/mailbox.ts
```

Expected:

- 第一条恰好两行，均指向 `legacyMailboxWriteGone`。
- 第二条无输出。

- [ ] **Step 7：写验收报告**

报告必须包含以下实际内容，不得使用“待填写”“稍后补充”或虚构结果：

```markdown
# Phase 14 后端兼容与迁移准备验收报告

## 基线
- 分支：实际分支
- 起始提交：556f5b3
- 最终提交：git rev-parse HEAD 的完整值
- 验收时间：实际 ISO 时间

## 实施范围
- 共享群聊创建服务
- 旧公共留言兼容
- 旧信箱只读兼容
- 本地迁移与通知同步事件核对

## 自动化结果
- 定向 Vitest：实际文件数、测试数、结果
- Worker 全量：实际文件数、测试数、结果
- TypeScript：实际结果
- git diff --check：实际结果

## 本地迁移演练
- 第一次报告：抄录实际 JSON
- 第二次报告：抄录实际 JSON
- anomalies：实际值
- 幂等结论：根据两次实际计数填写

## 安全边界
- 未运行 --remote
- 未部署 Worker
- 未部署 Pages
- 未修改 site/admin 前端

## 暂缓内容
- 公开站点前端客户端
- 纸质导航和班级空间布局
- 群聊前端完整交互
- 桌面和手机信箱界面
- 后台群聊治理与通知中心界面
- 视觉 QA、截图和生产发布
```

- [ ] **Step 8：提交验收报告**

```powershell
git add docs/phase-14-backend-compatibility-acceptance-report.md
git commit -m "docs: record backend compatibility acceptance"
```

---

## Task 8：最终复审和停止点

**Files:** 无新增业务文件。

- [ ] **Step 1：规格复审**

逐项对照本计划第 0.4 节。任何一项没有对应测试证据，都不能判定完成。

- [ ] **Step 2：代码质量复审**

重点检查：

- 共享创建服务没有丢失原群聊限流、禁言和幂等条件。
- 旧接口没有复制创建 SQL。
- 旧接口响应映射没有污染数据库状态。
- 410 handler 不读取 body，不写旧表。
- 管理历史批准只处理 `pending`，重复操作不会重复通知。
- migration runner 没有执行 remote。

- [ ] **Step 3：检查提交粒度**

```powershell
git log --oneline 556f5b3..HEAD
```

Expected: 至少包含以下职责清晰的提交，顺序可以因修复提交略有增加：

```text
test: define legacy chat compatibility contracts
refactor: share group chat creation service
feat: preserve legacy public message contracts
feat: make legacy mailbox APIs read only
test: verify migrated notification sync events
docs: document legacy chat compatibility
docs: record backend compatibility acceptance
```

- [ ] **Step 4：最终状态检查**

```powershell
git status --short
pnpm verify:worker
```

Expected: 工作树干净，Worker 全绿。

- [ ] **Step 5：在此停止**

完成本步骤后必须停止，不得继续以下操作：

- 不实现任何前端任务。
- 不修改站点或后台界面。
- 不运行生产迁移。
- 不部署 Worker 或 Pages。
- 不推送到远程。

最终只向上级模型或用户返回：

1. 最终提交 SHA。
2. 每个提交的一行说明。
3. Worker 测试实际文件数和测试数。
4. 本地两次迁移报告摘要。
5. 验收报告路径。
6. 明确声明生产部署仍被前端与视觉阶段阻塞。

---

## 3. 暂缓任务清单

以下内容不属于本计划，执行模型不得处理：

- Task 9：公开站点 API 客户端和可见性轮询器。
- Task 10：纸质档案导航和动画生命周期。
- Task 11：群聊消息舞台。
- Task 12：引用、回应、撤回、我的记录等前端交互。
- Task 13：班级空间相册、横向时间轴和三视口布局。
- Task 14：桌面会话式信箱界面。
- Task 15：手机信箱、URL 状态和响应式布局。
- Task 16：管理后台群聊治理和通知中心界面。
- Task 17 中的站点 Playwright、视觉截图、CLS 和前端性能门禁。
- Task 18 的生产迁移、Worker 部署、Pages 部署和生产视觉冒烟。

这些任务必须等待具备前端和视觉能力的模型另行制定计划。

---

## 4. 弱模型常见错误防护表

| 错误做法 | 正确做法 |
|---|---|
| 继续把旧 POST 写成 pending | 调共享创建服务，数据库写 visible |
| 为兼容旧类型把数据库写回 approved | 只在响应格式化时映射 approved |
| 复制一份群聊 INSERT 到 publicMessages.ts | 抽取并调用 groupChatCreate.ts |
| 先删 mail_* 表 | 保留旧数据读取和迁移来源 |
| 410 前先 `c.req.json()` | 身份校验后直接返回 410 |
| 用旧 POST 创建测试线程 | 测试直接 SQL 种入旧数据 |
| 看到 GET 更新 read_at 就删除 | 明确保留旧详情读取标记已读行为 |
| 为通过测试降低断言或跳过文件 | 修实现，保持断言 |
| 修改 site/admin 解决 Worker 测试 | 禁止；这说明实现越界 |
| 运行 remote 验证 | 只允许 local，生产由人工解锁 |
| 说“测试通过”但不记录数量 | 报告实际文件数、测试数和命令 |
| 遇到用户改动直接覆盖 | 停止并报告，不 revert |

---

## 5. 最终后端交付检查表

- [ ] `556f5b3` 是当前 HEAD 祖先。
- [ ] 没有修改 `packages/site-astro/**`。
- [ ] 没有修改 `packages/admin/**`。
- [ ] 新旧群聊 POST 共用一个创建服务。
- [ ] 旧公共 GET 需要同学 Session。
- [ ] 旧 public 响应 `visible -> approved`。
- [ ] 数据库没有新增 `approved` 状态。
- [ ] 历史 pending/rejected 管理仍可用。
- [ ] 旧 reaction 可以操作 visible。
- [ ] 两个旧信箱 POST 固定 410。
- [ ] 旧信箱 GET 授权隔离通过。
- [ ] 旧 POST 不再写 mail_*。
- [ ] 迁移通知拥有 notification_sync_events。
- [ ] 迁移连续执行两次保持幂等。
- [ ] 本地迁移 anomalies 为 0。
- [ ] TypeScript 检查通过。
- [ ] Worker 全量测试通过。
- [ ] git diff --check 通过。
- [ ] 工作树干净。
- [ ] 验收报告记录实际结果。
- [ ] 没有运行 remote、deploy 或 push。
- [ ] 已在后端发布准备节点停止。
