# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev:site                  # 公开站点 (localhost)
pnpm dev:admin                 # 管理后台 (localhost)
pnpm dev:worker                # Worker API (wrangler 本地)

# 构建
pnpm build:site
pnpm build:admin

# Worker 部署
pnpm --filter worker run deploy

# 数据迁移
pnpm migrate:data               # 运行 scripts/migrate.ts
```

**重要：** 本地开发时，前端通过 `VITE_API_BASE_URL` 环境变量指向后端 API。默认值为 `https://alumni-book-api.chenyuhao2263.workers.dev`。如需指向本地 Worker，在 shell 中设置该环境变量后重启 dev server。

## 架构概览

### Monorepo 结构（pnpm workspace）

- `packages/site-astro` — 面向访客的 Astro 5 SSG 站点，交互部分使用 Vue islands
- `packages/admin` — 管理后台 Vue 3 SPA，base path `/alumni-book-v2/admin/`
- `packages/shared` — 类型定义 (`types.ts`)、API 封装 (`utils.ts` 中的 `apiFetch`) 和设计令牌 (`tokens.css`)
- `workers/api` — Cloudflare Worker，框架为 Hono，绑定 D1（SQLite）和 R2（对象存储）
- `scripts/migrate.ts` — 从旧版系统迁移数据的脚本

### 公开站点的同学账号会话认证

公开站点通过“同学账号”进行半公开门控。访客在首页选择自己名字并输入密码（由管理员在后台生成/重置的初始密码，或其自定义密码）。密码在 Worker 后端使用 PBKDF2 算法与盐进行校验。

成功后，后端会在 `classmate_sessions` 数据表中创建会话记录，并返回 Session Token。前台保存该 Token 并使用 `@alumni/shared` 提供的 helper 写入全局 Session；后续前台发起个人资料自助编辑（`PUT /api/classmate/students/:slug`）或头像背景上传（`POST /api/classmate/upload`）时，均在 `X-Classmate-Token` 请求头中附加此 Token 进行查表鉴权。此外，在页面切换时由 `MainLayout.astro` 中的重定向守卫对此 Token 进行解密与降级验证，未登录用户将被强制重定向回首页。

### 管理后台的 JWT 认证

管理后台使用 JWT 进行认证。`adminLogin()` 将密码发送至 `/api/auth/login`，成功后将 JWT 存入 `sessionStorage.setItem('admin_token', token)`。`adminFetch()` 会自动在每个请求头中附加 `Authorization: Bearer <token>`。后台路由守卫在 `main.ts` 的 `router.beforeEach` 中检查该 token。

JWT 密钥通过 Cloudflare Worker 的环境变量 `JWT_SECRET` 配置，在 `wrangler.toml` 中定义。

### 两个不同的 API 客户端

- `packages/site/src/api/client.ts` — 使用 `@alumni/shared` 中的 `apiFetch` 工具函数，**不**附加认证头。仅访问公开的 GET 接口。
- `packages/admin/src/api/client.ts` — 定义了独立的 `adminFetch`，自动附加 JWT `Authorization` 头。401 响应会清除 token 并重定向到登录页。

两者都通过 `import.meta.env.VITE_API_BASE_URL` 读取 API 基础地址，该地址在 Vite 构建时通过 `define` 配置注入。

### Worker 的路由与中间件模式

`workers/api/src/index.ts` 是全局入口。所有路由在以下两个层级注册：

1. **内联路由** — 直接定义在 `index.ts` 中（健康检查、班级名单、学生查询、配置查询、相册查询、文件服务、管理统计）
2. **模块化路由** — 通过 `app.route()` 挂载，定义在 `src/routes/` 下（`students.ts`、`config.ts`、`albums.ts`、`upload.ts`、`auth.ts`）

JWT 中间件通过 `app.use()` 应用于需要认证的路径上，规则为：所有 HTTP 方法的写操作（POST/PUT/DELETE）都需要 JWT，GET 为公开访问。`index.ts` 按 HTTP 方法分别应用中间件——例如针对 `/api/students`，仅对非 GET 请求添加 JWT 校验。

### 数据库：D1（SQLite）

Schema 定义在 `workers/api/src/db/schema.sql`，迁移文件在 `workers/api/migrations/` 下，通过 wrangler D1 migration 系统执行。

关键设计决策：
- `students.info` 和 `students.photos` 以 **JSON 字符串**形式存储，而非独立表。意味着查询和更新这些字段时需要整体解析/序列化。
- `students.slug` 为 UNIQUE 约束，用作 REST API 中的标识符。
- `site_config` 为 key-value 表，每个 value 可能为普通字符串或 JSON 字符串（通过 `JSON.parse` 在读取时转换）。
- `is_owner` 布尔字段：当 `is_owner = 1` 且 `custom_html` 不为空时，该学生页面会渲染为全屏 iframe（专属模板），而非标准的信息页布局。

