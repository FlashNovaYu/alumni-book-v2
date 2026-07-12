# 班级空间聊天返工实施计划

> **面向智能体执行者：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，严格按任务顺序实施并更新复选框。

**目标：** 将现有公共留言和主题邮件重构为可治理的公共群聊、固定双人私聊和独立通知流，同时完成纸质档案导航及班级空间的桌面/手机响应式返工。

**架构：** Worker 继续使用 Hono、D1 和现有同学 Session，在兼容旧表的基础上增加群聊状态、规范化回应、固定双人会话和增量同步接口。Astro 站点使用 Vue islands 管理群聊与信箱状态，导航由单一浏览器运行时控制；管理后台只增加群聊治理和通知发送所需能力。数据库结构迁移、旧数据归并和前端切换按可回滚顺序执行。

**技术栈：** Astro 5、Vue 3、TypeScript、Hono、Cloudflare Workers、D1/SQLite、Vitest、Playwright、pnpm workspace、Lucide Vue。

---

## 执行基线

- 设计规格：`docs/superpowers/specs/2026-07-10-class-space-chat-rework-design.md`
- 计划编写基线：提交 `5659c01`
- 每个任务开始前运行 `git status --short`，不得覆盖其他智能体或用户的未提交修改。
- 每个任务只提交该任务列出的文件；测试失败时先定位根因，不跳过测试或降低断言。
- 数据迁移任务必须先在本地 D1 和测试夹具运行，生产迁移只在 Task 18 执行。

## 文件职责映射

### Worker 与数据

- `workers/api/migrations/0012_chat_rework.sql`：只创建新字段、表和索引，不执行不可逆旧数据删除。
- `workers/api/src/lib/cursor.ts`：统一编码和解析群聊、私聊的复合游标。
- `workers/api/src/lib/groupChat.ts`：群聊查询、格式化、禁言检查、回应聚合和发送限流。
- `workers/api/src/lib/adminGuard.ts`：管理员 JWT 与 `admin_sessions` 的共享校验。
- `workers/api/src/routes/groupChat.ts`：同学侧群聊读写、同步、撤回和回应接口。
- `workers/api/src/routes/directConversations.ts`：固定双人会话、消息、未读和已读接口。
- `workers/api/src/routes/adminCommunity.ts`：群聊隐藏、恢复、撤回、禁言及通知发送接口。
- `workers/api/src/routes/inbox.ts`：统一未读摘要和信箱增量同步。
- `scripts/lib/chatMigration.ts`：旧邮件归并 SQL、验证查询与报告类型。
- `scripts/migrate-chat-data.ts`：调用 Wrangler 执行幂等迁移并输出核对报告。

### 共享类型与公开站点

- `packages/shared/src/types.ts`：群聊、私聊、通知、游标与概览契约的唯一类型来源。
- `packages/site-astro/src/api/groupChat.ts`：群聊 API 客户端。
- `packages/site-astro/src/api/inbox.ts`：私聊、通知和信箱同步 API 客户端。
- `packages/site-astro/src/composables/useVisibilityPolling.ts`：页面可见性、联网状态、退避和销毁清理。
- `packages/site-astro/src/composables/useGroupChat.ts`：消息合并、乐观发送、重试、引用、回应与同步。
- `packages/site-astro/src/composables/useInbox.ts`：会话列表、通知、当前详情、未读和增量同步。
- `packages/site-astro/src/scripts/navRuntime.ts`：导航菜单、活动墨线、抽屉和未读轮询的单例运行时。
- `packages/site-astro/src/components/GroupChat*.vue`：群聊舞台及其小型组件。
- `packages/site-astro/src/components/DirectConversation*.vue`、`Notification*.vue`：信箱两种内容视图。

### 管理后台

- `packages/admin/src/api/community.ts`：群聊治理和通知发送 API 客户端。
- `packages/admin/src/views/MessagesView.vue`：公共群聊与历史投稿管理。
- `packages/admin/src/views/MailView.vue`：改造为通知中心。

### 自动化

- `workers/api/tests/chat-schema.test.ts`：D1 结构契约。
- `workers/api/tests/chat-migration.test.ts`：旧数据归并与幂等性。
- `workers/api/tests/group-chat.test.ts`：群聊读写、同步、回应、撤回和禁言。
- `workers/api/tests/direct-conversations.test.ts`：固定双人会话和未读。
- `workers/api/tests/inbox-sync.test.ts`：通知、摘要和增量同步。
- `packages/site-astro/tests/chat-rework-static.test.ts`：组件边界、基础路径和生命周期静态约束。
- `packages/site-astro/tests/chat-rework-flow.spec.ts`：班级空间群聊流程。
- `packages/site-astro/tests/mailbox-chat-flow.spec.ts`：私聊和通知流程。
- `packages/site-astro/tests/chat-rework-visual.spec.ts`：三种视口截图、溢出和稳定尺寸。

---

### Task 1：建立聊天数据库结构与共享类型

**文件：**

- Create: `workers/api/migrations/0012_chat_rework.sql`
- Create: `workers/api/tests/chat-schema.test.ts`
- Modify: `workers/api/src/db/schema.sql`
- Modify: `workers/api/tests/db-helper.ts`
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1：编写失败的数据库结构测试**

在 `chat-schema.test.ts` 查询 `PRAGMA table_info` 和 `sqlite_master`，明确断言：

```ts
const publicColumns = await env.DB.prepare('PRAGMA table_info(public_messages)').all()
expect(publicColumns.results.map((row: any) => row.name)).toEqual(expect.arrayContaining([
  'reply_to_id', 'client_nonce', 'recalled_by_type', 'recalled_at', 'moderation_reason'
]))

for (const table of ['group_chat_reactions', 'group_chat_mutes', 'direct_conversations', 'direct_messages']) {
  const row = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).bind(table).first()
  expect(row?.name).toBe(table)
}
```

- [ ] **Step 2：运行测试并确认失败**

Run: `pnpm --filter worker exec vitest run tests/chat-schema.test.ts`

Expected: FAIL，缺少 `reply_to_id` 或新表不存在。

- [ ] **Step 3：创建 0012 migration**

迁移必须包含规格中的五个 `public_messages` 字段、幂等 nonce 索引、`group_chat_reactions`、`group_chat_mutes`、`direct_conversations`、`direct_messages` 及以下索引：

```sql
CREATE INDEX IF NOT EXISTS idx_group_chat_updated
  ON public_messages(updated_at, id);
CREATE INDEX IF NOT EXISTS idx_direct_conversation_a
  ON direct_conversations(participant_a_slug, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_conversation_b
  ON direct_conversations(participant_b_slug, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_history
  ON direct_messages(conversation_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_unread
  ON direct_messages(recipient_slug, read_at, created_at DESC);
```

该 migration 只把 `status='approved'` 更新为 `status='visible'`，不得删除 `pending`、`rejected`、旧邮件表或旧回应 JSON。

- [ ] **Step 4：同步 schema 和测试迁移夹具**

把 0012 的最终结构同步到 `schema.sql` 和 `db-helper.ts` 的 `testMigrations`。测试夹具中的 0011 保持原样，新增独立 `0012_chat_rework` 项，确保测试模拟真实迁移顺序。

- [ ] **Step 5：增加共享类型**

在 `types.ts` 增加并导出以下契约；旧 `PublicMessage` 和 `MailboxThread` 暂时保留供兼容代码编译：

```ts
export type GroupChatStatus =
  | 'visible'
  | 'hidden'
  | 'recalled_by_author'
  | 'recalled_by_admin'
  | 'pending'
  | 'rejected'

export interface GroupChatMessage {
  id: string
  author: ClassmateSessionStudent
  content: string | null
  status: GroupChatStatus
  replyTo: { id: string; authorName: string; preview: string } | null
  reactionCounts: Record<string, number>
  myReaction: string | null
  canRecall: boolean
  moderationReason?: string | null
  createdAt: string
  updatedAt: string
}

export interface DirectConversation {
  id: string
  peer: ClassmateSessionStudent
  lastMessage: Pick<DirectMessage, 'id' | 'senderSlug' | 'body' | 'createdAt'> | null
  unreadCount: number
  updatedAt: string
}

export interface DirectMessage {
  id: string
  conversationId: string
  senderSlug: string
  recipientSlug: string
  body: string
  createdAt: string
}
```

