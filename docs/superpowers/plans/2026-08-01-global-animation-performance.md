# 全站动画性能优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 在保留现有功能、主题视觉和页面转场的前提下，减少全站持续动画、指针事件和布局读取造成的主线程与合成层开销。

**Architecture:** 扩展现有 src/utils/motion.ts 提供纯函数动画预算和帧间隔；星空、首页 Hero、卡片倾斜、陀螺仪和自定义光标各自消费该预算并自行管理 RAF 生命周期。所有改动保持在现有 Astro/Vue islands 和 CSS-first 结构内，不新增动画框架或跨页面状态容器。

**Tech Stack:** Astro 7、Vue 3、TypeScript、原生 requestAnimationFrame、IntersectionObserver、ResizeObserver、Canvas 2D、Vitest、Playwright、Chrome DevTools trace。

---

## 执行约束

- 当前工作区已有用户未提交改动，尤其覆盖主题 token、StarfieldCanvas.astro、MuseumHero.astro、AlbumGrid.vue、MessageWall.vue、RosterWall.vue、时间轴、年鉴和相关测试。每次只暂存本任务直接修改的文件，禁止 git reset --hard、git checkout -- 或整仓格式化。
- 已提交设计规格：docs/superpowers/specs/2026-08-01-global-animation-performance-design.md。
- 仓库明令禁止 superpowers 子 Agent/执行技能；由主 Agent 在本会话内联执行，并在每个任务后运行对应检查。
- 代码修改遵循红—绿—实现—回归顺序；静态测试只验证稳定契约，不把具体设备帧时间写成易抖动的硬编码断言。

## 文件地图

| 文件 | 职责 | 本计划变化 |
| --- | --- | --- |
| packages/site-astro/src/utils/motion.ts | 减少动效判断与纯函数 | 增加 MotionBudget、能力判断和帧间隔函数 |
| packages/site-astro/src/components/StarfieldCanvas.astro | 全局 Canvas 星空 | 缓存主题/偏移、预计算颜色、限制刷新频率、清理新监听器 |
| packages/site-astro/src/components/MuseumHero.astro | 首页视差与磁吸 | 初始化解析速度、可见性门控、指针 RAF 合帧 |
| packages/site-astro/src/composables/useMouseTilt.ts | 卡片指针/陀螺仪 | 指针 RAF 合帧、方向稳定阈值与预算、环境事件同步 |
| packages/site-astro/src/components/ArchiveRosterCard.vue | 档案卡交互层 | 移除长期 will-change |
| packages/site-astro/src/layouts/MainLayout.astro | 全局光标生命周期 | 光标位置 RAF 合帧、状态 class 去重、卸载时取消 RAF |
| packages/site-astro/src/styles/custom-cursor.css | 自定义光标合成层 | 将 will-change 限制到 transform/opacity |
| packages/site-astro/src/components/AccountCenter.vue、AlbumGrid.vue、CalendarDatePicker.vue、MessageWall.vue、RankingsPanel.vue、RosterWall.vue、StudentProfile.vue、TopNavSession.vue、packages/site-astro/src/pages/timeline.astro | 交互 CSS | 将 transition: all 收窄到真实变化属性 |
| packages/site-astro/tests/motion-budget.test.ts | 动画预算纯函数测试 | 新增 |
| packages/site-astro/tests/animation-performance-static.test.ts | 运行时/CSS 性能契约 | 新增 |

### Task 1: 锁定动画预算纯函数

**Files:**
- Modify: packages/site-astro/src/utils/motion.ts
- Create: packages/site-astro/tests/motion-budget.test.ts

- [ ] **Step 1: 写失败测试**

~~~ts
import { describe, expect, it } from 'vitest'
import { getMotionBudget, getMotionFrameInterval, type MotionEnvironment } from '../src/utils/motion'

const base: MotionEnvironment = {
  prefersReducedMotion: false,
  coarsePointer: false,
  saveData: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
}

describe('motion budget', () => {
  it('keeps normal fine-pointer devices on full budget', () => {
    expect(getMotionBudget(base)).toBe('full')
    expect(getMotionFrameInterval('full')).toBe(1000 / 30)
  })

  it('uses light budget for coarse, save-data, and low-capability devices', () => {
    expect(getMotionBudget({ ...base, coarsePointer: true })).toBe('light')
    expect(getMotionBudget({ ...base, saveData: true })).toBe('light')
    expect(getMotionBudget({ ...base, deviceMemory: 4 })).toBe('light')
    expect(getMotionBudget({ ...base, hardwareConcurrency: 4 })).toBe('light')
    expect(getMotionFrameInterval('light')).toBe(1000 / 20)
  })

  it('always gives reduced motion priority', () => {
    expect(getMotionBudget({ ...base, prefersReducedMotion: true })).toBe('reduced')
    expect(getMotionFrameInterval('reduced')).toBe(0)
  })
})
~~~

