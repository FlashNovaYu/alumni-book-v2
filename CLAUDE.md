# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev:site                  # 公开站点 (localhost:4321)
pnpm dev:admin                 # 管理后台 (localhost:3001)
pnpm dev:worker                # Worker API (wrangler 本地)

# 构建
pnpm build:site
pnpm build:admin

# Worker 部署
pnpm deploy:worker

# 数据库迁移
pnpm db:migrate                # 执行 D1 迁移
pnpm migrate:data              # 运行 scripts/migrate.ts

# 验证（CI 同款流程）
pnpm verify:worker             # Worker 测试
pnpm verify:admin              # Admin 类型检查 + 构建
pnpm verify:site               # Site 类型检查 + 构建测试 + 网络性能测试
pnpm verify:all                # 全部验证

# 单独运行测试
pnpm --filter worker exec vitest run                           # Worker 全部测试
pnpm --filter worker exec vitest run tests/api.test.ts         # Worker 单个测试文件
pnpm --filter site-astro test                                  # Site 静态测试
pnpm --filter site-astro test:perf-network                     # Site Playwright 网络测试
```

**重要：** 本地开发时，前端通过 `VITE_API_BASE_URL` 环境变量指向后端 API。默认值为 `https://alumni-book-api.chenyuhao2263.workers.dev`。如需指向本地 Worker，在 shell 中设置该环境变量后重启 dev server。Astro dev server 已配置 `/api` 代理到 Worker 域名。

## 架构概览

### Monorepo 结构（pnpm workspace）

```
packages/
├── site-astro/    # 面向访客的 Astro 5 SSG 站点，交互部分使用 Vue islands
├── admin/         # 管理后台 Vue 3 SPA (base path: /alumni-book-v2/admin/)
└── shared/        # 类型定义、API 封装、设计令牌
workers/
└── api/           # Cloudflare Worker API (Hono 框架)
scripts/
└── migrate.ts     # 旧版数据迁移脚本
```

### 认证体系

项目有两套认证机制：

#### 1. 同学账号认证（Session Token）

同学通过姓名 + 密码登录，获得更高级别的访问权限（查看同学间可见信息、编辑自己的页面、使用信箱）。

- 登录：`POST /api/classmate-auth/login` 发送 `{ slug, password }`
- 密码使用 PBKDF2 算法与盐进行校验
- 成功后在 `classmate_sessions` 表创建会话记录，返回 Session Token
- Token 有效期 7 天，存储在 `sessionStorage.setItem('classmate_account_token', token)`
- 前端通过 `X-Classmate-Token` 请求头传递 Token
- 辅助函数：`getClassmateToken()`、`setClassmateSession()`、`clearClassmateSession()`（在 `@alumni/shared` 中）
- 认证守卫：`requireClassmate()` 函数（在 `workers/api/src/lib/classmateGuard.ts` 中）

访问级别优先级：`admin > owner > classmates > public`

#### 2. 管理员认证（JWT）

管理后台使用 JWT 进行认证。

- 登录：`POST /api/auth/login` 发送 `{ password }`
- 成功后将 JWT 存入 `sessionStorage.setItem('admin_token', token)`
- `adminFetch()` 会自动在每个请求头中附加 `Authorization: Bearer <token>`
- 后台路由守卫在 `main.ts` 的 `router.beforeEach` 中检查该 token
- 管理后台还使用 `admin_sessions` 表进行会话管理，支持注销功能
- JWT 密钥通过 Cloudflare Worker 的环境变量 `JWT_SECRET` 配置

### API 客户端

项目有三个不同的 API 客户端：

1. **Site 公开客户端** (`packages/site-astro/src/api/`)：
   - `classmateAuth.ts` — 同学登录、修改密码、登出
   - `classSpace.ts` — 班级空间概览
   - `postOffice.ts` — 公开留言、信箱、通知
   - 使用 `getClassmateToken()` 自动附加 `X-Classmate-Token` 头
   - 通过 `joinApiUrl(apiBase, path)` 拼接 URL

