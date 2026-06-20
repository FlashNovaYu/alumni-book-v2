# Phase 8: 动画稳定性与加载性能专项优化计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task. This phase is performance-sensitive: measure before optimizing, and verify after each change.

**Goal:** 解决公开站各页面加载动画跳变、重复、卡顿，以及整体加载速度慢的问题。最终让同学录在普通网络和中低端设备上也能稳定首屏、顺滑滚动、快速进入可交互状态。

**Architecture:** 不重写 Astro + Vue islands 架构。本阶段以“减少客户端负担、统一动画生命周期、降低网络和资源成本”为核心。优先把不必要的 `client:load`、重复 GSAP/ScrollTrigger、运行时 SWR、远程字体和大图成本降下来。

**Tech Stack:** Astro 5 + Vue 3 islands + GSAP + Vite + Cloudflare Worker + D1/R2 + Vitest + optional Playwright/Lighthouse

---

## 1. 当前症状

用户反馈：

- 各页面加载动画会跳变。
- 动画会突然重复出现。
- 页面滚动和切换时有卡顿。
- 整体网站加载速度很慢。

初步代码观察：

| 问题域 | 现象 | 高风险来源 |
|---|---|---|
| 动画生命周期 | 入场动画重复、SWR 后重播、筛选后重播 | 全局 `.fade-in` + 组件局部 GSAP + 页面脚本动画同时存在 |
| JS 体积 | 首屏加载 Vue runtime、GSAP、ScrollTrigger、多个 island | 多处 `client:load`，动画库拆包但仍会在多页面加载 |
| 网络请求 | SSG 已有数据后客户端再次 SWR 拉取 | `RosterWall`、`StudentProfile`、`AlbumGrid`、`PrefaceWall`、`Timeline` 等二次请求 |
| 图片 | 首屏/相册/年度册图片可能过大或过多 | R2 原图直出、缺少缩略图策略、年度册一次展示多图 |
| 字体 | Google Fonts 阻塞和跨域开销 | `MainLayout.astro` 外链字体 |
| 构建数据 | 构建时拉线上 Worker，数据生成物曾导致工作区变脏 | `scripts/fetch-data.ts` 与 `public/data/*.json` |

---

## 2. 阶段目标

| 目标 | 验收标准 |
|---|---|
| 动画不重复 | 同一元素同一生命周期只播放一次入场动画；SWR 刷新不触发整页重播 |
| 首屏更快 | 首页、同学录页、学生页首屏 JS 更少，非关键 island 延迟加载 |
| 滚动更稳 | 滚动时无大面积 layout shift，无大量 ScrollTrigger 注册叠加 |
| 网络更省 | 已有 SSG 数据时不立即重复请求，改为 stale-while-idle 或用户触发刷新 |
| 图片更轻 | 头像、卡片图、相册缩略图使用稳定尺寸和可缓存轻量资源 |
| 可回归 | 增加静态性能测试和至少一个自动化性能预算脚本 |

---

## 3. 推荐指标预算

先以本地构建产物和轻量自动化为准，后续可接 Lighthouse CI。

| 指标 | 初始预算 |
|---|---:|
| 首页首屏 JS gzip | <= 80 KB |
| 同学录页首屏 JS gzip | <= 140 KB |
| 学生页首屏 JS gzip | <= 180 KB |
| 单页首屏主动 fetch 数 | <= 1 个关键请求 |
| 非交互页面 GSAP 加载 | 0 |
| CLS | 无明显图片/字体导致的肉眼跳动 |
| 动画初始化次数 | 每页面全局动画初始化 1 次 |

说明：预算需要第一步测量后再校准，不要为了追数字牺牲功能。

---

## 4. 文件影响范围

重点文件：

