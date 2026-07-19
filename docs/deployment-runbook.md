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

## 阿里云 ECS 自托管媒体

当前 ECS 部署使用 Node/Hono 的本地文件存储适配器，媒体 URL 仍统一为 `/api/files/<key>`；因此前端的 `srcset`、WebP 变体和旧原图回退不依赖 Cloudflare R2 专有 API。

- 持久化挂载 `/var/lib/alumni-book/data`（SQLite）和 `/var/lib/alumni-book/uploads`（原图及变体），不得使用容器临时目录。
- `deploy/nginx.conf` 的 `client_max_body_size` 必须不低于 Worker 上传上限；当前配置为 `20m`，覆盖头像、背景、相册和 misc 图片限制。
- 变体文件与原图放在同一上传根目录，保留 `avatars/`、`backgrounds/`、`photos/`、`misc/` 前缀；不要在 Nginx 中改写 key。
- 文件响应必须保留 Content-Type、ETag、immutable 缓存和 Range 行为；上线前使用 Node smoke 检查至少验证一个 WebP 变体。
- 本阶段不把阿里云 AccessKey、OSS endpoint 或服务器私钥写入仓库。未来接入 OSS/CDN 时，只替换存储/文件服务适配层，数据库中的相对 key 和前端组件保持不变。
- ECS 备份需同时覆盖 SQLite 和上传目录；清理旧对象前先生成只读引用报告，不能仅按文件扩展名删除。
