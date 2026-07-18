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
