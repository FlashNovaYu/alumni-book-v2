# 移动端沉浸光影 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 HTTPS 移动端在用户授权后，将设备倾斜转化为全局星空与首页入口的轻量光影牵引。

**Architecture:** 复用 `useMouseTilt.ts` 的唯一方向事件监听器，将平滑后的偏移同步为根元素 CSS 变量。全局布局和首页英雄区仅消费变量；花名录继续消费已有卡片旋转与高光状态。

**Tech Stack:** Astro、Vue 3、TypeScript、CSS 自定义属性、Vitest、Playwright。

---

### Task 1: 写入移动方向背景契约测试

**Files:**
- Modify: `packages/site-astro/tests/mobile-gyro-static.test.ts`

- [ ] **Step 1: 增加断言，要求方向运行时暴露背景偏移变量并要求首页具备授权入口。**

```ts
expect(tilt).toContain("'--ambient-tilt-x'")
expect(hero).toContain('data-home-gyro-toggle')
expect(layout).toContain('var(--ambient-tilt-x, 0px)')
```

- [ ] **Step 2: 运行 `pnpm --filter site-astro exec vitest run tests/mobile-gyro-static.test.ts`，确认新断言在实现前失败。**

### Task 2: 将方向状态同步为全局 CSS 变量

**Files:**
- Modify: `packages/site-astro/src/composables/useMouseTilt.ts`
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`

- [ ] **Step 1: 在动画循环中将限制后的平滑偏移写入根元素变量，并在停止时还原为 `0px`。**

```ts
document.documentElement.style.setProperty('--ambient-tilt-x', `${value}px`)
document.documentElement.style.setProperty('--ambient-tilt-y', `${value}px`)
```

- [ ] **Step 2: 让星空背景伪元素只消费变量并以轻量位移呈现，不改变内容层。**

```css
transform: translate3d(var(--ambient-tilt-x, 0px), var(--ambient-tilt-y, 0px), 0) scale(1.04);
```

### Task 3: 在首页提供显式授权入口与状态

**Files:**
- Modify: `packages/site-astro/src/components/MuseumHero.astro`

- [ ] **Step 1: 增加仅移动端显示的 `data-home-gyro-toggle` 按钮与状态文本。**
- [ ] **Step 2: 按钮点击时调用 `initDeviceOrientation()`，并以已开启、降级或拒绝状态更新标签。**
- [ ] **Step 3: 让两处已有磁性入口仅在移动端叠加不超过 5px 的全局偏移。**

### Task 4: 验证

**Files:**
- Test: `packages/site-astro/tests/mobile-gyro-static.test.ts`
- Test: `packages/site-astro/tests/mobile-gyro-flow.spec.ts`

- [ ] **Step 1: 运行定向 Vitest 测试。**

```powershell
pnpm --filter site-astro exec vitest run tests/mobile-gyro-static.test.ts tests/roster-card-cursor-static.test.ts tests/home-atmosphere-static.test.ts
```

- [ ] **Step 2: 运行站点类型检查。**

```powershell
pnpm --filter site-astro typecheck
```

- [ ] **Step 3: 使用 HTTPS 正式域名的移动视口核对首页入口、状态、无混合内容和无控制台错误。**
