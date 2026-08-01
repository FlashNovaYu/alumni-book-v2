# 全局 UI/UX 配色统一与舒适度优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变功能、路由、认证、数据和交互契约的前提下，将纸张日间与深绿夜读主题统一到参考稿级档案馆暖金配色，并让背景、导航、卡片、表单和状态组件共享同一套语义 token。

**Architecture:** 以 `packages/shared/src/tokens.css` 作为唯一主题源，补齐表面、文字、强调、状态、星空和首页封面 token；站点 CSS 与 Vue/Astro 组件只引用语义 token。Canvas 星空每帧读取当前 CSS token，页面壳保留纹理但移除重复固定星点；组件专属材质保留为局部 token，并在两套主题中映射。

**Tech Stack:** Astro 7、Vue 3、TypeScript、CSS Custom Properties、Canvas 2D、Vitest、Playwright。

---

## 文件边界

### 主题基础与背景

- Modify: `packages/shared/src/tokens.css`
- Modify: `packages/site-astro/src/styles/layout.css`
- Modify: `packages/site-astro/src/styles/components.css`
- Modify: `packages/site-astro/src/components/StarfieldCanvas.astro`
- Modify: `packages/site-astro/src/components/MuseumHero.astro`
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
- Modify: `packages/site-astro/src/scripts/themeRuntime.ts`

### 站点组件迁移

- Modify: `packages/site-astro/src/components/TopNav.astro`
- Modify: `packages/site-astro/src/components/ArchiveRosterCard.vue`
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Modify: `packages/site-astro/src/components/ui/UiEmptyState.vue`
- Modify: `packages/site-astro/src/components/AccountCenter.vue`
- Modify: `packages/site-astro/src/components/CalendarDatePicker.vue`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/components/PhotoWall.vue`
- Modify: `packages/site-astro/src/components/MessageWall.vue`
- Modify: `packages/site-astro/src/components/DirectConversationList.vue`
- Modify: `packages/site-astro/src/components/DirectConversationView.vue`
- Modify: `packages/site-astro/src/components/GroupChatComposer.vue`
- Modify: `packages/site-astro/src/components/GroupChatStage.vue`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/site-astro/src/styles/custom-cursor.css`

### 测试

- Create: `packages/site-astro/tests/global-theme-palette-static.test.ts`
- Create: `packages/site-astro/tests/global-theme-palette-flow.spec.ts`
- Modify: `packages/site-astro/tests/museum-dual-theme-static.test.ts`
- Modify: `packages/site-astro/tests/home-atmosphere-static.test.ts`
- Modify: `packages/site-astro/tests/motion-theme-static.test.ts`

---

### Task 1: 建立失败的全局配色契约测试

**Files:**
- Create: `packages/site-astro/tests/global-theme-palette-static.test.ts`
- Modify: `packages/site-astro/tests/museum-dual-theme-static.test.ts`
- Modify: `packages/site-astro/tests/home-atmosphere-static.test.ts`

- [ ] **Step 1: 写入 token 和旧值的失败断言。**

新测试读取共享 token、站点背景、星空、AccountCenter、CalendarDatePicker、MessageWall、MuseumHero 和 `RosterWall.vue`，加入：

```ts
for (const name of [
  '--surface-overlay', '--on-accent', '--stamp-soft', '--border-glass',
  '--star-core-rgb', '--star-halo-rgb', '--star-mix-mode',
  '--hero-ink', '--hero-ink-soft', '--hero-scrim', '--text-tertiary',
]) {
  expect(shared).toContain(name)
}

expect(starfield).toContain("getPropertyValue('--star-core-rgb')")
expect(starfield).toContain("getPropertyValue('--star-halo-rgb')")
expect(layout).not.toContain('--page-shell-star-core: rgba(')
expect(account).not.toContain('#cc785c')
expect(calendar).not.toContain('#cc785c')
expect(hero).not.toContain('#fffaf2')
expect(rosterWall).not.toContain('color: var(--text-dim)')
```

- [ ] **Step 2: 运行测试确认它们因缺少新契约而失败。**

```powershell
pnpm --filter site-astro exec vitest run tests/global-theme-palette-static.test.ts tests/museum-dual-theme-static.test.ts tests/home-atmosphere-static.test.ts
```

预期：FAIL，报告缺少新 token，并发现旧固定色值。

- [ ] **Step 3: 确认失败范围。**

失败输出只能涉及主题 token、旧硬编码色值和背景契约，不应包含业务逻辑、路由或数据测试失败。

---

### Task 2: 收敛共享主题 token 和首帧主题色

**Files:**
- Modify: `packages/shared/src/tokens.css`
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
- Modify: `packages/site-astro/src/scripts/themeRuntime.ts`

- [ ] **Step 1: 在日间 `:root` 增加角色 token。**

