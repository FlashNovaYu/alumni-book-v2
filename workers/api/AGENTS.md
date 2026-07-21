# API 局部说明

本文件适用于 `workers/api/`。同时继承仓库根目录的规则。

## 模块边界

- API 使用 Hono，同时支持 Cloudflare Worker 测试运行时和阿里云 Node/Hono 正式运行时。
- `src/index.ts` 包含内联路由和 `src/routes/` 模块路由。定位接口时先搜索精确路径和 HTTP 方法，不要通读全部入口。
- 管理写操作使用 JWT；同学自助接口使用 `X-Classmate-Token` 和 `classmate_sessions`。两套认证不可互换。
- 密码使用 PBKDF2 与盐校验。不得弱化认证、限流或会话过期规则来方便测试。

## 数据与文件

- Schema 在 `src/db/schema.sql`，迁移在 `migrations/`。生产自托管使用 SQLite，Cloudflare 测试使用 D1。
- `students.info`、`students.photos` 和部分配置值以 JSON 字符串存储；更新时保持安全解析和完整序列化契约。
- `students.slug` 是唯一 REST 标识；`is_owner`/`custom_html` 会影响前端专属模板。
- 文件 URL 保持 `/api/files/<key>`；Cloudflare R2 与本地文件适配器应遵守相同外部契约。
- 修改写入流程时检查数据库失败后的文件补偿，以及文件失败时不得提交不完整数据库状态。

## 调查与验证

- 优先运行命中路由或 helper 的单个 Vitest 文件：`pnpm --filter worker exec vitest run <test-file>`。
- Node/SQLite/本地文件适配器使用 `pnpm --filter worker run test:node -- <test-file>` 或相应 node 配置。
- 类型、Bindings 或路由契约变化时运行 `pnpm --filter worker typecheck`。
- 迁移、认证、限流或存储改动需要补充针对失败路径的测试；未要求部署时不要连接或写入生产数据库、D1、R2 或 ECS 文件目录。
