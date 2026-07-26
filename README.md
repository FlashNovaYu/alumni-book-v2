# 同学录 v2

校园纪念网站 — Astro/Vue + Node/Hono + SQLite，本地自托管为正式商用版本

## 技术栈

- **前端**: Vue 3 + Vite + Vue Router + TypeScript
- **后端**: Node.js/Hono（阿里云 ECS 正式运行）；Cloudflare Worker 仅开发测试
- **数据库**: SQLite（自托管持久化）；Cloudflare D1 仅测试
- **存储**: 本地持久化文件（可替换为 OSS/CDN 适配器）；Cloudflare R2 仅测试
- **部署**: 阿里云 ECS + Podman + Nginx

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动公开站点
pnpm dev:site

# 启动管理后台
pnpm dev:admin

# 启动 Worker API (需要 wrangler)
pnpm dev:worker

# 启动阿里云兼容的本地 Node API
pnpm --filter worker run dev:node
```

## 项目结构

```
packages/
├── site-astro/    # 面向访客的 Astro 5 SSG 站点，交互部分使用 Vue islands
├── admin/         # 管理后台 Vue SPA
└── shared/        # 共享类型、设计令牌
workers/
└── api/           # Cloudflare Worker API
scripts/
└── migrate.ts     # 旧版数据迁移脚本
```

## 部署

### 1. 阿里云正式发布

正式构建必须显式指定 API 地址，客户端使用同源 `/api`：

```powershell
$env:RELEASE_SHA=(git rev-parse HEAD).Trim()
pnpm build:selfhosted -- --api-base http://118.178.88.227
Remove-Item Env:RELEASE_SHA
```

发布后执行：`node scripts/smoke-selfhosted.mjs --base-url http://118.178.88.227`。

### 2. Cloudflare 开发测试

1. 创建 D1 数据库: `wrangler d1 create alumni-book-db`
2. 创建 R2 存储桶: `wrangler r2 bucket create alumni-book-assets`
3. 更新 `workers/api/wrangler.toml` 中的数据库 ID
4. 运行迁移: `wrangler d1 execute alumni-book-db --file=workers/api/src/db/schema.sql`
5. 部署 Worker: `pnpm --filter worker deploy`

使用 `VITE_SSG_API_BASE` 显式指定 Worker/Pages 测试地址；不要把 `VITE_WORKER_URL` 作为应用配置。

### 3. GitHub Pages 测试环境

在仓库 Settings → Secrets 中添加:
- `VITE_SSG_API_BASE`: Worker/Pages 测试 API 地址
- `CLOUDFLARE_API_TOKEN`: Cloudflare API 令牌
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 账户 ID

### 4. 数据迁移（仅 CF 测试工具）

```bash
# 生成迁移 SQL
npx tsx scripts/migrate.ts

# 执行迁移
npx wrangler d1 execute alumni-book-db --file=scripts/migration.sql
```

## 设计系统

视觉风格遵循 复古纸张风格

字体: Cormorant Garamond (显示) + Inter (正文)
