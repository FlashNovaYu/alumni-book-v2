# Phase 14 聊天返工验收报告

## 验收基线

- 分支：`codex/class-space-chat-rework`
- 验收时基线提交：`97f7251ec6f98ba38e411a971b0307671a3547c6`
- 验收时间：2026-07-11 19:49 - 19:54（Asia/Shanghai）
- 本报告覆盖 Task 17 的未提交验收门禁改动；生产迁移和部署不在本次验收范围内。

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

## 本地迁移依据

本次没有再次执行 `pnpm migrate:chat-data -- --local`，因为该命令会改写本地 D1 状态。迁移逻辑已包含在本次通过的 Worker 全量测试中；此前记录的两次本地演练见 `docs/phase-14-backend-compatibility-acceptance-report.md`：

- 源私聊线程：3
- 源私聊消息：5
- 目标私聊会话：2
- 目标私聊消息：5
- 迁移通知：1
- `anomalies`：0

两次演练的目标数量一致，记录结论为幂等。远程 D1 备份、迁移和复核尚未执行。

## 已知限制

- 群聊与信箱使用可见性驱动的五秒轮询，而非 WebSocket 实时推送。
- 私聊暂不支持图片或文件附件。
- 私聊不向发送方展示已读回执。

## 未执行的生产步骤

- 未导出远程 D1 备份。
- 未应用远程 `0012_chat_rework.sql` 迁移，未运行远程旧数据归并。
- 未部署 Worker 或 Cloudflare Pages，未进行生产双账号冒烟测试。

上述步骤属于 Task 18，必须先完成远程备份并将迁移报告、Worker 版本和 Pages URL 追加到本报告后再标记上线完成。
