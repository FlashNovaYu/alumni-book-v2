# 同学录图片性能与上传压缩实施计划

> **For agentic workers:** 按当前仓库 AGENTS 规则在当前会话内逐项执行；本仓库禁止调用 `superpowers` 技能。每个任务先写回归测试，再做最小实现并验证。

**目标：** 在保留旧图片 URL、R2/本地存储兼容和现有视觉交互的前提下，补齐所有图片上传入口的压缩/变体，并让公开站点、班级空间和管理后台按显示尺寸加载图片。

**架构：** 复用 `@alumni/shared` 的图片编码和 `buildMediaSources()`；上传端生成 WebP/回退格式的原图与响应式变体，Worker 只负责校验、存储和元数据；前端组件只消费媒体元数据。文件 URL 继续走 `/api/files/<key>`，因此 Cloudflare R2、阿里云 ECS 上的本地存储适配器以及未来 OSS/CDN 均保持兼容。

**技术栈：** Vue 3、Astro、TypeScript、Canvas/createImageBitmap、Hono、D1/SQLite、R2 兼容存储、Vitest、Playwright、pnpm workspace。

---

## 文件与职责映射

| 文件 | 职责 |
| --- | --- |
| `packages/shared/src/imageUtils.ts` | 上传前编码、尺寸限制、WebP/PNG/JPEG 回退 |
| `packages/shared/src/media.ts` | 原图与变体 URL、`srcset`、`sizes` 组装 |
| `packages/shared/src/types.ts` | 学生、相册、时间线和班级空间媒体类型 |
| `packages/site-astro/src/components/SelfEditPanel.vue` | 同学自助头像/背景上传 |
| `workers/api/src/routes/classmate.ts` | 自助上传验证、变体写入和旧对象清理 |
| `workers/api/src/lib/timelineFeed.ts` | 时间线图片及媒体元数据输出 |
| `workers/api/src/routes/classSpace.ts` | 班级空间相册封面媒体输出 |
| `packages/site-astro/src/components/StudentProfile.vue` | 学生 Hero 头像、背景图和灯箱数据 |
| `packages/site-astro/src/components/PhotoWall.vue` | 学生照片墙及灯箱预加载 |
| `packages/site-astro/src/components/AlbumGrid.vue` | 公开相册网格及灯箱预加载 |
| `packages/site-astro/src/components/ClassSpaceAlbumRail.vue` | 班级空间相册封面 |
| `packages/site-astro/src/components/ClassSpaceTimelineRail.vue` | 班级空间时间线图片 |
| `packages/site-astro/src/pages/timeline.astro` | 静态时间线初始渲染和 SWR 重渲染 |
| `packages/site-astro/src/pages/yearbook.astro` | 年度册头像、照片和时间线 |
| `packages/site-astro/src/components/AccountCenter.vue`、`DirectConversationList.vue`、`DirectConversationView.vue`、`GroupChatMessage.vue`、`RankingsPanel.vue`、`RecipientPicker.vue`、`PrefaceWall.vue` | 小尺寸头像的统一属性和回退 |
| `packages/admin/src/views/StudentEditView.vue`、`AlbumsView.vue` | 管理端图片预览、上传变体和缩略图 |
| `packages/shared/src/imageUtils.test.ts`、`media.test.ts` | 编码和 URL 纯函数测试 |
| `workers/api/tests/upload.test.ts`、`image-validation.test.ts` | 自助上传变体、格式校验和回滚测试 |
| `packages/site-astro/tests/media-variants-static.test.ts`、`performance-static.test.ts` | 展示属性和旧数据回退静态测试 |
| `packages/site-astro/tests/performance-network.spec.ts` | 浏览器网络预算和灯箱按需原图测试 |

---

### Task 1：收紧共享图片压缩规则

**文件：**
- Modify: `packages/shared/src/imageUtils.ts`
- Test: `packages/shared/src/imageUtils.test.ts`

- [ ] **Step 1：补充失败测试**：模拟 Canvas 的 WebP、PNG、JPEG 输出，验证 `compressImage()` 仅在输出更小且确实完成编码时替换输入；WebP 不可用时 PNG 透明图回退 PNG；SVG/GIF 原样返回；超时仍返回原文件。

