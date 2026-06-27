# Phase 9: 性能验收闭环与体验深度优化计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task. This phase must preserve existing behavior while closing the remaining animation and loading-performance gaps found during Phase 8 verification.

**Goal:** 在 Phase 8 已完成基础优化的基础上，彻底收口动画跳变、重复加载、全站 GSAP/ScrollTrigger 误加载、性能测试漏检和真实加载速度慢的问题，并进一步提升公开站与后台的稳定体验。

**Architecture:** 不重写当前 Astro 5 SSG + Vue 3 islands + Cloudflare Worker 架构。Phase 9 的核心策略是“按页面按需加载、单一动画 Owner、真实网络验收、数据链路闭环、可持续性能预算”。所有改动必须小步提交、可独立验证。

**Tech Stack:** Astro 5 + Vue 3 + Vite + TypeScript + GSAP 按需加载 + Cloudflare Worker/Hono + D1/R2 + Vitest + optional Playwright/Lighthouse

---

## 1. Phase 8 核验结论

Phase 8 已经完成了一批有效优化：

- 移除了 Google Fonts 外链，降低远程字体阻塞。
- 首页 Hero 动画从 JS/GSAP 改为 CSS-first。
- `RosterWall`、`PrefaceWall`、`AlbumGrid`、`StudentProfile` 等组件开始使用 idle SWR。
- `StudentProfile` 已拆出部分异步组件。
- `RankingsPanel` 已从 `client:load` 调整为 `client:visible`。
- `pnpm verify:all` 与 `node scripts/perf-budget.mjs` 已通过。

但核验发现仍有结构性问题没有完全收口：

| 编号 | 问题 | 证据 | 影响 | 优先级 |
|---|---|---|---|---|
| P9-01 | 全站仍会加载 GSAP + ScrollTrigger | `MainLayout.astro` 全站动态 import `animations.ts`，而 `animations.ts` 顶层静态 import `gsap` 和 `gsap/ScrollTrigger` | 首页、时光轴等非动画库页面仍可能下载约 45KB gzip 动画依赖，拖慢首屏 | P0 |
| P9-02 | 性能测试漏检动态 import 依赖链 | `performance-static.test.ts` 只检查 HTML 中是否直接出现 `ScrollTrigger` 文件名 | 测试通过但真实构建依然预加载 ScrollTrigger | P0 |
| P9-03 | 动画控制权仍有重叠 | `.fade-in` CSS 动画、`.js .student-body .fade-in` 隐藏规则、组件级 GSAP 同时存在 | 慢网或主线程阻塞时可能出现隐藏等待、闪烁、重复入场 | P0 |
| P9-04 | 性能预算估算仍不够贴近真实页面 | `perf-budget.mjs` 按 chunk 名估算，但没有验证浏览器实际请求 | 无法可靠证明“首页不加载 GSAP”或“时间轴不加载 ScrollTrigger” | P1 |
| P9-05 | 真实网络与低端设备体验缺少验收 | 当前主要是静态测试和构建预算 | 用户遇到的“加载慢、卡顿”可能只在真实网络/移动端暴露 | P1 |
| P9-06 | 文档还停留在优化前/审计态 | `docs/performance-baseline.md`、`docs/animation-audit.md` 主要记录初始状态 | 后续执行者容易误判哪些已修、哪些未修 | P2 |

---

## 2. 阶段目标与验收标准

| 目标 | 验收标准 |
|---|---|
| 首页不加载 GSAP/ScrollTrigger | 打开 `/` 时浏览器 network 中无 `index.*gsap*`、无 `ScrollTrigger.*.js`，入口 chunk dependency map 也不包含它们 |
| 静态页面不加载滚动动画库 | `/timeline`、`/yearbook`、纯内容页不加载 ScrollTrigger |
| 复杂动画只在需要的页面按需加载 | 学生详情页、照片墙等确实需要滚动或视差动画的组件才动态加载 GSAP/ScrollTrigger |
| 动画 Owner 唯一 | 同一元素不能同时被 CSS `.fade-in` 和 GSAP ScrollTrigger 控制 |
| 慢网不闪不白 | JS 动画库没下载完时，内容仍可见或有稳定占位，不出现长期隐藏 |
| 测试能守住真实依赖链 | 静态测试能解析入口 chunk 的 dependency map，Playwright 可选测试能断言真实请求 |
| 性能预算可解释 | 预算脚本按页面入口归因，不只按文件名粗略加总 |
| 文档同步 | 性能基线和动画审计文档更新为“优化后状态 + 剩余风险” |

