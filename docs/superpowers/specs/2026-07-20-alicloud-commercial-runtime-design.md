# 阿里云正式商用运行链路与稳定性收敛设计

## 1. 背景与目标

当前仓库同时包含 Cloudflare Worker/Pages 开发测试链路和阿里云 ECS 自托管链路。阿里云版本已经具备 Node/Hono、SQLite、本地文件存储、Nginx 和自托管构建，但站点源码与配置仍有多处 `pages.dev`、`workers.dev` 和 `VITE_WORKER_URL` 的隐式回退。这样会使自托管构建在环境变量缺失或构建入口分叉时误用 Cloudflare 地址，也会让运行时故障难以区分为配置错误还是服务错误。

本设计把阿里云 ECS 设为正式商用目标，把 Cloudflare 限定为开发测试目标，同时保留两条链路的独立能力。

成功标准：

1. 阿里云构建和产物只使用显式配置的自托管 API 或同源 `/api`，缺失配置时 fail-closed，不回退到 Cloudflare 生产地址。
2. CF 开发测试可以通过明确的开发配置继续访问 Worker/Pages，不被自托管改造破坏。
3. Node/SQLite 服务在并发读写、迁移、异常关闭和依赖故障时具有可观测、可恢复的行为。
4. 自托管构建、Node 测试、Worker 测试和公网 smoke 能证明上述边界。

## 2. 当前根因证据

- `packages/site-astro/astro.config.mjs` 默认把 `VITE_WORKER_URL` 注入为 `https://alumni-book.pages.dev`，开发代理固定指向 `workers.dev`。
- `packages/site-astro/src/pages/` 下首页、相册、名册、时间轴、序章、学生详情和年度册仍直接使用 `VITE_WORKER_URL` 及 `pages.dev` 回退。
- `packages/site-astro/scripts/fetch-data.ts` 在没有环境变量时回退到 `pages.dev`，导致 SSG 可能抓取错误环境。
- `workers/api/src/index.ts` 仍使用 Cloudflare 页面作为默认 CORS origin，并在配置缺失日志中使用 Cloudflare bindings 术语。
- `workers/api/src/routes/files.ts` 设置了 Cloudflare 专用缓存响应头；自托管应提供等价的标准 HTTP 缓存语义而不依赖该头。
- `workers/api/src/runtime/sqlite.ts` 未设置 WAL、busy timeout 等本地 SQLite 并发参数；`init-local.ts` 的迁移事务也没有针对启动竞争做保护。
- 工作区已有未提交改动将删除/隐藏审计原因改为可选，而 `workers/api/tests/admin-rbac.test.ts` 仍断言缺失原因返回 400，造成当前唯一已知的全量 Worker 测试失败。

## 3. 运行环境与配置边界

### 3.1 通用 SSG API 配置

用不带平台含义的 `VITE_SSG_API_BASE` 表示构建时抓取数据的 API 地址：

- 阿里云：构建脚本显式传入 `http://118.178.88.227` 或正式域名，客户端 `VITE_API_BASE_URL` 固定为空字符串，运行时请求同源 `/api`。
- CF 开发：开发命令或 `.env` 显式传入 Worker/Pages 测试地址。
- 生产/自托管构建缺失 `VITE_SSG_API_BASE` 时直接报错；不允许使用 `pages.dev`、`workers.dev` 或其他平台地址作为隐式默认值。

页面和数据抓取脚本统一读取该通用变量；`VITE_WORKER_URL` 不再作为应用层配置入口。CF 专属的 Wrangler 配置、Pages Functions 和开发代理仍保留在其边界内。

### 3.2 自托管产物约束

`build:selfhosted` 保持同源客户端 API，并增强产物扫描：扫描 HTML、JS、CSS、JSON、source map 等文本文件，拒绝 Cloudflare 生产域名、旧的 Worker 配置名和未替换的平台默认值。`release.json` 记录源 SHA、构建目标和 SSG API 地址，供部署后核对。

### 3.3 CORS 与默认值

Node 运行时的 CORS origin 只接受显式 `CORS_ORIGIN`/预览 origins；本地开发允许 localhost/127.0.0.1。删除 Cloudflare 生产域名作为默认 origin。自托管同源请求不依赖跨域放行，跨域预览必须显式配置。

## 4. 稳定性实现

### 4.1 SQLite 生命周期与并发

