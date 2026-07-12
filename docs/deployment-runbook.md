# 部署运行手册

## 生产发布

1. 确认目标提交已经位于 GitHub `main`，且 Verify 工作流通过。
2. 在 GitHub Actions 打开 `Deploy Site & Admin`。
3. 从 `main` 手动运行，输入确认词 `DEPLOY_PRODUCTION`。
4. 审核 `production` Environment 请求后批准。
5. 工作流验证、构建并发布，最后核对线上 `/release.json` 与工作流 SHA。

生产工作流不能通过 push、定时任务、`master` 或本地 Wrangler 触发。

## 预览发布

本地需要检查 Cloudflare 行为时只能使用非生产分支，例如：

```powershell
pnpm prepare:pages
pnpm --filter worker exec wrangler --cwd ../.. pages deploy deploy --project-name alumni-book --branch preview-network-check --commit-dirty=false
```

预览分支名不得使用 `main` 或 `master`。

## 回滚

出现生产故障时，在 Cloudflare Pages 的 Deployments 中选择已验证的历史生产部署执行 Rollback。不要检出旧工作树重新构建，因为旧源码、实时数据和构建工具可能产生与历史产物不同的结果。