Run: pnpm --filter site-astro exec vitest run tests/motion-budget.test.ts

Expected: FAIL because the three exports do not exist.

- [ ] **Step 2: 实现预算 API**

保留现有 prefersReducedMotion 和 oncePerElement，新增：

~~~ts
export type MotionBudget = 'full' | 'light' | 'reduced'

export interface MotionEnvironment {
  prefersReducedMotion: boolean
  coarsePointer: boolean
  saveData: boolean
  deviceMemory?: number
  hardwareConcurrency?: number
}

export function getMotionBudget(input: MotionEnvironment): MotionBudget {
  if (input.prefersReducedMotion) return 'reduced'
  if (
    input.coarsePointer ||
    input.saveData ||
    (typeof input.deviceMemory === 'number' && input.deviceMemory <= 4) ||
    (typeof input.hardwareConcurrency === 'number' && input.hardwareConcurrency <= 4)
  ) return 'light'
  return 'full'
}

export function getMotionFrameInterval(budget: MotionBudget): number {
  if (budget === 'reduced') return 0
  return budget === 'light' ? 1000 / 20 : 1000 / 30
}

export function getCurrentMotionBudget(): MotionBudget {
  if (typeof window === 'undefined') return 'full'
  const navigatorWithHints = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean }
  }
  return getMotionBudget({
    prefersReducedMotion: prefersReducedMotion(),
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    saveData: navigatorWithHints.connection?.saveData === true,
    deviceMemory: navigatorWithHints.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  })
}
~~~

Run: pnpm --filter site-astro exec vitest run tests/motion-budget.test.ts tests/runtime-performance.spec.ts tests/motion-theme-static.test.ts

Expected: PASS.

- [ ] **Step 3: Commit Task 1 only**

~~~powershell
git add -- packages/site-astro/src/utils/motion.ts packages/site-astro/tests/motion-budget.test.ts
git commit -m "perf(site): add adaptive motion budget"
~~~

### Task 2: 限制全局星空 Canvas 的重复工作

**Files:**
- Modify: packages/site-astro/src/components/StarfieldCanvas.astro
- Modify: packages/site-astro/src/composables/useMouseTilt.ts
- Create: packages/site-astro/tests/animation-performance-static.test.ts

- [ ] **Step 1: 写失败的星空性能契约**

测试至少断言 StarfieldCanvas 包含 getCurrentMotionBudget()、getMotionFrameInterval(、lastDrawAt、MutationObserver 和 alumni:ambient-tilt，并且 cleanup 移除 visibilitychange、astro:before-swap、alumni:ambient-tilt；同时断言 ArchiveRosterCard 不再有 will-change: transform，custom-cursor 使用 will-change: transform, opacity，目标交互文件不再含 transition: all。

Run: pnpm --filter site-astro exec vitest run tests/animation-performance-static.test.ts

Expected: FAIL。

- [ ] **Step 2: 缓存主题和环境偏移**

在 StarfieldCanvas 的 draw 外建立 budget、frameInterval、lastDrawAt、offsetX、offsetY、coreRgb、haloRgb、alphaScale。getComputedStyle(document.documentElement) 只允许在初始化、ResizeObserver 回调和 data-theme MutationObserver 回调中调用；draw 只消费缓存。

用 CustomEvent 传递环境偏移：

~~~ts
document.dispatchEvent(new CustomEvent('alumni:ambient-tilt', {
  detail: { x: ambientX, y: ambientY },
}))
~~~

星空监听该事件直接更新 offsetX/offsetY；不在 draw 中再次读取 CSS 变量。星体初始化/主题刷新时预计算填充色、光晕色和 shadowBlur，减少每颗星每帧的字符串创建。

- [ ] **Step 3: 增加帧预算和完整清理**

tick 使用 timestamp - lastDrawAt >= frameInterval 才执行完整 draw；reduced budget 不启动循环，light budget 使用更低频率。保留现有可见性暂停、ResizeObserver、Astro swap 和 pagehide 行为。cleanup 必须取消 RAF、断开主题/尺寸 Observer，并移除 visibilitychange、astro:before-swap、pagehide、alumni:ambient-tilt 和 matchMedia 监听器。

Run: pnpm --filter site-astro exec vitest run tests/animation-performance-static.test.ts tests/mobile-gyro-static.test.ts tests/home-atmosphere-static.test.ts tests/museum-dual-theme-static.test.ts

Expected: PASS，现有 --star-* 主题变量和纸张/夜读混合模式断言不变。

- [ ] **Step 4: Commit Task 2 only**

~~~powershell
git add -- packages/site-astro/src/components/StarfieldCanvas.astro packages/site-astro/src/composables/useMouseTilt.ts packages/site-astro/tests/animation-performance-static.test.ts
git commit -m "perf(site): budget global starfield rendering"
~~~

### Task 3: 合帧首页视差与磁吸指针

**Files:**
- Modify: packages/site-astro/src/components/MuseumHero.astro
- Modify: packages/site-astro/tests/runtime-performance.spec.ts

- [ ] **Step 1: 写失败契约**

在首页 runtime 测试中断言存在 const parallaxItems =、IntersectionObserver、pointerFrameId、cancelAnimationFrame(pointerFrameId)，并断言不再出现 JSON.parse(element.getAttribute('data-parallax') || '{}').speed。

Run: pnpm --filter site-astro exec vitest run tests/runtime-performance.spec.ts

Expected: FAIL。

- [ ] **Step 2: 初始化解析视差速度并按 Hero 可见性门控**

将 data-parallax 初始化为一次性解析的数组：

~~~ts
const hero = document.querySelector<HTMLElement>('.home-cover')
const parallaxItems = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]')).map(element => {
  let speed = 0
  try { speed = Number(JSON.parse(element.dataset.parallax || '{}').speed) || 0 } catch {}
  return { element, speed }
})
~~~