```css
--surface-overlay: color-mix(in srgb, var(--surface-raised) 88%, transparent);
--text-tertiary: #7C6C49;
--on-accent: #FBF6E9;
--stamp-soft: rgba(162, 59, 42, 0.12);
--border-glass: rgba(110, 83, 34, 0.15);
--shadow-rgb: 38, 28, 10;
--star-core-rgb: 113 86 47;
--star-halo-rgb: 162 59 42;
--star-mix-mode: multiply;
--hero-ink: #FBF6E9;
--hero-ink-soft: rgba(251, 246, 233, 0.78);
--hero-scrim: rgba(17, 16, 14, 0.76);
```

兼容别名 `--gold`、`--color-on-primary`、`--color-muted-soft` 必须指向语义 token，不得继续定义独立品牌色。

- [ ] **Step 2: 在夜间主题增加成对 token。**

```css
--surface-overlay: color-mix(in srgb, var(--surface-raised) 82%, transparent);
--text-tertiary: #93A092;
--on-accent: #1B1508;
--stamp-soft: rgba(178, 70, 48, 0.16);
--border-glass: rgba(231, 206, 140, 0.14);
--shadow-rgb: 0, 0, 0;
--star-core-rgb: 242 231 201;
--star-halo-rgb: 201 162 75;
--star-mix-mode: screen;
--hero-ink: #EDE6D2;
--hero-ink-soft: rgba(237, 230, 210, 0.78);
--hero-scrim: rgba(11, 18, 14, 0.82);
```

夜间 `--accent` 使用常态暖金，`--accent-strong` 保留亮金；状态色只映射到状态 token。

- [ ] **Step 3: 修正首帧和运行时浏览器主题色。**

`MainLayout.astro` 的 meta 初始值改为 `#F1E7CE`；内联脚本和 `themeRuntime.ts` 保持同一逻辑：

```ts
const themeColor = theme === 'night' ? '#0B120E' : '#F1E7CE'
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor)
```

不修改主题存储键、系统偏好、视图转场或按钮事件。

- [ ] **Step 4: 运行主题静态测试。**

```powershell
pnpm --filter site-astro exec vitest run tests/global-theme-palette-static.test.ts tests/museum-dual-theme-static.test.ts tests/motion-theme-static.test.ts
```

预期：新 token 断言通过；旧测试若只断言具体颜色字符串，则同步更新为新的语义契约。

---

### Task 3: 统一页面壳、导航和首页封面

**Files:**
- Modify: `packages/site-astro/src/styles/layout.css`
- Modify: `packages/site-astro/src/styles/components.css`
- Modify: `packages/site-astro/src/components/TopNav.astro`
- Modify: `packages/site-astro/src/components/MuseumHero.astro`
- Modify: `packages/site-astro/src/styles/custom-cursor.css`

- [ ] **Step 1: 移除页面壳重复星点。**

保留 `.page-shell` 的层级、纹理、背景尺寸和内容 z-index；删除使用 `--page-shell-star-core`/`--page-shell-star-halo` 的固定 radial-gradient 星点，只保留纹理和主题洗色，不删除噪点层或改变页面高度。

- [ ] **Step 2: 统一导航材质。**

`TopNav.astro` 的导航壳、滚动态、活动纸张、移动抽屉和账户块使用 `--surface-overlay`、`--surface-paper`、`--border-glass`、`--border-subtle`。保留 backdrop-filter、active ink、导航方向和抽屉行为。

- [ ] **Step 3: 统一按钮、输入框和光标强调文字。**

在 `components.css` 中把 `.btn-primary`、`.btn-danger` 的前景改为 `var(--on-accent)`；危险按钮 hover 使用 `color-mix(in srgb, var(--error) 86%, var(--text-primary))`。光标使用 `--accent-strong`/`--accent-soft`，保留隐藏系统光标和全部状态类。

- [ ] **Step 4: 统一首页封面 token。**

把 `MuseumHero.astro` 中 `#fffaf2`、白色 rgba、`#11100e`、`#211d17` 替换为 `--hero-ink`、`--hero-ink-soft`、`--hero-scrim` 和 `color-mix(in srgb, var(--bg) ...)`；保留噪点、暗角、磁性按钮和陀螺仪控制。

- [ ] **Step 5: 运行导航、背景和主题静态测试。**

```powershell
pnpm --filter site-astro exec vitest run tests/home-atmosphere-static.test.ts tests/navigation.test.ts tests/motion-theme-static.test.ts tests/roster-card-cursor-static.test.ts
```

预期：导航结构、单一星空引擎、光标和主题转场测试通过。

---

### Task 4: 迁移表单、账号、日历、相册和聊天组件

