# Reference Starfield and Archive Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以可降级的分层 Canvas 星空和档案索引卡，复刻参考稿的动态景深与花名录方卡体验。

**Architecture:** 新建只负责装饰性 Canvas 粒子的 Astro 组件；`MainLayout.astro` 只挂载它和 CSS 雾光。组件从根元素读取既有的指针/陀螺仪 CSS 变量，不新增方向监听器。`ArchiveRosterCard.vue` 保持数据、链接、音效和 view transition，只替换为照片主视觉的索引卡构图；`RosterWall.vue` 只调整断点网格。

**Tech Stack:** Astro、Vue 3、TypeScript、Canvas 2D、CSS 自定义属性、Vitest、Playwright。

---

### Task 1: 锁定失败契约

**Files:**
- Create: `packages/site-astro/tests/starfield-canvas-static.test.ts`
- Modify: `packages/site-astro/tests/roster-card-cursor-static.test.ts`

- [ ] **Step 1: 写入星空静态断言。**

```ts
expect(layout).toContain('<StarfieldCanvas />')
expect(layout).not.toContain('class="alumni-dust alumni-dust-1"')
expect(starfield).toContain('data-starfield-canvas')
expect(starfield).toContain('prefers-reduced-motion: reduce')
expect(starfield).toContain("'--ambient-tilt-x'")
```

- [ ] **Step 2: 写入索引卡断言。**

```ts
expect(card).toContain('class="roster-card__punch"')
expect(card).toContain('class="roster-card__media"')
expect(card).toContain('class="roster-card__rule"')
expect(wall).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))')
```

- [ ] **Step 3: 运行并确认失败。**

```powershell
pnpm --filter site-astro exec vitest run tests/starfield-canvas-static.test.ts tests/roster-card-cursor-static.test.ts
```

Expected: FAIL，缺少 Canvas 组件、索引卡标记和四列网格。

### Task 2: 实现分层 Canvas 星空

**Files:**
- Create: `packages/site-astro/src/components/StarfieldCanvas.astro`
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`

- [ ] **Step 1: 创建静态画布与两团 CSS 雾光。**

```astro
<div class="starfield" aria-hidden="true" data-starfield-root>
  <canvas data-starfield-canvas></canvas>
  <span class="starfield__mist starfield__mist--gold"></span>
  <span class="starfield__mist starfield__mist--stamp"></span>
</div>
```

- [ ] **Step 2: 定义确定性三层粒子，不使用 `Math.random()`。**

```ts
type Star = { x: number; y: number; radius: number; alpha: number; drift: number; depth: number }
const seed = (index: number) => ((Math.sin(index * 12.9898) * 43758.5453) % 1 + 1) % 1
const stars = Array.from({ length: mobile ? 38 : 72 }, (_, index): Star => ({
  x: seed(index + 1), y: seed(index + 101), radius: 0.45 + seed(index + 201) * 1.55,
  alpha: 0.16 + seed(index + 301) * 0.62, drift: 0.16 + seed(index + 401) * 0.52,
  depth: 0.24 + seed(index + 501) * 0.76,
}))
```

- [ ] **Step 3: 每帧只绘制画布并消费根变量；不可见或减少动态效果时停止循环。**

```ts
const offsetX = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ambient-tilt-x')) || 0
const offsetY = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ambient-tilt-y')) || 0
ctx.arc((star.x * width + offsetX * star.depth + time * star.drift) % width, star.y * height + offsetY * star.depth, star.radius, 0, Math.PI * 2)
```

- [ ] **Step 4: 在布局中替换旧 `alumni-ambient-bg` 元素及重复固定星点 CSS，内容层继续为 `z-index: 1`。**

- [ ] **Step 5: 重跑 Task 1 测试。**

```powershell
pnpm --filter site-astro exec vitest run tests/starfield-canvas-static.test.ts tests/home-atmosphere-static.test.ts tests/mobile-gyro-static.test.ts
```

Expected: PASS。

### Task 3: 实现档案索引卡和响应式网格

**Files:**
- Modify: `packages/site-astro/src/components/ArchiveRosterCard.vue`
- Modify: `packages/site-astro/src/components/RosterWall.vue`

- [ ] **Step 1: 将模板改为装订孔、右上编号、矩形主视觉、分隔线和文字档案区。**

```vue
<span class="roster-card__punch" aria-hidden="true" />
<span class="roster-card__archive-id">{{ archiveId }}</span>
<div class="roster-card__media">...</div>
<span class="roster-card__rule" aria-hidden="true" />
<div class="roster-card__body">...</div>
```

- [ ] **Step 2: 用以下比例保留现有图片 `srcset`、无图回退和 view-transition style。**

```css
.roster-card__inner { grid-template-rows: minmax(0, 1.15fr) 1px minmax(0, 0.85fr); }
.roster-card__media { min-height: 0; overflow: hidden; border-radius: calc(var(--radius-md) - 2px); }
.roster-card__media img { width: 100%; height: 100%; object-fit: cover; }
.roster-card__punch { position: absolute; inset: 14px auto auto 14px; width: 8px; aspect-ratio: 1; border-radius: 50%; }
```

- [ ] **Step 3: 修改网格断点。**

```css
.roster-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 900px) { .roster-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .roster-grid { grid-template-columns: minmax(0, 1fr); } }
```

- [ ] **Step 4: 重跑卡片测试。**

```powershell
pnpm --filter site-astro exec vitest run tests/roster-card-cursor-static.test.ts tests/mobile-gyro-static.test.ts
```

Expected: PASS。

### Task 4: 浏览器与发布验证

**Files:**
- Create: `packages/site-astro/tests/starfield-roster-flow.spec.ts`
- Modify: `packages/site-astro/tests/home-atmosphere-static.test.ts`

- [ ] **Step 1: 写入失败的浏览器断言，检查 Canvas 可见、宽屏四列和减少动态效果静态终态。**

```ts
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto('./roster/', { waitUntil: 'networkidle' })
await expect(page.locator('[data-starfield-canvas]')).toBeVisible()
await expect(page.locator('.roster-grid')).toHaveCSS('grid-template-columns', /repeat\(4/)
```

- [ ] **Step 2: 确认新浏览器断言先失败，再完成最少实现使其通过。**

```powershell
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/starfield-roster-flow.spec.ts --workers=1
```

- [ ] **Step 3: 运行定向静态测试、类型检查和自托管构建。**

```powershell
pnpm --filter site-astro exec vitest run tests/starfield-canvas-static.test.ts tests/home-atmosphere-static.test.ts tests/roster-card-cursor-static.test.ts tests/mobile-gyro-static.test.ts
pnpm --filter site-astro typecheck
$env:RELEASE_SHA = (git rev-parse HEAD).Trim(); pnpm build:selfhosted -- --api-base https://aluminbook.icu; Remove-Item Env:RELEASE_SHA
```

- [ ] **Step 4: 只提交星空、卡片、测试、规格和本计划，推送后用既有不可变目录流程发布 ECS。**

```powershell
git commit -m "feat(site): refine starfield and archive roster cards"
git push origin HEAD:main
node scripts/smoke-selfhosted.mjs --base-url https://aluminbook.icu --expected-sha (git rev-parse HEAD).Trim()
```

Expected: `/release.json.source` 与 `/api/health.data.releaseSha` 等于本次完整提交 SHA。
