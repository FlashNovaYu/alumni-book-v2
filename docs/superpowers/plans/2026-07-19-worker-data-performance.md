# Worker 与 D1 性能实施计划

> **For agentic workers:** 按当前仓库 AGENTS 规则使用本地协作调度和阶段性审查；本仓库禁止调用 `superpowers` 技能。

**目标：** 修复动态缓存覆盖、身份缓存边界和高增长数据的查询放大，不改变 API 响应语义和权限。

**架构：** 公共且无身份差异的 JSON 使用短 TTL/ETag；学生详情和所有会话相关响应私有化；D1 使用批量聚合、游标、匹配索引和统一时间格式。

**技术栈：** Hono、Cloudflare Workers、D1 SQLite、Vitest。

---

### Task 1：缓存策略回归测试

**文件：**
- Create: `workers/api/tests/cache-policy.test.ts`
- Create: `workers/api/src/lib/publicCache.ts`
- Modify: `workers/api/src/index.ts`

- [ ] **Step 1：写测试**：请求 `/api/config`、`/api/classmates`、`/api/albums` 断言 `public`、`max-age`、`s-maxage`；带 `X-Classmate-Token` 请求 `/api/students` 断言 `private` 和 `Vary: Authorization, X-Classmate-Token`；管理和写请求断言 `no-store`。
- [ ] **Step 2：运行 `pnpm --filter worker exec vitest run tests/cache-policy.test.ts`，预期当前全局中间件覆盖路由头导致失败。**
- [ ] **Step 3：把 `isPublicRevalidatedGet()` 拆为 `isPublicStableGet()` 与 `isPrivateAudienceGet()`；在中间件中先判断身份头，再设置最终 Cache-Control，不让通用分支覆盖具体公共策略。**
- [ ] **Step 4：实现 `publicCache.ts` 的安全 GET 包装：只接受无身份头的固定公共路径，以 URL（含 query）为 key，使用 `caches.default` 返回短 TTL 响应；写操作清理当前请求 URL 的缓存副本。**
- [ ] **Step 5：保留 ETag，但为身份响应添加 `Vary`；运行缓存测试和 `pnpm verify:worker`，提交 `perf(worker): restore safe public cache policy`。**

### Task 2：私信和群聊批量查询

**文件：**
- Modify: `workers/api/src/routes/directConversations.ts`
- Modify: `workers/api/src/lib/groupChat.ts`
- Modify: `workers/api/tests/direct-conversations.test.ts`
- Modify: `workers/api/tests/group-chat.test.ts`

- [ ] **Step 1：在测试 DB 中构造 10 个会话和 30 条消息，增加 D1 prepare 计数包装，先记录当前 `1 + 3N` 查询行为。**
- [ ] **Step 2：为会话列表实现一次会话主查询、一次参与者 `IN` 查询、一次最后消息/未读聚合查询，并按 conversation id 在内存组装。**
- [ ] **Step 3：为群聊先取得当前页 message ids，再对这些 ids 聚合 reactions；禁止对整个反应表做无界 CTE。**
- [ ] **Step 4：增加断言：10 个会话最多 3 次读取，群聊查询绑定当前页 ids；运行两个测试文件和 Worker 全量测试，提交 `perf(worker): batch conversation and reaction queries`。**

### Task 3：游标、索引和请求体边界

**文件：**
- Create: `workers/api/migrations/0017_performance_indexes.sql`
- Modify: `workers/api/src/db/schema.sql`
- Modify: `workers/api/src/lib/jsonBodyLimit.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/src/routes/classSpace.ts`
- Modify: `workers/api/src/lib/timelineFeed.ts`
- Modify: `workers/api/src/lib/sessionCleanup.ts`
- Modify: `workers/api/tests/class-space-inbox.test.ts`
- Modify: `workers/api/tests/timeline-feed.test.ts`

- [ ] **Step 1：新增测试：隐藏群聊消息达到 100 条时扫描上限生效；时间线每个来源 SQL 只读取所需 `LIMIT`；JSON 写接口超过 16KiB 返回 413；过期 public request limit 会被清理。**
- [ ] **Step 2：添加 `photos(album_id, sort_order)`、`albums(sort_order, created_at)`、私信未读复合索引和消息游标索引；schema 与迁移保持一致。**
- [ ] **Step 3：移除查询列上的 `julianday()` 包装，统一使用 ISO/SQLite 可比较时间，并在游标工具中兼容既有数据。**
- [ ] **Step 4：在所有 JSON 写入口解析前调用现有 `readLimitedJson()`；班级空间设置固定扫描上限；cron 清理 `public_request_limits`。**
- [ ] **Step 5：运行迁移静态测试、Worker 全量测试和 `pnpm --filter worker exec tsc --noEmit`，提交 `perf(worker): add bounded pagination and matching indexes`。**

### Task 4：访问计数和发布安全

**文件：**
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/src/routes/classmate.ts`
- Modify: `.github/workflows/deploy-worker.yml`
- Modify: `workers/api/tests/security.test.ts`
- Modify: `workers/api/tests/upload-compensation.test.ts`

- [ ] **Step 1：为访问计数和同学上传写失败测试：旧 R2 对象必须在 D1 更新成功后才删除；迁移失败时 Worker 发布流程必须停止。**
- [ ] **Step 2：将访问计数更新改为带 `RETURNING` 的单次读取；同学上传采用新对象上传、D1 更新、异步删除旧对象。**
- [ ] **Step 3：修改部署工作流使 D1 migration 非零退出码阻止 deploy，并保留当前 token scope 兼容逻辑。**
- [ ] **Step 4：运行安全、补偿和部署静态测试及 `pnpm verify:worker`，提交 `fix(worker): make writes and migrations failure-safe`。**