把 `InboxSummary` 改为 `directUnread`、`notificationUnread`、`totalUnread`；兼容期增加可选 `mailUnread?: number`，不得继续在新代码读取它。

- [ ] **Step 6：运行结构、Worker 和共享类型检查**

Run: `pnpm --filter worker exec vitest run tests/chat-schema.test.ts`

Expected: PASS。

Run: `pnpm --filter @alumni/shared typecheck`

Expected: PASS。

- [ ] **Step 7：提交**

```bash
git add workers/api/migrations/0012_chat_rework.sql workers/api/src/db/schema.sql workers/api/tests/db-helper.ts workers/api/tests/chat-schema.test.ts packages/shared/src/types.ts
git commit -m "feat: add chat rework schema"
```

---

### Task 2：实现统一游标与群聊核心读写

**文件：**

- Create: `workers/api/src/lib/cursor.ts`
- Create: `workers/api/src/lib/groupChat.ts`
- Create: `workers/api/src/routes/groupChat.ts`
- Create: `workers/api/tests/group-chat.test.ts`
- Modify: `workers/api/src/index.ts`

- [ ] **Step 1：编写群聊核心失败测试**

覆盖未登录 401、创建消息、nonce 幂等、最新 30 条升序、向前游标、本人记录和跨账号不可见的历史投稿：

```ts
it('returns the same message for a repeated client nonce', async () => {
  const payload = { content: '毕业快乐', clientNonce: 'nonce-group-1' }
  const first = await classmateJson('/api/group-chat/messages', tokenA, 'POST', payload)
  const second = await classmateJson('/api/group-chat/messages', tokenA, 'POST', payload)
  expect(first.status).toBe(201)
  expect(second.status).toBe(200)
  expect(second.body.data.id).toBe(first.body.data.id)
})
```

`classmateJson` 作为测试内 helper，始终附加 `X-Classmate-Token` 和 JSON 头。

- [ ] **Step 2：运行测试并确认 404**

Run: `pnpm --filter worker exec vitest run tests/group-chat.test.ts`

Expected: FAIL，`/api/group-chat/messages` 返回 404。

- [ ] **Step 3：实现复合游标**

`cursor.ts` 只接受服务端格式：

```ts
export interface CursorValue { timestamp: string; id: string }
export function encodeCursor(value: CursorValue): string
export function decodeCursor(raw: string | undefined): CursorValue | null
```

使用 UTF-8 JSON 与 base64url；缺字段、无效 JSON、空 ID 或超过 512 字符时返回 `null`。路由收到非空但无效游标时返回 400。

- [ ] **Step 4：实现群聊格式化服务**

`groupChat.ts` 暴露固定边界：

```ts
export const GROUP_REACTIONS = ['❤️', '👍', '😂', '🎉'] as const
export async function listGroupMessages(db: D1Database, viewerSlug: string, options: {
  before?: CursorValue | null
  updatedAfter?: CursorValue | null
  limit: number
}): Promise<GroupChatMessage[]>
export async function formatGroupMessage(db: D1Database, row: any, viewerSlug: string): Promise<GroupChatMessage>
export async function getActiveMute(db: D1Database, slug: string): Promise<{ reason: string; mutedUntil: string | null } | null>
```

`formatGroupMessage` 对隐藏消息只允许作者在 `/mine` 响应看到正文；公开列表不返回 hidden。撤回状态返回 `content: null`，引用目标不可用时只返回固定预览“原消息不可用”。

回应计数必须把旧 `public_messages.reactions` JSON 作为历史基数，再叠加 `group_chat_reactions` 聚合；`myReaction` 只来自规范化回应表。

- [ ] **Step 5：实现路由核心接口**

实现：

```text
GET  /group-chat/messages
GET  /group-chat/mine
POST /group-chat/messages
```

POST 校验 1-500 字、`mustChangePassword`、`clientNonce`、引用目标和 30 秒/1 小时限流。创建时间由 Worker 写入 ISO 毫秒字符串。重复 nonce 查询并返回原消息，不依赖捕获唯一索引异常。

- [ ] **Step 6：注册路由并运行测试**

在 `index.ts` 导入并注册：

```ts
import { groupChatRoutes } from './routes/groupChat'
app.route('/api', groupChatRoutes)
```

Run: `pnpm --filter worker exec vitest run tests/group-chat.test.ts`

Expected: PASS，且最新列表按 `createdAt` 升序。

- [ ] **Step 7：提交**

```bash
git add workers/api/src/lib/cursor.ts workers/api/src/lib/groupChat.ts workers/api/src/routes/groupChat.ts workers/api/src/index.ts workers/api/tests/group-chat.test.ts
git commit -m "feat: add group chat core API"
```

---

### Task 3：补齐群聊回应、撤回、增量同步与禁言校验

**文件：**

- Modify: `workers/api/src/lib/groupChat.ts`
- Modify: `workers/api/src/routes/groupChat.ts`
- Modify: `workers/api/tests/group-chat.test.ts`

- [ ] **Step 1：增加失败测试**

新增以下行为断言：

```ts
expect((await react(messageId, tokenB, '👍')).body.data.myReaction).toBe('👍')
expect((await react(messageId, tokenB, '👍')).body.data.myReaction).toBeNull()
expect((await react(messageId, tokenB, '😂')).body.data.reactionCounts['😂']).toBe(1)
```

同时覆盖：回应更新父消息 `updated_at`、`sync` 返回旧消息变化、作者 2 分钟内撤回成功、超时返回 403、非作者返回 404、禁言返回 403 与原因、每 30 秒第 7 条消息返回 429。

- [ ] **Step 2：确认测试失败**

Run: `pnpm --filter worker exec vitest run tests/group-chat.test.ts`

Expected: FAIL，回应或同步接口返回 404。

- [ ] **Step 3：实现回应切换**

实现 `PUT /group-chat/messages/:id/reaction`：同回应删除，不同回应替换；只允许四种固定回应；在同一 `DB.batch` 中更新回应表和父消息 `updated_at`。响应返回最新 `reactionCounts` 与 `myReaction`。

- [ ] **Step 4：实现作者撤回**

实现 `DELETE /group-chat/messages/:id`，SQL 必须同时限制作者、`status='visible'` 和 `created_at >= 2 分钟前`。成功写入 `recalled_by_author`、`recalled_by_type='student'`、`recalled_at` 与 `updated_at`。

- [ ] **Step 5：实现增量同步**

实现 `GET /group-chat/sync?cursor=`，返回：

```ts
interface GroupChatSyncResult {
  cursor: string
  items: GroupChatMessage[]
  mute: { reason: string; mutedUntil: string | null } | null
}
```

查询条件使用 `(updated_at > ? OR (updated_at = ? AND id > ?))`；响应游标取本次查询开始时刻和稳定 ID边界，确保请求期间写入进入下一轮。同步响应必须包含 `status='hidden', content=null` 的变化项，让其他客户端删除刚被隐藏的消息；公开历史列表仍排除 hidden。

- [ ] **Step 6：实现禁言与限流校验**

POST 消息先查询重复 nonce，再调用 `getActiveMute` 和限流，保证网络重试不会被限流误伤。过期禁言记录先删除再继续；有效禁言返回 403。限流分别查询最近 30 秒和最近 1 小时当前作者的 `visible`/撤回消息，返回 429 并设置 `Retry-After`。

- [ ] **Step 7：运行测试并提交**

Run: `pnpm --filter worker exec vitest run tests/group-chat.test.ts`

Expected: PASS。

```bash
git add workers/api/src/lib/groupChat.ts workers/api/src/routes/groupChat.ts workers/api/tests/group-chat.test.ts
git commit -m "feat: complete group chat interactions"
```

