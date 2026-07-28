# 同学相册投稿与容量管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 为同学投稿相册、管理员批量移动照片、存储容量面板和私聊浏览器回归提供可发布的阿里云自托管实现。

**Architecture:** API 将投稿相册和投稿归属保存到现有 SQLite/D1 相册数据模型；同学上传的目标相册只由服务端查询。Node runtime 把上传根目录显式传给容量统计模块，Cloudflare runtime 返回不可用状态。管理后台和同学资料面板分别调用受权限保护的管理接口与 classmate-token 接口。

**Tech Stack:** Hono、D1/SQLite、Node 22 statfs、Vue 3、Astro、Vitest、Playwright、Podman。

---

## 文件结构

- workers/api/migrations/0021_classmate_album_submissions.sql：投稿开关、照片归属、唯一投稿相册与查询索引。
- workers/api/src/db/schema.sql：新安装数据库的相同结构。
- workers/api/tests/db-helper.ts：Cloudflare Vitest 的 0021 迁移登记。
- workers/api/src/routes/classmate.ts：同学投稿 API、限额与对象补偿。
- workers/api/src/routes/albums.ts：投稿设置、批量移动和容量管理 API。
- workers/api/src/runtime/nodeEnv.ts 与 workers/api/src/runtime/storageUsage.ts：上传根目录和容量统计。
- workers/api/src/index.ts：公开相册字段、管理权限与缓存失效。
- workers/api/tests/classmate-album-submissions.test.ts、workers/api/tests/albums-admin.test.ts、workers/api/src/runtime/node-runtime.test.ts：API、权限、移动、限额和 Node 容量回归。
- packages/shared/src/types.ts：投稿字段类型。
- packages/site-astro/src/components/SelfEditPanel.vue：投稿 UI、压缩、额度及上传。
- packages/site-astro/tests/classmate-album-submission-static.test.ts：同学端静态契约。
- packages/admin/src/views/AlbumsView.vue：投稿开关、容量卡片和多选移动。
- packages/admin/tests/albums-submission-management.test.ts：后台交互回归。
- packages/site-astro/tests/chat-rework-flow.spec.ts：正确的 Playwright 私聊回归。

### Task 1: 建立数据库与测试基线

**Files:**

- Create: workers/api/migrations/0021_classmate_album_submissions.sql
- Modify: workers/api/src/db/schema.sql
- Modify: workers/api/tests/db-helper.ts
- Create: workers/api/tests/classmate-album-submissions.test.ts

- [ ] **Step 1: 写入失败的迁移/API 测试**

~~~ts
it('只允许一个投稿相册，且同学名下最多保留五张投稿照片', async () => {
  await createSubmissionAlbum('album-submissions')
  await Promise.all(Array.from({ length: 5 }, () => submitPhoto(TOKEN_A)))
  const sixth = await submitPhoto(TOKEN_A)
  expect(sixth.status).toBe(409)
  expect((await sixth.json()).message).toContain('最多上传 5 张')
})
~~~

- [ ] **Step 2: 运行失败测试**

Run: pnpm --filter worker exec vitest run tests/classmate-album-submissions.test.ts

Expected: FAIL，因为投稿字段和 /api/classmate/album-photos 尚未存在。

- [ ] **Step 3: 添加最小迁移及 schema**

~~~sql
ALTER TABLE albums ADD COLUMN accepts_classmate_uploads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN submitted_by_slug TEXT;
ALTER TABLE photos ADD COLUMN upload_source TEXT NOT NULL DEFAULT 'admin';
CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_one_classmate_submission_target
  ON albums(accepts_classmate_uploads) WHERE accepts_classmate_uploads = 1;
CREATE INDEX IF NOT EXISTS idx_photos_classmate_submission_quota
  ON photos(submitted_by_slug, upload_source);
CREATE TRIGGER IF NOT EXISTS trg_photos_classmate_submission_limit
BEFORE INSERT ON photos
WHEN NEW.upload_source = 'classmate' AND (
  SELECT COUNT(*) FROM photos
  WHERE submitted_by_slug = NEW.submitted_by_slug AND upload_source = 'classmate'
) >= 5
BEGIN SELECT RAISE(ABORT, 'classmate album submission limit reached'); END;
~~~

