# 管理后台局部说明

本文件适用于 `packages/admin/`。同时继承仓库根目录的规则。

## 模块边界

- 这是 Vue 3 SPA，正式 base path 为 `/alumni-book-v2/admin/`。
- `adminLogin()` 获取 JWT 后写入 `sessionStorage` 的 `admin_token`。
- `adminFetch()` 自动附加 `Authorization: Bearer <token>`；401 会清除 token 并重定向登录页。
- 路由守卫在 `main.ts` 中检查 token。修改认证时要覆盖登录、刷新、401 和路由跳转行为。
- 不要把公开站点的无认证 API client 与后台 `adminFetch()` 混用。

## 调查与验证

- 从具体 view、API 方法和对应测试开始；权限问题再扩展到路由守卫与 Worker 契约。
- 优先运行最接近的单项测试；静态测试、网络测试和 view 测试按改动类型选择，不默认执行全部后台测试。
- 类型或组件接口变化时运行 `pnpm --filter admin typecheck`。
- 只有构建配置、资源路径或发布产物变化时才运行 `pnpm --filter admin build` 和 `verify:dist-network`。
- 若接口字段发生变化，再检查 `packages/shared/` 和 `workers/api/`，并说明跨包依据。
