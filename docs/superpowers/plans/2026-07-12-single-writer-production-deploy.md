# Cloudflare Pages 单一生产发布者 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将生产发布收敛为 GitHub `main` 的手动审批流程，并通过来源与产物 SHA 门禁阻止旧版本覆盖。

**Architecture:** `verify.yml` 只验证代码；`deploy-site.yml` 只负责审批后的生产发布。独立 Node 守卫验证 GitHub 上下文，打包脚本写入 `release.json`，smoke 将线上 SHA 与工作流 SHA 对齐。

**Tech Stack:** GitHub Actions、Node.js、Vitest、Wrangler、Cloudflare Pages、GitHub REST API。

---

### Task 1: 发布安全契约

**Files:**
- Create: `packages/site-astro/tests/deployment-safety-static.test.ts`
- Modify: `packages/site-astro/package.json`

- [ ] 写失败测试，断言部署工作流无 `push`、`schedule`、`master` 和 `commit-dirty=true`，并包含 Environment、确认输入、守卫、显式 SHA 与版本 smoke。
- [ ] 运行该测试，确认它因现有自动生产配置而失败。
- [ ] 将测试加入站点静态测试命令。

### Task 2: 可执行的生产上下文守卫

**Files:**
- Create: `scripts/production-deploy-guard.mjs`
- Create: `packages/site-astro/tests/production-deploy-guard.test.ts`

- [ ] 为合法 main 手动发布和五类拒绝场景编写失败测试：非 Actions、非 workflow_dispatch、非 main、SHA 不一致、脏工作树。
- [ ] 实现纯函数 `validateProductionDeploy(context)`，CLI 模式从环境与 Git 读取上下文并在失败时退出 1。
- [ ] 运行守卫测试并确认通过。

### Task 3: 验证与生产工作流分离

**Files:**
- Create: `.github/workflows/verify.yml`
- Modify: `.github/workflows/deploy-site.yml`

- [ ] 将验证 CI 配置为 main push 和 pull request，仅运行测试且不引用 Cloudflare secrets。
- [ ] 将生产工作流改为仅 `workflow_dispatch`，要求 `DEPLOY_PRODUCTION`，绑定 `production` Environment，设置 `cancel-in-progress: true`。
- [ ] 在生产构建前运行守卫，并使用 `--commit-hash "$GITHUB_SHA" --commit-dirty=false` 发布。
- [ ] 运行静态安全契约并确认转绿。

### Task 4: 发布版本证明

**Files:**
- Modify: `scripts/prepare-pages-deploy.mjs`
- Modify: `scripts/smoke-pages.mjs`
- Modify: `packages/site-astro/tests/pages-deployment-static.test.ts`

- [ ] 先写失败测试，要求打包脚本生成 `release.json`，smoke 使用 `PAGES_EXPECTED_SHA` 校验。
- [ ] 生成包含完整提交 SHA 的发布元数据。
- [ ] 在 smoke 中读取线上 `/release.json` 并与预期 SHA 比较。
- [ ] 本地打包后验证元数据与当前 HEAD 一致。

### Task 5: 清理危险入口并配置 GitHub

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Create: `docs/deployment-runbook.md`

- [ ] 删除文档中的本地 `--branch main` 指令，保留唯一的预览发布方式。
- [ ] 记录 GitHub 手动审批、Cloudflare 历史部署回滚和禁止本地生产发布规则。
- [ ] 推送修复分支并合入最新 main；确认 push 只触发 Verify 工作流。
- [ ] 创建 GitHub `production` Environment，限制为 main 并配置审批。
- [ ] 启用 main 分支保护，要求 Verify 检查通过。
- [ ] 验证远端配置后执行 Wrangler logout，撤销本机生产写入凭据。

### Task 6: 最终验证

**Files:**
- Create: `docs/deployment-single-writer-acceptance.md`

- [ ] 运行发布守卫单测、工作流静态契约、类型检查和 `pnpm verify:all`。
- [ ] 检查 GitHub Actions 最新 push 只有验证任务，没有部署步骤。
- [ ] 检查 Cloudflare Production 部署 ID 在修复 push 前后不变。
- [ ] 记录取消的危险运行、测试结果、GitHub 环境/分支保护和本机登出状态。
