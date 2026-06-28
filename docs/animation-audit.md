# 动画系统与选择器控制权审计报告 (Phase 8 审计)

记录日期: 2026-06-20

## 1. 全局与局部动画触发控制矩阵

下表梳理了当前项目中所有的动画触发入口、影响的选择器及其实际 Owner：

| 触发位置 | 影响选择器 (DOM) | 动画引擎/策略 | Owner 系统 | 备注 |
|---|---|---|---|---|
| `MainLayout.astro` | `.fade-in` | GSAP + ScrollTrigger | 全局动画系统 (`animations.ts`) | **高风险**：会跨页面无差别捕获所有 `.fade-in` 元素。 |
| `index.astro` (首页) | `.hero-content > *` | GSAP Timeline | 首页内联脚本 | **竞态冲突**：与全局动画系统同时操作相同的 hero 元素。 |
| `timeline.astro` | `.timeline-node` | GSAP + ScrollTrigger | 时间轴内联脚本 | 重复绑定触发器，且在过滤/SWR 重绘时易重播闪烁。 |
| `RosterWall.vue` | `.classmate-card` | GSAP (无 Context) | 组件生命周期 (`triggerAnimations`) | 列表卡片飞入。无 local 隔离，容易全局污染。 |
| `PhotoWall.vue` | `.photo-item` | GSAP + ScrollTrigger | 组件生命周期 | 照片列表淡入。有 context revert，但使用了全局类匹配。 |
| `MessageWall.vue` | `.msg-item` | GSAP + ScrollTrigger | 组件生命周期 | 留言列表淡入。有 context revert，但使用了全局类匹配。 |
| `StudentProfile.vue` | `.student-body > .fade-in` | GSAP + ScrollTrigger | 组件生命周期 (`triggerGSAPAnimations`) | 详情页内容滑入。**高风险**：与全局 `.fade-in` 产生抢夺，双重入场。 |

---

## 2. 重大冲突与优化路径

### 冲突 1：首页入场抢夺与首屏闪烁 (index.astro)
- **原因**：首页 Hero 元素的 class 是 `.fade-in`，被全局 `animations.ts` 抓取并执行了 `ScrollTrigger.batch`；而首页自身又通过内联 JS 执行了一次 GSAP 动画，造成双重动画干预，出现跳变与闪烁。
- **解决**：首页移除所有 JS-GSAP 控制，改用纯 CSS `@keyframes` 硬件加速，并移除 `.fade-in` 的动画控制权（将其变成纯静态 CSS 占位）。

### 冲突 2：学生详情页的局部 vs 全局二次入场 (StudentProfile.vue)
- **原因**：学生详情页的 `.student-body > .fade-in` 既包含 `.fade-in` 类（触发全局 `animations.ts`），又在组件内通过 `triggerGSAPAnimations()` 绑定了 ScrollTrigger 逐个淡入，造成触发器并发冲突。
- **解决**：全局 `animations.ts` 退出对所有 `.fade-in` 的自动扫描，仅对标记了 `data-motion="global-reveal"` 的页面级 Astro 静态骨架元素进行一次性揭示，组件内部交互动画完全由组件的 `gsap.context()` 局部控制。

### 冲突 3：无隔离的全局元素选择器污染 (RosterWall.vue)
- **原因**：`RosterWall.vue` 在 GSAP 动画中直接通过 `gsap.utils.toArray('.classmate-card')` 获取节点。若同页面挂载了其他也含有 `.classmate-card` 类的节点（如未来新增的分支卡片或排行榜），会导致误操作，且由于没有 reversible context，销毁组件后 ScrollTrigger 无法有效注销。
- **解决**：在组件模板中绑定根容器 `rootRef`，通过 `gsap.context()` 对组件做完美沙箱隔离。

---

## 3. Phase 9 优化后动画 Owner 矩阵 (2026-06-27)

优化后，我们重新定义并归拢了全站元素动画的所有权，彻底切断了全局对于常规 `.fade-in` 元素的抓取，让职责分配极其单一清晰：

| 页面/组件 | 影响选择器 (DOM) | 动画引擎/所有权 | 降级/Reduced Motion 策略 | 说明 |
|---|---|---|---|---|
| **MainLayout (全局)** | `[data-motion="global-reveal"]` | 原生 IntersectionObserver | 直接显示 (Opacity: 1, Transform: none) | 全局只负责无 GSAP 的轻量首屏进入，完全没有第三方库开销。 |
| **首页 (index)** | `.hero-content > *` | 纯 CSS Animation (`globalFadeIn`) | 直接显示 | 彻底移除了内联 JS 和 GSAP。 |
| **同学录 (Roster)** | `.classmate-card` | 纯 CSS Animation + Inline Delay | 直接显示 | 移除 GSAP，完全通过 CSS Stagger 渲染，SWR 和过滤时无闪烁。 |
| **详情留言墙** | `.msg-item` | 纯 CSS Animation + Inline Delay | 直接显示 | 移除 GSAP，全新留言提交时直接无闪烁淡入。 |
| **详情照片墙** | `.photo-item` | GSAP + ScrollTrigger (Lazy loaded) | 直接显示 | 仅当 PhotoWall 进入视口 150px 挂载后，才按需异步加载 GSAP 播放。 |
| **学生详情页** | `.hero-bg` | GSAP + ScrollTrigger (Lazy loaded) | 移动端关闭 / 直接显示 | 仅在非移动端 (大屏) 且 mounted 后应用背景视差滚动。 |

---

## 4. Phase 10 优化后动画 Owner 矩阵 (2026-06-27)

在混合重新设计中，我们对手账与纪念馆主题动效进行了精细管控，确保其在可访问性（减弱动效）及延迟加载层面完全达标：

| 页面/组件 | 影响选择器 (DOM) | 动画引擎/所有权 | 降级/Reduced Motion 策略 | 说明 |
|---|---|---|---|---|
| **祝福贴纸墙 (MessageWall)** | `.msg-item` | CSS-first Transition (随机倾斜 & 悬浮上滑投影) | **强制复位重置**：`transform: none`, `transition: none`, `animation: none` | 在 reduced motion 激活时，彻底移除了倾斜、悬浮位移、放大和淡入动效，符合无障碍强制重置规范。 |
| **影像馆 (AlbumGrid)** | `.fade-in-img` | CSS-first Transition (onload 触发 `.img-loaded`) | 直接显示 | 绝无 GSAP 依赖。基于 onload 侦测确保图片无闪烁渐入，支持 aspect-ratio 消除 CLS。 |
| **校史走廊 (timeline.astro)** | `.timeline-item` | CSS-first Transition + Inline Delay | **彻底关闭**：`animation: none`, `transform: none` | 支持了过滤时多分类平滑淡入。当减弱动效开启时，动画延迟及位移完全停用。 |
| **亮点预览延迟入口** | `ClassGraphPreview`, `SeatMapPreview` | Vue Async Component + IntersectionObserver | 直接显示（按需加载） | 延迟到亮点锚点滚动到视区 150px 内才触发 chunk 下载与水合。组件卸载时在 `onUnmounted` 彻底 disconnect observer 释放强引用。 |

## Phase 11 动画所有权约束

- 全站不再保留旧 `scripts/animations.ts` 作为全局 GSAP owner。
- 首页、列表、留言、时间轴默认使用 CSS-first 动效。
- GSAP/ScrollTrigger 只能出现在局部组件的懒加载路径中，并必须带有卸载清理和 reduced-motion 降级。