---

### Task 4：实现管理员群聊治理与通知服务

**文件：**

- Create: `workers/api/src/lib/adminGuard.ts`
- Create: `workers/api/src/routes/adminCommunity.ts`
- Create: `workers/api/tests/admin-community.test.ts`
- Modify: `workers/api/src/lib/notificationService.ts`
- Modify: `workers/api/src/routes/adminMail.ts`
- Modify: `workers/api/src/index.ts`

- [ ] **Step 1：编写治理失败测试**

覆盖无 JWT 401、无有效 `admin_sessions` 401、原因空白 400、隐藏/恢复、管理员撤回、限时/永久禁言、解除禁言和通知只生成一次：

```ts
const hidden = await adminJson(`/api/admin/group-chat/messages/${messageId}/hide`, {
  hidden: true,
  reason: '包含不适合公开的个人信息'
})
expect(hidden.status).toBe(200)
expect(await notificationCount('group_chat_hidden', messageId)).toBe(1)
```

- [ ] **Step 2：确认测试失败**

Run: `pnpm --filter worker exec vitest run tests/admin-community.test.ts`

Expected: FAIL，管理接口返回 404。

- [ ] **Step 3：抽取共享管理员守卫**

`adminGuard.ts` 导出 Hono middleware：

```ts
export const adminGuard: MiddlewareHandler<{ Bindings: AdminBindings }>
```

它验证 Bearer JWT、签名、过期时间和 `admin_sessions`。把 `adminMail.ts` 的重复守卫替换为此函数，行为和状态码保持不变。

- [ ] **Step 4：扩展幂等通知创建**

给 `CreateNotificationInput` 增加可选 `id`，提供 ID时使用 `INSERT OR IGNORE` 并返回该 ID；不提供时保持现有随机 ID行为。治理路由在写处理记录前比较当前状态，相同隐藏状态、相同禁言原因和期限直接返回现状。不可逆撤回使用稳定通知 ID `ntf_group_recall_<messageId>`，不得通过吞掉所有数据库异常实现幂等。

- [ ] **Step 5：实现管理接口**

实现：

```text
GET    /admin/group-chat/messages?status=
PUT    /admin/group-chat/messages/:id/hide
POST   /admin/group-chat/messages/:id/recall
PUT    /admin/group-chat/mutes/:slug
DELETE /admin/group-chat/mutes/:slug
```

隐藏可恢复；管理员撤回不可恢复。每个处理动作写 `content_reviews`，处理通知包含原因和解除时间。解除禁言也发送 `group_chat_unmuted`。

- [ ] **Step 6：注册路由、运行回归并提交**

Run: `pnpm --filter worker exec vitest run tests/admin-community.test.ts tests/group-chat.test.ts`

Expected: PASS。

```bash
git add workers/api/src/lib/adminGuard.ts workers/api/src/lib/notificationService.ts workers/api/src/routes/adminCommunity.ts workers/api/src/routes/adminMail.ts workers/api/src/index.ts workers/api/tests/admin-community.test.ts
git commit -m "feat: add group chat moderation"
```

---

### Task 5：实现固定双人私聊 API

**文件：**

- Create: `workers/api/src/routes/directConversations.ts`
- Create: `workers/api/tests/direct-conversations.test.ts`
- Modify: `workers/api/src/index.ts`

- [ ] **Step 1：编写双人会话失败测试**

测试创建首条消息、同一对账号复用同一会话、双方列表都可见、第三人 404、回复未读、按最后展示消息已读、nonce 幂等和历史分页：

```ts
const fromA = await startConversation(tokenA, 'student-b', '周末见', 'direct-a-1')
const fromB = await startConversation(tokenB, 'student-a', '收到', 'direct-b-1')
expect(fromB.body.data.conversation.id).toBe(fromA.body.data.conversation.id)
expect((await listConversations(tokenA)).body.data.items).toHaveLength(1)
expect((await listConversations(tokenB)).body.data.items).toHaveLength(1)
```

- [ ] **Step 2：运行并确认 404**

Run: `pnpm --filter worker exec vitest run tests/direct-conversations.test.ts`

Expected: FAIL。

- [ ] **Step 3：实现参与者与会话查询 helper**

在路由文件内保持三个小函数：

```ts
function orderedPair(a: string, b: string): [string, string]
async function requireParticipant(db: D1Database, conversationId: string, slug: string): Promise<any | null>
async function formatConversation(db: D1Database, row: any, viewerSlug: string): Promise<DirectConversation>
```

所有详情接口使用 `participant_a_slug = ? OR participant_b_slug = ?` SQL 约束；非参与者统一 404。

- [ ] **Step 4：实现列表和首条消息事务**

实现：

```text
GET  /direct-conversations
POST /direct-conversations
```

POST 接收 `recipientSlug/body/clientNonce`，校验不能给自己和账号未锁定。按 slug 排序查询唯一会话；不存在时与首条消息在一个 `DB.batch` 创建。重复 nonce 返回已有消息。

正文 trim 后必须为 1-2000 字；返回模型不包含 `read_at`，避免形成对发送者可见的已读回执。

- [ ] **Step 5：实现历史、回复和已读**

实现：

```text
GET  /direct-conversations/:id/messages
POST /direct-conversations/:id/messages
PUT  /direct-conversations/:id/read
```

已读请求体固定为 `{ throughMessageId: string }`；只更新 `recipient_slug=当前账号` 且排序不晚于目标消息的记录。接口不得向发送者返回 `read_at`。

- [ ] **Step 6：注册路由并验证**

Run: `pnpm --filter worker exec vitest run tests/direct-conversations.test.ts`

Expected: PASS。

- [ ] **Step 7：提交**

```bash
git add workers/api/src/routes/directConversations.ts workers/api/src/index.ts workers/api/tests/direct-conversations.test.ts
git commit -m "feat: add direct conversations API"
```

---

### Task 6：实现统一信箱同步、未读和管理员通知

**文件：**

- Create: `workers/api/tests/inbox-sync.test.ts`
- Modify: `workers/api/src/routes/inbox.ts`
- Modify: `workers/api/src/routes/adminCommunity.ts`
- Modify: `workers/api/src/routes/adminMail.ts`
- Modify: `workers/api/src/routes/notifications.ts`

- [ ] **Step 1：编写信箱失败测试**

断言摘要改为 `directUnread`，同步同时返回新私聊、新通知、变化会话和新游标：

```ts
expect(summary.body.data).toEqual({
  directUnread: 1,
  notificationUnread: 2,
  totalUnread: 3,
})
expect(sync.body.data).toEqual(expect.objectContaining({
  cursor: expect.any(String),
  conversations: expect.any(Array),
  messages: expect.any(Array),
  notifications: expect.any(Array),
  unread: expect.any(Object),
}))
```

另外测试旧 `/admin/mail/send` 不再新增 `mail_threads`，而是新增 `admin_notice`。

- [ ] **Step 2：确认测试失败**

Run: `pnpm --filter worker exec vitest run tests/inbox-sync.test.ts`

Expected: FAIL，摘要仍返回 `mailUnread` 或 sync 404。

- [ ] **Step 3：改造摘要和同步**

`GET /inbox/summary` 统计 `direct_messages.recipient_slug = 当前账号 AND read_at IS NULL` 与通知未读。`GET /inbox/sync` 使用一个不透明复合游标返回查询开始时刻之前的变化，并限制单次最多 100 条私聊和 50 条通知。

- [ ] **Step 4：实现管理员通知接口**

在 `adminCommunity.ts` 实现：

```text
POST /admin/notifications/send
POST /admin/notifications/broadcast
GET  /admin/notifications/history
```

正文限制 2000 字、标题 80 字；广播只选择未锁定账号。同一次单发或广播生成共享 `relatedId`，通知使用 `relatedType='admin_notice'`，历史按 relatedId 聚合并返回标题、时间、接收数与已读数。

- [ ] **Step 5：兼容旧管理员发信接口**