- 创建本地数据库连接时设置 `journal_mode=WAL`、`busy_timeout`、`foreign_keys=ON`，并保持合理的同步级别。
- 迁移启动使用单连接事务；迁移失败时回滚并关闭连接，错误信息包含迁移文件名。
- 批量写入继续使用原子事务，针对 SQLite busy/locked 错误提供有限、可观测的重试或明确 503 响应，不无限重试。
- 不改变 D1 schema 或线上数据语义；只补充 Node 适配器的连接参数和测试。

### 4.2 HTTP 服务边界

- Node fetch 入口为未捕获异常提供统一 JSON 错误响应和 request id，避免进程因单个请求崩溃。
- 启停信号只执行一次优雅关闭，停止接收新请求后关闭文件存储和数据库；关闭过程可重复调用。
- readiness 检查真实验证 SQLite 查询、本地文件存储可读写能力和 JWT 配置；health 只表示进程存活。
- 文件服务使用标准 `Cache-Control`、ETag、Range 响应；移除对 Cloudflare 专用响应头的运行时依赖。

### 4.3 构建与前端请求稳定性

- SSG 数据抓取统一使用带超时、指数退避和清晰错误上下文的请求 helper。
- 页面构建区分必需数据和可选数据：必需数据失败直接终止，非必需数据使用明确的空数据回退并输出警告。
- 前端同源 API 保持空 base，避免生成 `/api/api/...`；外部 API base 统一去除尾部斜杠。

### 4.4 审计契约与现有改动

删除/隐藏操作的原因字段按当前未提交改动改为可选：空白值序列化为 `null`，仍写入审计记录。更新相关测试以覆盖“取消确认不请求、空原因成功、非空原因保留”的契约，不恢复已放宽的强制输入。

## 5. 代码范围

预计修改范围：

- `packages/site-astro/astro.config.mjs`、SSG 数据脚本及所有读取构建 API 地址的页面；
- `scripts/build-selfhosted.mjs`、自托管 smoke/构建测试及必要的 CF 开发命令说明；
- `workers/api/src/index.ts`、`workers/api/src/routes/files.ts`；
- `workers/api/src/runtime/sqlite.ts`、`workers/api/src/runtime/nodeEnv.ts`、`workers/api/src/db/init-local.ts`、`workers/api/src/node-server.ts`；
- 对应 Node/Worker/站点静态测试和 `workers/api/tests/admin-rbac.test.ts`；
- 自托管部署文档中涉及的命令、环境变量和验收说明。

不在本次范围：

- 删除 Cloudflare Wrangler、D1、R2 或 Pages Functions；
- 修改数据库 schema、迁移历史或导入 Cloudflare 旧数据；
- 改动无关的视觉设计、业务字段或用户权限模型；
- 直接操作生产 ECS、Cloudflare 生产资源或输出任何服务器密钥。

## 6. 验证与验收

实现后按以下顺序验证：

1. `pnpm --filter worker exec vitest run src/runtime/node-runtime.test.ts tests/admin-rbac.test.ts`：Node 运行时和审计契约通过。
2. `pnpm verify:worker`、`pnpm verify:shared`、`pnpm verify:admin`：后端、共享包和后台门禁通过。
3. 使用显式 `VITE_SSG_API_BASE` 执行 `pnpm build:selfhosted -- --api-base http://118.178.88.227`，确认产物扫描无 Cloudflare 地址、`release.json` 目标正确、客户端请求为同源 `/api`。
4. 启动 Node API 后运行 `node scripts/smoke-selfhosted.mjs --base-url http://127.0.0.1:8787 --api-only`，确认 health、readiness、文件 404 和错误响应。
5. `pnpm verify:site` 及自托管构建后的站点 smoke，确认页面、后台、资源路径和 API 不回退到 CF。
6. 若具备 ECS 访问权限，再运行 `node scripts/smoke-selfhosted.mjs --base-url http://118.178.88.227`；只核对发布产物和服务健康，不执行破坏性数据操作。

验收以“精确目标地址 + 构建产物扫描 + readiness + smoke + 测试结果”共同成立为准，单独的 HTTP 200 不视为发布成功。

## 7. 发布与回滚原则

阿里云发布使用专用自托管构建脚本、容器和 Nginx 配置；数据库、上传目录和备份目录保持持久化。Cloudflare 仍可独立用于开发测试。任何自托管发布失败时，保留上一版静态产物和容器镜像，通过既有备份与恢复流程回滚，不从 Cloudflare D1/R2 自动导入数据。
