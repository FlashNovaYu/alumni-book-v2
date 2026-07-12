# Gemini 前端第二批返工与任务包

## 执行顺序

1. 先完成“包 R：现有三项提交返工”，通过全部验收后再提交替代 SHA。
2. 包 R 合并后，包 1、包 2、包 3 可使用三个独立 worktree 并行执行。
3. 会话式信箱与后台通知中心暂不派发，等待 Worker Task 6 审查通过并合并。

所有包统一要求：

- 基线分支为 `codex/class-space-chat-rework`，开始前 rebase 到最新提交。
- 不直接合并、推送或部署；返回提交 SHA、文件列表、完整命令输出和已知限制。
- 先写失败测试并确认失败，再实现；不得降低断言或用静态字符串假装行为成立。
- 只能修改所属文件，不覆盖其他 Agent 的改动。

## 包 R：现有前端三项提交返工

**分支：** `gemini/chat-frontend-clients`

**当前提交：**

- `3ab5b36 feat: add chat frontend clients`
- `330c698 feat: rebuild paper archive navigation`
- `dcf937a feat: build class space group chat stage`

### R1：修复轮询取消链路

涉及文件：

- `packages/site-astro/src/composables/useVisibilityPolling.ts`
- `packages/site-astro/src/composables/useGroupChat.ts`
- `packages/site-astro/src/api/groupChat.ts`
- `packages/site-astro/src/components/GroupChatStage.vue`
- `packages/site-astro/tests/chat-rework-static.test.ts`
- `packages/site-astro/tests/chat-rework-flow.spec.ts`

要求：

- `useVisibilityPolling` 每轮创建的 `AbortSignal` 必须一路传到 `fetch`，不能只创建 controller 却丢弃 signal。
- `GroupChatStage` 的轮询回调必须接收 signal，并调用支持 signal 的 `syncNow(signal)`。
- `useGroupChat` 与 `api/groupChat.ts` 的同步函数接受可选 `AbortSignal`，传给实际请求。
- 页面隐藏、离线、重新调度和卸载后，旧请求必须被 abort，且同一时刻最多一个请求。
- 测试不得在无 Vue effect scope 时直接调用含 `onScopeDispose` 的 composable；消除现有 `onScopeDispose()` 警告。

### R2：统一导航未读请求与无动画偏好

涉及文件：

- `packages/site-astro/src/scripts/navRuntime.ts`
- `packages/site-astro/src/components/TopNav.astro`
- `packages/site-astro/tests/navigation.test.ts`
- `packages/site-astro/tests/chat-rework-static.test.ts`

要求：

- 导航不得直接读取 `sessionStorage` 拼 token，也不得用 ``${apiBase}/api/...`` 拼 URL。
- 复用 `api/inbox.ts` 的 `getInboxSummary()` 和共享同学 token helper；API base 带尾部 `/` 时不得出现双斜杠。
- 保持 60 秒递归 timeout、无并发 fetch 和完整 destroy 清理。
- `prefers-reduced-motion: reduce` 下关闭墨线、抽屉、遮罩、平滑滚动及其他导航过渡，不只是关闭 `.nav-active-ink`。

### R3：补齐群聊 E2E 与触控尺寸

涉及文件：

- `packages/site-astro/src/components/GroupChatComposer.vue`
- `packages/site-astro/src/components/GroupChatStage.vue`
- `packages/site-astro/src/components/GroupChatMessage.vue`
- `packages/site-astro/tests/chat-rework-flow.spec.ts`
- `packages/site-astro/package.json`

要求：

- E2E 增加本人/他人左右布局断言。
- 增加发送失败后保留消息、显示失败状态、点击重试且复用同一 `clientNonce` 的真实请求断言。
- 将 `chat-rework-flow.spec.ts` 接入正式 Playwright 质量门禁，不得只靠手工单文件命令。
- 发送按钮、新消息按钮、回应按钮和 Emoji 菜单按钮触控尺寸均不小于 44x44px；稳定尺寸不得因文案或状态变化而跳动。
- 保持已有乐观成功、内部滚动和历史锚点行为。

### 包 R 验收

```powershell
pnpm --filter site-astro typecheck
pnpm --filter site-astro test
pnpm --filter site-astro build
pnpm --filter site-astro exec vitest run tests/chat-rework-static.test.ts tests/navigation.test.ts tests/animation-ownership.test.ts
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/chat-rework-flow.spec.ts
git diff --check
```

验收必须无 Vue lifecycle 警告。不要把 Worker `/api/inbox/sync` 暂缺列为前端返工项；最新基线的 Worker Task 6 已提供该接口。

## 包 1：群聊完整交互与生命周期（Task 12A）

**前置：** 包 R 已合并。不依赖信箱。

**文件所有权：**