`adminMail.ts` 的 send/broadcast 调用同一个通知 service，不再写 `mail_threads`。旧查询接口继续只读旧数据，响应头增加 `Deprecation: true`。

- [ ] **Step 6：运行 Worker 相关测试并提交**

Run: `pnpm --filter worker exec vitest run tests/inbox-sync.test.ts tests/direct-conversations.test.ts tests/class-space-inbox.test.ts`

Expected: 新测试 PASS；更新 `class-space-inbox.test.ts` 的旧摘要断言后全部 PASS。

```bash
git add workers/api/src/routes/inbox.ts workers/api/src/routes/adminCommunity.ts workers/api/src/routes/adminMail.ts workers/api/src/routes/notifications.ts workers/api/tests/inbox-sync.test.ts workers/api/tests/class-space-inbox.test.ts
git commit -m "feat: unify inbox sync and notifications"
```

---

### Task 7：实现旧数据归并脚本与兼容接口

**文件：**

- Create: `scripts/lib/chatMigration.ts`
- Create: `scripts/migrate-chat-data.ts`
- Create: `workers/api/tests/chat-migration.test.ts`
- Modify: `workers/api/src/routes/publicMessages.ts`
- Modify: `workers/api/src/routes/mailbox.ts`
- Modify: `package.json`

- [ ] **Step 1：编写迁移失败测试**

种入同一对同学的两个旧 private 线程、四条双向消息、一个管理员线程和一条待审核公共投稿。执行迁移语句两次后断言：

```ts
expect(await scalar('SELECT COUNT(*) FROM direct_conversations')).toBe(1)
expect(await scalar('SELECT COUNT(*) FROM direct_messages')).toBe(4)
expect(await scalar("SELECT COUNT(*) FROM notifications WHERE type = 'admin_notice'")).toBe(1)
expect(await scalar("SELECT COUNT(*) FROM public_messages WHERE status = 'pending'")).toBe(1)
```

同时断言四条消息按原时间顺序、`client_nonce='legacy:<原消息 ID>'`，第二次执行数量不变。

- [ ] **Step 2：运行并确认失败**

Run: `pnpm --filter worker exec vitest run tests/chat-migration.test.ts`

Expected: FAIL，迁移模块不存在。

- [ ] **Step 3：实现迁移语句单一来源**

`scripts/lib/chatMigration.ts` 导出：

```ts
export const legacyChatMigrationStatements: string[]
export interface ChatMigrationReport {
  sourcePrivateThreads: number
  sourcePrivateMessages: number
  directConversations: number
  directMessages: number
  migratedNotifications: number
  anomalies: number
}
export function assertChatMigrationReport(report: ChatMigrationReport): void
```

SQL 使用排序后的 slug 生成稳定会话 ID；管理员/系统线程按收件人生成稳定通知 ID；通知正文按 `created_at, id` 拼接带发送者标签的完整历史。任何缺少创建者、收件人或发送者的学生私信计入 anomalies，不静默丢弃。

- [ ] **Step 4：实现 Wrangler 执行脚本**

`migrate-chat-data.ts` 支持 `--local` 和 `--remote`，默认 local。流程固定为：迁移前查询源计数、把语句写到临时 SQL、调用 `wrangler d1 execute`、执行验证查询、打印 JSON 报告、调用 `assertChatMigrationReport`。异常数非零或消息计数不一致时 `process.exitCode = 1`。

- [ ] **Step 5：增加兼容接口**

- `/api/public-messages` GET 要求同学 Session，把 `visible` 映射为旧 `approved`。
- 旧 POST 调用群聊创建 service 并返回旧响应形状。
- 旧 `/api/mailbox/*` 只读，所有 POST 回复 410 并提示客户端升级。
- 历史 pending/rejected 的管理员审核接口保留；不得创建新的 pending 投稿。

- [ ] **Step 6：增加脚本并验证**

在根 `package.json` 增加：

```json
"migrate:chat-data": "tsx scripts/migrate-chat-data.ts"
```

Run: `pnpm --filter worker exec vitest run tests/chat-migration.test.ts`

Expected: PASS。

Run: `pnpm --filter worker exec wrangler d1 migrations apply alumni-book-db --local`

Expected: 本地 D1 已应用 `0012_chat_rework.sql`。

Run: `pnpm migrate:chat-data -- --local`

Expected: 输出 JSON 报告，`anomalies` 为 0；空本地数据库允许源计数为 0。

- [ ] **Step 7：提交**

```bash
git add scripts/lib/chatMigration.ts scripts/migrate-chat-data.ts workers/api/tests/chat-migration.test.ts workers/api/src/routes/publicMessages.ts workers/api/src/routes/mailbox.ts package.json
git commit -m "feat: migrate legacy mail to conversations"
```

---

### Task 8：改造班级空间概览接口

**文件：**

- Modify: `workers/api/src/routes/classSpace.ts`
- Modify: `workers/api/tests/class-space-inbox.test.ts`
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1：更新失败测试**

概览测试先获取同学 token，并断言无 token 401、30 条消息升序、包含 `chatCursor/mute`、私有缓存、相册最多 4、时间轴最多 8：

```ts
expect(res.headers.get('Cache-Control')).toBe('private, no-store')
expect(body.data.chat.items.length).toBeLessThanOrEqual(30)
expect(body.data.chat.cursor).toEqual(expect.any(String))
expect(body.data.albums.length).toBeLessThanOrEqual(4)
expect(body.data.timeline.length).toBeLessThanOrEqual(8)
```

- [ ] **Step 2：运行并确认旧行为失败**

Run: `pnpm --filter worker exec vitest run tests/class-space-inbox.test.ts`

Expected: FAIL，旧接口允许匿名且使用公共缓存。

- [ ] **Step 3：实现带身份的单请求概览**

通过 `requireClassmate` 获取 viewer，复用 `listGroupMessages` 和 `getActiveMute`。只返回 `visible` 与撤回占位；查询最新 30 条后升序输出。移除旧 `approvedMessages` 命名，counts 改为 `groupMessages`。

- [ ] **Step 4：更新共享概览类型**

```ts
export interface ClassSpaceOverview {
  chat: {
    items: GroupChatMessage[]
    cursor: string
    mute: { reason: string; mutedUntil: string | null } | null
  }
  albums: ClassSpaceAlbumPreview[]
  timeline: ClassSpaceTimelinePreview[]
  counts: { groupMessages: number; albums: number; timelineItems: number }
}
```

- [ ] **Step 5：验证并提交**

Run: `pnpm --filter worker exec vitest run tests/class-space-inbox.test.ts tests/group-chat.test.ts`

Expected: PASS。

```bash
git add workers/api/src/routes/classSpace.ts workers/api/tests/class-space-inbox.test.ts packages/shared/src/types.ts
git commit -m "feat: serve authenticated class space overview"
```

---

### Task 9：创建前台 API 客户端与可见性轮询器

**文件：**

- Create: `packages/site-astro/src/api/groupChat.ts`
- Create: `packages/site-astro/src/api/inbox.ts`
- Create: `packages/site-astro/src/composables/useVisibilityPolling.ts`
- Create: `packages/site-astro/tests/chat-rework-static.test.ts`
- Modify: `packages/site-astro/src/api/classSpace.ts`
- Modify: `packages/site-astro/package.json`

- [ ] **Step 1：编写静态失败测试**

断言新客户端全部使用 `joinApiUrl` 和 `X-Classmate-Token`，轮询器包含单计时器、AbortController、`visibilitychange`、`online` 和卸载清理：

```ts
const polling = read('composables/useVisibilityPolling.ts')
expect(polling).toContain('AbortController')
expect(polling).toContain('visibilitychange')
expect(polling).toContain("addEventListener('online'")
expect(polling).toContain('onScopeDispose')
expect(polling).not.toContain('setInterval')
```

- [ ] **Step 2：加入正式静态测试脚本并确认失败**

把 `tests/chat-rework-static.test.ts` 加入 site `test` 命令。

Run: `pnpm --filter site-astro test`