在 schema.sql 的 albums、photos 建表语句加入相同列和索引；在 db-helper.ts import 0021 原始 SQL，并作为最后一项 testMigrations 登记。

- [ ] **Step 4: 运行迁移/API 测试**

Run: pnpm --filter worker exec vitest run tests/classmate-album-submissions.test.ts

Expected: 仍只剩投稿路由未实现的断言失败。

- [ ] **Step 5: 提交数据库基线**

~~~bash
git add workers/api/migrations/0021_classmate_album_submissions.sql workers/api/src/db/schema.sql workers/api/tests/db-helper.ts workers/api/tests/classmate-album-submissions.test.ts
git commit -m "feat: add classmate album submission schema"
~~~

### Task 2: 实现同学投稿 API 与对象补偿

**Files:**

- Modify: workers/api/src/routes/classmate.ts
- Modify: workers/api/src/index.ts
- Modify: workers/api/tests/classmate-album-submissions.test.ts
- Modify: workers/api/tests/upload-compensation.test.ts

- [ ] **Step 1: 扩充失败路径测试**

~~~ts
it('忽略客户端伪造的 albumId，并只写入指定投稿相册', async () => {
  const res = await submitPhoto(TOKEN_A, { albumId: 'other-album' })
  expect(res.status).toBe(201)
  const photo = await env.DB.prepare('SELECT album_id, submitted_by_slug, upload_source FROM photos').first()
  expect(photo).toMatchObject({ album_id: 'album-submissions', submitted_by_slug: STUDENT_A, upload_source: 'classmate' })
})
~~~

- [ ] **Step 2: 运行失败测试**

Run: pnpm --filter worker exec vitest run tests/classmate-album-submissions.test.ts tests/upload-compensation.test.ts

Expected: FAIL，路由尚未创建或无法写入投稿归属。

- [ ] **Step 3: 写入最小受保护路由**

在 classmate.ts 增加 POST /classmate/album-photos：调用既有 session 校验，拒绝 mustChangePassword，查询 accepts_classmate_uploads = 1 的相册；使用已有 parseUploadVariants、validateImageUpload 和 buildUploadKey('photo', ...)。

~~~ts
const quota = await db.prepare(
  "SELECT COUNT(*) AS count FROM photos WHERE submitted_by_slug = ? AND upload_source = 'classmate'"
).bind(identity.slug).first<{ count: number }>()
if ((quota?.count || 0) >= 5) return c.json({ success: false, message: '每名同学最多上传 5 张照片' }, 409)
~~~

将原图和 variants 放入 uploadedKeys，插入 photos(id, album_id, filename, r2_key, media_json, submitted_by_slug, upload_source)；迁移的 BEFORE INSERT trigger 是五张上限的并发最终约束，任一写入失败删除本次所有对象。让相册公开缓存失效覆盖 /api/classmate/album-photos。

- [ ] **Step 4: 运行 API 与补偿测试**

Run: pnpm --filter worker exec vitest run tests/classmate-album-submissions.test.ts tests/upload-compensation.test.ts tests/upload.test.ts

Expected: PASS。

- [ ] **Step 5: 提交投稿 API**

~~~bash
git add workers/api/src/routes/classmate.ts workers/api/src/index.ts workers/api/tests/classmate-album-submissions.test.ts workers/api/tests/upload-compensation.test.ts
git commit -m "feat: allow classmate album submissions"
~~~

### Task 3: 管理员投稿设置、照片移动与容量接口

**Files:**

- Create: workers/api/src/runtime/storageUsage.ts
- Modify: workers/api/src/runtime/nodeEnv.ts
- Modify: workers/api/src/routes/albums.ts
- Modify: workers/api/src/index.ts
- Create: workers/api/tests/albums-admin.test.ts
- Modify: workers/api/src/runtime/node-runtime.test.ts

- [ ] **Step 1: 写入失败测试**