### 文件服务（R2）

文件上传后以 `/api/files/<r2Key>` 的相对 URL 形式存储。Worker 通过通配路由 `GET /api/files/:key+` 直接提供 R2 文件内容，设置 `Cache-Control: public, max-age=31536000`。前端拼接 API base 前缀得到完整 URL。R2 key 遵循约定的目录结构：`avatars/`、`music/`、`photos/`、`backgrounds/`、`misc/`。

### 部署与发布流程

1. **验证 CI**：`main` push 和 pull request 只运行 `.github/workflows/verify.yml`，不会部署。
2. **生产发布**：只能从 GitHub Actions 手动运行 `Deploy Site & Admin`，选择 `main`，输入 `DEPLOY_PRODUCTION` 并通过 `production` Environment 审批。
3. **本地预览发布**：本机不得使用 `main` 作为 Pages branch；需要远程预览时使用唯一的非生产分支名。详见 `docs/deployment-runbook.md`。
4. **Worker 发布**：保持 `.github/workflows/deploy-worker.yml` 手动触发，不从本机直接更新生产。

### 阿里云 ECS 自托管当前基线

项目目前同时保留 Cloudflare 发布链路和阿里云 ECS 自托管实例。除非任务明确针对 Cloudflare，否则涉及 ECS 的部署、排查和验收遵循以下约束：

- 预发布公网入口：`http://118.178.88.227`；备案完成前不配置正式域名 HTTPS。
- ECS 系统：Alibaba Cloud Linux 3；运行方式：rootless Podman + `podman-compose` + aaPanel Nginx。
- API：Node.js 22 + Hono，容器名通常为 `app_api_1`，内部端口 `8787`，公网只经 Nginx 的 `/api/` 访问。
- 数据库：全新 SQLite，路径为 `/var/lib/alumni-book/data/alumni.sqlite`；不导入旧 Cloudflare D1 数据。
- 文件：本地持久化路径 `/var/lib/alumni-book/uploads`；当前不依赖 OSS，文件 URL 仍为 `/api/files/<key>`。
- 静态站点：`/www/wwwroot/alumni-book`；服务器配置：`/www/server/panel/vhost/nginx/alumni-book.conf`。
- 备份：`/var/backups/alumni-book`；`alumni-book-backup.timer` 每日 UTC 04:00 运行，`alumni-book-cleanup.timer` 每日 UTC 03:00 清理过期会话。
- 服务器环境文件：`/opt/alumni-book/app/deploy/.env`，权限必须为 `600`；禁止读取、提交或输出 `JWT_SECRET`、管理员密码和 SSH 私钥。

自托管发布必须使用专用构建脚本，不要直接用默认 Cloudflare 数据构建：

```powershell
$env:RELEASE_SHA=(git rev-parse HEAD).Trim()
pnpm build:selfhosted -- --api-base http://118.178.88.227
Remove-Item Env:RELEASE_SHA
```

自托管客户端 API 基址必须为空字符串，让后台和前端统一请求同源 `/api/...`；不要把 `VITE_API_BASE_URL` 设为 `/api`，否则会产生错误的 `/api/api/...` 路径。发布后至少执行：

```powershell
node scripts/smoke-selfhosted.mjs --base-url http://118.178.88.227
```

服务器巡检和恢复命令见 `docs/deployment-runbook.md`、`docs/operations-data-recovery.md` 及 `docs/alibaba-ecs-selfhosted-acceptance.md`。重启或重建容器不得删除 SQLite、上传目录或备份目录；备案完成并通过域名 smoke 前，不要停止 Cloudflare 旧生产。

### 专属模板系统

`isOwner` 学生可以配置 `customHtml`（自定义 HTML 页面）。模板变量支持 `{{ student.name }}`、`{{ student.avatarUrl }}` 等，在 `StudentView.vue` 的 `processedHtml` 计算属性中被替换。该 HTML 通过 sandbox iframe 渲染（`allow-scripts allow-same-origin`），与标准信息页布局互斥——标准页面的所有分区（基础信息、联系方式、个性标签等）通过 `v-if="student.isOwner && student.customHtml"` 隐藏。

### 数据流总结

```
访客浏览器 → 输入姓名 → GET /api/classmates → 匹配 → sessionStorage
                                                          ↓
                                              浏览 Preface/Roster/Student/Album
                                                          ↓
管理员浏览器 → 登录 → POST /api/auth/login → JWT → sessionStorage
                                                          ↓
                                             管理 Students/Albums/Config
                                                          ↓
                                             上传文件 → POST /api/upload → R2
```
