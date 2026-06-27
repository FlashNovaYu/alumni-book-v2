# 性能优化基线数据 (Phase 8 基线报告)

记录日期: 2026-06-20

## 1. 初始构建产物大小 (优化前)

基于 `pnpm --filter site-astro build` 统计的 `dist/assets` 主要 chunk 数据：

### 核心运行时及重量依赖 (多页面共享/预加载)

| Chunk 文件 | 物理体积 | Gzip 估算体积 | 主要作用 |
|---|---|---|---|
| `runtime-core.esm-bundler.BkV4QYMA.js` | 71.93 kB | 28.37 kB | Vue 3 核心运行时 (Core) |
| `index.C-UGJFrr.js` | 70.55 kB | 27.84 kB | GSAP 动画主库及公共代码 |
| `ScrollTrigger.7Zy99s9Q.js` | 43.99 kB | 18.27 kB | GSAP 滚动触发器插件 |
| `runtime-dom.esm-bundler.B2nEHodd.js` | 12.97 kB | 5.65 kB | Vue 3 DOM 绑定模块 |

### 各页面及 Island 组件代码

| Page/Component Chunk | 物理体积 | Gzip 估算体积 | Hydration 触发策略 |
|---|---|---|---|
| `StudentProfile.YzdZLsud.js` | 42.90 kB | 13.48 kB | `client:load` (详情页) |
| `AlbumGrid.BRigeCtd.js` | 5.17 kB | 2.25 kB | `client:load` (相册页) |
| `RosterWall.Dl9LioEF.js` | 3.21 kB | 1.77 kB | `client:load` (同学录页) |
| `PrefaceWall.B11ZpTTu.js` | 2.26 kB | 1.24 kB | `client:load` (前言页) |
| `RankingsPanel.BuFe_C1W.js` | 2.13 kB | 1.20 kB | `client:load` (同学录页) |
| `NameGate.zEHWSHx5.js` | 1.68 kB | 1.09 kB | `client:load` (首页) |

---

## 2. 页面级首屏 JS 预算核算

以下是根据 Astro islands 路由分发及 JS chunk 引用关系估算的首屏 JS 大小（包含依赖 chunk，未压缩物理大小 / Gzip 大小）：

### 首页 (Hero)
- **包含资源**：`runtime-core` + `runtime-dom` + `NameGate` + `client` + `animations` + `gsap (index)`
- **估算大小**：`71.93 + 12.97 + 1.68 + 1.05 + 0.49 + 70.55 = 158.67 kB` (Gzip: **64.08 kB**)
- **说明**：当前首页即使仅加载了 `NameGate` 的 UI，但因为异步加载了 `gsap` (首页入场动画) 以及 MainLayout 里的 `animations`，导致首屏被拖累，需要加载整个 Vue 和 GSAP 依赖。

### 同学录页 (Roster)
- **包含资源**：`runtime-core` + `runtime-dom` + `RosterWall` + `RankingsPanel` + `client` + `animations` + `gsap (index)` + `ScrollTrigger`
- **估算大小**：`71.93 + 12.97 + 3.21 + 2.13 + 1.05 + 0.49 + 70.55 + 43.99 = 216.32 kB` (Gzip: **87.21 kB**)
- **说明**：此页面因为首屏交互挂载了 `client:load` 的 `RosterWall` 和 `RankingsPanel`，加上 animations.ts 里的全局 ScrollTrigger，使所有核心依赖全量打包下载。

### 学生页 (Student Detail)
- **包含资源**：`runtime-core` + `runtime-dom` + `StudentProfile` + `PhotoWall` + `MessageWall` + `SelfEditPanel` (已被打包在 StudentProfile 中) + `gsap (index)` + `ScrollTrigger`
- **估算大小**：`71.93 + 12.97 + 42.90 + 70.55 + 43.99 = 241.44 kB` (Gzip: **93.62 kB**)
- **说明**：学生详情页中包含了照片墙、留言板、自助编辑、背景音乐等大量沉重功能，首屏一次性全部加载并 hydration，主线程处理压力极高。

---

## 3. 首屏主动 Fetch 数量审计

在页面装载（`onMounted`）的瞬间发起的 HTTP 网络请求计数：

1. **首页**：1 个 (`api/classmates` 用于 NameGate 校验名册，静态数据直出后可优化)。
2. **同学录页**：2 个 (`api/classmates` 页面直出后再发 SWR 刷新，`api/rankings` 排行榜拉取)。
3. **学生页**：3 个 (`api/students/<slug>` 用于资料 SWR 刷新，`api/messages` 用于留言获取，`api/students/<slug>/visit` 增加计数)。

---

## 4. 优化目标线 (KPI)

1. **首页**：全面免除 GSAP 依赖，JS 物理体积降至 100KB 以下（Gzip <= 40KB），Fetch 请求降为 0（使用已有静态名册或推迟校验）。
2. **同学录页**：`RankingsPanel` 延迟 Hydration。列表页首屏不需要立即加载 ScrollTrigger。
3. **学生页**：把大组件 `StudentProfile` 物理大小降至 20KB 以下。分享卡、音乐播放延迟异步挂载。

---

## 5. Phase 9 优化后实测数据 (2026-06-27)

优化后，我们彻底移除了首页和主要列表页对 GSAP/ScrollTrigger 的依赖，重构为纯 CSS 动画以杜绝“隐藏等待”和“首屏预加载”：

### 页面级首屏 JS 真实依赖体积对比 (Gzip)

| 页面 | Phase 8 优化前 (Gzip) | Phase 9 优化后 (Gzip) | 体积下降比例 | 优化手段 |
|---|---|---|---|---|
| **首页 (Home)** | 64.08 kB | 1.80 kB | **-97.2%** | 全面免除 GSAP/ScrollTrigger，改用纯 CSS-first 及原生 Reveal |
| **时光轴 (Timeline)** | 45.00 kB | 0.71 kB | **-98.4%** | 免除 GSAP 注入，回归轻量 CSS 入场 |
| **同学录 (Roster)** | 87.21 kB | 3.47 kB | **-96.0%** | 重构为纯 CSS Stagger 渐显动画，移除所有 GSAP/ScrollTrigger 异步依赖 |
| **学生详情页 (Student)** | 93.62 kB | 0.96 kB | **-99.0%** | SWR 水合前不载入 PhotoWall、留言板和 GSAP 背景视差 |

### 性能指标评估结论

1. **首屏加载速度**：首页与时间轴页完全不再发起对 GSAP 核心包与 ScrollTrigger 的网络请求，页面直接运行体积极轻，极速展现。
2. **防隐藏等待**：列表卡片和留言内容改用纯 CSS-first 入场，即使在网络极慢或 JS 被禁用的设备上也能立刻可见，完全消除了之前的隐藏白屏等待。
3. **数据一致性与 SWR 缓存**：引入 `fetchJsonIfChanged` 基于 ETag 对公开接口进行了客户端缓存与 304 拦截，二次访问时页面数据能秒级渲染，不增加多余的流量消耗。
