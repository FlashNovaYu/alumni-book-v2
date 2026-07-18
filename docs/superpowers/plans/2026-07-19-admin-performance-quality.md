# 管理后台性能与质量实施计划

> **For agentic workers:** 按当前仓库 AGENTS 规则使用本地协作调度和阶段性审查；本仓库禁止调用 `superpowers` 技能。

**目标：** 缩短后台路由切换、限制数据规模增长带来的渲染成本、避免离页请求和上传阻塞，同时保持 RBAC、错误处理和现有表单语义。

**架构：** `fetchCurrentAdmin` 使用 token 绑定的短 TTL/进行中请求缓存；列表 API 采用 cursor/limit；视图生命周期统一 AbortController；上传使用 2 并发队列。

**技术栈：** Vue 3、Vue Router、Vite、TypeScript、Node test、Vitest/Playwright。

---

### Task 1：管理员身份请求去重

**文件：**
- Modify: `packages/admin/src/api/client.ts`
- Modify: `packages/admin/src/main.ts`
- Modify: `packages/admin/tests/network.test.ts`

- [ ] **Step 1：写失败测试**：同一 token 并发调用三次 `fetchCurrentAdmin()` 只触发一次 `/api/auth/me`；token 变化时缓存失效；401 仍清理 token。
- [ ] **Step 2：运行 `pnpm --filter admin test:network`，预期当前实现三次发请求而失败。**
- [ ] **Step 3：增加 `currentAdminToken`、`currentAdminPromise` 和 30 秒 TTL；`adminLogin`、logout、401 分支清空；路由守卫复用进行中的 promise。**
- [ ] **Step 4：运行后台完整测试和 typecheck，提交 `perf(admin): deduplicate admin identity checks`。**

### Task 2：请求生命周期取消与路由 skeleton

**文件：**
- Modify: `packages/admin/src/api/network.ts`
- Modify: `packages/admin/src/views/AdminLayout.vue`
- Modify: `packages/admin/src/views/StudentsView.vue`
- Modify: `packages/admin/src/views/AlbumsView.vue`
- Modify: `packages/admin/src/views/MessagesView.vue`
- Create: `packages/admin/src/components/RouteLoadingSkeleton.vue`
- Modify: `packages/admin/tests/network.test.ts`

- [ ] **Step 1：增加测试**：AbortSignal 触发时不显示错误 toast；GET 重试前等待 250ms；路由异步组件加载时显示 skeleton。
- [ ] **Step 2：在每个视图 `onMounted` 创建 AbortController，`onUnmounted` 调用 abort；把 signal 传入现有 `adminFetch`。**
- [ ] **Step 3：在 `AdminLayout` 的 `router-view` 外增加最小 skeleton，不改变路由 URL 或权限守卫。**
- [ ] **Step 4：运行 `pnpm --filter admin test` 和 typecheck，提交 `perf(admin): cancel stale view requests`。**

### Task 3：列表 API 分页与前端首批渲染

**文件：**
- Modify: `packages/admin/src/views/StudentsView.vue`
- Modify: `packages/admin/src/views/AlbumsView.vue`
- Modify: `packages/admin/src/views/MessagesView.vue`
- Modify: `packages/admin/src/views/AuditLogView.vue`
- Modify: `packages/admin/src/api/adminAccounts.ts`
- Modify: `packages/admin/tests/community-static.test.mjs`
- Create: `packages/admin/tests/list-performance.test.mjs`

- [ ] **Step 1：使用 1,000 学生、10,000 留言的 fixture 写失败测试：首个请求 limit 不超过 50，DOM 列表首批不超过 60。**
- [ ] **Step 2：前端统一 `PageResult<T> { items, nextCursor, total }`，筛选/排序改变时清空 cursor 并取消旧请求。**
- [ ] **Step 3：学生、相册、留言、审计列表接入 cursor/limit；保留当前筛选、编辑、删除、审核按钮语义。**
- [ ] **Step 4：为列表图片添加 `loading="lazy"`、`decoding="async"` 和固定尺寸；原图只在弹窗打开。**
- [ ] **Step 5：运行管理后台完整测试、dist-network 和列表性能测试，提交 `perf(admin): paginate large content lists`。**

### Task 4：后台上传队列与 motion 规则

**文件：**
- Modify: `packages/admin/src/views/AlbumsView.vue`
- Modify: `packages/shared/src/imageUtils.ts`
- Modify: `packages/admin/src/styles/admin.css`
- Modify: `packages/admin/src/components/CalendarDatePicker.vue`
- Modify: `packages/admin/tests/image-upload-performance.test.mjs`

- [ ] **Step 1：写失败测试**：20 张图片最多同时处理 2 张；单张失败不阻止其他文件；取消后队列可继续。
- [ ] **Step 2：将 Canvas 压缩包装为可取消任务，复用 shared 变体生成器；UI 显示每文件状态和进度。**
- [ ] **Step 3：将 `transition: all` 改为明确的 transform/opacity/background 属性，加入后台 reduced-motion 覆盖。**
- [ ] **Step 4：运行后台完整测试、typecheck 和手动 20 图 fixture，提交 `perf(admin): bound image work and motion cost`。**