---

## 3. 文件影响范围

核心修改文件：

- Modify: `packages/site-astro/src/layouts/MainLayout.astro` - 移除全站无条件动画入口。
- Modify: `packages/site-astro/src/scripts/animations.ts` - 改为无顶层 GSAP 依赖，按需动态导入，或拆分为页面级模块。
- Modify: `packages/site-astro/src/utils/motion.ts` - 扩展动画 Owner、可见性降级和一次性执行工具。
- Modify: `packages/site-astro/src/styles/global.css` - 收敛 `.fade-in` 与 JS 隐藏规则。
- Modify: `packages/site-astro/src/components/RosterWall.vue` - 同学卡片动画从全局隐藏依赖中解耦。
- Modify: `packages/site-astro/src/components/StudentProfile.vue` - 学生页动画按需加载和 fallback 可见性保护。
- Modify: `packages/site-astro/src/components/PhotoWall.vue` - 只在进入视口/需要时加载 ScrollTrigger。
- Modify: `packages/site-astro/src/components/MessageWall.vue` - 避免非关键留言动画抢占首屏。
- Modify: `packages/site-astro/src/pages/timeline.astro` - 保持 CSS-first，不被全局动画入口污染。
- Modify: `packages/site-astro/tests/performance-static.test.ts` - 增加入口 chunk 依赖链检测。
- Modify: `scripts/perf-budget.mjs` - 从“资源总量”升级到“页面实际入口预算”。
- Create: `packages/site-astro/tests/performance-network.spec.ts` - 可选 Playwright 网络冒烟测试。
- Modify: `docs/performance-baseline.md` - 更新优化后性能基线。
- Modify: `docs/animation-audit.md` - 更新动画 Owner 矩阵。

可选新增文件：

- Create: `packages/site-astro/src/scripts/globalReveal.ts` - 只处理无需 GSAP 的全局 CSS reveal。
- Create: `packages/site-astro/src/scripts/scrollRevealGsap.ts` - 只在明确页面/组件中按需加载。
- Create: `docs/phase-9-acceptance-report.md` - 阶段完成后的验收报告。

---

## 4. P0：彻底移除全站 GSAP/ScrollTrigger 误加载

### Task 1: 让 MainLayout 不再全站加载动画库

**Problem:** 当前 `MainLayout.astro` 每个页面都会执行：

```astro
<script>
  import('../scripts/animations').then(m => m.initAnimations())
</script>
```

而 `animations.ts` 顶层导入：

```ts
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
```

这会让全站入口 chunk 带上 GSAP 与 ScrollTrigger 依赖。

**Files:**

- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
- Modify: `packages/site-astro/src/scripts/animations.ts`
- Create: `packages/site-astro/src/scripts/globalReveal.ts`

- [ ] Step 1: 在 `globalReveal.ts` 中实现无 GSAP 的轻量 reveal。

```ts
import { prefersReducedMotion } from '../utils/motion'

let initialized = false

export function initGlobalReveal() {
  if (initialized) return
  initialized = true

  const revealEls = Array.from(document.querySelectorAll<HTMLElement>('[data-motion="global-reveal"]'))
  if (!revealEls.length) return

  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => {
      el.dataset.motionState = 'done'
      el.style.opacity = '1'
      el.style.visibility = 'visible'
      el.style.transform = 'none'
    })
    return
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      const el = entry.target as HTMLElement
      el.dataset.motionState = 'done'
      el.classList.add('motion-visible')
      observer.unobserve(el)
    })
  }, { rootMargin: '0px 0px -10% 0px' })

  revealEls.forEach((el) => observer.observe(el))
}
```

- [ ] Step 2: 将 `MainLayout.astro` 的全站脚本改为导入 `globalReveal`，不导入 GSAP 版本。

```astro
<script>
  import('../scripts/globalReveal').then(m => m.initGlobalReveal())
</script>
```

- [ ] Step 3: `animations.ts` 改名或保留为组件专用模块，但不得被 `MainLayout` 直接引用。
- [ ] Step 4: 运行构建。

```bash
pnpm --filter site-astro build
```

- [ ] Step 5: 检查构建产物中 `MainLayout...js` 不再包含 `ScrollTrigger` 与 GSAP core chunk。

