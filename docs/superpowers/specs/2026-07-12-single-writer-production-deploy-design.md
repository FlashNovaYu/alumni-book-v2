# Cloudflare Pages 单一生产发布者设计

## 问题

Cloudflare Pages 项目没有 Git Provider，所有发布均为 Wrangler 直接上传。仓库现有工作流同时响应 `main`、旧 `master`、每日定时任务和手动触发，并一律使用 `--branch main` 写入生产。与此同时，本机多个工作树也保留同一条生产命令。GitHub concurrency 不覆盖本机发布，现有 smoke 只验证可用性，不验证产物来源，因此任意旧工作树或旧任务都能覆盖生产。

## 决策

采用“单一生产写入者”方案：

- push 和 pull request 只运行验证 CI，绝不持有 Cloudflare 凭据或执行部署。
- 生产发布只由 `deploy-site.yml` 的 `workflow_dispatch` 触发。
- 生产任务必须运行在 `main`，输入明确确认词，并通过 GitHub `production` Environment 审批。
- 生产任务开始时执行独立守卫，拒绝非 GitHub Actions、非手动事件、非 `main`、SHA 不匹配或脏工作树。
- Wrangler 显式携带 `GITHUB_SHA`，并标记 `commit-dirty=false`。
- Pages 产物包含 `/release.json`；生产 smoke 必须验证其中 SHA 与本次工作流 SHA 一致。
- GitHub 工作流旧运行使用 `cancel-in-progress: true`，但验证和生产使用不同 concurrency group。
- 删除 AGENTS/CLAUDE 中直接生产发布命令，改为预览分支命令和 GitHub 手动生产说明。
- 配置 GitHub `production` Environment、仅允许 `main`，并保护 `main` 分支。
- GitHub 路径完成验证后撤销本机 Wrangler OAuth，消除本机代理直接写生产的能力。

## 工作流边界

### 验证 CI

触发条件为 `main` push 和指向 `main` 的 pull request。它安装依赖与 Chromium，创建测试专用 `.dev.vars`，运行 `pnpm verify:all`，不读取 Cloudflare secrets。

### 生产发布

只允许手动触发，要求输入 `DEPLOY_PRODUCTION`。生产 job 绑定 `production` Environment，在任何构建前执行守卫。随后完成验证、Pages 打包、生产上传及带版本核对的 smoke。

## 防回退门禁

`release.json` 由打包脚本生成，至少包含完整 40 位提交 SHA。Smoke 同时验证 HTTP/API/R2 和发布 SHA。这样即使某个任务错误地检查了旧产物，也不能以新 SHA 通过验收。

静态契约测试负责防止以下配置回归：定时部署、push 部署、`master`、`commit-dirty=true`、缺少 Environment、缺少守卫、缺少发布版本核对，以及文档中的本地生产命令。

## 安全与回滚

- Cloudflare 凭据只存在于 GitHub Secrets，不写入仓库或日志。
- Environment 审批发生在 job 获取 secrets 之前。
- 回滚使用 Cloudflare 已有部署记录，不通过旧工作树重新构建。
- 本次只改变发布控制，不重新部署生产页面。

## 成功标准

- 普通 push 不产生 Cloudflare Production deployment。
- 定时任务和 `master` push 不再存在生产入口。
- 非 `main` 手动运行在守卫处失败。
- 生产产物 SHA 与工作流 SHA 不一致时 smoke 失败。
- GitHub 环境和分支保护启用后，本机 OAuth 被撤销。

