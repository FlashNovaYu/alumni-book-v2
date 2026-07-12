# Astro 安全升级与生产发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 升级 Astro 运行时及其 Vue 集成以消除已知依赖公告，并将验证通过的全部当前改动发布到生产环境。

**Architecture:** 站点从 Astro 5 升级到当前 Astro 7.0.7，同时使用兼容的 `@astrojs/vue` 7.0.1。Astro 7 将 Vite 链升级到使用已修复 esbuild 的范围，并要求 Node 22.12 以上，因此所有 CI 和生产工作流统一改为 Node 22。先以依赖审计和现有全量测试锁定兼容性，再只针对真实失败做最小修复。

**Tech Stack:** pnpm workspace、Astro 6、Vue 3、Vite、GitHub Actions、Cloudflare Pages。

---

### Task 1: 升级受影响的站点运行时

**Files:**
- Modify: `packages/site-astro/package.json`
- Modify: `workers/api/package.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: 记录升级前依赖审计失败**

Run: `pnpm audit --prod --audit-level low`

Expected: Astro 5.18.1 命中所有 Astro 公告，且锁文件中的 esbuild、Babel、js-yaml 版本仍受影响。

- [ ] **Step 2: 升级 Astro 与 Vue 集成**

Run: `pnpm --filter site-astro up astro@7.0.7 @astrojs/vue@7.0.1 @cloudflare/workers-types@5.20260712.1; pnpm -r up tsx@4.23.0; pnpm --filter worker up wrangler@4.110.0 @cloudflare/vitest-pool-workers@0.18.4 @cloudflare/workers-types@5.20260712.1`

Expected: `package.json` 记录 Astro `^7.0.7` 和 `@astrojs/vue` `^7.0.1`；Worker 开发工具与最新测试池对齐；锁文件解析出 esbuild `0.28.1`。

- [ ] **Step 3: 验证站点类型与构建**

Run: `pnpm --filter site-astro typecheck; pnpm --filter site-astro build`

Expected: 类型检查和 22 个静态页面构建通过；如有 Astro 6 兼容性错误，仅修改错误直接涉及的源码。

### Task 2: 对齐 CI 与生产运行时

**Files:**
- Modify: `.github/workflows/verify.yml`
- Modify: `.github/workflows/deploy-production.yml`
- Modify: `.github/workflows/deploy-worker.yml`

- [ ] **Step 1: 将三份工作流的 Node 版本更新为 22**

Replace each `node-version: 20` with `node-version: 22`.

- [ ] **Step 2: 验证工作流配置与锁文件一致**

Run: `rg -n 'node-version: 20|astro@5|@astrojs/vue@5' .github packages/site-astro/package.json pnpm-lock.yaml`

Expected: 命令无匹配；Node 22 满足 Astro 7.0.7 的 `>=22.12.0` 要求。

### Task 3: 安全与回归验证

**Files:**
- Test: 现有 `packages/site-astro/tests/*`

- [ ] **Step 1: 运行完整质量门禁**

Run: `pnpm verify:all`

Expected: Worker、共享包、后台、站点静态与 Chromium 测试全部通过。

- [ ] **Step 2: 重新审计生产依赖**

Run: `pnpm audit --prod --audit-level low`

Expected: 无 high、moderate、low 已知公告。

- [ ] **Step 3: 准备 Pages 产物并执行安全扫描**

Run: `pnpm prepare:pages; rg -n 'accountStatus|accountLastLoginAt' deploy/data/students.json deploy/student -g '*.html' -g '*.json'`

Expected: Pages 只完成准备；公开产物无内部账号元数据。

### Task 4: 合并、推送和生产发布

**Files:**
- Include: 当前工作树中全部已批准改动（包括 `packages/site-astro/src/components/RosterWall.vue` 与根目录 `{`）

- [ ] **Step 1: 创建合并提交并推送 main**

Run: `git add -A; git commit -m "chore: release security hardening"; git push origin main`

Expected: 工作树干净，远程 `main` 指向该提交。

- [ ] **Step 2: 等待 Verify 工作流成功**

Run: `gh run watch <verify-run-id> --exit-status`

Expected: GitHub Actions Verify 成功。

- [ ] **Step 3: 触发生产 Pages 工作流**

Run: `gh workflow run deploy-production.yml --ref main -f confirmation=DEPLOY_PRODUCTION`

Expected: 工作流进入生产环境审批和发布流程。

- [ ] **Step 4: 观察发布并验证线上版本**

Run: `gh run watch <deploy-run-id> --exit-status; pnpm smoke:pages`

Expected: 工作流成功，`/release.json` 与提交 SHA 一致。