Expected: FAIL，新文件不存在或接口缺失。

- [ ] **Step 3：实现群聊与信箱客户端**

所有方法返回强类型 data，不把 `Response` 泄漏给组件。群聊客户端包含 list/sync/send/recall/react/mine；信箱客户端包含 list/start/history/send/read/sync/summary/notifications/markNotificationRead。

统一错误类：

```ts
export class ApiRequestError extends Error {
  constructor(message: string, public status: number, public retryAfter: number | null = null) {
    super(message)
  }
}
```

- [ ] **Step 4：实现轮询器**

`useVisibilityPolling` 接收 `{ run, initialDelay, baseDelay, maxDelay }`，使用递归 `setTimeout`。成功恢复 baseDelay；失败按 5/10/20/30 秒退避；隐藏和离线时取消 timer 与请求；恢复时立即运行；`onScopeDispose` 完整清理。

- [ ] **Step 5：给概览请求附加同学 token**

更新 `classSpace.ts`，没有 token 时直接抛出 401 语义错误，不发送匿名请求。

- [ ] **Step 6：类型检查、静态测试并提交**

Run: `pnpm --filter site-astro typecheck`

Expected: PASS。

Run: `pnpm --filter site-astro test`

Expected: PASS。

```bash
git add packages/site-astro/src/api/groupChat.ts packages/site-astro/src/api/inbox.ts packages/site-astro/src/api/classSpace.ts packages/site-astro/src/composables/useVisibilityPolling.ts packages/site-astro/tests/chat-rework-static.test.ts packages/site-astro/package.json
git commit -m "feat: add chat frontend clients"
```

---

### Task 10：重构纸质档案导航与单例生命周期

**文件：**

- Create: `packages/site-astro/src/scripts/navRuntime.ts`
- Modify: `packages/site-astro/src/components/TopNav.astro`
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
- Modify: `packages/site-astro/src/styles/global.css`
- Modify: `packages/site-astro/tests/chat-rework-static.test.ts`
- Modify: `packages/site-astro/tests/navigation.test.ts`

- [ ] **Step 1：增加导航失败断言**

静态测试必须拒绝旧样式并要求新结构：

```ts
expect(nav).not.toContain('backdrop-filter')
expect(nav).not.toContain('width: 820px')
expect(nav).not.toContain('inkLineFlow')
expect(nav).toContain('mobile-page-title')
expect(nav).toContain('nav-mailbox-button')
expect(runtime).toContain('astro:before-swap')
expect(runtime).toContain('window.__alumniNavRuntime')
```

- [ ] **Step 2：运行并确认失败**

Run: `pnpm --filter site-astro exec vitest run tests/chat-rework-static.test.ts tests/navigation.test.ts`

Expected: FAIL，命中旧玻璃导航。

- [ ] **Step 3：重写导航结构**

桌面使用全宽 64px sticky 目录条；移动端使用 `44px 1fr 44px` 三栏、52px 高。所有按钮使用 Lucide 或已有图标组件，提供中文 `aria-label`。活动项包含固定的 `.nav-active-paper` 和 `.nav-active-ink`。

移动端中间标题由当前 pathname 映射，左侧抽屉包含账号中心和退出登录。`prefers-reduced-motion` 下取消墨线滑动、抽屉位移和平滑滚动，状态直接切换。

- [ ] **Step 4：实现单例 navRuntime**

运行时接口固定为：

```ts
declare global {
  interface Window { __alumniNavRuntime?: { destroy(): void; refresh(): void } }
}
export function initNavRuntime(): void
```

初始化前销毁旧实例；全局只注册一组 `astro:page-load`、`astro:before-swap`、`visibilitychange` 和 `alumni:inbox-changed`。未读摘要 60 秒递归 timeout，同一时刻只有一个 fetch。

- [ ] **Step 5：实现活动墨线与菜单清理**

使用元素测量计算 `translateX/scaleX`，只在页面切换、活动项变化和 ResizeObserver 回调时更新。抽屉打开给 `html` 添加 `nav-open`；关闭、切页和 destroy 必须移除。

- [ ] **Step 6：运行测试、构建并提交**

Run: `pnpm --filter site-astro exec vitest run tests/chat-rework-static.test.ts tests/navigation.test.ts tests/animation-ownership.test.ts`

Expected: PASS。

Run: `pnpm --filter site-astro build`

Expected: PASS。

```bash
git add packages/site-astro/src/scripts/navRuntime.ts packages/site-astro/src/components/TopNav.astro packages/site-astro/src/layouts/MainLayout.astro packages/site-astro/src/styles/global.css packages/site-astro/tests/chat-rework-static.test.ts packages/site-astro/tests/navigation.test.ts
git commit -m "feat: rebuild paper archive navigation"
```

---

### Task 11：实现群聊状态与基础消息舞台

**文件：**

- Create: `packages/site-astro/src/composables/useGroupChat.ts`
- Create: `packages/site-astro/src/components/GroupChatStage.vue`
- Create: `packages/site-astro/src/components/GroupChatMessage.vue`
- Create: `packages/site-astro/src/components/GroupChatComposer.vue`
- Create: `packages/site-astro/tests/chat-rework-flow.spec.ts`
- Modify: `packages/site-astro/src/components/ClassSpaceHub.vue`
- Modify: `packages/site-astro/src/pages/class-space.astro`

- [ ] **Step 1：编写群聊基础 E2E 失败测试**

Mock overview 和 POST，断言首屏消息、左右气泡、输入栏、乐观消息、成功替换、失败保留和重试相同 nonce：

```ts
await page.getByPlaceholder('写下消息……').fill('周末见')
await page.getByRole('button', { name: '发送消息' }).click()
await expect(page.locator('[data-message-state="sending"]')).toContainText('周末见')
await expect(page.locator('[data-message-id="pm-server"]')).toContainText('周末见')
```

- [ ] **Step 2：将 E2E 加入临时单文件运行并确认失败**

Run: `pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/chat-rework-flow.spec.ts`

Expected: FAIL，找不到输入栏。

- [ ] **Step 3：实现 useGroupChat 基础状态**

暴露：

```ts
return {
  items, mute, connectionState, newMessageCount,
  send, retry, loadOlder, syncNow,
  setNearBottom, consumeNewMessages
}
```

消息按 ID Map 合并，临时 ID使用 `local:<nonce>`。发送成功用 canonical ID替换，失败保留 body、nonce 和 `failed` 状态。

- [ ] **Step 4：实现消息、输入与舞台组件**

- `GroupChatMessage` 只渲染消息、作者、时间、发送状态和撤回占位。
- `GroupChatComposer` 管理文本和发送按钮，禁言时显示原因与时间。
- `GroupChatStage` 管理内部滚动、顶部历史加载和“有 N 条新消息”按钮。

消息流使用 `role="log"` 和 `aria-live="polite"`；批量加载历史前临时关闭 live announcement，避免朗读全部历史。所有图标按钮触控尺寸不小于 44px。

初次定位最新消息使用一次 `nextTick`；历史插入前后记录 `scrollHeight` 差值保持锚点。

- [ ] **Step 5：把 ClassSpaceHub 改为工作台骨架**

使用 overview 一次注入初始 chat items/cursor/mute，不再渲染 `ClassSpaceMessageStage`。页面主结构使用 `class-space-directory + class-space-main`，群聊 section ID固定为 `group-chat`。

- [ ] **Step 6：运行 E2E、类型检查并提交**

Run: `pnpm --filter site-astro typecheck`

Expected: PASS。

Run: `pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/chat-rework-flow.spec.ts`

Expected: PASS 基础发送和重试用例。

```bash
git add packages/site-astro/src/composables/useGroupChat.ts packages/site-astro/src/components/GroupChatStage.vue packages/site-astro/src/components/GroupChatMessage.vue packages/site-astro/src/components/GroupChatComposer.vue packages/site-astro/src/components/ClassSpaceHub.vue packages/site-astro/src/pages/class-space.astro packages/site-astro/tests/chat-rework-flow.spec.ts
git commit -m "feat: build class space group chat stage"
```

