# 头像上传圆形裁切实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为同学自助头像上传增加可拖拽、可缩放的圆形取景预览，并将确认结果沿用现有阿里云自托管上传链路提交。

**Architecture:** 在共享图片工具中提供纯 Canvas 正方形裁切函数；新增一个职责单一的 Vue 裁切弹层组件负责预览交互；`SelfEditPanel.vue` 只协调选图、裁切确认与现有上传函数。背景图上传分支保持不变。

**Tech Stack:** Vue 3、TypeScript、Canvas 2D、Vitest、Astro。

---

### Task 1: 可测试的头像裁切工具

**Files:**
- Modify: `packages/shared/src/imageUtils.ts`
- Modify: `packages/shared/src/imageUtils.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 编写失败测试**

在 `imageUtils.test.ts` 中为 `cropImageToSquare` 增加测试：模拟 1200×800 图片，以 `{ x: 200, y: 0, size: 800 }` 为源区域，断言 Canvas 为 512×512、`drawImage` 参数正确、输出为命名的 JPEG File，并验证对象 URL 被释放。

- [ ] **Step 2: 验证测试先失败**

运行：`pnpm --filter @alumni/shared test -- imageUtils.test.ts`

预期：测试因 `cropImageToSquare` 尚未导出而失败。

- [ ] **Step 3: 实现最小裁切函数**

在 `imageUtils.ts` 中增加 `SquareCrop` 类型和 `cropImageToSquare(file, crop, outputSize = 512)`：校验区域和格式，解码图片，限制源区域在图片边界内，通过 `drawImage(source, x, y, size, size, 0, 0, outputSize, outputSize)` 输出 JPEG File，并在 `finally` 中释放解码与 Canvas 资源。从 `index.ts` 导出函数和类型。

- [ ] **Step 4: 验证共享包**

运行：`pnpm --filter @alumni/shared test -- imageUtils.test.ts` 与 `pnpm --filter @alumni/shared typecheck`

预期：全部通过。

### Task 2: 圆形裁切预览组件

**Files:**
- Create: `packages/site-astro/src/components/AvatarCropper.vue`
- Modify: `packages/site-astro/tests/classmate-auth-static.test.ts`

- [ ] **Step 1: 编写失败的静态契约测试**

断言组件包含 `role="dialog"`、`aria-modal="true"`、圆形 `.crop-circle`、中文缩放标签、Pointer Events 拖拽、Escape 取消，以及 `confirm`/`cancel` 事件。

- [ ] **Step 2: 验证测试先失败**

运行：`pnpm --filter site-astro exec vitest run tests/classmate-auth-static.test.ts`

预期：因 `AvatarCropper.vue` 不存在而失败。

- [ ] **Step 3: 实现预览组件**

组件接收 `src`、`naturalWidth`、`naturalHeight` 和 `busy`；固定正方形预览区，按 cover 计算基础比例，使用响应式 `zoom` 与归一化偏移渲染图片；Pointer Events 更新偏移并约束不露边；确认时将当前视口反算为原图 `{ x, y, size }` 并 emit；取消或 Escape emit `cancel`。CSS 使用圆形边框和 `box-shadow: 0 0 0 999px` 形成选区外遮罩，移动端工作区不超过视口宽度。

- [ ] **Step 4: 验证组件契约和类型**

运行：`pnpm --filter site-astro exec vitest run tests/classmate-auth-static.test.ts` 与 `pnpm --filter site-astro typecheck`

预期：全部通过。

### Task 3: 接入现有头像上传流程

**Files:**
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/site-astro/tests/classmate-auth-static.test.ts`

- [ ] **Step 1: 添加失败的上传流程契约**

断言头像 input 调用 `selectAvatar` 而非立即上传，背景图仍调用 `uploadBackground`；`AvatarCropper` 的确认事件调用 `confirmAvatarCrop`；确认函数先执行 `cropImageToSquare` 再走 `uploadPreparedFile`；取消和卸载时释放预览 URL。

- [ ] **Step 2: 验证测试先失败**

运行：`pnpm --filter site-astro exec vitest run tests/classmate-auth-static.test.ts`

预期：因裁切流程尚未接入而失败。

- [ ] **Step 3: 最小接入实现**

将原 `uploadFile(event, type)` 拆为 `uploadPreparedFile(file, type)` 与背景选择处理；头像选择时校验 JPG/PNG/WebP，加载自然尺寸并保存对象 URL；渲染 `AvatarCropper`；确认时生成裁切 File 并调用现有上传逻辑；取消、关闭编辑器和组件卸载时释放 URL、清空 input/状态。保留现有用户对生日选择器的未提交改动。

- [ ] **Step 4: 验证聚焦测试**

运行：`pnpm --filter site-astro exec vitest run tests/classmate-auth-static.test.ts tests/ui-reliability-static.test.ts`

预期：全部通过。

### Task 4: 完整质量门禁与差异检查

**Files:**
- Verify only

- [ ] **Step 1: 执行共享包和站点验证**

运行：`pnpm --filter @alumni/shared test`、`pnpm --filter @alumni/shared typecheck`、`pnpm --filter site-astro test`、`pnpm --filter site-astro typecheck`。

预期：全部通过；若现有未提交改动导致无关失败，记录精确失败并单独运行任务相关测试证明本改动。

- [ ] **Step 2: 执行站点构建**

使用显式自托管数据源运行：`$env:VITE_SSG_API_BASE='http://118.178.88.227'; pnpm build:site; Remove-Item Env:VITE_SSG_API_BASE`。

预期：构建成功且浏览器端仍使用同源 API。

- [ ] **Step 3: 审查最终差异**

运行：`git diff --check`、`git status --short`、`git diff -- packages/shared/src/imageUtils.ts packages/shared/src/imageUtils.test.ts packages/shared/src/index.ts packages/site-astro/src/components/AvatarCropper.vue packages/site-astro/src/components/SelfEditPanel.vue packages/site-astro/tests/classmate-auth-static.test.ts docs/superpowers/specs/2026-07-21-avatar-upload-crop-design.md docs/superpowers/plans/2026-07-21-avatar-upload-crop.md`。

预期：没有空白错误；每一行任务改动都可追溯到头像裁切需求；用户原有文件改动被保留。

