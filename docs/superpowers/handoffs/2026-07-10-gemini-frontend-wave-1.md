# Gemini 前端第二批任务包

## 通用规则

- 基线分支：`codex/class-space-chat-rework`。开始前执行 `git fetch --all --prune`，并 rebase 到该分支最新提交。
- 每个任务使用独立 worktree 和独立分支；不要直接合并、部署或推送生产环境。
- 只能修改所属文件。发现基线已有未提交改动时，不得覆盖或格式化无关内容。
- 所有接口地址必须经 `joinApiUrl(apiBase, path)` 构造；同学鉴权统一使用 `getClassmateToken()` 和 `X-Classmate-Token`。
- 不读取 `sessionStorage` 中的管理员 token，不修改 Worker、D1 migration、共享类型或管理后台。
- 先写失败测试，确认失败后再实现；提交前运行指定命令与 `git diff --check`。
- 交付时返回：提交 SHA、修改文件列表、测试完整结果、尚未覆盖的风险。不要只说“已完成”。

## 包 C：前台聊天 API 客户端与可见性轮询器

**前置条件：** 可立即开始。此包不改任何页面或现有组件。

**文件所有权：**

- 新建 `packages/site-astro/src/api/groupChat.ts`
- 新建 `packages/site-astro/src/api/inbox.ts`
- 新建 `packages/site-astro/src/composables/useVisibilityPolling.ts`
- 修改 `packages/site-astro/src/api/classSpace.ts`
- 新建 `packages/site-astro/tests/chat-rework-static.test.ts`
- 修改 `packages/site-astro/package.json`

**不可修改：** `TopNav.astro`、`MainLayout.astro`、`ClassSpaceHub.vue`、任何 `Mailbox*.vue`、所有 Worker 文件。

### 实现要求

1. `groupChat.ts` 导出强类型方法：
   - `listGroupMessages(apiBase, options)`
   - `listMyGroupMessages(apiBase, options)`
   - `syncGroupChat(apiBase, cursor?)`
   - `sendGroupMessage(apiBase, payload)`
   - `reactToGroupMessage(apiBase, id, reaction)`
   - `recallGroupMessage(apiBase, id)`
2. `inbox.ts` 导出强类型方法：
   - `listDirectConversations(apiBase)`、`startDirectConversation(apiBase, payload)`
   - `listDirectMessages(apiBase, id, options)`、`sendDirectMessage(apiBase, id, payload)`、`markDirectConversationRead(apiBase, id, throughMessageId)`
   - `getInboxSummary(apiBase)`、`syncInbox(apiBase, cursor?)`
   - `listNotifications(apiBase)`、`markNotificationRead(apiBase, id)`
3. 所有客户端失败时抛出统一的 `ApiRequestError`，包含 `status` 和可选的 `retryAfter`。组件不能直接处理原始 `Response`。
4. 请求体为 JSON 时统一发送 `Content-Type: application/json`；没有同学 token 时直接抛出 401 语义错误，绝不发送匿名鉴权请求。
5. `fetchClassSpaceOverview` 必须附带同学 token，行为与上述规则一致。
6. `useVisibilityPolling` 使用递归 `setTimeout`，绝不使用 `setInterval`。它必须：
   - 同一时刻只有一个 timer 和一个 `AbortController`。
   - 页面隐藏、离线、卸载时终止请求并清理 timer。
   - 页面恢复或 `online` 时立即重新执行。
   - 成功后恢复基础间隔；连续失败依次按 5、10、20、30 秒退避。
   - 用 `onScopeDispose` 清理 `visibilitychange`、`online` 监听器和请求。
7. 共享契约以 `@alumni/shared` 的 `GroupChatMessage`、`DirectConversation`、`DirectMessage`、`NotificationItem`、`InboxSummary` 为准。新代码不得读取兼容字段 `mailUnread`。

### 测试与验收

- 静态测试必须断言 `joinApiUrl`、`X-Classmate-Token`、`AbortController`、`visibilitychange`、`online`、`onScopeDispose` 存在，且不包含 `setInterval`。
- 将该测试纳入 `packages/site-astro/package.json` 的正式 `test` 命令。
- 运行：

```powershell
pnpm --filter site-astro typecheck
pnpm --filter site-astro test
git diff --check
```

- 提交建议：`feat: add chat frontend clients`

## 包 D：纸质档案导航与单例运行时

**前置条件：** 包 C 已合并到基线后再开始，避免同时修改 `chat-rework-static.test.ts`。

**文件所有权：**