---

### Task 12：补齐群聊引用、回应、撤回、个人记录与同步生命周期

**文件：**

- Create: `packages/site-astro/src/components/GroupChatMineDrawer.vue`
- Modify: `packages/site-astro/src/components/GroupChatMessage.vue`
- Modify: `packages/site-astro/src/components/GroupChatComposer.vue`
- Modify: `packages/site-astro/src/components/GroupChatStage.vue`
- Modify: `packages/site-astro/src/composables/useGroupChat.ts`
- Modify: `packages/site-astro/src/pages/messages.astro`
- Modify: `packages/site-astro/tests/chat-rework-flow.spec.ts`
- Modify: `packages/site-astro/tests/chat-rework-static.test.ts`
- Modify: `packages/site-astro/tests/class-space-navigation-static.test.ts`
- Modify: `packages/site-astro/tests/post-office-flow.spec.ts`
- Delete: `packages/site-astro/src/components/PublicMessageBoard.vue`
- Delete: `packages/site-astro/src/components/MessageComposer.vue`
- Delete: `packages/site-astro/src/components/MessageCardGrid.vue`
- Delete: `packages/site-astro/src/composables/usePublicMessages.ts`

- [x] **Step 1：增加交互失败测试**

覆盖引用预览、四种回应切换、2 分钟撤回、个人记录、5 秒后首次 sync、离开页面后无继续请求、阅读历史时不自动跳底：

```ts
await page.getByRole('button', { name: '引用这条消息' }).click()
await expect(page.locator('.composer-reply-preview')).toContainText('班长')
await page.getByRole('button', { name: '回应：赞' }).click()
await expect(page.getByRole('button', { name: /赞，1 人/ })).toHaveAttribute('aria-pressed', 'true')
```

- [x] **Step 2：运行并确认失败**

Run: `pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/chat-rework-flow.spec.ts`

Expected: FAIL，引用或个人记录入口不存在。

- [x] **Step 3：扩展 useGroupChat**

增加 `replyTarget/react/recall/openMine/loadMine`。同步复用 `useVisibilityPolling`，初始 delay 5000ms；新/变更消息按 ID覆盖，hidden 从公开 Map 删除，撤回替换为占位。组件卸载时轮询必须停止。

- [x] **Step 4：实现可访问交互**

Emoji 文本菜单和回应菜单都用按钮，支持 Escape。回应按钮使用 `aria-pressed`。撤回仅在 `canRecall` 时出现。引用目标被撤回时显示“原消息不可用”。

- [x] **Step 5：实现个人记录抽屉**

抽屉调用 `/group-chat/mine`，分组展示历史待审核、未通过、被隐藏和本人撤回；只显示当前账号内容。关闭和路由切换恢复焦点及滚动锁定。

- [x] **Step 6：切换旧留言路由并清理孤立组件**

把 `/messages` 改为基础路径安全重定向到 `/class-space#group-chat`。更新 `class-space-navigation-static.test.ts` 和 `post-office-flow.spec.ts`，把旧公共留言流程替换为重定向与群聊断言；邮件相关用例暂时保留。确认无引用后删除 `PublicMessageBoard.vue`、`MessageComposer.vue`、`MessageCardGrid.vue` 和 `usePublicMessages.ts`。

Run: `rg "PublicMessageBoard|usePublicMessages|MessageComposer|MessageCardGrid" packages/site-astro/src`

Expected: 无输出。

- [x] **Step 7：验证交互与生命周期并提交**

Run: `pnpm --filter site-astro exec vitest run tests/chat-rework-static.test.ts tests/animation-ownership.test.ts`

Expected: PASS。

Run: `pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/chat-rework-flow.spec.ts`

Expected: PASS。

```bash
git add packages/site-astro/src/components/GroupChatMineDrawer.vue packages/site-astro/src/components/GroupChatMessage.vue packages/site-astro/src/components/GroupChatComposer.vue packages/site-astro/src/components/GroupChatStage.vue packages/site-astro/src/composables/useGroupChat.ts packages/site-astro/src/pages/messages.astro packages/site-astro/tests/chat-rework-flow.spec.ts packages/site-astro/tests/chat-rework-static.test.ts packages/site-astro/tests/class-space-navigation-static.test.ts packages/site-astro/tests/post-office-flow.spec.ts packages/site-astro/src/components/PublicMessageBoard.vue packages/site-astro/src/components/MessageComposer.vue packages/site-astro/src/components/MessageCardGrid.vue packages/site-astro/src/composables/usePublicMessages.ts
git commit -m "feat: complete group chat interactions"
```

---

### Task 13：完成班级空间相册、横向时间轴与响应式布局

**文件：**

- Create: `packages/site-astro/src/components/ClassSpaceSectionNav.vue`
- Create: `packages/site-astro/src/components/ClassSpaceTimelineRail.vue`
- Create: `packages/site-astro/tests/chat-rework-visual.spec.ts`
- Modify: `packages/site-astro/src/components/ClassSpaceHub.vue`
- Modify: `packages/site-astro/src/components/ClassSpaceAlbumRail.vue`
- Modify: `packages/site-astro/src/pages/class-space.astro`
- Modify: `packages/site-astro/tests/class-space-navigation-static.test.ts`
- Delete: `packages/site-astro/src/components/ClassSpaceMessageStage.vue`
- Delete: `packages/site-astro/src/components/ClassSpaceTimelinePreview.vue`

- [ ] **Step 1：编写布局和视觉失败测试**

在 1440x900、768x1024、390x844 三个视口断言：桌面左目录、平板顶部锚点、手机三段长页、横向时间轴、无页面横向溢出。截图固定写入 `test-results/chat-rework/`。

```ts
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
expect(overflow).toBe(false)
await page.screenshot({
  path: 'test-results/chat-rework/class-space-mobile.png',
  fullPage: true,
})
```

- [ ] **Step 2：运行并确认失败**

Run: `pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/chat-rework-visual.spec.ts`

Expected: FAIL，旧时间轴仍为纵向。

- [ ] **Step 3：实现分区目录**

桌面大于等于 1100px 为 176px sticky 目录；769-1099px 与手机为横向锚点条。只创建一个 IntersectionObserver，并在卸载时 disconnect。

- [ ] **Step 4：重写相册和时间轴轨道**

相册链接接收 `siteBase` 或由 helper 生成，禁止 `href="/album"`。封面设置稳定 `aspect-ratio`。时间轴桌面和手机都为横向轨道，节点按日期排序；手机 `scroll-snap-type: x proximity`、`touch-action: pan-x pan-y`。

- [ ] **Step 5：删除被替代组件并检查引用**

Run: `rg "ClassSpaceMessageStage|ClassSpaceTimelinePreview" packages/site-astro/src`

Expected: 无输出。

- [ ] **Step 6：生成最终快照并验证**

Run: `pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/chat-rework-visual.spec.ts`

Expected: `test-results/chat-rework/` 生成桌面、平板和手机三张 PNG，且所有溢出和结构断言通过。执行者必须实际打开三张截图确认无重叠、裁切和空白画布。

- [ ] **Step 7：提交**

```bash
git add packages/site-astro/src/components/ClassSpaceSectionNav.vue packages/site-astro/src/components/ClassSpaceTimelineRail.vue packages/site-astro/src/components/ClassSpaceHub.vue packages/site-astro/src/components/ClassSpaceAlbumRail.vue packages/site-astro/src/pages/class-space.astro packages/site-astro/tests/chat-rework-visual.spec.ts packages/site-astro/tests/class-space-navigation-static.test.ts packages/site-astro/src/components/ClassSpaceMessageStage.vue packages/site-astro/src/components/ClassSpaceTimelinePreview.vue
git commit -m "feat: finish responsive class space workbench"
```

---

### Task 14：重建班级信箱状态与桌面双栏界面

**文件：**