- Modify: `packages/site-astro/src/layouts/MainLayout.astro` - 字体加载、全局动画入口、预加载策略。
- Modify: `packages/site-astro/src/scripts/animations.ts` - 全局动画注册、清理和降级。
- Modify: `packages/site-astro/src/pages/index.astro` - 首页首屏动画和 `NameGate` 加载策略。
- Modify: `packages/site-astro/src/pages/roster.astro` - `RankingsPanel` 与 `RosterWall` 加载策略。
- Modify: `packages/site-astro/src/pages/student/[slug].astro` - 学生页 island 拆分和首屏策略。
- Modify: `packages/site-astro/src/pages/timeline.astro` - 页面脚本动画进一步收敛。
- Modify: `packages/site-astro/src/pages/yearbook.astro` - 年度册图片和打印页加载策略。
- Modify: `packages/site-astro/src/components/RosterWall.vue` - SWR、搜索和动画策略。
- Modify: `packages/site-astro/src/components/StudentProfile.vue` - SWR、音乐、照片墙、留言墙延迟加载。
- Modify: `packages/site-astro/src/components/PhotoWall.vue` - 动画和图片缩略图策略。
- Modify: `packages/site-astro/src/components/AlbumGrid.vue` - 灯箱、缩略图、懒加载。
- Modify: `packages/site-astro/src/components/MessageWall.vue` - 延迟加载和提交态。
- Modify: `packages/site-astro/src/components/RankingsPanel.vue` - `client:visible` 或延迟加载。
- Modify: `packages/site-astro/src/styles/global.css` - 减少动效、layout stability、font fallback。
- Create: `packages/site-astro/src/utils/deferredFetch.ts` - 空闲时刷新工具。
- Create: `packages/site-astro/src/utils/motion.ts` - 动画统一工具。
- Create: `scripts/perf-budget.mjs` - 构建产物体积预算检查。
- Create: `packages/site-astro/tests/performance-static.test.ts` - 静态性能约束测试。

---

## 5. P0：先测量，建立性能基线

### Task 1: 建立性能基线报告

**Files:**

- Create: `docs/performance-baseline.md`
- Create: `scripts/perf-budget.mjs`

- [ ] Step 1: 构建站点。

```bash
pnpm --filter site-astro build
```

- [ ] Step 2: 记录 `dist/assets` 中 JS/CSS 体积，按页面归类：
  - 首页
  - 同学录页
  - 学生页
  - 相册页
  - 时间轴
  - 年度册

- [ ] Step 3: 新增 `scripts/perf-budget.mjs`，扫描 `packages/site-astro/dist/assets`，输出：
  - 最大 JS 文件
  - 最大 CSS 文件
  - 总 JS gzip 估算
  - 是否超过预算

- [ ] Step 4: 将结果写入 `docs/performance-baseline.md`。

**Acceptance Criteria:**

- 有一份当前性能基线文档。
- 能用脚本重复生成体积报告。
- 后续优化有对照，而不是凭感觉。

---

### Task 2: 记录当前动画控制点

**Files:**

- Create: `docs/animation-audit.md`

- [ ] Step 1: 扫描所有动画入口：

```bash
rg "gsap|ScrollTrigger|fade-in|fromTo|client:load|client:visible" packages/site-astro/src
```

- [ ] Step 2: 按页面列出：
  - 哪些元素被全局 `.fade-in` 管
  - 哪些元素被组件 GSAP 管
  - 哪些动画会在数据刷新后重跑
  - 哪些动画没有 reduced motion 分支

- [ ] Step 3: 标记每个动画的 Owner：
  - Global reveal
  - Page script
  - Component local
  - CSS transition

**Acceptance Criteria:**

- 每个动画入口都有明确 Owner。
- 同一个选择器不能同时被两个 Owner 管。

---

## 6. P1：动画生命周期收敛

### Task 3: 建立统一 motion 工具

**Files:**

- Create: `packages/site-astro/src/utils/motion.ts`
- Modify: `packages/site-astro/src/scripts/animations.ts`

- [ ] Step 1: 新增工具函数：

```ts
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function oncePerElement(el: Element, key: string): boolean {
  const attr = `data-motion-${key}`
  if (el.getAttribute(attr) === 'done') return false
  el.setAttribute(attr, 'done')
  return true
}
```

- [ ] Step 2: 全局 reveal 只处理带 `data-motion="global-reveal"` 的元素，不再接管所有 `.fade-in`。

- [ ] Step 3: 将 `.fade-in` 从“动画控制选择器”降级为“样式语义类”，避免被多个系统抢。

**Acceptance Criteria:**

- 全局动画不再自动扫描所有 `.fade-in`。
- 每个会动画的元素有明确 `data-motion` 标记。

---

### Task 4: 页面级动画改为 CSS 优先

**Files:**

- Modify: `packages/site-astro/src/pages/index.astro`
- Modify: `packages/site-astro/src/pages/timeline.astro`
- Modify: `packages/site-astro/src/styles/global.css`

- [ ] Step 1: 首页 hero 入场从 GSAP 改为 CSS keyframes 或 transition。
- [ ] Step 2: 时间轴筛选后的列表动画改成 CSS class 切换，不再动态 import GSAP。
- [ ] Step 3: 简单淡入、轻微上移一律使用 CSS，不引入 ScrollTrigger。
- [ ] Step 4: 只有复杂滚动视差或灯箱过渡才允许组件级 JS 动画。

**Acceptance Criteria:**

- 首页不再加载 GSAP。
- 时间轴非滚动视差动画不再加载 ScrollTrigger。
- 常规页面的动画不会因 JS chunk 加载慢而闪烁。