使用 IntersectionObserver 维护 heroVisible；Hero 离开视窗时取消 pending RAF，返回时允许恢复。updateParallax 只遍历 parallaxItems 的数值，不再解析属性。cleanup 断开 Observer 并取消 RAF。

- [ ] **Step 3: 合并磁吸 pointermove**

每个磁吸元素维护 targetX、targetY、pointerFrameId。pointermove 只读取当前 rect 并记录目标，若没有 pending frame 则 requestAnimationFrame；flushPointer 才写 --hero-magnetic-x 和 --hero-magnetic-y。pointerleave 立即清零并取消 pending frame，cleanup 移除事件和取消 frame。

Run: pnpm --filter site-astro exec vitest run tests/runtime-performance.spec.ts tests/performance-static.test.ts tests/motion-theme-static.test.ts tests/home-atmosphere-static.test.ts

Expected: PASS，首页仍不加载 GSAP/ScrollTrigger。

- [ ] **Step 4: Commit Task 3 only**

~~~powershell
git add -- packages/site-astro/src/components/MuseumHero.astro packages/site-astro/tests/runtime-performance.spec.ts
git commit -m "perf(site): coalesce homepage motion updates"
~~~

### Task 4: 合帧卡片指针并让陀螺仪稳定后停止

**Files:**
- Modify: packages/site-astro/src/composables/useMouseTilt.ts
- Modify: packages/site-astro/src/components/ArchiveRosterCard.vue
- Modify: packages/site-astro/tests/animation-performance-static.test.ts

- [ ] **Step 1: 写失败契约并验证**