- Create: `packages/site-astro/src/composables/useInbox.ts`
- Create: `packages/site-astro/src/components/DirectConversationList.vue`
- Create: `packages/site-astro/src/components/DirectConversationView.vue`
- Create: `packages/site-astro/src/components/NotificationList.vue`
- Create: `packages/site-astro/src/components/NotificationDetail.vue`
- Create: `packages/site-astro/src/components/NewConversationDialog.vue`
- Create: `packages/site-astro/tests/mailbox-chat-flow.spec.ts`
- Modify: `packages/site-astro/src/components/MailboxApp.vue`
- Modify: `packages/site-astro/src/components/RecipientPicker.vue`
- Modify: `packages/site-astro/src/pages/mailbox.astro`
- Modify: `packages/site-astro/tests/post-office-static.test.ts`
- Modify: `packages/site-astro/tests/post-office-flow.spec.ts`

- [ ] **Step 1：编写桌面信箱失败测试**

Mock 固定会话、通知、历史和发送接口，断言“私聊/通知”分段、左列表右详情、无标题输入、选择同学后复用会话、发送状态与失败重试：

```ts
await page.getByRole('tab', { name: '私聊' }).click()
await page.getByRole('button', { name: '李四' }).click()
await expect(page.locator('.direct-conversation-view')).toBeVisible()
await expect(page.getByPlaceholder('给信件起个标题吧...')).toHaveCount(0)
```

- [ ] **Step 2：运行并确认旧邮件界面失败**

Run: `pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/mailbox-chat-flow.spec.ts`

Expected: FAIL，仍出现“收件箱/写信”和标题输入。

- [ ] **Step 3：实现 useInbox**

暴露：

```ts
return {
  mode, conversations, notifications, selectedConversation, selectedNotification,
  messages, unread, loading, connectionState,
  loadInitial, selectConversation, selectNotification,
  startConversation, send, retry, markCurrentRead, syncNow
}
```

会话消息使用 ID Map；乐观消息和重试规则与群聊一致。通知和私聊分别保存选中项与滚动位置。

- [ ] **Step 4：实现桌面组件**

- 左栏宽 320-360px，分段控件使用 `role=tablist`。
- 私聊列表显示头像、姓名、最后消息、时间和未读数。
- 通知列表显示来源、标题、摘要和未读状态。
- 私聊详情有 header/log/composer；通知详情没有 composer。
- 新会话对话框排除自己，选择同学后打开已有会话或等待首条消息创建。

`RecipientPicker.vue` 改为从 `api/inbox.ts` 读取同学目录，供 `NewConversationDialog` 复用；不得继续依赖旧 `postOffice.ts`。

私聊消息流使用 `role="log"`，通知详情使用普通文章语义；搜索、分段控件、返回和发送均可由键盘操作，焦点样式不可移除。

- [ ] **Step 5：移除外层嵌套纸卡**

`mailbox.astro` 直接承载工作区，不再使用包裹整个 `MailboxApp` 的 `.paper-panel`。页面仍保留必要标题，但不增加功能说明卡。

- [ ] **Step 6：验证桌面流程并提交**

Run: `pnpm --filter site-astro typecheck`

Expected: PASS。

Run: `pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/mailbox-chat-flow.spec.ts`

Expected: PASS 桌面用例。

```bash
git add packages/site-astro/src/composables/useInbox.ts packages/site-astro/src/components/DirectConversationList.vue packages/site-astro/src/components/DirectConversationView.vue packages/site-astro/src/components/NotificationList.vue packages/site-astro/src/components/NotificationDetail.vue packages/site-astro/src/components/NewConversationDialog.vue packages/site-astro/src/components/MailboxApp.vue packages/site-astro/src/components/RecipientPicker.vue packages/site-astro/src/pages/mailbox.astro packages/site-astro/tests/mailbox-chat-flow.spec.ts packages/site-astro/tests/post-office-static.test.ts packages/site-astro/tests/post-office-flow.spec.ts
git commit -m "feat: rebuild class inbox conversations"
```

---

### Task 15：补齐手机信箱、URL 状态、增量同步与旧组件清理

**文件：**

- Modify: `packages/site-astro/src/composables/useInbox.ts`
- Modify: `packages/site-astro/src/components/MailboxApp.vue`
- Modify: `packages/site-astro/src/components/DirectConversationView.vue`
- Modify: `packages/site-astro/tests/mailbox-chat-flow.spec.ts`
- Modify: `packages/site-astro/tests/chat-rework-visual.spec.ts`
- Modify: `packages/site-astro/tests/post-office-static.test.ts`
- Delete: `packages/site-astro/src/components/MailboxList.vue`
- Delete: `packages/site-astro/src/components/MailboxDetail.vue`
- Delete: `packages/site-astro/src/components/MailComposer.vue`
- Delete: `packages/site-astro/src/api/postOffice.ts`

- [ ] **Step 1：增加手机与生命周期失败测试**

390x844 下测试列表进入全屏详情、查询参数、浏览器返回、列表滚动恢复、键盘安全区、离开页面停止同步：

```ts
await page.getByRole('button', { name: '李四' }).click()
await expect(page).toHaveURL(/conversation=dc_ab/)
await page.goBack()
await expect(page.locator('.direct-conversation-list')).toBeVisible()
```

- [ ] **Step 2：运行并确认失败**

Run: `pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/mailbox-chat-flow.spec.ts`

Expected: FAIL，URL 未同步或返回离开信箱。

- [ ] **Step 3：实现手机详情历史状态**

选择详情时使用 `history.pushState` 写入 `?conversation=` 或 `?notification=`；监听 `popstate` 恢复列表。初次挂载解析查询参数。卸载时移除 listener，不修改用户离开信箱后的历史记录。

- [ ] **Step 4：接入可见性同步和已读**

信箱可见时 5 秒 sync；隐藏、离线和卸载停止。详情渲染后调用 read endpoint 到最后展示的收件消息。每次本地未读变化派发 `alumni:inbox-changed`。

- [ ] **Step 5：完成移动端布局**

小于等于 768px 时列表和详情互斥；详情高度使用 `100dvh - 52px`，composer 加 `env(safe-area-inset-bottom)`。长单词和 URL必须换行，页面级无横向滚动。

- [ ] **Step 6：删除旧邮件组件并检查引用**

Run: `rg "MailboxList|MailboxDetail|MailComposer" packages/site-astro/src`

Expected: 无输出。

Run: `rg "api/postOffice" packages/site-astro/src`

Expected: 无输出，随后删除 `api/postOffice.ts`。

- [ ] **Step 7：运行完整信箱测试并提交**

Run: `pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/mailbox-chat-flow.spec.ts tests/chat-rework-visual.spec.ts`

Expected: PASS。

```bash
git add packages/site-astro/src/composables/useInbox.ts packages/site-astro/src/components/MailboxApp.vue packages/site-astro/src/components/DirectConversationView.vue packages/site-astro/tests/mailbox-chat-flow.spec.ts packages/site-astro/tests/chat-rework-visual.spec.ts packages/site-astro/tests/post-office-static.test.ts packages/site-astro/src/components/MailboxList.vue packages/site-astro/src/components/MailboxDetail.vue packages/site-astro/src/components/MailComposer.vue packages/site-astro/src/api/postOffice.ts
git commit -m "feat: complete responsive class inbox"
```

---

### Task 16：改造管理后台群聊治理与通知中心

**文件：**

- Create: `packages/admin/src/api/community.ts`
- Modify: `packages/admin/src/views/MessagesView.vue`
- Modify: `packages/admin/src/views/MailView.vue`
- Modify: `packages/admin/src/views/AdminLayout.vue`
- Modify: `packages/admin/src/main.ts`

- [ ] **Step 1：先运行当前后台类型检查建立基线**

Run: `pnpm --filter admin typecheck`

Expected: PASS；若失败，记录为前置问题并先修复与本任务相关的类型错误。

- [ ] **Step 2：实现强类型管理客户端**

`community.ts` 导出：