```bash
Get-Content packages/site-astro/dist/assets/MainLayout*.js
```

**Acceptance Criteria:**

- `MainLayout` 入口 chunk dependency map 不包含 `ScrollTrigger.*.js`。
- 首页 HTML 仍能正常渲染与入场。
- 首页 network 不下载 GSAP 与 ScrollTrigger。

---

### Task 2: 将 GSAP/ScrollTrigger 变成组件级按需能力

**Files:**

- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Modify: `packages/site-astro/src/components/PhotoWall.vue`
- Modify: `packages/site-astro/src/components/MessageWall.vue`

- [ ] Step 1: 保留复杂页面中的动态导入，但只在确实需要时执行。

推荐模式：

```ts
async function loadGsapWithScrollTrigger() {
  const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
  ])
  gsap.registerPlugin(ScrollTrigger)
  return { gsap, ScrollTrigger }
}
```

- [ ] Step 2: `RosterWall` 的普通卡片入场优先改 CSS，不使用 ScrollTrigger。
- [ ] Step 3: `StudentProfile` 的背景视差和信息区滚动动画保留 GSAP，但必须在组件挂载后按需加载。
- [ ] Step 4: `PhotoWall` 只在照片墙进入视口后加载动画库，或者直接改 CSS stagger。
- [ ] Step 5: `MessageWall` 留言入场默认 CSS transition，提交/刷新不触发整组 GSAP 重播。

**Acceptance Criteria:**

- `rg "import gsap from 'gsap'|import \\{ ScrollTrigger \\}" packages/site-astro/src` 不应在全局入口文件中命中。
- 只有组件内部动态 import `gsap` 或 `gsap/ScrollTrigger`。
- 不访问学生页/照片墙时，不下载 ScrollTrigger。

---

## 5. P0：收敛动画 Owner，解决隐藏等待与重复入场

### Task 3: 重定义 `.fade-in` 的职责

**Problem:** 当前 `.fade-in` 既有 CSS 动画，又被 `.js .student-body .fade-in` 隐藏，还可能被组件级 GSAP 接管。选择器语义不清会导致慢网下内容先隐藏，等待 JS 或 GSAP 后才出现。

**Files:**

