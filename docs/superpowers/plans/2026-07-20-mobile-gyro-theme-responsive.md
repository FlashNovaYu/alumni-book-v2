# 移动端陀螺仪光影、主题水波与两列档案墙实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有纸页主题与路由的前提下，让移动端保持两列档案墙，真实陀螺仪可用时同步驱动卡片旋转和光影，并为 HTTP/权限拒绝提供诚实降级，同时修正主题水波起点和移动端控件适配。

**Architecture:** 将设备方向能力检测、权限申请、共享 RAF 平滑和旋转/光影映射集中在 `useMouseTilt.ts`。档案卡与相册卡消费同一组状态；触摸/指针降级也写入同一组光影变量。主题运行时从可见主题按钮的图标盒子测量水波起点，布局修复保持组件局部、令牌驱动，不引入新动画库。

**Tech Stack:** Astro 7、Vue 3、TypeScript、Vitest、Playwright、CSS media queries、View Transition API。

---

## 文件与职责地图

- 修改 `packages/site-astro/src/composables/useMouseTilt.ts`：设备方向能力状态、权限申请、共享方向循环、旋转和光影坐标、触摸降级。
- 修改 `packages/site-astro/src/components/ArchiveRosterCard.vue`、`AlbumGrid.vue`：消费统一光影状态并接入指针移动。
- 修改 `packages/site-astro/src/components/RosterWall.vue`：显示真实设备状态并保持两列。
- 修改 `packages/site-astro/src/layouts/MainLayout.astro`：清理错位重复样式，恢复环境光媒体查询。
- 修改 `TopNav.astro`、`UiPagination.vue`、`timeline.astro`、`AccountCenter.vue`、`StudentProfile.vue`：移动触控区、滚动和边距。
- 修改 `themeRuntime.ts`：从实际可见主题图标中心计算水波。
- 新增 `tests/mobile-gyro-static.test.ts`、`tests/mobile-gyro-flow.spec.ts`；扩展主题和响应式测试。

## Task 1：设备方向纯函数与能力状态（TDD）

**Files:** Create `packages/site-astro/tests/mobile-gyro-static.test.ts`; Modify `packages/site-astro/src/composables/useMouseTilt.ts`.

- [ ] 写失败测试，要求导出 `DeviceOrientationStatus`、`classifyDeviceOrientation`、`mapOrientationToTilt`：

```ts
it('HTTP 返回 insecure-context', () => {
  expect(classifyDeviceOrientation({ isSecureContext: false, hasEvent: true })).toBe('insecure-context')
})
it('无事件返回 unsupported', () => {
  expect(classifyDeviceOrientation({ isSecureContext: true, hasEvent: false })).toBe('unsupported')
})
it('方向同时映射旋转与光影', () => {
  expect(mapOrientationToTilt({ beta: 20, gamma: 18, baseBeta: 0, maxTilt: 8 })).toEqual({
    rotateX: 3.56, rotateY: 3.2, glareX: 70, glareY: 27.78,
  })
})
```

- [ ] 运行 `pnpm --filter site-astro exec vitest run tests/mobile-gyro-static.test.ts`，确认因导出缺失而失败。
- [ ] 实现最小纯函数：状态联合类型为 `idle | granted | unsupported | insecure-context | denied | error`；beta/gamma 映射限制在 `[-maxTilt,maxTilt]` 和 `[0,100]`，数值保留两位。
- [ ] 重跑同一 Vitest 命令，确认纯函数测试通过。

## Task 2：共享方向循环与触摸降级（TDD）

**Files:** Modify `useMouseTilt.ts`、`ArchiveRosterCard.vue`、`AlbumGrid.vue`.

- [ ] 在静态测试中先加入失败断言：`mapPointerToGlare({x:20,y:75,width:100,height:100})` 返回 `{ glareX:20, glareY:75 }`；权限拒绝不能返回 `granted`。
- [ ] 运行新测试确认失败。
- [ ] 在 composable 中实现 `mapPointerToGlare`、`initDeviceOrientation(): Promise<DeviceOrientationStatus>`、`stopDeviceOrientation()`：
  - 非安全上下文/不支持时不注册事件；
  - iOS `requestPermission()` 只从按钮点击链调用；
  - 全局只保留一份方向监听和 RAF，实例销毁时移除自身 Map，最后实例销毁时停止循环；
  - 方向循环同时写 rotateX/rotateY/glareX/glareY/isOrientationActive；
  - reduced-motion 下不启动 RAF；
  - `getTiltStyles` 总是输出 `--glare-x`、`--glare-y`。
- [ ] 两类卡片改用 pointermove/pointerenter/pointerleave；光影透明度条件改为 `isHovered || isOrientationActive`，保留音效、点击和灯箱。
- [ ] 运行 `pnpm --filter site-astro exec vitest run tests/mobile-gyro-static.test.ts && pnpm --filter site-astro typecheck`。

## Task 3：真实状态提示与两列档案墙

**Files:** Modify `RosterWall.vue`、`ArchiveRosterCard.vue`.

- [ ] 先加入失败静态契约：源码必须出现 `DeviceOrientationStatus`、`insecure-context`、`isOrientationActive`，移动 CSS 必须出现 `repeat(2, minmax(0, 1fr))`。
- [ ] 运行静态测试确认现状失败。
- [ ] 用 `gyroStatus = ref<DeviceOrientationStatus>('idle')` 取代布尔 `gyroActivated`，按钮保存 `await initDeviceOrientation()` 结果；文案映射为：
  - idle：开启 3D 光影
  - granted：陀螺仪光影已开启
  - unsupported：当前使用触摸光影
  - insecure-context：HTTPS 后开启陀螺仪
  - denied：重新请求陀螺仪权限
  - error：使用触摸光影