---

### Task 5: 组件级 GSAP 严格局部化

**Files:**

- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/PhotoWall.vue`
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`

- [ ] Step 1: 所有 GSAP 选择器从全局字符串改成 root ref 内查找。
- [ ] Step 2: 所有 `gsap.context()` 必须绑定 root element。
- [ ] Step 3: 所有组件 `onUnmounted()` 必须 `ctx.revert()`。
- [ ] Step 4: 数据刷新时不重播入场动画，只对新增元素做局部动画。

**Acceptance Criteria:**

- `rg "gsap\\.utils\\.toArray<HTMLElement>\\('\\." packages/site-astro/src/components` 无未绑定 root 的全局选择器。
- 切换路由或重新挂载不会留下旧 ScrollTrigger。

---

## 7. P2：减少首屏 JS 和 hydration 成本

### Task 6: 调整 island 加载策略

**Files:**

- Modify: `packages/site-astro/src/pages/index.astro`
- Modify: `packages/site-astro/src/pages/roster.astro`
- Modify: `packages/site-astro/src/pages/album.astro`
- Modify: `packages/site-astro/src/pages/student/[slug].astro`
- Modify: `packages/site-astro/src/pages/preface.astro`

- [ ] Step 1: 只对首屏必须交互的组件使用 `client:load`。
- [ ] Step 2: 非首屏组件改为 `client:visible`：
  - `RankingsPanel`
  - `AlbumGrid`
  - 学生页下方留言墙
  - 照片墙
- [ ] Step 3: 对可等待用户操作的组件改为按需加载：
  - 分享卡
  - 自助编辑面板
  - 照片灯箱

**Acceptance Criteria:**

- 首页首屏只 hydrate `NameGate`。
- 同学录页不在首屏立即加载所有非关键互动。
- 学生页不会首屏一次性加载留言、照片墙、分享卡、自助编辑的全部逻辑。

---

### Task 7: 拆分 StudentProfile 大组件

**Files:**

- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Create: `packages/site-astro/src/components/StudentMusicPlayer.vue`
- Create: `packages/site-astro/src/components/StudentShareCard.vue`
- Create: `packages/site-astro/src/components/StudentProfileSections.vue`

- [ ] Step 1: 将音乐播放逻辑拆出。
- [ ] Step 2: 将分享卡 modal 拆出并按用户点击懒加载。
- [ ] Step 3: 将纯展示资料区拆成轻组件，减少主组件状态量。
- [ ] Step 4: 保持外部 props 不变，避免页面接口大改。

**Acceptance Criteria:**

- `StudentProfile` chunk 明显变小。
- 首屏未打开分享卡时不加载二维码/分享卡逻辑。

---

### Task 8: SWR 改为 idle refresh

**Files:**

- Create: `packages/site-astro/src/utils/deferredFetch.ts`
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/components/PrefaceWall.vue`
- Modify: `packages/site-astro/src/pages/timeline.astro`

- [ ] Step 1: 新增工具：

```ts
export function runWhenIdle(task: () => void, timeout = 2500) {
  if ('requestIdleCallback' in window) {
    ;(window as any).requestIdleCallback(task, { timeout })
  } else {
    window.setTimeout(task, timeout)
  }
}
```

- [ ] Step 2: 已有 SSG 初始数据的页面，不在 `onMounted()` 立刻 fetch。
- [ ] Step 3: 改为 idle 后刷新，且如果数据相同不触发 DOM 重绘。
- [ ] Step 4: 对用户强依赖的新鲜数据增加“刷新”按钮或轻提示，而不是首屏阻塞。

**Acceptance Criteria:**

- 首屏 mount 后不会立刻发出多路重复 fetch。
- SWR 更新不重播动画，不导致布局跳动。

---

## 8. P3：图片、字体和网络优化

### Task 9: 建立 R2 图片尺寸策略

**Files:**

- Modify: `workers/api/src/routes/upload.ts`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/components/PhotoWall.vue`
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`

- [ ] Step 1: 上传时生成或保存缩略图：
  - avatar: 160px, 400px
  - album thumb: 480px
  - background: 1280px / 1920px
- [ ] Step 2: 前台卡片和列表使用缩略图。
- [ ] Step 3: 灯箱打开后再加载原图。
- [ ] Step 4: R2 文件服务补齐缓存头和图片类型头。

**Acceptance Criteria:**

- 同学录头像和相册卡片不直接加载大图。
- 灯箱仍能看高清图。
- 图片加载不再造成大面积布局跳动。

---

### Task 10: 字体加载优化

**Files:**

- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
- Modify: `packages/site-astro/src/styles/tokens.css`

- [ ] Step 1: 评估是否保留 Google Fonts。
- [ ] Step 2: 推荐方案：改成本地托管字体或系统字体优先。
- [ ] Step 3: 如果保留远程字体，加入 `font-display=swap`，并减少字重。
- [ ] Step 4: 明确 fallback 字体，避免字体到达时大幅重排。

**Acceptance Criteria:**

- 字体不会明显阻塞首屏。
- 字体切换不造成明显文字跳动。

---

### Task 11: 缓存与 API 请求优化

**Files:**

- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/src/routes/*.ts`
- Modify: `packages/site-astro/src/utils/deferredFetch.ts`

