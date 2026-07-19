# 阿里云 ECS 自托管迁移实施计划

> **给执行代理的要求：** 按复选框逐项执行；每个任务完成后运行该任务的验证命令。当前项目不启用子代理，所有改动由主代理在同一工作区完成。

**目标：** 将 `alumni-book-v2` 改造成可在 Alibaba Cloud Linux 3 ECS 上以 Node/Hono + SQLite + 本地文件存储 + Nginx 运行的全新数据实例。

**架构：** 保留现有 Hono 路由和 SQLite SQL 语义，通过 Node 运行时适配器提供 D1/R2 兼容接口。前端生成静态文件，Nginx 同源提供站点、后台和 `/api` 反向代理；旧 Cloudflare 数据不导入。

**技术栈：** Node.js 22、Hono、`better-sqlite3`、`@hono/node-server`、TypeScript、Docker Compose、Nginx、Alibaba Cloud Linux 3。

---

## 文件与职责地图

- 创建 `workers/api/src/runtime/sqlite.ts`：将 `better-sqlite3` 封装为现有路由使用的 D1 风格接口。
- 创建 `workers/api/src/runtime/localStorage.ts`：将本地目录封装为 R2 风格的 `put/get/head/delete/list` 接口，处理 MIME、ETag 和 Range。
- 创建 `workers/api/src/runtime/nodeEnv.ts`：读取环境变量，打开数据库和上传目录，组装 API 运行时绑定。
- 创建 `workers/api/src/node-server.ts`：Node HTTP 入口，调用 `app.fetch(request, env, executionContext)`。
- 创建 `workers/api/src/db/init-local.ts`：在新 SQLite 文件上按顺序执行 20 个迁移并确认关键表、角色和索引存在。
- 创建 `workers/api/src/db/create-admin.ts`：使用命令行参数或交互式输入创建新的主管理员，不写入源码。
- 创建 `workers/api/src/runtime/node-runtime.test.ts`：覆盖 SQLite、文件存储、Range 和路径穿越保护。
- 修改 `workers/api/src/index.ts`：移除 Node 环境无法使用的 Cache API 直接调用，并让 readiness 使用本地适配器。
- 修改 `workers/api/src/routes/files.ts`：保留 HTTP 行为，允许本地适配器在没有 Cloudflare Cache API 时正常运行。
- 修改 `workers/api/src/lib/publicCache.ts`：检测 `caches` 不存在时直接跳过边缘缓存。
- 修改 `workers/api/package.json`、`workers/api/tsconfig.json`：增加 Node 运行、迁移、初始化和测试脚本及依赖。
- 创建 `workers/api/Dockerfile`、`docker-compose.yml`、`deploy/nginx.conf`、`deploy/.env.example`：构建和运行 API、静态站点、后台与持久化目录。
- 修改 `packages/site-astro/astro.config.mjs`：支持通过构建环境注入同源或 IP 预发布 API 地址。
- 创建 `scripts/build-selfhosted.mjs`：以指定预发布 API 地址构建站点和后台，并检查产物未残留 Cloudflare Worker 地址。
- 创建 `scripts/smoke-selfhosted.mjs`：验证健康、readiness、站点、后台、CORS 和不存在文件响应。

---

### 任务 1：先写本地 SQLite 适配器的失败测试

**文件：**

- 创建：`workers/api/src/runtime/node-runtime.test.ts`
- 创建：`workers/api/src/runtime/sqlite.ts`

- [ ] **步骤 1：增加 SQLite 适配器契约测试**

