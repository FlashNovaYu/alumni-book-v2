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