**Files:**
- Modify: `packages/site-astro/src/components/AccountCenter.vue`
- Modify: `packages/site-astro/src/components/CalendarDatePicker.vue`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/components/PhotoWall.vue`
- Modify: `packages/site-astro/src/components/DirectConversationList.vue`
- Modify: `packages/site-astro/src/components/DirectConversationView.vue`
- Modify: `packages/site-astro/src/components/GroupChatComposer.vue`
- Modify: `packages/site-astro/src/components/GroupChatStage.vue`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`

- [ ] **Step 1: 移除账号中心和日历旧 fallback。**

将 `#cc785c`、`#ffdcd2`、`#141413`、`#ffffff`、`#eee` 分别替换为 `var(--accent)`、`var(--accent-soft)`、`var(--text-primary)`、`var(--on-accent)`、`var(--border-subtle)`；保留 AccountCenter 内部别名，但全部指向共享 token。

- [ ] **Step 2: 统一相册和灯箱控制色。**

关闭按钮、左右导航、计数、空状态和错误提示改为 `--hero-ink-soft`、`--hero-ink`、`--surface-overlay`、`--error` 与 `--on-accent`；照片、比例、懒加载和灯箱键盘行为不变。

- [ ] **Step 3: 统一聊天发送按钮和未读标记。**

发送、跳转和新消息按钮前景使用 `var(--on-accent)`，背景使用 `var(--accent)` 或 `var(--stamp)`；固定阴影改用既有主题阴影 token。

- [ ] **Step 4: 统一编辑面板状态提示。**

主按钮、错误文字、提醒文字、空头像/背景占位和遮罩改为共享 surface、accent、error、warning token；不改变表单校验、上传、保存、退出或关闭逻辑。

- [ ] **Step 5: 运行组件静态测试和色值扫描。**

```powershell
pnpm --filter site-astro exec vitest run tests/global-theme-palette-static.test.ts tests/public-ui-feedback-static.test.ts tests/ui-reliability-static.test.ts tests/museum-dual-theme-static.test.ts
rg -n --glob '!node_modules/**' --glob '!dist/**' '#cc785c|#ffdcd2|#fffaf2|#ffffff|#fff\\b|#11100e|#211d17' packages/site-astro/src
```

预期：测试通过，组件样式不再出现旧主题值。

---

### Task 5: 迁移档案卡、留言墙和可读性 token

**Files:**
- Modify: `packages/site-astro/src/components/ArchiveRosterCard.vue`
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Modify: `packages/site-astro/src/components/ui/UiEmptyState.vue`
- Modify: `packages/site-astro/src/components/MessageWall.vue`

- [ ] **Step 1: 将档案卡表面与高光接入主题角色。**

保留方形比例、照片、装订孔、编号、分隔线、倾斜和点击链路；卡片背景、边框、编号和 glare layer 使用 `--surface-raised`、`--border-glass`、`--text-muted`、`--accent-soft`。不引入新的布局或方向监听器。

- [ ] **Step 2: 修复 `text-dim` 的正文使用。**

把 `RosterWall.vue` 的人数/分页辅助文本和 `UiEmptyState.vue` 的标题/说明从 `var(--text-dim)` 改为 `var(--text-muted)`；装饰性编号、发丝线仍可使用 `--text-dim`。

- [ ] **Step 3: 把留言墙四种材质变为局部主题 token。**

在 `MessageWall.vue` 根样式中定义 `--msg-paper-*`、`--msg-photo-*`、`--msg-letter-*`、`--msg-chalk-*`；日间映射到米纸/暖灰/信纸线，夜间映射到深绿黑/柔和骨白。style class、选择状态、反应按钮、内容编辑和夜间覆盖规则保持不变。

- [ ] **Step 4: 运行档案卡、移动光影和消息测试。**

```powershell
pnpm --filter site-astro exec vitest run tests/roster-card-cursor-static.test.ts tests/mobile-gyro-static.test.ts tests/museum-dual-theme-static.test.ts tests/public-site-major-redesign-static.test.ts
```

预期：方形档案卡、移动陀螺仪、主题别名和页面结构测试通过。

---

### Task 6: 让星空 Canvas 读取主题 token

**Files:**
- Modify: `packages/site-astro/src/components/StarfieldCanvas.astro`
- Modify: `packages/site-astro/tests/home-atmosphere-static.test.ts`
- Modify: `packages/site-astro/tests/global-theme-palette-static.test.ts`

- [ ] **Step 1: 添加 RGB token 解析函数。**

在脚本中加入：

```ts
const readRgb = (styles: CSSStyleDeclaration, name: string, fallback: string) => {
  const value = styles.getPropertyValue(name).trim()
  return value || fallback
}
```

- [ ] **Step 2: 在每帧绘制时读取当前主题颜色。**

在 `draw()` 中读取 `--star-core-rgb`、`--star-halo-rgb` 和 `--star-mix-mode`，并使用：