~~~ts
it('管理员将多张照片移至目标相册并保持投稿归属', async () => {
  const res = await request('/api/photos/move', adminOptions({ photoIds: ['p-a', 'p-b'], targetAlbumId: 'target' }))
  expect(res.status).toBe(200)
  const { results } = await env.DB.prepare('SELECT album_id, submitted_by_slug FROM photos WHERE id IN (?, ?) ORDER BY id').bind('p-a', 'p-b').all()
  expect(results).toEqual([{ album_id: 'target', submitted_by_slug: STUDENT_A }, { album_id: 'target', submitted_by_slug: null }])
})
~~~

并在 Node runtime 测试使用临时上传目录写入确定字节数，断言 albums.totalBytes、uploads.totalBytes 与 filesystem.totalBytes > 0。

- [ ] **Step 2: 运行失败测试**

Run: pnpm --filter worker exec vitest run tests/albums-admin.test.ts && pnpm --filter worker run test:node -- src/runtime/node-runtime.test.ts

Expected: FAIL，移动和容量接口尚未实现。

- [ ] **Step 3: 实现最小管理能力**

在 albums.ts：创建/更新相册时处理 acceptsClassmateUploads；启用时同一 runAuditedBatch 中将其他相册清零。新增 POST /photos/move，严格验证非空、去重后的 photo IDs、目标相册存在和不等于源相册；按传入照片在源相册 sort_order 的顺序追加到目标相册，并以 photo.move 写入审计。

storageUsage.ts 导出：

~~~ts
export async function collectLocalStorageUsage(uploadRoot: string, photos: Array<{ r2_key: string; media_json: string }>): Promise<StorageUsage>
~~~

它递归统计上传根目录（跳过 .meta.json），使用 statfs(uploadRoot) 计算磁盘字段，并只累加数据库照片原图/变体对应的真实文件。Node runtime 将安全的上传根目录作为非敏感 binding 暴露；Cloudflare 端返回 { available: false, environment: 'cloudflare' }。两个接口都使用既有 content.manage 权限，并纳入相册缓存失效。

- [ ] **Step 4: 运行接口和 Node 运行时测试**

Run: pnpm --filter worker exec vitest run tests/albums-admin.test.ts tests/classmate-album-submissions.test.ts && pnpm --filter worker run test:node -- src/runtime/node-runtime.test.ts

Expected: PASS。

- [ ] **Step 5: 提交管理 API**

~~~bash
git add workers/api/src/runtime/storageUsage.ts workers/api/src/runtime/nodeEnv.ts workers/api/src/routes/albums.ts workers/api/src/index.ts workers/api/tests/albums-admin.test.ts workers/api/src/runtime/node-runtime.test.ts
git commit -m "feat: manage album storage and photo moves"
~~~

### Task 4: 接入同学端与管理后台界面

**Files:**

- Modify: packages/shared/src/types.ts
- Modify: packages/site-astro/src/components/SelfEditPanel.vue
- Create: packages/site-astro/tests/classmate-album-submission-static.test.ts
- Modify: packages/admin/src/views/AlbumsView.vue
- Create: packages/admin/tests/albums-submission-management.test.ts

- [ ] **Step 1: 写入 UI 测试**

~~~ts
it('相册管理允许选择照片、目标相册和加载容量统计', async () => {
  const wrapper = mount(AlbumsView, { global: { stubs: { Teleport: true } } })
  await vi.waitFor(() => expect(wrapper.text()).toContain('服务器可用空间'))
  await wrapper.get('[data-photo-select="photo-1"]').setValue(true)
  await wrapper.get('[data-move-target]').setValue('album-2')
  await wrapper.get('[data-move-selected]').trigger('click')
  expect(fetch).toHaveBeenCalledWith('/api/photos/move', expect.objectContaining({ method: 'POST' }))
})
~~~

- [ ] **Step 2: 运行失败测试**

Run: pnpm --filter site-astro exec vitest run tests/classmate-album-submission-static.test.ts && pnpm --filter admin exec vitest run tests/albums-submission-management.test.ts

Expected: FAIL，因为 UI 和 data attributes 尚未存在。

- [ ] **Step 3: 实现最小界面**