- Modify: `packages/site-astro/src/styles/global.css`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/pages/index.astro`
- Modify: `packages/site-astro/src/pages/roster.astro`
- Modify: `packages/site-astro/src/pages/album.astro`
- Modify: `packages/site-astro/src/pages/timeline.astro`

- [ ] Step 1: 将 `.fade-in` 定义为 CSS-only 入场，不再被 JS 系统默认隐藏。

```css
.fade-in {
  opacity: 0;
  animation: globalFadeIn 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

- [ ] Step 2: 只有带 `data-motion="global-reveal"` 的元素才允许被 `globalReveal.ts` 初始化隐藏。

```css
.js [data-motion="global-reveal"]:not([data-motion-state="done"]) {
  opacity: 0;
  visibility: hidden;
  transform: translateY(20px);
}

.js [data-motion="global-reveal"].motion-visible {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  transition:
    opacity 0.55s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.55s cubic-bezier(0.16, 1, 0.3, 1);
}
```

- [ ] Step 3: 移除或缩窄这类规则：

```css
.js .classmate-card,
.js .student-body .fade-in {
  opacity: 0;
  visibility: hidden;
  transform: translateY(24px);
}
```

- [ ] Step 4: 对 `StudentProfile` 中需要 JS 控制的 section 增加明确类名，例如 `.profile-motion-section`，不要继续复用 `.fade-in` 作为 GSAP 选择器。
- [ ] Step 5: 首页、相册、时光轴的标题区保持 CSS-only，不接入 JS reveal。

**Acceptance Criteria:**

- `.fade-in` 不再同时被 CSS 和 GSAP 作为控制选择器。
- 慢网禁用 JS 时，页面内容仍能显示。
- `StudentProfile` 的 GSAP 只选中 `.profile-motion-section` 或组件内明确 selector。

---

### Task 4: 防止 SWR 与筛选触发整页重播动画

**Files:**

- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/pages/timeline.astro`

- [ ] Step 1: 所有 SWR 更新前先做深比较，数据不变不赋值。
- [ ] Step 2: 数据变更后只对新增元素做局部动画，不对旧元素 `gsap.set(... opacity: 0)`。
- [ ] Step 3: 搜索、标签筛选、时间轴筛选只使用 CSS transition 或直接重排，不重新调用页面入场动画。
- [ ] Step 4: 建立 `hasAnimated` 与 `animatedKeys`：

```ts
const animatedKeys = new Set<string>()

function markNewItems<T extends { id?: string; slug?: string }>(items: T[]) {
  return items.filter((item) => {
    const key = item.id || item.slug
    if (!key || animatedKeys.has(key)) return false
    animatedKeys.add(key)
    return true
  })
}
```

**Acceptance Criteria:**

- 同学录搜索不会整批卡片消失再出现。
- 学生详情 SWR 更新不会重放所有资料区动画。
- 相册标签切换不会触发照片墙整组闪烁。

---

## 6. P0：修补性能测试盲区

### Task 5: 静态测试解析入口 chunk 依赖链

**Problem:** 当前测试只检查 HTML 是否直接包含 `ScrollTrigger` 文件名，不能发现 `MainLayout` chunk 内部通过 Vite preload helper 引入依赖。

**Files:**

- Modify: `packages/site-astro/tests/performance-static.test.ts`

- [ ] Step 1: 新增工具函数，读取页面 HTML 中的入口 JS。

```ts
function extractModuleScripts(html: string) {
  return Array.from(html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g))
    .map(match => match[1].replace(/^\/+/, ''))
}
```

- [ ] Step 2: 新增递归检查函数，读取入口 chunk 内容和 dependency map。

```ts
function readAsset(assetPath: string) {
  const fullPath = path.join(distDir, assetPath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : ''
}

function expectEntryNotToReference(entry: string, forbidden: string[]) {
  const content = readAsset(entry)
  for (const token of forbidden) {
    expect(content, `${entry} should not reference ${token}`).not.toContain(token)
  }
}
```

- [ ] Step 3: 首页测试必须检查：

```ts
const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8')
const entries = extractModuleScripts(html)
for (const entry of entries) {
  expectEntryNotToReference(entry, ['ScrollTrigger', 'index.C-UGJFrr', 'gsap'])
}
```

说明：实际 chunk hash 会变化，测试不能硬编码 `index.C-UGJFrr`，应改为检查 `ScrollTrigger`、`gsap`、或 dependency map 中的动画 chunk 名。若 GSAP core chunk 名仍为 `index.*.js`，需要用内容识别该 chunk 是否包含 GSAP 标识。

- [ ] Step 4: 时间轴页面同样断言入口 chunk 不包含 ScrollTrigger。
- [ ] Step 5: 对学生详情页则允许 ScrollTrigger，但只允许出现在 `StudentProfile` 相关动态依赖中。

**Acceptance Criteria:**

- 如果 `MainLayout` 再次拖入 ScrollTrigger，测试会失败。
- 首页和时间轴不加载 GSAP 的约束能被 CI 守住。

---

### Task 6: 升级性能预算脚本为页面级预算

**Files:**

- Modify: `scripts/perf-budget.mjs`

- [ ] Step 1: 解析 `packages/site-astro/dist/**/*.html` 中的实际入口脚本和 Astro island 组件脚本。
- [ ] Step 2: 建立页面预算表：

```js
const budgets = {
  '/': {
    maxInitialJsGzipKb: 55,
    forbiddenAssets: ['ScrollTrigger', 'gsap'],
  },
  '/timeline/': {
    maxInitialJsGzipKb: 45,
    forbiddenAssets: ['ScrollTrigger', 'gsap'],
  },
  '/roster/': {
    maxInitialJsGzipKb: 95,
    forbiddenAssets: [],
  },
  '/student/template/': {
    maxInitialJsGzipKb: 130,
    forbiddenAssets: [],
  },
}
```

- [ ] Step 3: 输出每个页面：
  - 初始 HTML 引用 JS
  - Astro island 组件 JS
  - 入口 dependency map 命中的依赖
  - gzip 合计
  - 禁止资源命中情况
- [ ] Step 4: 如果禁止资源命中，脚本失败并给出具体页面和文件。

**Acceptance Criteria:**

- `node scripts/perf-budget.mjs` 能指出“哪个页面为什么超预算”。
- 首页如果加载 ScrollTrigger，预算脚本失败。
- 输出结果可直接粘贴进验收报告。

---

## 7. P1：真实浏览器网络验收

### Task 7: 增加 Playwright 网络冒烟测试

**Files:**

- Create: `packages/site-astro/tests/performance-network.spec.ts`
- Modify: `packages/site-astro/package.json`

- [ ] Step 1: 增加可选脚本：

```json
{
  "scripts": {
    "test:perf-network": "playwright test tests/performance-network.spec.ts"
  }
}
```

- [ ] Step 2: 编写首页网络断言：

```ts
import { test, expect } from '@playwright/test'

test('home page does not request GSAP or ScrollTrigger', async ({ page }) => {
  const requests: string[] = []
  page.on('request', req => requests.push(req.url()))

  await page.goto('/', { waitUntil: 'networkidle' })

  expect(requests.some(url => url.includes('ScrollTrigger'))).toBe(false)
  expect(requests.some(url => url.includes('/assets/index.') && url.endsWith('.js'))).toBe(false)
})
```

- [ ] Step 3: 编写时间轴网络断言：

```ts
test('timeline page keeps animation libraries out of initial load', async ({ page }) => {
  const requests: string[] = []
  page.on('request', req => requests.push(req.url()))

  await page.goto('/timeline/', { waitUntil: 'networkidle' })

  expect(requests.some(url => url.includes('ScrollTrigger'))).toBe(false)
})
```

- [ ] Step 4: 编写学生页允许项断言：

```ts
test('student page remains interactive and loads animation libraries only after page script starts', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await page.goto('/student/template/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.student-loading-container, .student-page, .student-error-container')).toBeVisible()
  expect(consoleErrors).toEqual([])
})
```

**Acceptance Criteria:**

- 本地 preview 下能用真实浏览器证明首页与时间轴不请求 ScrollTrigger。
- 若暂不引入 Playwright 到默认 CI，也必须在文档中记录运行方式。

---

### Task 8: 建立低速网络手动验收清单

**Files:**

- Create: `docs/phase-9-manual-performance-checklist.md`

- [ ] Step 1: 新增手动验收环境：
  - Chrome DevTools Network: Slow 4G
  - CPU throttling: 4x slowdown
  - viewport: 375 x 812
  - prefers-reduced-motion: reduce 和 no-preference 各测一次

- [ ] Step 2: 页面检查清单：

| 页面 | 检查点 |
|---|---|
| 首页 | 输入框 1 秒内可见；无字体跳动；不请求 GSAP/ScrollTrigger |
| 同学录 | 卡片不整批闪烁；搜索不重播动画；头像占位稳定 |
| 学生详情 | 首屏资料不长时间隐藏；SWR 后不二次滑入；音乐控件不挡内容 |
| 相册 | 缩略图稳定；灯箱打开不卡死；失败图片有占位 |
| 时光轴 | 筛选不卡顿；不请求 ScrollTrigger |
| 年度册 | 图片懒加载；打印样式不被动画影响 |

**Acceptance Criteria:**

- 手动验收结果可填入文档。
- 低速网络下的问题能被记录为具体页面、具体元素、具体资源。

---

## 8. P1：进一步降低加载速度瓶颈

### Task 9: 首页最小化 JS 策略

**Files:**

- Modify: `packages/site-astro/src/pages/index.astro`
- Modify: `packages/site-astro/src/components/NameGate.vue`

- [ ] Step 1: 确认首页初始 JS 只包含：
  - Astro hydration runtime
  - Vue runtime
  - `NameGate`
  - API client 最小依赖
- [ ] Step 2: `NameGate` 仅在点击提交时请求 `/api/classmates`，避免输入前预取大数据。
- [ ] Step 3: 如果名单较大，新增 `/api/classmates/verify?name=` 或 POST `/api/session/verify-name`，避免下载完整同学列表。
- [ ] Step 4: 首页 Hero 全部 CSS-only，禁止任何 GSAP 入口。

**Acceptance Criteria:**

- 首页 JS gzip 预算建议降到 55KB 以下。
- 首页不下载 classmates 全量列表，除非用户提交姓名。
- 输入框和按钮在慢网下立即可操作。

---

### Task 10: 图片缩略图与 R2 响应优化

**Files:**

- Modify: `workers/api/src/routes/upload.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/components/PhotoWall.vue`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`