- [ ] **Step 2：运行测试确认失败**

  ```powershell
  pnpm --filter @alumni/shared exec vitest run src/imageUtils.test.ts
  ```

  预期：新增断言因当前 `compressImage` 固定输出 PNG/JPEG 且不比较体积而失败。

- [ ] **Step 3：实现最小压缩改动**：复用现有解码和 ObjectURL 生命周期；对 PNG/JPEG 依次尝试 WebP（质量 `0.82`），仅当 Blob 存在、MIME 正确且 `blob.size < file.size` 时采用；不支持 WebP 时按原类型回退；保持 SVG、GIF 和尺寸未超限的小文件快速返回。

- [ ] **Step 4：运行 shared 测试和类型检查**

  ```powershell
  pnpm --filter @alumni/shared exec vitest run src/imageUtils.test.ts
  pnpm verify:shared
  ```

  预期：测试全部通过，且不改变 `generateImageVariants` 的 `original/128/256/320/960` 输出契约。

- [ ] **Step 5：提交**

  ```powershell
  git add packages/shared/src/imageUtils.ts packages/shared/src/imageUtils.test.ts
  git commit -m "perf(shared): prefer smaller loss-aware image encodings"
  ```

### Task 2：补齐同学自助上传的压缩和派生图

**文件：**
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/shared/src/imageUtils.ts`（仅在 Task 1 已验证的接口上调用）
- Test: `workers/api/tests/upload.test.ts`
- Test: `packages/site-astro/tests/classmate-auth-static.test.ts`

- [ ] **Step 1：补充失败测试**：同学头像和背景上传请求包含 `variants` 与 `variant_<kind>` 文件；服务器响应返回变体；旧的无变体上传仍成功。

- [ ] **Step 2：运行目标测试确认失败**

  ```powershell
  pnpm --filter worker exec vitest run tests/upload.test.ts
  pnpm --filter site-astro exec vitest run tests/classmate-auth-static.test.ts
  ```

  预期：服务器兼容路径可能通过，但前端静态契约因未调用 `appendImageVariants` 而失败。

- [ ] **Step 3：修改自助上传**：在 `SelfEditPanel.vue` 中按类型使用 `compressImage(file, 400/1600, 0.82)`，调用 `generateImageVariants`，用 `appendImageVariants(fd, variants, 'avatars'/'backgrounds', studentSlug)` 追加派生文件；保留现有 token、错误提示、取消文件输入和成功后更新 URL 的行为。

- [ ] **Step 4：验证变体和回滚**

  ```powershell
  pnpm --filter worker exec vitest run tests/upload.test.ts tests/image-validation.test.ts tests/upload-compensation.test.ts
  pnpm --filter site-astro exec vitest run tests/classmate-auth-static.test.ts
  pnpm --filter site-astro typecheck
  ```

  预期：管理员上传、自助上传、格式拒绝、数据库失败补偿和旧对象清理均通过。

- [ ] **Step 5：提交**

  ```powershell
  git add packages/site-astro/src/components/SelfEditPanel.vue workers/api/tests/upload.test.ts packages/site-astro/tests/classmate-auth-static.test.ts
  git commit -m "perf(upload): generate variants for classmate self-service images"
  ```

### Task 3：让时间线和班级空间传递媒体元数据

**文件：**
- Modify: `packages/shared/src/types.ts`
- Modify: `workers/api/src/lib/timelineFeed.ts`
- Modify: `workers/api/src/routes/classSpace.ts`
- Test: `workers/api/tests/class-space-inbox.test.ts`
- Test: `workers/api/tests/api.test.ts`

- [ ] **Step 1：补充失败测试**：相册封面和照片型时间线条目在有 `media_json.variants` 时返回 `media.variants`；没有元数据时字段为空或缺省，原 `coverR2Key/photoUrl` 不变。

- [ ] **Step 2：实现 Worker 输出**：相册封面查询同时读取封面照片的 `media_json`，时间线照片查询读取 `p.media_json`；事件自定义 `photo_r2_key` 若无法匹配照片则只返回原 URL。使用安全 JSON 解析，禁止把 R2/本地存储实现细节泄露到响应。

- [ ] **Step 3：同步共享类型**：为 `ClassSpaceAlbumPreview`、`ClassSpaceTimelinePreview` 增加可选 `media?: { variants: MediaVariant[] } | null`，保持现有字段必填关系和旧 fixture 兼容。

- [ ] **Step 4：运行 Worker 测试**

  ```powershell
  pnpm --filter worker exec vitest run tests/class-space-inbox.test.ts tests/api.test.ts
  ```

  预期：响应新增媒体元数据但不改变旧字段和鉴权行为。

- [ ] **Step 5：提交**

  ```powershell
  git add packages/shared/src/types.ts workers/api/src/lib/timelineFeed.ts workers/api/src/routes/classSpace.ts workers/api/tests/class-space-inbox.test.ts workers/api/tests/api.test.ts
  git commit -m "perf(api): expose media variants for timeline and class space"
  ```

### Task 4：统一公开站点图片展示与灯箱预加载

**文件：**
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/PhotoWall.vue`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/components/ClassSpaceAlbumRail.vue`
- Modify: `packages/site-astro/src/components/ClassSpaceTimelineRail.vue`
- Modify: `packages/site-astro/src/pages/timeline.astro`
- Modify: `packages/site-astro/src/pages/yearbook.astro`
- Test: `packages/site-astro/tests/media-variants-static.test.ts`
- Test: `packages/site-astro/tests/performance-static.test.ts`
- Test: `packages/site-astro/tests/performance-network.spec.ts`

- [ ] **Step 1：先增加静态/浏览器失败断言**：目标图片具有 `srcset/sizes` 或明确固定尺寸；公开列表请求使用变体 key；灯箱打开前不请求原图，相邻预加载使用 960 变体。

- [ ] **Step 2：修改学生页媒体模型**：在 `StudentProfile.vue` 的 Student 接口加入 `media?: StudentMediaAssets | null`；新增头像和背景的 `buildMediaSources` 计算值；Hero 头像使用头像媒体，背景 CSS 使用背景媒体中适合宽度的 URL，缺失时回退原 URL。

- [ ] **Step 3：修改照片墙和相册灯箱**：列表继续使用现有 `srcset`；灯箱主图明确使用原 URL并设置 `decoding="async"`；`preloadImages()` 使用照片 960 变体的 URL，并复用媒体元数据，不预加载重复 URL。

- [ ] **Step 4：修改时间线、班级空间和年度册**：使用 `buildMediaSources` 选择 320/960 变体；补充 `width/height`、`loading="lazy"`、`decoding="async"`；动态 `renderTimeline()` 输出同等属性并对 URL 做既有 HTML 转义。

- [ ] **Step 5：运行静态与站点类型检查**

  ```powershell
  pnpm --filter site-astro exec vitest run tests/media-variants-static.test.ts tests/performance-static.test.ts
  pnpm --filter site-astro typecheck
  pnpm --filter site-astro build
  ```

  预期：旧字符串照片和无变体 API fixture 仍能显示，构建产物不出现未解析的媒体字段。

- [ ] **Step 6：运行性能网络测试**

  ```powershell
  pnpm --filter site-astro test:perf-network -- tests/performance-network.spec.ts
  ```

  预期：列表不请求原图；点击灯箱后才出现原图请求；失败图片仍显示现有占位内容。

- [ ] **Step 7：提交**

  ```powershell
  git add packages/site-astro/src/components/StudentProfile.vue packages/site-astro/src/components/PhotoWall.vue packages/site-astro/src/components/AlbumGrid.vue packages/site-astro/src/components/ClassSpaceAlbumRail.vue packages/site-astro/src/components/ClassSpaceTimelineRail.vue packages/site-astro/src/pages/timeline.astro packages/site-astro/src/pages/yearbook.astro packages/site-astro/tests/media-variants-static.test.ts packages/site-astro/tests/performance-static.test.ts packages/site-astro/tests/performance-network.spec.ts
  git commit -m "perf(site): serve responsive media across public image surfaces"
  ```

### Task 5：统一小头像和管理端预览属性

**文件：**
- Modify: `packages/site-astro/src/components/AccountCenter.vue`
- Modify: `packages/site-astro/src/components/DirectConversationList.vue`
- Modify: `packages/site-astro/src/components/DirectConversationView.vue`
- Modify: `packages/site-astro/src/components/GroupChatMessage.vue`
- Modify: `packages/site-astro/src/components/RankingsPanel.vue`
- Modify: `packages/site-astro/src/components/RecipientPicker.vue`
- Modify: `packages/site-astro/src/components/PrefaceWall.vue`
- Modify: `packages/admin/src/views/StudentEditView.vue`
- Modify: `packages/admin/src/views/AlbumsView.vue`
- Test: `packages/site-astro/tests/performance-static.test.ts`
- Test: `packages/admin/tests/view-behavior.test.ts`

- [ ] **Step 1：补充静态断言**：固定尺寸头像包含 `width/height`；非首屏头像包含 `loading="lazy" decoding="async"`；编辑预览不阻塞列表请求。

- [ ] **Step 2：实现统一属性**：对已有 avatar URL 只补充展示属性和错误回退；若接口没有媒体元数据，不伪造 `srcset`；管理员预览使用 320/960 变体并保持原图可访问。

- [ ] **Step 3：运行目标测试与后台构建**

  ```powershell
  pnpm --filter site-astro exec vitest run tests/performance-static.test.ts
  pnpm --filter admin test -- tests/view-behavior.test.ts
  pnpm --filter admin typecheck
  pnpm --filter admin build
  ```

- [ ] **Step 4：提交**

  ```powershell
  git add packages/site-astro/src/components/AccountCenter.vue packages/site-astro/src/components/DirectConversationList.vue packages/site-astro/src/components/DirectConversationView.vue packages/site-astro/src/components/GroupChatMessage.vue packages/site-astro/src/components/RankingsPanel.vue packages/site-astro/src/components/RecipientPicker.vue packages/site-astro/src/components/PrefaceWall.vue packages/admin/src/views/StudentEditView.vue packages/admin/src/views/AlbumsView.vue packages/site-astro/tests/performance-static.test.ts packages/admin/tests/view-behavior.test.ts
  git commit -m "perf(ui): bound small avatar image work"
  ```

### Task 6：阿里云 ECS/本地存储兼容验收与总门禁

**文件：**
- Modify: `packages/site-astro/tests/performance-network.spec.ts`（仅补充自托管 `/api` 场景断言）
- Modify: `docs/deployment-runbook.md`
- Test: `workers/api/src/runtime/node-runtime.test.ts`

- [ ] **Step 1：验证存储适配器契约**：本地 `UPLOAD_ROOT` 产生原图和变体文件，`/api/files/<key>` 返回正确 Content-Type、immutable 缓存和 Range；不引入 R2 专有调用。

- [ ] **Step 2：在部署 runbook 写明 ECS 要求**：持久化 `/var/lib/alumni-book/data` 和 `/var/lib/alumni-book/uploads`；Nginx `client_max_body_size` 不低于上传上限；不把 OSS/AccessKey 写入仓库；未来 OSS/CDN 只替换适配层。

- [ ] **Step 3：运行完整门禁**

  ```powershell
  pnpm verify:worker
  pnpm verify:shared
  pnpm verify:admin
  pnpm verify:site
  git diff --check
  git status --short --branch
  ```

  预期：所有验证通过；工作区只保留本任务提交和用户后续新增改动，不执行清理或 reset。

- [ ] **Step 4：提交部署文档**

  ```powershell
  git add packages/site-astro/tests/performance-network.spec.ts docs/deployment-runbook.md workers/api/src/runtime/node-runtime.test.ts
  git commit -m "docs: verify media performance on self-hosted ECS"
  ```

## 计划自审

- 设计说明中的上传压缩、自助上传变体、所有主要展示面、灯箱按需原图、旧数据回退和阿里云兼容边界均有对应任务。
- 已扫描计划中的占位符和未定义步骤；没有未决实现项。
- `MediaVariant`、`StudentMediaAssets`、`ClassSpace*Preview.media`、`buildMediaSources()` 和现有 `appendImageVariants()` 名称在各任务中保持一致。
- 每个任务包含测试、实现、验证和提交步骤；已有 R2/本地存储实现不被重写。