测试必须验证：`prepare().bind().first()` 能读到值，`run()` 返回 `meta.changes`，`all()` 返回 `results`，`batch()` 在同一事务中提交两个写入，并且失败时回滚。

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
pnpm --filter worker exec vitest run src/runtime/node-runtime.test.ts
```

预期：因 `sqlite.ts` 尚未提供 `createSqliteDatabase` 而失败。

- [ ] **步骤 3：实现最小 SQLite D1 适配器**

实现 `createSqliteDatabase(filename)`，内部使用 `new Database(filename)`；`prepare(sql)` 返回 `bind(...values)`，并提供 `first<T>()`、`all<T>()`、`run()`；`batch(statements)` 使用 `db.transaction()`。`all()` 返回 `{ results: rows }`，`run()` 返回 `{ success: true, meta: { changes, last_row_id } }`。

- [ ] **步骤 4：运行测试确认通过**

运行同一 Vitest 命令，预期全部 SQLite 契约测试通过。

- [ ] **步骤 5：提交**

```powershell
git add workers/api/src/runtime/sqlite.ts workers/api/src/runtime/node-runtime.test.ts
git commit -m "feat: add local sqlite runtime adapter"
```

### 任务 2：实现本地文件存储并覆盖安全边界

**文件：**

- 创建：`workers/api/src/runtime/localStorage.ts`
- 修改：`workers/api/src/runtime/node-runtime.test.ts`

- [ ] **步骤 1：增加文件存储失败测试**

测试 `put` 写入文件后 `head` 返回大小、Content-Type 和 ETag；`get` 支持普通读取及 `Range: bytes=1-2`；`delete` 删除对象；`../secret`、绝对路径和空 key 均被拒绝。

- [ ] **步骤 2：实现本地 R2 兼容对象**

所有 key 先执行 `path.posix.normalize`，再确认解析后的绝对路径仍位于 `UPLOAD_ROOT`；写入使用临时文件后 rename，读取使用 `fs.createReadStream`；ETag 使用文件内容 SHA-256；`list` 只返回目录内对象。

- [ ] **步骤 3：运行测试**

```powershell
pnpm --filter worker exec vitest run src/runtime/node-runtime.test.ts
```

预期：文件存储、Range 和路径穿越测试通过。

- [ ] **步骤 4：提交**

```powershell
git add workers/api/src/runtime/localStorage.ts workers/api/src/runtime/node-runtime.test.ts
git commit -m "feat: add local file storage adapter"
```

### 任务 3：接入 Node API 入口和运行时配置

**文件：**

- 创建：`workers/api/src/runtime/nodeEnv.ts`
- 创建：`workers/api/src/node-server.ts`
- 修改：`workers/api/src/index.ts`
- 修改：`workers/api/package.json`
- 修改：`workers/api/tsconfig.json`

- [ ] **步骤 1：添加 Node 依赖和脚本**

增加 `@hono/node-server`、`better-sqlite3`、`dotenv` 运行依赖及对应类型依赖；增加脚本 `dev:node`、`start:node`、`db:init:local`、`db:create-admin`、`cleanup:local`。

- [ ] **步骤 2：实现运行时绑定**

`nodeEnv.ts` 读取 `DATABASE_PATH`、`UPLOAD_ROOT`、`JWT_SECRET`、`CORS_ORIGIN`，创建目录、SQLite 连接和本地文件适配器，返回与当前 Hono `Bindings` 结构一致的对象。

- [ ] **步骤 3：实现 Node HTTP 入口**

`node-server.ts` 使用 `serve` 监听 `PORT`（默认 `8787`），对每个请求调用 `app.fetch(request, env, { waitUntil: promise => void promise.catch(console.error) })`，并在进程退出时关闭 SQLite 连接。

- [ ] **步骤 4：移除 Node 下的 Cache API 硬依赖**

`publicCache.ts` 在 `typeof caches === 'undefined'` 时让 `matchPublicCache` 返回 `undefined`，让 `storePublicCache` 和 `clearPublicCache` 直接返回；`files.ts` 保留已有的 `typeof caches` 判断。

- [ ] **步骤 5：运行类型检查和 Node 健康测试**

```powershell
pnpm --filter worker typecheck
pnpm --filter worker exec vitest run src/runtime/node-runtime.test.ts
```

预期：类型检查通过，Node 运行时契约测试通过。

- [ ] **步骤 6：提交**

```powershell
git add workers/api/src/runtime/nodeEnv.ts workers/api/src/node-server.ts workers/api/src/index.ts workers/api/src/lib/publicCache.ts workers/api/src/routes/files.ts workers/api/package.json workers/api/tsconfig.json
git commit -m "feat: add node api runtime"
```

### 任务 4：实现新库迁移和主管理员初始化

**文件：**

- 创建：`workers/api/src/db/init-local.ts`
- 创建：`workers/api/src/db/create-admin.ts`
- 修改：`workers/api/src/db/seed.ts`
- 修改：`workers/api/package.json`

- [ ] **步骤 1：为初始化脚本增加空库测试**

验证新数据库执行全部迁移后存在 `students`、`site_config`、`admin_accounts`、`admin_roles`、`public_messages`、`direct_messages` 和 `notifications`，且学生、相册、留言均为 0 行。

- [ ] **步骤 2：实现迁移执行器**

按 `workers/api/migrations/*.sql` 的文件名排序，使用 SQLite 事务逐个执行；记录已执行文件名，重复执行时跳过已完成迁移。

- [ ] **步骤 3：实现主管理员创建命令**

命令从标准输入读取用户名和密码，使用项目现有密码哈希工具，插入 `admin_accounts`，并拒绝空密码、重复用户名和第二个 owner；命令输出只显示账号创建成功，不打印密码或哈希。

- [ ] **步骤 4：运行初始化验证**

```powershell
pnpm --filter worker db:init:local -- --database-path .tmp/alumni.sqlite
pnpm --filter worker exec tsx src/db/create-admin.ts --database-path .tmp/alumni.sqlite --username owner --password '只在本地测试使用的临时密码'
```

预期：迁移成功、关键表存在、主管理员可查询；测试数据库不得加入 Git。

- [ ] **步骤 5：提交**

```powershell
git add workers/api/src/db/init-local.ts workers/api/src/db/create-admin.ts workers/api/src/db/seed.ts workers/api/package.json
git commit -m "feat: initialize empty self-hosted database"
```

### 任务 5：构建同源站点、后台和部署文件

**文件：**

- 创建：`workers/api/Dockerfile`
- 创建：`docker-compose.yml`
- 创建：`deploy/nginx.conf`
- 创建：`deploy/.env.example`
- 创建：`scripts/build-selfhosted.mjs`
- 修改：`packages/site-astro/astro.config.mjs`
- 修改：`packages/admin/vite.config.ts`

- [ ] **步骤 1：添加构建环境契约测试**

测试构建脚本默认使用 `VITE_API_BASE_URL=/api`，站点构建地址由 `SELF_HOST_API_BASE` 注入，并在产物中拒绝 `alumni-book-api.chenyuhao2263.workers.dev` 和 `alumni-book.pages.dev`。

- [ ] **步骤 2：实现构建脚本**

脚本按顺序执行 `pnpm install --frozen-lockfile`、`pnpm build:admin`、`pnpm build:site`，将站点产物和后台产物复制到 Nginx 发布目录；构建失败或检测到 Cloudflare 生产地址时退出非零。

- [ ] **步骤 3：实现 Nginx 配置**

配置 `/` 指向 Astro 产物，`/admin/` 指向后台产物，`/api/` 反代到 `api:8787`，保留 `X-Forwarded-Proto`、`X-Forwarded-For` 和上传请求体大小；备案前使用 HTTP IP，不配置证书。

- [ ] **步骤 4：实现 Compose 和环境模板**

Compose 启动 `api` 和 `web` 两个服务，挂载 `/var/lib/alumni-book/data`、`/var/lib/alumni-book/uploads` 和 `/var/backups/alumni-book`；API 不发布公网端口，只暴露给 Compose 网络；`.env.example` 不包含真实密钥。

- [ ] **步骤 5：运行本地构建验证**

```powershell
pnpm verify:all
pnpm build:selfhosted -- --api-base http://127.0.0.1:8787
```

预期：现有质量门禁通过，站点和后台产物生成且不含 Cloudflare 生产地址。

- [ ] **步骤 6：提交**

```powershell
git add workers/api/Dockerfile docker-compose.yml deploy/nginx.conf deploy/.env.example scripts/build-selfhosted.mjs packages/site-astro/astro.config.mjs packages/admin/vite.config.ts
git commit -m "feat: add self-hosted web deployment"
```

### 任务 6：增加备份、清理和预发布 smoke test

**文件：**

- 创建：`scripts/backup-selfhosted.sh`
- 创建：`scripts/smoke-selfhosted.mjs`
- 创建：`deploy/alumni-book-cleanup.service`
- 创建：`deploy/alumni-book-cleanup.timer`
- 创建：`deploy/alumni-book-backup.service`
- 创建：`deploy/alumni-book-backup.timer`

- [ ] **步骤 1：实现备份脚本**

停止写入不作为前提；使用 SQLite 在线备份或 `.backup` 生成一致性副本，压缩数据库和上传目录到带时间戳的备份文件，保留最近 7 份，并在可用空间低于 5 GiB 时退出并打印告警。

- [ ] **步骤 2：实现定时任务**

清理任务每天执行 `cleanupExpiredSessions`；备份任务每天执行数据库和上传目录备份；systemd timer 不直接删除业务文件。

- [ ] **步骤 3：实现 smoke test**

检查 `/api/health` 为 200、`/api/readiness` 为 200、首页和 `/admin/` 为 200、`/api/files/does-not-exist` 为 404，并确认响应不含 Cloudflare Worker 地址。

- [ ] **步骤 4：运行测试并提交**

```powershell
node scripts/smoke-selfhosted.mjs --base-url http://127.0.0.1:8787
git add scripts/backup-selfhosted.sh scripts/smoke-selfhosted.mjs deploy/*.service deploy/*.timer
git commit -m "feat: add self-hosted operations checks"
```

### 任务 7：在 ECS 上安装基线并部署 IP 预发布

**远程路径：** `/opt/alumni-book/app`、`/var/lib/alumni-book/data`、`/var/lib/alumni-book/uploads`、`/var/backups/alumni-book`

- [ ] **步骤 1：只读确认安全组和系统包管理器**

通过 `admin` 执行 `sudo dnf makecache`、`sudo ss -lntp` 和 `df -h`，确认未占用 80/443，确认当前可用空间不低于 25 GiB。

- [ ] **步骤 2：安装 Docker 和 Compose**

使用 Alibaba Cloud Linux 3 官方 Docker 仓库或系统包，安装后执行 `sudo systemctl enable --now docker`，并用 `sudo docker run --rm hello-world` 验证。

- [ ] **步骤 3：上传代码并创建服务器配置**

只上传已验证 Git 提交；在服务器生成 `.env`，设置随机 `JWT_SECRET`、`CORS_ORIGIN=http://118.178.88.227`、SQLite 路径和上传根目录；真实密钥只写服务器文件，权限设为 `600`。

- [ ] **步骤 4：初始化空库并启动 Compose**

执行迁移命令，创建新的主管理员，然后 `sudo docker compose up -d --build`；确认两个容器健康、80 端口监听、readiness ready。

- [ ] **步骤 5：执行 IP smoke test**

```powershell
node scripts/smoke-selfhosted.mjs --base-url http://118.178.88.227
```

预期：公开站点、后台、健康检查和 API 文件 404 均通过。

- [ ] **步骤 6：提交部署记录**

记录 ECS 部署提交 SHA、镜像构建时间、数据库迁移版本和 smoke test 输出；不记录管理员密码、JWT 密钥或 SSH 私钥。

### 任务 8：端到端功能验收与备案后切换

**文件：** `docs/deployment-runbook.md`、`docs/operations-data-recovery.md`

- [ ] **步骤 1：通过新后台录入测试同学**

创建一名测试同学，完成账号登录、资料编辑、头像上传、背景上传、相册创建、照片上传、留言、群聊、通知和私信验证。

- [ ] **步骤 2：验证持久化和恢复**

重启 API 与 Nginx 容器，确认测试数据和文件仍在；执行一次备份，再将备份复制到临时目录验证 SQLite 可打开。

- [ ] **步骤 3：更新运维文档**

补充 IP 预发布启动、停止、日志、备份恢复和 40G 磁盘巡检命令；明确 Cloudflare 旧数据不属于新实例数据源。

- [ ] **步骤 4：备案完成后配置域名 HTTPS**

将域名 A 记录指向 `118.178.88.227`，配置 Nginx HTTPS，更新 `CORS_ORIGIN` 和前端构建地址，重新构建并运行域名 smoke test；验证通过后再决定是否停止 Cloudflare 线上服务。

---

## 计划自审

- 设计说明中的 Node 入口、SQLite、文件存储、定时清理、Docker、Nginx、IP 预发布、备份和域名切换均有对应任务。
- 已检查计划全文，不包含未定义的占位任务。
- `createSqliteDatabase`、`LocalStorage`、`nodeEnv` 和 `node-server` 的职责在文件地图中先定义，再在任务中使用。
- 每个实现任务包含失败测试、实现、验证和提交步骤；服务器任务先检查再安装，不导入旧数据。