- [ ] Step 1: 建立图片规格：

| 类型 | 列表/卡片 | 详情 | 原图 |
|---|---:|---:|---:|
| 头像 | 160x160 | 400x400 | 保留 |
| 相册图 | 480 宽 | 960 宽 | 灯箱按需 |
| 背景图 | 1280 宽 | 1920 宽 | 保留 |

- [ ] Step 2: Worker 上传后生成缩略图，或先支持约定 key：
  - `avatars/<id>_160.webp`
  - `photos/<id>_480.webp`
  - `backgrounds/<id>_1280.webp`
- [ ] Step 3: 前台根据场景选择缩略图。
- [ ] Step 4: R2 文件服务补齐：

```ts
return new Response(object.body, {
  headers: {
    'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
  },
})
```

**Acceptance Criteria:**

- 同学录头像不直接加载原图。
- 相册网格不直接加载大图。
- 灯箱仍能查看高清图。

---

### Task 11: 公开 API 缓存与去重

**Files:**

- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/src/routes/*.ts`
- Modify: `packages/site-astro/src/utils/deferredFetch.ts`

- [ ] Step 1: 公开 GET 接口增加短缓存或 ETag：
  - `/api/classmates`
  - `/api/config`
  - `/api/albums`
  - `/api/rankings`
  - `/api/timeline`
  - `/api/students/:slug?audience=public`
- [ ] Step 2: 前台 idle SWR 支持 304：

```ts
export async function fetchJsonIfChanged(url: string, etagKey: string) {
  const headers: Record<string, string> = {}
  const oldEtag = sessionStorage.getItem(etagKey)
  if (oldEtag) headers['If-None-Match'] = oldEtag

  const res = await fetch(url, { headers })
  if (res.status === 304) return { changed: false, data: null }

  const etag = res.headers.get('ETag')
  if (etag) sessionStorage.setItem(etagKey, etag)

  return { changed: true, data: await res.json() }
}
```

- [ ] Step 3: 管理后台写操作不使用公开缓存。
- [ ] Step 4: 文档说明缓存时间和失效策略。

**Acceptance Criteria:**

- 重复访问页面时公开 API 更快。
- 后台保存后管理视图不会被缓存污染。

---

## 9. P2：前后台功能体验继续补强

### Task 12: 数据链路二次核验

**Files:**

- Modify: `docs/feature-field-matrix.md`
- Modify: `packages/admin/src/views/StudentEditView.vue`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `workers/api/src/routes/students.ts`

- [ ] Step 1: 核对后台字段是否全部能在前台找到展示位置。
- [ ] Step 2: 核对学生自助编辑保存后是否能更新对应字段。
- [ ] Step 3: 核对隐私字段不会出现在静态 HTML。
- [ ] Step 4: 补齐缺失字段的空状态或“仅本人可见”提示。

**Acceptance Criteria:**

- 后台修改资料、隐私、音乐、背景、小传后，前台展示路径明确。
- 隐私字段不泄漏。

---

### Task 13: 后台体验与公开站功能入口对齐

**Files:**

- Modify: `packages/admin/src/views/DashboardView.vue`
- Modify: `packages/admin/src/views/StudentsView.vue`
- Modify: `packages/admin/src/views/AlbumsView.vue`
- Modify: `packages/admin/src/views/MessagesView.vue`
- Modify: `packages/site-astro/src/components/TopNav.astro`
- Modify: `packages/site-astro/src/pages/yearbook.astro`

- [ ] Step 1: Dashboard 展示待处理项：
  - 待审核留言
  - 资料缺失同学
  - 无头像同学
  - 最近更新
  - 访问排行
- [ ] Step 2: 后台每个功能入口提供“查看前台效果”链接。
- [ ] Step 3: 公开站导航确认年度册、相册、同学录、时间轴入口完整。
- [ ] Step 4: 移动端后台列表增加横向滚动或卡片化降级。

**Acceptance Criteria:**

- 后台配置的功能不会“有数据但前台找不到”。
- 管理员能快速知道内容缺口。

---

### Task 14: 移动端与低端设备体验打磨

**Files:**

- Modify: `packages/site-astro/src/styles/global.css`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/MessageWall.vue`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`

- [ ] Step 1: 375px 宽度下检查所有固定按钮，避免“分享 TA”“编辑资料”“音乐控件”互相遮挡。
- [ ] Step 2: 留言表单和样式选择在小屏不挤压。
- [ ] Step 3: 相册灯箱按钮在小屏可点击且不挡图片主体。
- [ ] Step 4: 学生详情页 hero 背景视差在移动端默认关闭或降低幅度。

**Acceptance Criteria:**

- 移动端无文字重叠、按钮遮挡、横向溢出。
- 低端设备滚动不明显掉帧。

---

## 10. P2：文档与验收报告同步

### Task 15: 更新性能与动画审计文档

**Files:**

- Modify: `docs/performance-baseline.md`
- Modify: `docs/animation-audit.md`
- Create: `docs/phase-9-acceptance-report.md`

- [ ] Step 1: `performance-baseline.md` 分成：
  - Phase 8 前基线
  - Phase 8 后实测
  - Phase 9 后实测
- [ ] Step 2: `animation-audit.md` 更新为当前 Owner 矩阵：

| 页面/组件 | 动画 Owner | 是否加载 GSAP | 是否加载 ScrollTrigger | 降级策略 |
|---|---|---|---|---|
| 首页 | CSS-only | 否 | 否 | CSS/reduced motion |
| 时光轴 | CSS-only | 否 | 否 | CSS/reduced motion |
| 同学录卡片 | CSS 或局部 Vue transition | 否 | 否 | 直接显示 |
| 学生详情资料区 | Component local | 是 | 可选 | 直接显示 |
| 照片墙 | Component local 或 CSS | 可选 | 可选 | 直接显示 |

- [ ] Step 3: `phase-9-acceptance-report.md` 记录：
  - 执行任务列表
  - 测试命令输出摘要
  - 页面预算结果
  - 手动低速网络结果
  - 未完成风险

**Acceptance Criteria:**

- 后续执行者不需要重新猜 Phase 8/Phase 9 哪些问题已解决。
- 验收报告能直接用于下一轮核验。

---

## 11. 推荐执行顺序

1. Task 1：先切断 `MainLayout` 全站 GSAP/ScrollTrigger 依赖。
2. Task 5：立刻补上入口 chunk 依赖链测试，防止问题回归。
3. Task 3-4：收敛 `.fade-in` 与组件动画 Owner，解决隐藏等待和重复入场。
4. Task 2：把 GSAP/ScrollTrigger 保留在真正需要的组件里，按需加载。
5. Task 6-7：升级预算脚本和真实浏览器网络冒烟。
6. Task 9-11：继续压首页 JS、图片和 API 请求成本。
7. Task 12-14：补齐前后台功能体验和移动端体验。
8. Task 15：同步文档与验收报告。

---

## 12. 验收命令

基础验证：

```bash
pnpm verify:all
```

站点专项：

```bash
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

构建产物人工核验：

```bash
pnpm --filter site-astro build
Get-Content packages/site-astro/dist/assets/MainLayout*.js
```

期望：

- `MainLayout*.js` 不包含 `ScrollTrigger`。
- `MainLayout*.js` 不包含 GSAP core chunk dependency。

可选真实网络验收：

```bash
pnpm --filter site-astro preview
pnpm --filter site-astro test:perf-network
```

---

## 13. 禁止事项

- 不要为了性能直接删除所有动画；目标是按需、稳定、可降级。
- 不要让全局 layout 导入任何重型动画库。
- 不要继续用 `.fade-in` 同时承担 CSS 动画和 GSAP 控制选择器。
- 不要只看 HTML 中有没有 `ScrollTrigger` 文件名就宣布通过。
- 不要把 Playwright 网络测试放进默认 CI，除非运行时间和稳定性已确认。
- 不要在同一个提交里同时改动画架构、Worker 缓存、后台 UI 和图片处理。
- 不要让 SWR 更新触发整页动画重播。
- 不要在公开静态 HTML 中输出隐私字段。

---

## 14. 最终完成标准

Phase 9 完成时必须满足：

- 首页和时间轴不再请求 GSAP/ScrollTrigger。
- `MainLayout` 入口 chunk 不再带 GSAP/ScrollTrigger dependency map。
- `.fade-in`、`data-motion`、组件 GSAP 三者职责清晰，不再抢同一批元素。
- 慢网下页面内容不会因等待动画库而长期隐藏。
- 搜索、筛选、SWR 刷新不会触发整页重复入场。
- 性能静态测试能捕捉入口 chunk 误加载动画库的问题。
- 性能预算脚本能按页面解释资源来源和超限原因。
- 文档记录优化后状态和剩余风险。
- `pnpm verify:all`、`pnpm --filter site-astro test:with-build`、`node scripts/perf-budget.mjs` 全部通过。