- [ ] 375–430px 始终使用 `grid-template-columns: repeat(2, minmax(0, 1fr))`；卡片内容 `min-width:0`，姓名/座右铭/状态设置行数或省略，不能撑破网格。
- [ ] 运行静态测试和 `pnpm --filter site-astro typecheck`。

## Task 4：全局环境光与移动尺寸

**Files:** Modify `MainLayout.astro`、`TopNav.astro`、`UiPagination.vue`、`timeline.astro`、`AccountCenter.vue`、`StudentProfile.vue`。

- [ ] 先加入失败静态契约：`MainLayout.astro` 的 `@keyframes dustDrift` 只出现一次并保留移动/reduced-motion 媒体查询；导航、分页、时间轴分别包含 44px 触控规则。
- [ ] 运行静态测试确认失败。
- [ ] 删除 `MainLayout.astro` 第一个 `@keyframes dustDrift {` 后误插入的重复 HTML/样式，保留唯一 keyframes、移动环境光媒体查询和 reduced-motion 规则。
- [ ] 移动导航主题/音效/菜单按钮为 44×44px；分页页码、前后按钮和省略位为 44×44px；时间轴筛选按钮 `min-height:44px`，隐藏滚动条但保留横向滚动和边缘提示。
- [ ] 账号输入和主要按钮 `min-height:44px`，移动卡片水平内边距 16px；学生页操作区两列换行，操作项至少 44px 高。
- [ ] 运行 `pnpm --filter site-astro exec vitest run tests/mobile-gyro-static.test.ts tests/responsive-vintage-static.test.ts && pnpm --filter site-astro typecheck`。

## Task 5：主题水波从实际图标中心开始

**Files:** Modify `themeRuntime.ts`、`TopNav.astro`、`motion-theme-static.test.ts`、`motion-theme-flow.spec.ts`。

- [ ] 先在两个主题 SVG 上增加 `data-theme-icon`，并写失败 Playwright 测试：

```ts
test('移动主题水波从可见图标中心开始', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  const toggle = page.locator('[data-theme-toggle]:visible').first()
  const icon = await toggle.locator('[data-theme-icon]').boundingBox()
  await toggle.click()
  const origin = await page.evaluate(() => (window as any).__themeRippleOrigin)
  expect(origin.x).toBeCloseTo(icon!.x + icon!.width / 2, 1)
  expect(origin.y).toBeCloseTo(icon!.y + icon!.height / 2, 1)
})
```

- [ ] 运行 `pnpm --filter site-astro exec playwright test tests/motion-theme-flow.spec.ts --workers=1`，确认新断言失败。
- [ ] 在运行时实现 `getThemeOrigin(button)`：优先测量 `[data-theme-icon]`，找不到时测量按钮；用其中心计算 clip-path 半径；保留 reduced-motion/无 View Transition 立即切换。
- [ ] 更新静态契约并重跑主题 Vitest 与 Playwright 测试。

## Task 6：移动浏览器回归（TDD）

**Files:** Create `packages/site-astro/tests/mobile-gyro-flow.spec.ts`; Modify `public-site-major-redesign-visual.spec.ts`.

- [ ] 先写失败测试覆盖 390×844、430×932：档案墙两列、页面 `scrollWidth <= clientWidth`、HTTP/不支持状态不显示“陀螺仪光影已开启”、触摸 pointermove 后光影可见。
- [ ] 运行 `pnpm --filter site-astro exec playwright test tests/mobile-gyro-flow.spec.ts --workers=1`，记录真实失败信息。
- [ ] 只修改使这些断言通过的 DOM/CSS/状态，不修改数据、路由或认证。
- [ ] 运行 `pnpm --filter site-astro exec playwright test tests/mobile-gyro-flow.spec.ts tests/public-site-major-redesign-visual.spec.ts --workers=1`。

## Task 7：完整验证与交付

**Files:** 仅在门禁发现明确回归时修改对应实现/测试。

- [ ] 运行静态目标集：`pnpm --filter site-astro exec vitest run tests/mobile-gyro-static.test.ts tests/motion-theme-static.test.ts tests/responsive-vintage-static.test.ts tests/public-site-major-redesign-static.test.ts`。
- [ ] 运行类型和目标浏览器集：`pnpm --filter site-astro typecheck && pnpm --filter site-astro exec playwright test tests/mobile-gyro-flow.spec.ts tests/motion-theme-flow.spec.ts tests/public-site-major-redesign-visual.spec.ts --workers=1`。
- [ ] 运行既有站点集：`pnpm --filter site-astro test`。
- [ ] 检查 `git status --short; git diff --stat`，保留现有 `package.json`、`pnpm-lock.yaml`、三个未跟踪脚本和其他用户改动。
- [ ] 运行 `pnpm verify:site`；若外部 API/预览导致失败，记录失败边界，不放宽断言。

## 计划自审

- 已覆盖规格中的 HTTP/权限状态、旋转与光影同步、触摸降级、两列 390/430px、44px 触控区、时间轴滚动、账号页边距、主题图标中心和 reduced-motion。
- 所有行为均先写失败测试再实现；函数名和状态类型在任务间一致。
- 未新增后端、数据库、依赖或未要求的主题方案；MainLayout 清理限定于已确认的错位重复块。
- 计划不存在未解决占位或“类似任务”式省略。
