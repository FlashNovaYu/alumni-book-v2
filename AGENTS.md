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

### 公开站点的会话认证

公开站点**不使用 JWT**。访客通过在首页输入姓名来获得访问权限——姓名会匹配 `/api/classmates` 接口返回的同学录名单，匹配成功后写入 `sessionStorage.setItem('classmate_name', name)`。所有后续页面的 `onMounted` 中都会检查 `getSessionName()`，如果为空则重定向回首页。这是一个轻量级的"半公开"门控机制，而非真正安全的认证。

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

1. **自动 CI/CD 部署**
   - **Site + Admin** (`deploy-site.yml`)：向 `master` 分支 push 更改后，会自动触发 GitHub Actions 编译并将 site 部署到 Cloudflare Pages（同时把 admin SPA 部署在 `deploy/admin/` 子目录下）。
   - **Worker**：通过 GitHub Actions 或本地命令推送至 Cloudflare Workers。

2. **本地手动热部署 (备用/跳过 CI)**
   如果遇到 Git 权限报错 403 或 CI/CD 暂不可用时，可直接在本地使用 Wrangler 命令行热部署。
   - **Worker 部署**：
     ```bash
     pnpm --filter worker run deploy
     ```
   - **Pages 前端部署**（同时发布 Astro 站点与 Admin 后台）：
     ```powershell
     # 1. 编译前后台
     pnpm --filter site-astro build
     # 2. 编译后台 SPA
     pnpm --filter admin build
     # 3. 本地打包发布
     if (Test-Path deploy) { Remove-Item -Recurse -Force deploy }
     New-Item -ItemType Directory -Path deploy
     New-Item -ItemType Directory -Path deploy/admin
     Copy-Item -Path packages/site-astro/dist/* -Destination deploy -Recurse
     Copy-Item -Path packages/admin/dist/* -Destination deploy/admin -Recurse
     Copy-Item -Path packages/site-astro/_worker.js -Destination deploy/
     npx wrangler pages deploy deploy --project-name alumni-book --branch main --commit-dirty=true
     ```

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
