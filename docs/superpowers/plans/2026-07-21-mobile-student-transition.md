# Mobile Student Transition Timing Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with review checkpoints.

**Goal:** 在不改变桌面端的前提下，放慢手机端同学档案卡进入/返回过渡，并将相关提交合并部署到阿里云。

**Architecture:** 继续使用现有 View Transition 伪元素和共享元素命名，仅在 `max-width: 768px` 媒体查询中覆盖手机端时长、延迟和关键帧。通过静态测试锁定移动端专属规则，保留现有 JavaScript 状态管理和 reduced-motion 降级。

**Tech Stack:** Astro View Transitions、CSS keyframes、Vitest/Node 静态测试、Playwright、pnpm、自托管静态构建、SSH/scp。

---

### Task 1: 锁定移动端 CSS 合同

**Files:**
- Modify: `packages/site-astro/tests/active-card-motion-static.test.ts`

- [ ] 添加测试读取 `styles/view-transitions.css`，断言存在 `@media (max-width: 768px)`，并在该媒体查询中包含 `student-edge-expand`、`student-edge-contract`、`.student-identity` 和 `student-card-details-collapse` 的移动端覆盖。
- [ ] 断言移动端边缘动画时长为 `1.05s`、身份移动延迟为 `0.14s` 且时长为 `0.9s`、详情坍缩时长为 `0.62s`。
- [ ] 运行 `pnpm --filter site-astro exec vitest run tests/active-card-motion-static.test.ts`，确认新增断言在实现前失败。

### Task 2: 实现移动端专属节奏

**Files:**
- Modify: `packages/site-astro/src/styles/view-transitions.css`

- [ ] 保持现有桌面端 `0.82s`、`0.7s` 和 `0.48s` 参数不变。
- [ ] 在文件末尾新增 `@media (max-width: 768px)`，覆盖进入/返回 root 过渡、`.student-identity` 和 `.student-card-details` 的时长与延迟。
- [ ] 为手机端使用独立关键帧：前 20% 缓慢起步，中段持续扩散/坍缩，100% 完成覆盖；返回方向使用同样节奏的反向收缩。
- [ ] 不改变 `prefers-reduced-motion` 规则和 JavaScript 状态管理。

### Task 3: 定向验证

**Files:**
- No new files.

- [ ] 运行移动端静态测试、主题静态测试和档案身份转场 Playwright 测试。
- [ ] 运行 `pnpm --filter site-astro typecheck` 或仓库现有等价类型检查。
- [ ] 使用移动视口执行档案卡进入/返回测试，确认动画完成、头像姓名无重影且桌面测试不回归。

### Task 4: 合并相关提交并发布

**Files:**
- Include only task-owned files and the already validated recent related commits; preserve unrelated dirty worktree files.

- [ ] 检查当前 `main`、`origin/main` 和最近提交，确认不把用户未提交的后台、音频或文档改动带入发布。
- [ ] 将移动端实现和测试提交为独立提交；如相关最近提交尚未在远端，则只合并明确属于本次动效的提交。
- [ ] 推送发布提交到 `origin/main`。

### Task 5: 阿里云发布与验收

**Files:**
- Build artifact: `deploy/selfhosted` in a clean worktree.

- [ ] 使用完整发布 SHA 和 `pnpm build:selfhosted -- --api-base http://118.178.88.227` 构建干净产物。
- [ ] 通过临时目录上传，再使用服务器端受控 sudo 原子替换 `/www/wwwroot/releases/<SHA>` 和 `alumni-book` symlink。
- [ ] 验证线上 `/release.json` 与 `/api/health` 的 SHA 相同，并执行允许当前 HTTP 预发布入口的 smoke 检查。
- [ ] 下载线上 `/roster/` CSS，确认移动端规则已进入发布产物。
