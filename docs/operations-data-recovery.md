# 数据备份、恢复与对象存储巡检

这些命令用于本地恢复演练和人工生产核查。脚本默认不连接远程资源；带有 `--remote` 的命令必须由有权限的运维人员在变更窗口内执行。

## D1 备份与恢复演练

先应用当前迁移，再导出本地数据库：

```bash
pnpm --filter worker run db:migrate -- --local
npx tsx scripts/backup-d1.ts
```

生产备份只生成本地 SQL 文件，不会修改数据库：

```bash
npx tsx scripts/backup-d1.ts --remote
```

恢复演练必须先在本地数据库验证：

```bash
pnpm --filter worker run db:migrate -- --local
npx wrangler d1 execute alumni-book-db --local --config workers/api/wrangler.toml --file=backups/backup_YYYYMMDD_HHMMSS_local.sql
```

生产恢复是高风险写操作，必须先确认备份校验和、停止应用写入并取得审批；本项目不会在部署、定时任务或孤儿扫描中自动执行远程恢复。

## R2 孤儿对象只读报告

扫描器读取 D1 中所有已引用的头像、音乐、背景、相册封面、照片和时光轴对象，再读取 R2 清单，输出未被引用的 key。它是只读报告，不会自动删除生产对象：

```bash
OPS_ADMIN_TOKEN=... npx tsx scripts/report-r2-orphans.ts --base-url=http://127.0.0.1:8787
OPS_ADMIN_TOKEN=... OPS_BASE_URL=https://alumni-book.pages.dev npx tsx scripts/report-r2-orphans.ts --remote
```

报告接口仅允许主管理员访问，并通过 R2 绑定执行分页读取；脚本不依赖 Wrangler 的对象删除命令。

人工确认孤儿对象后，另行走 Cloudflare 变更流程；不要把删除命令加入此脚本或定时触发器。

## 定时清理

Worker 的每日 `0 3 * * *`（UTC）触发器调用 `cleanupExpiredSessions`，只清理已过期的 `classmate_sessions`、`admin_sessions` 和 `auth_login_attempts`，不会删除仍有效的会话或 R2 对象。每次执行输出结构化 `scheduled_cleanup` 日志，便于核对清理数量。

## 阿里云 ECS 自托管备份与恢复

当前 ECS 使用 SQLite 和本地文件目录，不使用 OSS。备份脚本通过 SQLite 在线备份生成一致性快照，再将数据库快照和上传目录打包到 `/var/backups/alumni-book`，默认保留最近 7 份；可用空间低于 5 GiB 时会拒绝继续备份。

手动演练：

```bash
cd /opt/alumni-book/app
sudo systemctl start alumni-book-backup.service
ls -lh /var/backups/alumni-book
```

恢复必须在 Workbench 中人工确认备份文件后进行。先停止 API，再解压选定归档，恢复 `admin:admin` 所有权并启动服务；最后检查 `/api/health`、`/api/readiness` 和公网 smoke。恢复操作不会从 Cloudflare 导入数据，也不会自动覆盖未确认的目录。

```bash
sudo systemctl stop alumni-book-api.service
sudo tar -xzf /var/backups/alumni-book/alumni-book-YYYYMMDDTHHMMSSZ.tar.gz \\
  -C /var/lib --overwrite
sudo chown -R admin:admin /var/lib/alumni-book
sudo systemctl start alumni-book-api.service
```

会话清理由 `alumni-book-cleanup.timer` 每日 UTC 03:00 执行，仅删除过期的 SQLite 会话和登录限流记录；不会删除上传对象。备份由 `alumni-book-backup.timer` 每日 UTC 04:00 执行。两者均以 rootless Podman 的 `admin` 用户运行，勿改为 root 容器。