- 新建 `packages/site-astro/src/components/GroupChatMineDrawer.vue`
- 修改 `packages/site-astro/src/components/GroupChatMessage.vue`
- 修改 `packages/site-astro/src/components/GroupChatComposer.vue`
- 修改 `packages/site-astro/src/components/GroupChatStage.vue`
- 修改 `packages/site-astro/src/composables/useGroupChat.ts`
- 修改 `packages/site-astro/tests/chat-rework-flow.spec.ts`
- 修改 `packages/site-astro/tests/chat-rework-static.test.ts`

**要求：**

- 首次同步延迟 5 秒；隐藏、离线和卸载后不再请求。
- 支持引用预览、四种回应切换、作者两分钟内撤回和撤回占位。
- `hidden` 同步项从公开列表删除，其他变化按 ID 覆盖；阅读历史时不自动跳底。
- 回应按钮有 `aria-pressed`；Emoji/更多菜单支持 Escape。
- “我的记录”只读取 `/api/group-chat/mine`，分组展示待审核、未通过、隐藏和本人撤回；关闭后恢复焦点和滚动锁。

**禁止修改：** `ClassSpaceHub.vue`、相册/时间轴、信箱、后台、Worker、共享类型、旧 `/messages` 页面与旧组件。

**验收：**

```powershell
pnpm --filter site-astro typecheck
pnpm --filter site-astro exec vitest run tests/chat-rework-static.test.ts tests/animation-ownership.test.ts
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/chat-rework-flow.spec.ts
git diff --check
```

## 包 2：班级空间相册、横向时间轴与三视口（Task 13）

**前置：** 包 R 已合并。可与包 1、包 3 并行。

**文件所有权：**

- 新建 `packages/site-astro/src/components/ClassSpaceSectionNav.vue`
- 新建 `packages/site-astro/src/components/ClassSpaceTimelineRail.vue`
- 新建 `packages/site-astro/tests/chat-rework-visual.spec.ts`
- 修改 `packages/site-astro/src/components/ClassSpaceHub.vue`
- 修改 `packages/site-astro/src/components/ClassSpaceAlbumRail.vue`
- 修改 `packages/site-astro/src/pages/class-space.astro`
- 修改 `packages/site-astro/tests/class-space-navigation-static.test.ts`
- 删除 `packages/site-astro/src/components/ClassSpaceMessageStage.vue`
- 删除 `packages/site-astro/src/components/ClassSpaceTimelinePreview.vue`

**要求：**

- `>=1100px` 使用 176px sticky 分区目录；更窄视口使用横向锚点条。
- 全页只创建一个 `IntersectionObserver`，卸载时 disconnect。
- 相册链接和时间轴链接使用站点基础路径，不得硬编码根路径。
- 相册封面有稳定 `aspect-ratio`；时间轴桌面/手机均为横向，按日期排序。
- 手机时间轴使用 `scroll-snap-type: x proximity` 与 `touch-action: pan-x pan-y`。
- 在 1440x900、768x1024、390x844 下无页面横向溢出，生成并人工检查三张截图。

**禁止修改：** 所有 `GroupChat*.vue`、`useGroupChat.ts`、信箱、后台、Worker、共享类型。

**验收：**

```powershell
pnpm --filter site-astro typecheck
pnpm --filter site-astro exec vitest run tests/class-space-navigation-static.test.ts tests/animation-ownership.test.ts
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/chat-rework-visual.spec.ts
rg "ClassSpaceMessageStage|ClassSpaceTimelinePreview" packages/site-astro/src
git diff --check
```

## 包 3：后台公共群聊治理（Task 16A）

**前置：** 当前 Worker 管理群聊接口已完成。可与包 1、包 2 并行。

**文件所有权：**

- 新建 `packages/admin/src/api/community.ts`
- 修改 `packages/admin/src/views/MessagesView.vue`

**要求：**

- API 客户端只复用 `adminFetch`，不得自行读取 JWT。
- 保留个人主页留言管理，新增“公共群聊”和“历史公共投稿”。
- 支持最新/隐藏/撤回筛选、隐藏/恢复、管理员撤回、限时/永久禁言和解除禁言。
- 原因 trim 后为空不得发送；解除时间必须是带时区的未来 ISO，永久禁言传 `null`。
- 使用现有 `/api/admin/group-chat/**` 契约，不修改 Worker 迁就前端。

**禁止修改：** `MailView.vue`、`AdminLayout.vue`、`main.ts`、`api/client.ts`、站点、Worker、共享类型。

**验收：**

```powershell
pnpm --filter admin typecheck
pnpm --filter admin build
git diff --check
```

## 暂缓任务

以下任务等 Worker Task 6 规格与质量审查完成后再生成独立包：

- Task 14-15：桌面/手机会话式信箱、URL 状态、增量同步和旧邮件组件清理。
- Task 16B：后台通知中心。
- Task 12B：`/messages` 重定向与旧公共留言组件清理。
