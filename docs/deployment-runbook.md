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

## 媒体变体回填

先从 D1 导出 `students` 与 `photos` 为本地 JSON，并准备原图目录（或在导出中提供 `files` 映射），执行：

```powershell
pnpm media:backfill --input=media-export.json --assets-dir=./assets --dry-run --batch=25 --retries=3
```

确认计划后，使用 `--execute` 在本地 Wrangler D1/R2 执行；只有明确需要写入远程资源时才额外使用 `--remote`：

```powershell
pnpm media:backfill --input=media-export.json --assets-dir=./assets --execute --batch=25 --retries=3
pnpm media:backfill --input=media-export.json --assets-dir=./assets --execute --remote --batch=25 --retries=3
```

脚本会使用 ffmpeg 生成 WebP，编码失败时回退 JPEG，并通过 Wrangler 分批上传 R2、更新 D1 `media_json`；失败任务按 `--retries` 重试。旧 `students.photos` 字符串数组没有独立 `photos.id` 时只生成并上传派生文件，保留原数组并输出告警。回填始终保留原图；需要回滚时清除变体元数据即可，原始 `r2_key` 不变。
