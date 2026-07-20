# Phase 14 聊天返工验收报告

## 验收基线

- 分支：`codex/class-space-chat-rework`
- 验收时基线提交：`97f7251ec6f98ba38e411a971b0307671a3547c6`
- Task 17 验收提交：`d4a1101`
- 验收与发布时间：2026-07-11 19:49 - 20:15（Asia/Shanghai）
- 本报告覆盖 Task 17 验收门禁与 Task 18 的生产迁移、部署记录。

## 自动化结果

| 命令 | 实际结果 |
| --- | --- |
| `pnpm verify:worker` | 12 个测试文件、130 条测试全部通过。 |
| `pnpm verify:admin` | 社群治理与通知中心静态契约、`vue-tsc --noEmit`、生产构建全部通过。 |
| `pnpm verify:site` | 站点类型检查、静态数据构建、12 个静态测试文件共 71 条测试、47 条 Playwright 流程全部通过。 |
| `pnpm verify:all` | 最终静默复验退出码为 `0`。 |
| `SITE_BASE=/alumni-book-v2 pnpm --filter site-astro build` | 通过。 |
| 非根路径关键流程 | 班级空间、群聊、信箱、账号中心共 24 条 Playwright 流程全部通过。 |

## 本次收紧的门禁

- 正式 Playwright 脚本已显式覆盖班级空间、账号/信箱、群聊重构、私聊/通知和三视口视觉流程。
- 已移除 Playwright 中不再由新界面调用的 `/api/mailbox/**` mock，旧主题邮件 API 的意外回归会暴露为测试失败。
- 性能流程验证离开班级空间或信箱后，不再继续五秒轮询。
- 静态约束验证群聊不被全局 reveal 接管，轮询在 Vue scope 销毁时停止。
- 非根路径复验额外发现并修复账号中心登出未标准化 `SITE_BASE` 尾部斜杠的问题；登出与未登录跳转现在均回到站点根目录。

## 视觉走查

以下快照由 `tests/chat-rework-visual.spec.ts` 在本次通过的门禁中生成，并已人工检查：

- `packages/site-astro/test-results/chat-rework/class-space-desktop.png`（1440x900）
- `packages/site-astro/test-results/chat-rework/class-space-tablet.png`（768x1024）
- `packages/site-astro/test-results/chat-rework/class-space-mobile.png`（390x844）

结论：三个视口均未见元素重叠、空白画布或页面级横向溢出；相册与时间轴轨道末端露出的卡片属于预期的横向滚动提示。

## 迁移依据

本次没有再次执行 `pnpm migrate:chat-data -- --local`，因为该命令会改写本地 D1 状态。迁移逻辑已包含在本次通过的 Worker 全量测试中；此前记录的两次本地演练见 `docs/phase-14-backend-compatibility-acceptance-report.md`：

- 源私聊线程：3
- 源私聊消息：5
- 目标私聊会话：2
- 目标私聊消息：5
- 迁移通知：1
- `anomalies`：0

两次演练的目标数量一致，记录结论为幂等。

## 生产发布记录

- 远程 D1 备份：`.artifacts/pre-chat-rework.sql`，31,232 字节。该文件已通过 `.gitignore` 排除。
- 远程结构迁移：`0012_chat_rework.sql` 与 `0013_notification_sync_events.sql` 均成功应用。`0013` 是 inbox 增量同步所需的通知事件表、回填与触发器迁移。
- 远程归并报告：`.artifacts/chat-migration-report.json`。
  - `sourcePrivateThreads: 0`
  - `sourcePrivateMessages: 0`
  - `directConversations: 0`
  - `directMessages: 0`
  - `migratedNotifications: 0`
  - `anomalies: 0`
- Worker：已部署 `alumni-book-api`，版本 `03bcd12c-fe41-4777-b941-bcb6d0c3f5c0`；`https://alumni-book-api.chenyuhao2263.workers.dev/api/health` 返回 200。
- Pages：已部署到生产 `main` 分支，发布 URL 为 `https://08e6cffd.alumni-book.pages.dev`，主域为 `https://alumni-book.pages.dev`。
- 生产静态烟测：`/alumni-book-v2/` 首页、首页实际 JavaScript 资源、`/alumni-book-v2/admin/` 及其实际 JavaScript 资源、`/alumni-book-v2/api/health`、`/alumni-book-v2/api/students` 均返回 200。
- 发布工具修正：根脚本的 `deploy:worker` 与 `db:migrate` 已补齐 `pnpm --filter worker run`，避免 pnpm 将包脚本误解析为自身命令；Worker 实际部署与 D1 帮助命令均已验证该入口。

## 已知限制与本期产品非目标

- 群聊与信箱使用可见性驱动的五秒轮询；五秒轮询不是实时通信，WebSocket/推送属于独立产品非目标。
- 附件、已读回执、实时推送是三项独立产品能力，本期均为独立产品非目标；私聊界面明确提示“当前仅支持文字私聊”。
- 私聊暂不支持图片或文件附件，也不向发送方展示已读回执。
- 未提供独立的生产测试同学账号凭据，因此未执行会产生聊天、回应、撤回、私聊或已读写入的双账号认证烟测；本次只完成无副作用的生产静态与 API 代理检查。

## 发布后待办

- 将当前分支的发布修正推送到 GitHub 并合并至 `main`，使仓库源码与已发布产物一致。
- 获得两名专用测试同学账号后，补做 Task 18 规定的认证型双账号烟测，并由管理员撤回测试消息。

## 2026-07-11 新增同学账号初始化发布

- 代码提交：`8072ab3`（自动初始化）、`8dfce2e`（后台反馈）、`fe056fb`（名录头像 CLS 修复）。
- 自动化：`pnpm verify:all` 退出码为 `0`；Worker 全量测试 131 条通过，包含新增学生使用 `123456` 登录且必须首次改密的端到端断言。
- Worker：已部署版本 `aab813b8-0f21-4512-b4da-a9f795ada2a0`，健康接口返回 200。
- Pages：已部署到生产 `main` 分支，发布 URL 为 `https://3a0b4073.alumni-book.pages.dev`。
- 生产烟测：`/alumni-book-v2/`、`/alumni-book-v2/admin/`、`/alumni-book-v2/api/health`、`/alumni-book-v2/api/students` 均返回 200。
- 行为：后台新增学生会自动写入 `123456` 的 PBKDF2 哈希，状态为待改密；创建成功弹窗会提示管理员通知该同学首次登录后修改密码。接口不返回明文密码。