共享类型增加 acceptsClassmateUploads、submittedBySlug 和 uploadSource。SelfEditPanel.vue 复用 compressImage(file, 1920, 0.82) 与 generateImageVariants，调用 /api/classmate/album-photos 并显示剩余额度/失败原因，单批不超过五张。AlbumsView.vue 加入投稿开关和标识、容量卡片、照片 checkbox、目标相册 select、确认后调用 /api/photos/move 并刷新列表；容量不可用时只展示 API message。

- [ ] **Step 4: 运行 UI 测试与类型检查**

Run: pnpm --filter site-astro exec vitest run tests/classmate-album-submission-static.test.ts && pnpm --filter admin exec vitest run tests/albums-submission-management.test.ts tests/albums-upload-queue.test.ts && pnpm --filter site-astro typecheck && pnpm --filter admin typecheck

Expected: PASS。

- [ ] **Step 5: 提交前端功能**

~~~bash
git add packages/shared/src/types.ts packages/site-astro/src/components/SelfEditPanel.vue packages/site-astro/tests/classmate-album-submission-static.test.ts packages/admin/src/views/AlbumsView.vue packages/admin/tests/albums-submission-management.test.ts
git commit -m "feat: add album submission management UI"
~~~

### Task 5: 私聊浏览器回归、发布构建与阿里云验收

**Files:**

- Modify: packages/site-astro/tests/chat-rework-flow.spec.ts（仅当正确 Playwright 执行揭示缺少的回归覆盖时）
- Modify: packages/site-astro/src/composables/useInbox.ts（仅当浏览器测试复现实际行为缺陷时）

- [ ] **Step 1: 正确执行浏览器私聊回归**

Run: pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/post-office-flow.spec.ts tests/chat-rework-flow.spec.ts --workers=1

Expected: PLAYWRIGHT 通过；不得把 .spec.ts 交给 Vitest。

- [ ] **Step 2: 若失败，先写精确失败断言再做最小修复**

~~~ts
await page.getByPlaceholder('写下消息……').fill('首条私聊')
await page.getByRole('button', { name: '发送消息' }).click()
await expect(page.locator('[data-message-id="pm-created"]')).toContainText('首条私聊')
~~~

只修改导致该断言失败的 useInbox.ts 或直接 API client；保留 clientNonce 幂等重试。完成后重跑两个 Playwright spec。

- [ ] **Step 3: 运行受影响质量门禁**

Run: pnpm --filter worker exec vitest run tests/classmate-album-submissions.test.ts tests/albums-admin.test.ts tests/direct-conversations.test.ts && pnpm --filter worker typecheck && pnpm --filter worker run test:node -- src/runtime/node-runtime.test.ts && pnpm --filter admin test && pnpm --filter admin typecheck && VITE_SSG_API_BASE=http://118.178.88.227 pnpm --filter site-astro typecheck

Expected: PASS。

- [ ] **Step 4: 构建并原子发布指定提交**

~~~bash
git status --short
git rev-parse HEAD
$env:RELEASE_SHA=(git rev-parse HEAD); pnpm build:selfhosted -- --api-base http://118.178.88.227
~~~

将只含已提交发布 SHA 的产物按 docs/deployment-runbook.md 上传至 ECS release 目录，使用 Podman 构建 API，原子切换静态 release 和服务版本；不读取或输出生产环境机密。

- [ ] **Step 5: 验证线上收敛与业务接口**

Run: node scripts/smoke-selfhosted.mjs --base-url http://118.178.88.227

Expected: /release.json、API health/readiness 和静态 SHA 一致；验证新迁移已经应用、管理容量接口要求管理认证、同学投稿接口未认证时返回 401。不得为验证而写入真实同学照片或消息。

## 计划自审

- 规格覆盖：Task 1-2 覆盖投稿相册、五张限额、压缩对象与补偿；Task 3 覆盖移动、审计和 Node/Cloudflare 容量；Task 4 覆盖两个 UI；Task 5 覆盖私聊回归及阿里云发布验收。
- 占位检查：本计划没有未完成占位符，不要求未定义的抽象实现。
- 类型一致性：API 使用 acceptsClassmateUploads、submittedBySlug、uploadSource；数据库使用对应 snake_case 列；移动接口统一为 POST /api/photos/move.
