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

## 阿里云 ECS IP 预发布（当前部署）

备案完成前，访问入口为 `http://118.178.88.227`。本实例不导入 Cloudflare D1/R2 数据，数据库和上传目录均从空目录开始。

服务器关键路径：

- 应用：`/opt/alumni-book/app`
- SQLite：`/var/lib/alumni-book/data/alumni.sqlite`
- 上传：`/var/lib/alumni-book/uploads`
- 备份：`/var/backups/alumni-book`
- 静态站点：`/www/wwwroot/alumni-book`
- 版本目录：`/www/wwwroot/releases/<完整提交 SHA>`
- aaPanel Nginx：`/www/server/panel/vhost/nginx/alumni-book.conf`

日常巡检（通过 Workbench 或 SSH 以 `admin` 执行）：

```bash
cd /opt/alumni-book/app
podman-compose ps
systemctl is-active alumni-book-api.service alumni-book-backup.timer alumni-book-cleanup.timer
df -h /var/lib/alumni-book /var/backups/alumni-book
curl -fsS http://127.0.0.1:8787/api/health
curl -fsS http://127.0.0.1:8787/api/readiness
```

从本地验收公网入口：

```powershell
$releaseSha = (git rev-parse HEAD).Trim()
node scripts/smoke-selfhosted.mjs --base-url http://118.178.88.227 --expected-sha $releaseSha
```

### 静态站点原子发布

本地必须先使用完整提交 SHA 构建，再通过现有受控上传渠道把 `deploy/selfhosted` 和对应应用代码同步到 `/opt/alumni-book/app`。仓库脚本不保存或读取 SSH 密码、私钥：

```powershell
$env:RELEASE_SHA = (git rev-parse HEAD).Trim()
pnpm build:selfhosted -- --api-base http://118.178.88.227
Remove-Item Env:RELEASE_SHA
```

服务器上的候选 API 必须先在独立 loopback 端口启动，并使用独立的候选数据库和上传目录；staging 前禁止重启或替换监听 `127.0.0.1:8787` 的线上 API。原子发布脚本会直接从最终 `/www/wwwroot/releases/$RELEASE_SHA` 启动临时 HTTP staging，并把 `/api` 代理到候选 API，因此不再使用服务 `deploy/selfhosted` 的固定 staging 容器：

```bash
cd /opt/alumni-book/app
export RELEASE_SHA='<本次完整 40 位提交 SHA>'
# 先以受控发布工具在 127.0.0.1:8788 启动候选 API；不得占用线上 8787，
# DATABASE_PATH 与 UPLOAD_ROOT 必须指向候选专用目录。
pnpm release:selfhosted:atomic -- deploy \
  --release-sha "$RELEASE_SHA" \
  --artifact-dir /opt/alumni-book/app/deploy/selfhosted \
  --candidate-api-base-url http://127.0.0.1:8788 \
  --retain 3
```

脚本先把候选产物准备到 `/www/wwwroot/releases/$RELEASE_SHA`，再由 loopback staging 对该最终目录和隔离候选 API 执行完整 smoke，并强制静态清单、API health 和 expected SHA 三者一致。只有 smoke 成功后才会在 `/www/wwwroot` 内创建临时 symlink 并以 rename 原子替换 `alumni-book`；staging 失败不会触碰当前 symlink 或线上 API。成功后清理旧版时会显式保护切换前 live symlink 指向的版本，即使它是刚回滚到的较老版本，也至少保留当前版本和两个历史版本。

首次启用前，如果 `/www/wwwroot/alumni-book` 仍是实体目录，需要在维护窗口把它移动到独立的 pre-atomic 备份目录并立即用指向该备份的 symlink 替代。由于旧线上版本当前无法证明完整 SHA，不得把它伪装成 `/releases/<SHA>`；在积累三个已验证版本前保留这份备份。此一次性迁移不是后续原子发布脚本的一部分。

明确回滚到已保留的历史版本：先把 API 应用和 `deploy/.env` 恢复到同一个目标 SHA并重启 API，再原子切换静态 symlink，最后用目标 SHA 做公网 smoke。不要只改 `RELEASE_SHA` 来冒充旧 API 代码：

```bash
cd /opt/alumni-book/app
pnpm release:selfhosted:atomic -- rollback \
  --release-sha '<目标完整 40 位提交 SHA>' \
  --candidate-api-base-url http://127.0.0.1:8788
node scripts/smoke-selfhosted.mjs \
  --base-url http://118.178.88.227 \
  --expected-sha '<目标完整 40 位提交 SHA>'
```

重启 API（不会删除 SQLite 或上传文件）：

```bash
sudo systemctl restart alumni-book-api.service
podman-compose ps
```

如果通过 Windows 工具上传运维脚本，安装 systemd unit 前要确保脚本使用 Unix LF 换行并可执行；否则会出现 `203/EXEC`：

```bash
sudo sed -i 's/\r$//' /opt/alumni-book/app/scripts/backup-selfhosted.sh
sudo chmod 755 /opt/alumni-book/app/scripts/backup-selfhosted.sh
```

备份由 `alumni-book-backup.timer` 每日 UTC 04:00 执行，过期会话清理由 `alumni-book-cleanup.timer` 每日 UTC 03:00 执行。查看最近记录：

```bash
systemctl list-timers 'alumni-book-*'
journalctl -u alumni-book-backup.service -n 50 --no-pager
journalctl -u alumni-book-cleanup.service -n 50 --no-pager
ls -lh /var/backups/alumni-book
```

恢复前先停止 API，并确认目标备份文件；恢复后重新启动服务并运行 health/readiness 及公网 smoke。不要删除现有备份作为“清理”步骤：

```bash
sudo systemctl stop alumni-book-api.service
sudo tar -xzf /var/backups/alumni-book/alumni-book-YYYYMMDDTHHMMSSZ.tar.gz \\
  -C /var/lib --overwrite
sudo chown -R admin:admin /var/lib/alumni-book
sudo systemctl start alumni-book-api.service
```

备案完成后的切换顺序：先将域名 A 记录指向 `118.178.88.227`，再在 aaPanel 配置 HTTPS；更新服务器 `deploy/.env` 的 `CORS_ORIGIN`，以正式域名重新执行自托管构建并运行域名 smoke。Cloudflare 仅作为开发测试链路保留，不作为阿里云商用发布回退。