```ts
const coreRgb = readRgb(styles, '--star-core-rgb', '242 231 201')
const haloRgb = readRgb(styles, '--star-halo-rgb', '201 162 75')
context.fillStyle = `rgb(${coreRgb} / ${star.alpha})`
```

Canvas 的混合模式由 CSS 的 `var(--star-mix-mode)` 控制；主题切换无需新增事件监听器，因为每帧都会读取当前根样式。

- [ ] **Step 3: 保持性能和降级契约。**

继续使用确定性种子、DPR 上限、可见性暂停、减少动态效果静态首帧和已有陀螺仪变量；不得增加新的 deviceorientation 监听器、随机布局或高密度粒子。

- [ ] **Step 4: 运行星空和移动背景测试。**

```powershell
pnpm --filter site-astro exec vitest run tests/home-atmosphere-static.test.ts tests/mobile-gyro-static.test.ts tests/global-theme-palette-static.test.ts
```

预期：Canvas token、背景层级、减少动态效果和移动变量消费全部通过。

---

### Task 7: 增加浏览器主题回归并完成类型检查

**Files:**
- Create: `packages/site-astro/tests/global-theme-palette-flow.spec.ts`

- [ ] **Step 1: 写入桌面双主题验收。**

测试使用现有 Playwright preview runner，检查纸张与夜读模式的计算样式、主题按钮状态、星空 Canvas、导航和档案卡：

```ts
test('paper and night themes keep the same semantic hierarchy', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./roster/', { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.setItem('alumni_theme', 'paper'))
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper')
  await expect(page.locator('[data-starfield-canvas]')).toBeVisible()
  const paperBg = await page.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor)

  await page.locator('[data-theme-toggle]:visible').first().click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  const nightBg = await page.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor)
  expect(nightBg).not.toBe(paperBg)
  await expect(page.locator('.archive-card, .roster-card').first()).toBeVisible()
})
```

- [ ] **Step 2: 写入移动宽度和减少动态效果验收。**

在 375px 宽度检查无横向滚动、导航按钮保持可见、主题切换不改变路由；使用 `page.emulateMedia({ reducedMotion: 'reduce' })` 后确认 Canvas 和卡片仍有静态可读终态。

- [ ] **Step 3: 运行浏览器回归。**

```powershell
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/global-theme-palette-flow.spec.ts tests/motion-theme-flow.spec.ts tests/public-site-major-redesign-visual.spec.ts --workers=1
```

预期：主题切换、移动宽度、星空可见性和页面结构断言通过；不得有断言失败或控制台错误。

- [ ] **Step 4: 运行站点类型检查。**

```powershell
pnpm --filter site-astro typecheck
```

预期：`astro check` 和 `tsc --noEmit` 均为 0 errors。

---

### Task 8: 构建验收并保留发布边界

**Files:**
- No new production files; only build output is generated and not committed.

- [ ] **Step 1: 执行显式 API 基址的自托管构建。**

```powershell
$env:RELEASE_SHA = (git rev-parse HEAD).Trim()
pnpm build:selfhosted -- --api-base https://aluminbook.icu
Remove-Item Env:RELEASE_SHA
```

预期：构建成功，`release.json` 目标仍为 `aliyun-selfhosted`；不修改 API、数据库或上传数据。

- [ ] **Step 2: 检查工作区边界。**

运行 `git status --short`，确认 `.tmp/` 和 `packages/site-astro/class-space-fixed.png` 等用户未跟踪文件仍保留，构建产物未被误加入版本控制。

- [ ] **Step 3: 汇总实现结果，不执行生产部署。**

本计划只完成全局主题视觉优化和验证；不执行 ECS 发布、Cloudflare 发布、数据库迁移或上传数据操作。后续若用户明确要求上线，再按部署 runbook 以准确 release SHA 单独发布并验证。

---

## 计划自审

- 规格覆盖：token 角色与两套色板由 Task 2 覆盖；页面壳/导航/封面由 Task 3 覆盖；表单、相册、聊天由 Task 4 覆盖；档案卡、留言墙与 `text-dim` 由 Task 5 覆盖；Canvas 同步由 Task 6 覆盖；无障碍与移动验收由 Task 7 覆盖；构建和未跟踪文件保护由 Task 8 覆盖。
- 占位符检查：计划不含 TODO、TBD 或待定步骤；每个实现步骤给出目标文件、具体 token、选择器或命令。
- 类型一致性：所有任务使用同一组 `--surface-overlay`、`--on-accent`、`--star-core-rgb`、`--star-halo-rgb`、`--hero-*` token；Canvas 解析函数名固定为 `readRgb`。
- 范围检查：没有引入新业务功能、第三种主题、新动效引擎或数据层改动；组件迁移按共享 token、背景、表单、内容材质和浏览器验证分组。