- [ ] Step 1: 公开 GET 接口增加合理缓存：
  - `/api/classmates`
  - `/api/config`
  - `/api/albums`
  - `/api/rankings`
  - `/api/timeline`
- [ ] Step 2: 对更新频率高的接口使用短缓存或 ETag。
- [ ] Step 3: 前台 fetch 支持 `If-None-Match` 或本地 session cache。
- [ ] Step 4: 管理后台写操作后仍能看到最新数据，不被公开缓存影响。

**Acceptance Criteria:**

- 重复访问公开页面时 API 响应更快。
- 缓存不会让后台刚保存的管理视图读到旧数据。

---

## 9. P4：性能回归测试和可观测性

### Task 12: 静态性能测试

**Files:**

- Create: `packages/site-astro/tests/performance-static.test.ts`
- Modify: `packages/site-astro/package.json`

- [ ] Step 1: 检查构建产物中不该出现的模式：
  - 首页 chunk 不应包含 ScrollTrigger。
  - 时间轴 chunk 不应包含 ScrollTrigger。
  - 页面中不应重复加载多个 Google Font CSS。
- [ ] Step 2: 检查关键页面 HTML 中图片有宽高或 aspect-ratio。
- [ ] Step 3: 检查测试对预算友好，不依赖网络。

**Acceptance Criteria:**

- `pnpm --filter site-astro test` 覆盖性能静态约束。
- 违反预算时 CI 会失败。

---

### Task 13: 可选 Playwright 性能冒烟

**Files:**

- Create: `packages/site-astro/tests/performance.e2e.ts`
- Modify: `packages/site-astro/package.json`

- [ ] Step 1: 启动本地预览。
- [ ] Step 2: 用 Playwright 打开：
  - `/`
  - `/roster`
  - `/student/<slug>`
  - `/album`
  - `/timeline`
- [ ] Step 3: 记录：
  - console error
  - network request count
  - first visible content time
  - layout shift 粗略指标
- [ ] Step 4: 如果 Playwright 引入过重，先作为手动脚本，不进默认 CI。

**Acceptance Criteria:**

- 能本地复现“加载慢/跳变”的量化证据。
- 优化前后可对比。

---

## 10. 推荐执行顺序

1. Task 1-2：先量化，建立性能和动画审计基线。
2. Task 3-5：收敛动画 Owner，减少重复和跳变。
3. Task 6-8：调整 hydration 和 SWR，降低首屏 JS 与网络压力。
4. Task 9-11：优化图片、字体、缓存。
5. Task 12-13：加入性能回归测试，防止后续反弹。

---

## 11. 验收命令

基础验收：

```bash
pnpm verify:all
```

站点专项：

```bash
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

可选手动验收：

```bash
pnpm --filter site-astro preview
```

然后在浏览器检查：

- 首页是否快速可输入姓名。
- 同学录列表是否无闪烁。
- 学生页头像、背景、资料是否无二次跳动。
- 相册打开是否先显示缩略图，灯箱再加载大图。
- 时间轴筛选是否顺滑，不重复飞入。

---

## 12. 不要做

- 不要在没有性能基线的情况下盲目删除功能。
- 不要为了速度砍掉所有动画；目标是稳定、轻量、可控。
- 不要继续新增全局选择器动画。
- 不要让 SWR 在首屏 mount 后立即造成多路请求和 DOM 重绘。
- 不要让学生页继续膨胀成一个超大组件。
- 不要把所有组件都设为 `client:load`。
- 不要直接用原图做列表缩略图。

---

## 13. 最终完成标准

- 用户肉眼不再看到加载动画重复、跳变、闪烁。
- 首屏不被非关键 Vue island、GSAP、ScrollTrigger 和远程字体拖慢。
- 已有 SSG 数据不再被首屏 SWR 立即重绘。
- 图片有缩略图、稳定尺寸和失败占位。
- Site 测试包含动画/性能静态约束。
- `pnpm verify:all` 和性能预算脚本通过。