断言 useMouseTilt.ts 包含 pendingPointers、pointerFrameId、orientationFrameId、getMotionFrameInterval(、cancelAnimationFrame(pointerFrameId) 和 cancelAnimationFrame(orientationFrameId)。

Run: pnpm --filter site-astro exec vitest run tests/animation-performance-static.test.ts

Expected: FAIL。

- [ ] **Step 2: 用 pending map 合并指针事件**

在 useMouseTilt() 内增加 pendingPointers 和 pointerFrameId。pointermove 只记录 target、clientX、clientY、pointerType，并安排一个 RAF；flushPointers 每个活跃卡片每帧最多调用一次 getBoundingClientRect()，按现有公式更新 rotateX、rotateY、glareX、glareY，然后清空 pendingPointers。触摸 pointerType 仍设置 isHovered，确保原有触摸光影不变。

- [ ] **Step 3: 限制方向传感器循环**

保存 orientationFrameId、lastOrientationFrame 和 motion frame interval。deviceorientation 只更新目标值并安排 RAF；RAF 未达到预算时不写状态，四个当前值与目标值均小于 0.01 时停止下一帧。syncAmbientTilt 只有 CSS 值变化时才写入，并发送 Task 2 的 alumni:ambient-tilt 事件。stopDeviceOrientation 取消两个 frame、移除传感器监听、清空 pending 状态并恢复既有零值。

- [ ] **Step 4: 移除档案卡长期合成层**

在 ArchiveRosterCard.vue 删除 will-change: transform，保留 transform-style: preserve-3d，不添加新的全局 will-change。

Run: pnpm --filter site-astro exec vitest run tests/animation-performance-static.test.ts tests/mobile-gyro-static.test.ts tests/active-card-motion-static.test.ts tests/student-profile-lifecycle.test.ts tests/runtime-performance.spec.ts

Expected: PASS，卡片共享元素转场、触摸结束、方向权限和卸载契约不变。

- [ ] **Step 5: Commit Task 4 only**

~~~powershell
git add -- packages/site-astro/src/composables/useMouseTilt.ts packages/site-astro/src/components/ArchiveRosterCard.vue packages/site-astro/tests/animation-performance-static.test.ts
git commit -m "perf(site): coalesce tilt and gyro updates"
~~~

### Task 5: 合帧自定义光标并收窄 will-change

**Files:**
- Modify: packages/site-astro/src/layouts/MainLayout.astro
- Modify: packages/site-astro/src/styles/custom-cursor.css
- Modify: packages/site-astro/tests/animation-performance-static.test.ts

- [ ] **Step 1: 写失败契约**

断言 MainLayout 包含 cursorFrameId、cancelAnimationFrame(cursorFrameId) 和 cursorMode。

Run: pnpm --filter site-astro exec vitest run tests/animation-performance-static.test.ts

Expected: FAIL。

- [ ] **Step 2: 用单一 RAF 写入光标位置并去重 class**

在 initCustomCursor() 内增加 cursorFrameId、cursorMode、flushCursor、queueCursor 和 setCursorMode。pointermove 只更新坐标和状态，queueCursor 负责安排 RAF，flushCursor 负责写 transform；只有模式变化时切换 is-clickable/is-text class。cleanupCursor 取消 pending RAF 并保留现有 listener 移除和节点删除。

- [ ] **Step 3: 收窄 CSS 合成提示**

将 custom-cursor.css 的 will-change: transform, width, height, opacity 改为 will-change: transform, opacity。保留尺寸、颜色、按压状态和现有过渡时长。

Run: pnpm --filter site-astro exec vitest run tests/animation-performance-static.test.ts tests/roster-card-cursor-static.test.ts tests/navigation.test.ts

Expected: PASS。

- [ ] **Step 4: Commit Task 5 only**

~~~powershell
git add -- packages/site-astro/src/layouts/MainLayout.astro packages/site-astro/src/styles/custom-cursor.css packages/site-astro/tests/animation-performance-static.test.ts
git commit -m "perf(site): schedule custom cursor updates"
~~~

### Task 6: 收窄交互 CSS 的 transition 属性

**Files:**
- Modify: packages/site-astro/src/components/AccountCenter.vue
- Modify: packages/site-astro/src/components/AlbumGrid.vue
- Modify: packages/site-astro/src/components/CalendarDatePicker.vue
- Modify: packages/site-astro/src/components/MessageWall.vue
- Modify: packages/site-astro/src/components/RankingsPanel.vue
- Modify: packages/site-astro/src/components/RosterWall.vue
- Modify: packages/site-astro/src/components/StudentProfile.vue
- Modify: packages/site-astro/src/components/TopNavSession.vue
- Modify: packages/site-astro/src/pages/timeline.astro
- Modify: packages/site-astro/tests/animation-performance-static.test.ts

- [ ] **Step 1: 建立清单并验证当前基线**

Run: rg -n 'transition:\s*all' packages/site-astro/src/components packages/site-astro/src/pages

Expected: 当前命中 13 处；实现后 Task 2 静态测试要求这些文件都不再命中。

- [ ] **Step 2: 按真实变化属性替换，保留时长和 easing**

使用下表逐项替换声明本身：

| 文件/选择器 | 属性 |
| --- | --- |
| AccountCenter.vue .link-item | background-color, color, border-color |
| AccountCenter.vue .btn-primary | background-color, color, box-shadow, transform |
| AlbumGrid.vue .tag-filter-btn | background-color, color, border-color |
| AlbumGrid.vue .photo-list-* | transform, opacity |
| CalendarDatePicker.vue .nav-btn | background-color, color, border-color, box-shadow |
| CalendarDatePicker.vue .day-btn | background-color, color, border-color |
| CalendarDatePicker.vue .grid-item-btn | background-color, color, border-color, transform |
| MessageWall.vue .style-select-btn | background-color, color, border-color, box-shadow |
| RankingsPanel.vue .tab-btn | background-color, color, border-color |
| RosterWall.vue .roster-gyro-btn | background-color, color, border-color, box-shadow |
| StudentProfile.vue button.seal | opacity, transform, color |
| TopNavSession.vue .btn-logout | background-color, color, border-color |
| timeline.astro .tab-btn | background-color, color, border-color, transform |

Vue TransitionGroup 的 .photo-list-move 必须保留 transform；不得改成只过渡颜色。

- [ ] **Step 3: 运行 CSS 和组件回归**

Run: pnpm --filter site-astro exec vitest run tests/animation-performance-static.test.ts tests/public-ui-feedback-static.test.ts tests/museum-yearbook-static.test.ts tests/class-space-navigation-static.test.ts

Expected: PASS，rg 不再输出 transition: all，既有 hover/focus/active 契约不变。

- [ ] **Step 4: Commit Task 6 only**

~~~powershell
git add -- packages/site-astro/src/components/AccountCenter.vue packages/site-astro/src/components/AlbumGrid.vue packages/site-astro/src/components/CalendarDatePicker.vue packages/site-astro/src/components/MessageWall.vue packages/site-astro/src/components/RankingsPanel.vue packages/site-astro/src/components/RosterWall.vue packages/site-astro/src/components/StudentProfile.vue packages/site-astro/src/components/TopNavSession.vue packages/site-astro/src/pages/timeline.astro packages/site-astro/tests/animation-performance-static.test.ts
git commit -m "perf(site): narrow interactive CSS transitions"
~~~

### Task 7: 类型、构建、浏览器性能和交互验收

**Files:**
- No source changes unless a failing verification identifies a regression directly caused by Tasks 1–6.
- Generated test-results and Chrome trace files must not be staged.

- [ ] **Step 1: 运行站点完整静态测试**

Run: pnpm --filter site-astro test

Expected: all site Vitest/static tests PASS。

- [ ] **Step 2: 运行类型检查**

Run: pnpm --filter site-astro typecheck

Expected: Astro check、Vue 类型检查和 functions TypeScript 检查 PASS。

- [ ] **Step 3: 使用显式 SSG API 基址构建**

在本地 API 已准备好时运行：

~~~powershell
$env:VITE_SSG_API_BASE = 'http://127.0.0.1:8787'
pnpm --filter site-astro build
~~~

Expected: dist 重新生成，不发生隐式公网数据源回退；若本地 API 未运行，先启动仓库既有 API 测试实例，不改用隐式地址。

- [ ] **Step 4: 运行性能/网络 Playwright 门禁**

Run: pnpm --filter site-astro test:perf-network

Expected: 首页、时间轴、人物长廊、学生详情页、主题、相册、信箱、聊天和导航 spec PASS；GSAP/ScrollTrigger 和按需 island 契约不回退。

- [ ] **Step 5: 用 Chrome DevTools 采集同口径指标**

对首页、/roster/、/student/template/ 使用与基线相同的本地 preview 和视口，记录 LCP、CLS、ForcedReflow 总耗时、静置 P95 帧间隔、连续滚动 P95 帧间隔、超过 33ms 的帧数和长任务数量。

Expected: 学生页滚动 P95 目标不高于 12ms 且没有超过 33ms 的帧；硬件噪声导致绝对目标不可重复时，至少比基线改善 25%，并同时报告原始值和复测值。

- [ ] **Step 6: 验证减少动效、移动端和生命周期**

验证 reduced motion 下背景/视差/磁吸/倾斜/光标/转场静态可读；light budget 下登录、导航、相册、聊天、表单和触摸反馈仍可用；桌面精细指针下光标、卡片悬停、磁吸和音效入口仍可用；页面离开再返回后不重复注册 RAF、传感器、Observer 或光标节点。

- [ ] **Step 7: 核对提交边界**

Run:

~~~powershell
git status --short
git diff HEAD~6..HEAD --stat
~~~

Expected: 用户现有主题改动、global-theme-palette 计划/规格、.tmp、class-space-fixed.png 和用户新增测试未被暂存或覆盖；交付说明中同时报告性能提交和未处理的用户工作区边界。

## 计划自检

- 规格中的动画预算、星空缓存、首页视差/磁吸、卡片/陀螺仪、自定义光标、CSS transition、低性能降级、生命周期清理和验证要求均有对应任务。
- 计划不包含生产部署、API/数据库修改、内容虚拟化或新动画框架。
- 所有新增符号已在前置任务定义：MotionBudget、MotionEnvironment、getMotionBudget、getMotionFrameInterval、getCurrentMotionBudget、pendingPointers、pointerFrameId、orientationFrameId、cursorFrameId、cursorMode。
- 没有 TBD、TODO、later 或实现占位。