2. **Site 共享客户端** (`packages/shared/src/utils.ts`)：
   - `apiFetch<T>()` — 通用 API 请求函数，不附加认证头
   - 用于公开的 GET 接口

3. **Admin 客户端** (`packages/admin/src/api/client.ts`)：
   - `adminFetch<T>()` — 自动附加 JWT `Authorization` 头
   - 401 响应会清除 token 并重定向到登录页
   - `adminLogin()`、`adminLogout()` — 登录登出

所有客户端都通过 `import.meta.env.VITE_API_BASE_URL` 读取 API 基础地址。

### Worker 路由与中间件

`workers/api/src/index.ts` 是全局入口。路由分两层注册：

1. **内联路由** — 直接定义在 `index.ts` 中（健康检查、班级名单、学生查询、配置查询、相册查询、文件服务、管理统计）
2. **模块化路由** — 通过 `app.route()` 挂载，定义在 `src/routes/` 下：
   - `auth.ts` — 管理员登录登出
   - `classmateAuth.ts` — 同学登录、修改密码、登出
   - `classmate.ts` — 同学自助编辑
   - `students.ts` — 学生 CRUD
   - `config.ts` — 站点配置
   - `albums.ts` — 相册管理
   - `upload.ts` — 文件上传
   - `messages.ts` — 留言管理
   - `publicMessages.ts` — 公开留言（留言板）
   - `timeline.ts` — 时光轴事件
   - `highlights.ts` — 精选内容
   - `notifications.ts` — 通知系统
   - `inbox.ts` — 统一收件箱摘要
   - `mailbox.ts` — 班级信箱
   - `adminMail.ts` — 管理员邮局
   - `classSpace.ts` — 班级空间概览

中间件规则：
- 所有写操作（POST/PUT/DELETE）需要 JWT 认证（通过 `adminGuard()`）
- 同学相关接口需要 Session Token 认证（通过 `requireClassmate()`）
- GET 请求为公开访问
- 辅助函数 `determineAudience()` 和 `filterStudentForAudience()` 用于根据访问者身份过滤敏感字段

### 数据库：D1（SQLite）

Schema 定义在 `workers/api/src/db/schema.sql`，迁移文件在 `workers/api/migrations/` 下。

关键设计决策：
- `students.info` 和 `students.photos` 以 **JSON 字符串**形式存储，需要整体解析/序列化
- `students.slug` 为 UNIQUE 约束，用作 REST API 中的标识符
- `site_config` 为 key-value 表，value 可能为普通字符串或 JSON 字符串
- `is_owner` 布尔字段：当 `is_owner = 1` 且 `custom_html` 不为空时，该学生页面会渲染为全屏 iframe
- 隐私级别：`students.privacy_level` 控制默认可见性，`students.info.visibility`（JSON 内）控制单个字段的可见性（`public`/`classmates`/`owner`/`hidden`）
- 会话表：`admin_sessions`（管理员 JWT）、`classmate_sessions`（同学 Session Token）
- 邮件系统：`mail_threads`、`mail_messages`、`mail_recipients` 三表结构
- 通知系统：`notifications` 表，支持按 `recipient_slug` 查询未读通知

### 文件服务（R2）

文件上传后以 `/api/files/<r2Key>` 的相对 URL 形式存储。Worker 通过通配路由 `GET /api/files/:key+` 直接提供 R2 文件内容，设置 `Cache-Control: public, max-age=31536000`。R2 key 遵循约定的目录结构：`avatars/`、`music/`、`photos/`、`backgrounds/`、`misc/`。

### 部署：Cloudflare Pages + Cloudflare Workers