```ts
export function fetchGroupChatMessages(status?: string): Promise<GroupChatMessage[]>
export function setGroupChatHidden(id: string, hidden: boolean, reason: string): Promise<void>
export function recallGroupChatMessage(id: string, reason: string): Promise<void>
export function muteClassmate(slug: string, reason: string, mutedUntil: string | null): Promise<void>
export function unmuteClassmate(slug: string): Promise<void>
export function sendAdminNotification(payload: { recipientSlug: string; title: string; body: string }): Promise<void>
export function broadcastAdminNotification(payload: { title: string; body: string }): Promise<void>
```

所有函数复用 `adminFetch`，不自行读取 token。

- [ ] **Step 3：改造留言管理页**

保留个人主页留言管理；新增“公共群聊”和“历史公共投稿”标签。群聊提供最新/隐藏/撤回筛选、原因对话框、隐藏恢复、管理员撤回、限时/永久禁言。原因 trim 后为空时不发送请求。

- [ ] **Step 4：把班级邮局改为通知中心**

`MailView.vue` 移除允许回复和主题邮件线程概念，提供单人/全班分段、收件人选择、标题、正文和历史统计。`AdminLayout.vue` 文案改为“通知中心”；路由可继续使用 `/mail` 以避免旧书签失效，route name 改为 `notifications`。

- [ ] **Step 5：运行后台类型和构建**

Run: `pnpm --filter admin typecheck`

Expected: PASS。

Run: `pnpm --filter admin build`

Expected: PASS。

- [ ] **Step 6：提交**

```bash
git add packages/admin/src/api/community.ts packages/admin/src/views/MessagesView.vue packages/admin/src/views/MailView.vue packages/admin/src/views/AdminLayout.vue packages/admin/src/main.ts
git commit -m "feat: add chat moderation and notification admin"
```

---

### Task 17：收紧正式测试门禁、性能与验收报告

**文件：**

- Modify: `packages/site-astro/package.json`
- Modify: `packages/site-astro/tests/performance-network.spec.ts`
- Modify: `packages/site-astro/tests/animation-ownership.test.ts`
- Modify: `packages/site-astro/tests/class-space-flow.spec.ts`
- Modify: `packages/site-astro/tests/mailbox-account-flow.spec.ts`
- Create: `docs/phase-14-chat-rework-acceptance-report.md`

- [ ] **Step 1：把所有新测试加入正式脚本**

site `test:perf-network` 必须显式包含：

```text
tests/class-space-flow.spec.ts
tests/mailbox-account-flow.spec.ts
tests/chat-rework-flow.spec.ts
tests/mailbox-chat-flow.spec.ts
tests/chat-rework-visual.spec.ts
```

删除旧流程中与主题邮件、纵向时间轴和留言卡片冲突的断言，不能简单跳过测试文件。

- [ ] **Step 2：增加性能与生命周期断言**

`performance-network.spec.ts` 记录请求：班级空间进入后 5 秒内只有一个 overview；离开后没有 group-chat sync；信箱离开后没有 inbox sync；不加载 `gsap`、`ScrollTrigger`、完整相册灯箱代码。

`animation-ownership.test.ts` 断言导航 runtime 单例、群聊元素不带全局 reveal、所有轮询 composable 具备 scope dispose。

- [ ] **Step 3：运行 Worker 全量测试**

Run: `pnpm verify:worker`

Expected: 所有 Worker 测试 PASS，无未处理 Promise 和 D1 警告。

- [ ] **Step 4：运行后台与站点门禁**

Run: `pnpm verify:admin`

Expected: PASS。

Run: `pnpm verify:site`

Expected: 静态、构建和正式 Playwright 全部 PASS；确认日志实际列出五个新增 E2E 文件。

- [ ] **Step 5：验证非根部署路径**

```powershell
$env:SITE_BASE='/alumni-book-v2'
pnpm --filter site-astro build
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/class-space-flow.spec.ts tests/chat-rework-flow.spec.ts tests/mailbox-chat-flow.spec.ts
Remove-Item Env:SITE_BASE
```

Expected: PASS；`/messages`、相册、时间轴、信箱和账号链接都包含正确基础路径。

- [ ] **Step 6：运行整库门禁**

Run: `pnpm verify:all`

Expected: PASS。

- [ ] **Step 7：填写验收报告**

报告必须写入：当前提交、各命令实际结果、Worker 测试数量、Playwright 数量、三种视口截图路径、迁移本地报告、非根 `SITE_BASE` 结果、已知限制（轮询而非 WebSocket、无图片私聊、无已读回执）。不得写未执行的结果。

- [ ] **Step 8：提交**

```bash
git add packages/site-astro/package.json packages/site-astro/tests/performance-network.spec.ts packages/site-astro/tests/animation-ownership.test.ts packages/site-astro/tests/class-space-flow.spec.ts packages/site-astro/tests/mailbox-account-flow.spec.ts docs/phase-14-chat-rework-acceptance-report.md
git commit -m "test: complete chat rework acceptance gates"
```

---

### Task 18：生产迁移、部署与上线核验

**文件：**

- Modify: `docs/phase-14-chat-rework-acceptance-report.md`

- [ ] **Step 1：确认发布前状态**

Run: `git status --short`

Expected: 无输出。

Run: `git log -1 --oneline`

Expected: 当前提交为 Task 17 验收提交。

- [ ] **Step 2：导出生产 D1 备份**

```powershell
New-Item -ItemType Directory -Force .artifacts | Out-Null
pnpm --filter worker exec wrangler d1 export alumni-book-db --remote --output ../../.artifacts/pre-chat-rework.sql
```

Expected: `.artifacts/pre-chat-rework.sql` 存在且文件大小大于 0。`.artifacts/` 不提交 Git。

- [ ] **Step 3：应用结构迁移**

Run: `pnpm --filter worker exec wrangler d1 migrations apply alumni-book-db --remote`

Expected: `0012_chat_rework.sql` 成功应用，无 SQL 错误。

- [ ] **Step 4：执行旧数据归并并核对报告**

Run: `pnpm migrate:chat-data -- --remote`

Expected: `anomalies: 0`，源私信消息数等于新 direct message 数；报告保存到 `.artifacts/chat-migration-report.json`。

- [ ] **Step 5：部署 Worker**

Run: `pnpm deploy:worker`

Expected: Wrangler 返回新的 Worker version，`GET /api/health` 为 200。

- [ ] **Step 6：构建并部署 Pages**

按项目 `AGENTS.md` 的 Pages 备用流程构建 site/admin、组装 `deploy/`，然后运行：

Run: `npx wrangler pages deploy deploy --project-name alumni-book --branch main --commit-dirty=true`

Expected: 返回成功部署 URL。

- [ ] **Step 7：生产冒烟核验**

使用两个测试同学账号完成：登录进入前言、进入班级空间、A发送群聊、B同步收到、B回应、A撤回测试消息、A发起私聊、B回复、通知已读、手机导航与信箱返回。测试消息完成后由管理员撤回并记录原因“上线冒烟测试”。

- [ ] **Step 8：更新验收报告并提交**

把 D1 备份路径、迁移报告摘要、Worker version、Pages URL、生产冒烟时间和结果写入验收报告。

```bash
git add docs/phase-14-chat-rework-acceptance-report.md
git commit -m "docs: record chat rework deployment"
```

---

## 最终完成检查

- [ ] `pnpm verify:all` 全部通过。
- [ ] 数据迁移报告 `anomalies` 为 0，且消息数量核对一致。
- [ ] `/messages` 在根路径和非根 `SITE_BASE` 下均进入 `/class-space#group-chat`。
- [ ] 桌面班级空间符合左目录、群聊主舞台、横向相册、横向时间轴结构。
- [ ] 手机班级空间为连续分段长页，没有页面级横向滚动。
- [ ] 发件人与收件人都能看到唯一持续私聊，未读只影响收件人。
- [ ] 管理员隐藏、撤回、禁言和通知形成完整处理闭环。
- [ ] 连续五次 Astro 页面切换后没有重复监听器、Observer 或轮询请求。
- [ ] 生产 Worker、Pages 和 D1 迁移全部记录在验收报告中。