- 新建 `packages/site-astro/src/scripts/navRuntime.ts`
- 修改 `packages/site-astro/src/components/TopNav.astro`
- 修改 `packages/site-astro/src/layouts/MainLayout.astro`
- 修改 `packages/site-astro/src/styles/global.css`
- 修改 `packages/site-astro/tests/chat-rework-static.test.ts`
- 修改 `packages/site-astro/tests/navigation.test.ts`

**不可修改：** 任何 Vue 群聊/信箱组件、`api/` 客户端、Worker、共享类型。

### 实现要求

1. 用纸质档案目录替换当前玻璃液态胶囊导航：桌面为全宽 64px sticky 目录条，非浮动卡片；移动端是 `44px 1fr 44px` 三栏、52px 高。
2. 移动端中栏显示当前页面标题，左侧打开抽屉，右侧为信箱按钮。抽屉包含账号中心和退出入口。
3. 不得保留 `backdrop-filter`、`width: 820px`、`inkLineFlow` 或旧玻璃胶囊样式。图标按钮必须有中文 `aria-label` 与可见或原生 tooltip。
4. 活动项使用稳定的 `.nav-active-paper` 与 `.nav-active-ink`；墨线仅在路径、尺寸或活动项变化时测量更新，动画只使用 transform。
5. `navRuntime.ts` 导出 `initNavRuntime()`，挂到 `window.__alumniNavRuntime`。重新初始化前必须 destroy 旧实例。
6. 页面生命周期全局只绑定一组 `astro:page-load`、`astro:before-swap`、`visibilitychange`、`alumni:inbox-changed`。未读摘要用 60 秒递归 timeout，禁止并发 fetch。切页、抽屉关闭和 destroy 必须解除滚动锁定与所有监听。
7. `prefers-reduced-motion` 下不得保留墨线、抽屉和平滑滚动的过渡动画。

### 测试与验收

```powershell
pnpm --filter site-astro exec vitest run tests/chat-rework-static.test.ts tests/navigation.test.ts tests/animation-ownership.test.ts
pnpm --filter site-astro build
git diff --check
```

- 提交建议：`feat: rebuild paper archive navigation`

## 包 E：群聊基础舞台

**前置条件：** 包 C 已合并；Worker 群聊接口已在基线提供。

**文件所有权：**

- 新建 `packages/site-astro/src/composables/useGroupChat.ts`
- 新建 `packages/site-astro/src/components/GroupChatStage.vue`
- 新建 `packages/site-astro/src/components/GroupChatMessage.vue`
- 新建 `packages/site-astro/src/components/GroupChatComposer.vue`
- 修改 `packages/site-astro/src/components/ClassSpaceHub.vue`
- 修改 `packages/site-astro/src/pages/class-space.astro`
- 新建 `packages/site-astro/tests/chat-rework-flow.spec.ts`

**不可修改：** `ClassSpaceAlbumRail.vue`、时间轴组件、导航文件、信箱文件、Worker 文件。不要删除旧留言组件，本包只完成基础舞台。

### 实现要求

1. 用 `useGroupChat` 管理 `items`、`mute`、`connectionState`、`newMessageCount`、`send`、`retry`、`loadOlder`、`syncNow`、`setNearBottom`、`consumeNewMessages`。
2. 使用以服务端消息 ID 为键的 Map 合并状态。乐观消息 ID 为 `local:<nonce>`；成功后原位替换为服务端 ID；失败保留正文和 nonce 以供重试，重试必须复用 nonce。
3. `GroupChatStage` 是内部滚动区，支持顶部加载历史并保持滚动锚点；新消息在用户不接近底部时显示“有 N 条新消息”按钮。
4. `GroupChatComposer` 支持 1-500 字消息、发送中禁用、失败重试入口。禁言时展示原因和解除时间，不允许发送。
5. 消息流使用 `role="log"` 与适度 `aria-live="polite"`。历史批量插入前暂时关闭 live announcement。所有图标按钮触控面积至少 44px。
6. `ClassSpaceHub` 只用一次 overview 注入初始 `chat.items/cursor/mute`；改为 `class-space-directory + class-space-main` 的工作台骨架，群聊 section 固定为 `id="group-chat"`。不得再把旧的 `overviewData.messages` 当作数据源。
7. E2E 需 mock overview 和 POST，覆盖首屏、左右消息、乐观发送、成功替换和失败后相同 nonce 重试。

### 测试与验收

```powershell
pnpm --filter site-astro typecheck
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/chat-rework-flow.spec.ts
git diff --check
```

- 提交建议：`feat: build class space group chat stage`

## 后续排期

- 包 E 合并后，再派发相册/横向时间轴与三端视觉走查（计划 Task 13）。
- Worker 完成统一信箱同步后，再派发会话式信箱（计划 Task 14-15）。
- 管理通知接口完成后，再派发后台群聊治理与通知中心（计划 Task 16）。
