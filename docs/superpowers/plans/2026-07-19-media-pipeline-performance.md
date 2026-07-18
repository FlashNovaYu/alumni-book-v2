# 媒体与图片管线性能实施计划

> **For agentic workers:** 按当前仓库 AGENTS 规则使用本地协作调度和阶段性审查；本仓库禁止调用 `superpowers` 技能。

**目标：** 保留原图、灯箱和下载能力，同时让列表、名册、年度册只传输适合视口的派生图片。

**架构：** 上传端生成 128/256/320/960 四档 WebP（不支持时回退 JPEG），Worker 将派生对象写入 R2 并返回资源元数据；前端通过 `srcset`/`sizes` 选择尺寸，原始对象只用于灯箱和下载。

**技术栈：** TypeScript、Canvas/createImageBitmap、Cloudflare R2、Vitest、Playwright。

---

### Task 1：定义共享媒体类型和 URL 生成器

**文件：**
- Modify: `packages/shared/src/types.ts`
- Create: `packages/shared/src/media.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/utils.ts`
- Create: `packages/shared/tests/media.test.ts`

- [ ] **Step 1：先写测试**：给定原图 key、宽高和四个变体，生成稳定的 `src`、`srcset`、`sizes`；旧的单一 `r2Key` 数据仍生成单 URL。
- [ ] **Step 2：运行 `pnpm --filter @alumni/shared exec vitest run tests/media.test.ts`，预期模块不存在而失败。**
- [ ] **Step 3：实现 `MediaVariant`、`MediaAsset` 和纯函数 `buildMediaSources()`；不得在函数中访问 window 或网络。**
- [ ] **Step 4：运行 shared typecheck 与测试，提交 `feat(shared): define responsive media sources`。**

### Task 2：上传端生成派生文件

**文件：**
- Modify: `packages/shared/src/imageUtils.ts`
- Create: `packages/shared/src/imageVariants.ts`
- Modify: `packages/admin/src/views/AlbumsView.vue`
- Modify: `packages/admin/src/views/StudentEditView.vue`
- Modify: `packages/admin/src/api/client.ts`
- Modify: `packages/admin/tests/image-upload-performance.test.mjs`

- [ ] **Step 1：增加失败测试**：20 张图片上传时最多 2 个压缩任务并发；每个文件报告阶段和进度；取消一个文件不影响其他文件。
- [ ] **Step 2：实现 `createImageVariants(file)`：优先 `createImageBitmap`，回退现有 `Image`；返回 original/128/256/320/960 Blob，统一释放 bitmap、ObjectURL 和 Canvas。**
- [ ] **Step 3：实现受控队列 `runUploadQueue(items, concurrency = 2, signal)`；沿用现有 API 认证头、错误提示和失败补偿。**
- [ ] **Step 4：管理后台列表只显示 320/缩略 URL，编辑和灯箱保留原图入口；运行管理后台测试和 typecheck，提交 `perf(admin): generate responsive media variants`。**

### Task 3：Worker/R2 变体存储与返回

**文件：**
- Create: `workers/api/migrations/0018_media_variants.sql`
- Modify: `workers/api/src/db/schema.sql`
- Modify: `workers/api/src/routes/upload.ts`
- Modify: `workers/api/src/routes/classmate.ts`
- Modify: `workers/api/src/routes/files.ts`
- Modify: `workers/api/src/lib/fileUrl.ts`
- Modify: `workers/api/tests/upload.test.ts`
- Modify: `workers/api/tests/files.test.ts`

- [ ] **Step 1：写测试**：上传响应包含变体清单和宽高；旧格式上传只返回原图；R2 变体仍带 immutable、ETag、Range 行为。
- [ ] **Step 2：新增迁移，在 `photos` 与 `students` 增加 `media_json TEXT NOT NULL DEFAULT '{}'`；schema.sql 与迁移保持相同默认值，旧行可直接读取。**
- [ ] **Step 3：扩展上传 payload 为 `variants[]`，每个元素包含 key、contentType、width、height、kind；Worker 校验 key 前缀和总数量。**
- [ ] **Step 4：批量写入 R2，并在同一业务写入中保存 `media_json`；失败时删除本批已写对象并返回现有错误格式。**
- [ ] **Step 5：文件路由继续使用现有缓存头和 Range 分支；运行迁移、上传/文件测试与 Worker 全量测试，提交 `feat(worker): store responsive media variants`。**

### Task 4：前端 srcset、占位和旧资源回退

**文件：**
- Modify: `packages/site-astro/src/components/ArchiveRosterCard.vue`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/components/PhotoWall.vue`
- Modify: `packages/site-astro/src/pages/yearbook.astro`
- Modify: `packages/site-astro/tests/performance-static.test.ts`
- Modify: `packages/site-astro/tests/performance-network.spec.ts`

- [ ] **Step 1：写浏览器断言**：名册/相册首屏的图片请求 URL 不包含原图 key；图片具备 `width`/`height` 或 `aspect-ratio`；灯箱打开后才请求原图。
- [ ] **Step 2：使用共享 `buildMediaSources()` 输出 `srcset`、`sizes`、`loading="lazy"` 和 `decoding="async"`；旧数据没有 variants 时保持现有 URL。**
- [ ] **Step 3：为年度册头像从 `<object>` 改为有回退的 `<img>`，不改变首字母占位和打印效果。**
- [ ] **Step 4：压缩 favicon 至 40KB 内并更新静态测试；运行 site build、静态测试、性能网络测试，提交 `perf(site): serve responsive media sources`。**

### Task 5：旧资源渐进式回填

**文件：**
- Create: `scripts/backfill-media-variants.ts`
- Modify: `package.json`
- Modify: `docs/deployment-runbook.md`

- [ ] **Step 1：脚本使用现有 R2 key 列表，只处理没有 variants 的图片，支持 `--dry-run`、批次大小和失败重试；不删除原图。**
- [ ] **Step 2：增加 `pnpm media:backfill -- --dry-run`，输出待处理数量和预计 R2 对象数，不连接生产写入。**
- [ ] **Step 3：在部署 runbook 中写明先 dry-run、再分批执行和回滚方式；提交 `chore(media): add safe variant backfill`。**