- **Site + Admin** (`deploy-site.yml`)：同时构建 site 和 admin，将 site 放到 `deploy/` 根目录，admin 放到 `deploy/admin/`，作为单个 Pages artifact 部署到 Cloudflare Pages。触发条件为 `packages/**` 或 `workers/**` 变更时。
- **Worker** (`deploy-worker.yml`)：通过 `wrangler deploy` 部署到 Cloudflare。触发条件为 `workers/api/**` 变更时。

Site 的 base path 为 `/alumni-book-v2/`。所有前端路由和 Vite 构建均使用该 base 配置。

### 专属模板系统

`isOwner` 学生可以配置 `customHtml`（自定义 HTML 页面）。模板变量支持 `{{ student.name }}`、`{{ student.avatarUrl }}` 等，在 `StudentView.vue` 的 `processedHtml` 计算属性中被替换。该 HTML 通过 sandbox iframe 渲染（`allow-scripts allow-same-origin`），与标准信息页布局互斥。

### 测试策略

项目有两层测试：

1. **Worker 测试** (`workers/api/tests/`)：使用 `@cloudflare/vitest-pool-workers`，在 Worker 运行时环境中测试 API 端点。需要 `.dev.vars` 文件配置 `JWT_SECRET` 和 `CORS_ORIGIN`。

2. **Site 测试** (`packages/site-astro/tests/`)：
   - 静态测试（`*.test.ts`）：使用 Vitest，构建后验证页面结构、导航、隐私过滤等。
   - 网络测试（`*.spec.ts`）：使用 Playwright，验证实际页面加载、登录流程、性能指标。

### 设计系统

项目使用两套设计令牌：

1. **Claude 设计系统** (`packages/site-astro/src/styles/tokens.css`)：
   - 品牌色：`--color-primary: #cc785c`（珊瑚色）
   - 画布：`--color-canvas: #faf9f5`（暖白）
   - 深色：`--color-surface-dark: #181715`（海军蓝）
   - 字体：`--font-display`（Georgia 衬线）、`--font-body`（系统无衬线）

2. **Vintage Paper 设计系统**（同文件下半部分）：
   - 纸张背景：`--color-paper-bg: #f4eddf`
   - 卡片：`--color-paper-card: #fffaf2`
   - 边框：`--color-paper-border: #ded2bd`
   - 文字：`--color-paper-ink: #2f2a23`
   - 棕色强调：`--color-paper-brown: #ad8051`

导航栏使用 "paper-bookmark-nav" 风格：毛玻璃效果、圆角胶囊形状、纸张纹理。

### 数据流总结

```
访客浏览器 → 输入姓名密码 → POST /api/classmate-auth/login → Session Token → sessionStorage
                                                          ↓
                                              浏览 Preface/Roster/Student/Album/ClassSpace/Mailbox
                                                          ↓
管理员浏览器 → 登录 → POST /api/auth/login → JWT → sessionStorage
                                                          ↓
                                             管理 Students/Albums/Config/Messages/Mail
                                                          ↓
                                             上传文件 → POST /api/upload → R2
```

## 本地手动热部署 (备用/跳过 CI)

如果遇到 Git 权限报错 403 或 CI/CD 暂不可用时，可直接在本地使用 Wrangler 命令行热部署。

**Worker 部署**：
```bash
pnpm --filter worker run deploy
```

**Pages 前端部署**（同时发布 Astro 站点与 Admin 后台）：
```powershell
pnpm --filter site-astro build
pnpm --filter admin build
if (Test-Path deploy) { Remove-Item -Recurse -Force deploy }
New-Item -ItemType Directory -Path deploy
New-Item -ItemType Directory -Path deploy/admin
Copy-Item -Path packages/site-astro/dist/* -Destination deploy -Recurse
Copy-Item -Path packages/admin/dist/* -Destination deploy/admin -Recurse
Copy-Item -Path packages/site-astro/_worker.js -Destination deploy/
npx wrangler pages deploy deploy --project-name alumni-book --branch main --commit-dirty=true
```
