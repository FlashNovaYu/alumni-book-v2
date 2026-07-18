# 同学录 v2

校园纪念网站 — Vue 3 + Cloudflare Workers + D1 + R2

## 技术栈

- **前端**: Vue 3 + Vite + Vue Router + TypeScript
- **后端**: Cloudflare Workers (Hono)
- **数据库**: Cloudflare D1 (SQLite)
- **存储**: Cloudflare R2
- **部署**: GitHub Pages + Cloudflare

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

### 1. Cloudflare 配置

1. 创建 D1 数据库: `wrangler d1 create alumni-book-db`
2. 创建 R2 存储桶: `wrangler r2 bucket create alumni-book-assets`
3. 更新 `workers/api/wrangler.toml` 中的数据库 ID
4. 运行迁移: `wrangler d1 execute alumni-book-db --file=workers/api/src/db/schema.sql`
5. 部署 Worker: `pnpm --filter worker deploy`

### 2. GitHub Pages

在仓库 Settings → Secrets 中添加:
- `VITE_API_BASE_URL`: Worker API 地址
- `CLOUDFLARE_API_TOKEN`: Cloudflare API 令牌
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 账户 ID

### 3. 数据迁移

```bash
# 生成迁移 SQL
npx tsx scripts/migrate.ts

# 执行迁移
npx wrangler d1 execute alumni-book-db --file=scripts/migration.sql
```

## 设计系统

视觉风格遵循 复古纸张风格

字体: Cormorant Garamond (显示) + Inter (正文)
