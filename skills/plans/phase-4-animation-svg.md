# Phase 4: 前端动画与 SVG 图标全面升级

> **For agentic workers:** Use subagent-driven-development to implement this plan task-by-task.

**Goal:** 用纯 CSS 动画 + 内联 SVG 替代所有 emoji/unicode，统一设计 token，激活滚动渐显，为所有交互组件添加细腻过渡动画。

**Architecture:** 8 个工作流按依赖顺序执行。Workstream 1（Token 扩展）是基础，所有后续工作流都引用新增的设计 token。SVG 图标作为 Astro 组件创建，支持描边绘制动画。滚动渐显通过 IntersectionObserver + CSS transition 实现，不引入任何第三方动画库。

**Tech Stack:** CSS @keyframes、CSS custom properties、IntersectionObserver、Vue `<Transition>` / `<TransitionGroup>`、Astro 组件、内联 SVG（stroke-dasharray 描边动画）

---

## Context：当前设计系统诊断

| 问题 | 现状 |
|------|------|
| 动画覆盖 | 仅按钮/输入框有 `0.15s ease`，无 @keyframes，无滚动动画 |
| Emoji/Unicode | `🏠👥📷💬⏳⚙️✦✕‹›★📷` 直接嵌入 HTML，无法自定义样式 |
| 死代码 | `.fade-in` 类已定义但无 JS 激活；汉堡菜单 transition 无旋转状态 |
| 视觉一致性 | hover 提升距离 -2px/-3px/-4px 不一致；仅 1 个 shadow token |
| 无障碍 | 无 focus-visible 环；无 prefers-reduced-motion；无 active 页指示器 |
| Loading 状态 | 骨架屏为零；按钮加载仅文字无动画 |

---

## Workstream 1：设计 Token 扩展

> **优先级最高** — 其他所有工作流依赖此 token。

**Files:**
- Modify: `packages/shared/src/tokens.css`（主文件）
- Modify: `packages/site-astro/src/styles/tokens.css`（副本，保持同步）

### 1a. Shadow Token

```css
/* 已有 */ --shadow-subtle: 0 1px 3px rgba(20, 20, 19, 0.08);
/* 新增 */ --shadow-card-hover: 0 8px 24px rgba(20, 20, 19, 0.10);
/* 新增 */ --shadow-elevated: 0 12px 40px rgba(20, 20, 19, 0.12);
/* 新增 */ --shadow-nav-scroll: 0 2px 12px rgba(20, 20, 19, 0.06);
```

### 1b. 过渡时间 Token

```css
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);       /* 减速进入 */
--ease-in-out-quint: cubic-bezier(0.83, 0, 0.17, 1);    /* 对称过渡 */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);       /* 弹性回弹 */
--duration-instant: 100ms;
--duration-fast: 150ms;
--duration-normal: 200ms;
--duration-slow: 300ms;
--duration-reveal: 600ms;
```

### 1c. Z-index Token

```css
--z-nav: 100;
--z-lightbox: 200;
--z-modal: 300;
--z-toast: 400;
```

### 1d. prefers-reduced-motion 全局覆盖

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-instant: 0ms;
    --duration-fast: 0ms;
    --duration-normal: 0ms;
    --duration-slow: 0ms;
    --duration-reveal: 0ms;
  }
}
```

### 1e. @keyframes 声明

添加到 `packages/site-astro/src/styles/global.css` 和 `packages/admin/src/styles/admin.css`：

| Keyframe | 用途 | 参数 |
|----------|------|------|
| `shimmer` | 骨架屏闪光 | `background-position -200%→200%` |
| `fadeInUp` | 滚动渐显 | `opacity 0→1, translateY(16px)→0` |
| `overlayIn` | 灯箱遮罩 | `opacity 0→1` |
| `imageIn` | 灯箱图片 | `opacity 0→1, scale(0.92)→1` |
| `toastIn` | Toast 滑入 | `opacity 0→1, translateY(10px)→0` |
| `drawOn` | SVG 描边绘制 | `stroke-dashoffset var→0` |
| `gentlePulse` | 品牌图标脉冲 | `scale 1→1.12→1` (2s infinite) |
| `bounceIn` | SVG 弹入 | `scale 0→1.15→1` |
| `spin` | 加载旋转 | `rotate 0→360deg` |

---

## Workstream 2：SVG 图标系统

### 2a. 公开站图标

**新建目录:** `packages/site-astro/src/components/icons/`

| 组件 | 替换 | 动画 |
|------|------|------|
| `IconBrand.astro` | TopNav `✦` | `gentlePulse` hover |
| `IconCamera.astro` | album `📷` | `drawOn` 0.8s |
| `IconClose.astro` | 灯箱 `✕` | hover rotate(90deg) |
| `IconChevronLeft.astro` | 灯箱 `‹` | hover translateX(-2px) |
| `IconChevronRight.astro` | 灯箱 `›` | hover translateX(2px) |
| `IconStar.astro` | StudentHero `★` | `bounceIn` 0.4s |

### 2b. 管理后台图标

**新建目录:** `packages/admin/src/components/icons/`

| 组件 | 替换 | 尺寸 |
|------|------|------|
| `IconBrand.astro` | sidebar `✦` | 18px |
| `IconHome.astro` | `🏠` | 18px |
| `IconUsers.astro` | `👥` | 18px |
| `IconCamera.astro` | `📷` | 18px |
| `IconMessageCircle.astro` | `💬` | 18px |
| `IconClock.astro` | `⏳` | 18px |
| `IconGear.astro` | `⚙️` | 18px |

### 2c. SVG 规范

- `viewBox="0 0 24 24"`，`aria-hidden="true"`
- `currentColor` 继承文字颜色
- Props: `size`（数字，默认 18）、`class`（字符串）
- stroke-based 图标用 `stroke-dasharray`/`stroke-dashoffset` 实现描边动画

---

## Workstream 3：滚动渐显动画

### 3a. 创建 ScrollReveal 组件

**新建:** `packages/site-astro/src/components/ScrollReveal.astro`

- IntersectionObserver，`threshold: 0.15, rootMargin: '0px 0px -40px 0px'`
- 给 `.fade-in` 添加 `.visible`（只触发一次，unobserve）
- `prefers-reduced-motion` 时立即添加 `.visible`

### 3b. 更新 global.css .fade-in

```css
.fade-in {
  opacity: 0; transform: translateY(16px);
  transition: opacity var(--duration-reveal) var(--ease-out-quart),
              transform var(--duration-reveal) var(--ease-out-quart);
}
.fade-in.visible { opacity: 1; transform: translateY(0); }
```

### 3c. 错位渐显

```css
.fade-in-stagger > .fade-in:nth-child(1) { transition-delay: 0ms; }
.fade-in-stagger > .fade-in:nth-child(2) { transition-delay: 80ms; }
.fade-in-stagger > .fade-in:nth-child(3) { transition-delay: 160ms; }
.fade-in-stagger > .fade-in:nth-child(4) { transition-delay: 240ms; }
.fade-in-stagger > .fade-in:nth-child(5) { transition-delay: 320ms; }
.fade-in-stagger > .fade-in:nth-child(6) { transition-delay: 400ms; }
```

### 3d. MainLayout 引入

在 `MainLayout.astro` 的 `<slot />` 后、`</body>` 前引入 `<ScrollReveal />`

### 3e. 页面应用

| 页面 | 添加 fade-in 的元素 |
|------|---------------------|
| `index.astro` | `.hero-content` 子元素（错位） |
| `preface.astro` | `.preface-header`、`.preface-body`、`.acknowledgment`、`.bottom-actions` |
| `roster.astro` | `.roster-header`、`.classmate-grid.fade-in-stagger` |
| `album.astro` | `.album-header`、相册区块 |
| `timeline.astro` | `.timeline-header`、`.timeline-node` |
| `student/[slug].astro` | hero + 各 section + 照片墙 + 留言墙 + 留念章 |

---

## Workstream 4：组件动画改进

### 4a. 按钮（global.css + admin.css）

```css
transition: background-color var(--duration-fast) var(--ease-out-quart),
            transform var(--duration-fast) var(--ease-out-quart);
.btn-primary:active { transform: scale(0.97); }
.btn-primary:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
```

### 4b. 输入框（global.css + admin.css）

```css
transition: border-color var(--duration-fast) var(--ease-out-quart),
            box-shadow var(--duration-fast) var(--ease-out-quart);
.text-input:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
```

### 4c. 卡片 hover（global.css）

```css
.card { transition: transform var(--duration-normal) var(--ease-out-quart),
                    box-shadow var(--duration-normal) var(--ease-out-quart); }
.card:hover { transform: translateY(-2px); box-shadow: var(--shadow-card-hover); }
```

### 4d-4e. 同学录卡片 & 照片项 hover 统一

提升 -3px + `--shadow-card-hover`，transition 改用 token

### 4f. 导航链接（TopNav.astro）

transition 改用 token

### 4g. MessageWall 留言动画

- 列表：`<TransitionGroup name="msg">`，`msg-enter-from { opacity:0; translateY(12px) }`
- 状态切换：`<Transition name="fade" mode="out-in">`

### 4h. RosterSearch 搜索过滤

- `display:none` → `.hidden` 类 + opacity/scale 过渡
- 300ms 后再设 `display:none`

---

## Workstream 5：灯箱动画

**File:** `packages/site-astro/src/components/AlbumGrid.vue`

### 5a. Vue `<Transition>` 替换 v-if

```html
<Transition name="lightbox">
  <div v-if="lightbox.open" class="lightbox">...</div>
</Transition>
```

### 5b. CSS

```css
.lightbox-enter-active { transition: opacity var(--duration-slow) var(--ease-out-quart); }
.lightbox-leave-active { transition: opacity var(--duration-normal) var(--ease-out-quart); }
.lightbox-enter-from, .lightbox-leave-to { opacity: 0; }

.lightbox-image-enter-active { transition: opacity var(--duration-normal) var(--ease-out-quart),
                                           transform var(--duration-normal) var(--ease-out-quart); }
.lightbox-image-enter-from { opacity: 0; transform: scale(0.95); }
```

### 5c. 灯箱按钮

- SVG Close：hover rotate(90deg)
- SVG 箭头：hover translateX(±2px)

---

## Workstream 6：导航改进

**File:** `packages/site-astro/src/components/TopNav.astro`

### 6a. 当前页指示器

- `Astro.url.pathname` 判断当前路径
- `.nav-link.active::after` — 4px 圆点（`--color-primary`）
- `aria-current="page"` 属性

### 6b. 汉堡 → X

```css
.menu-toggle-input:checked ~ .mobile-toggle .toggle-bar { background: transparent; }
.menu-toggle-input:checked ~ .mobile-toggle .toggle-bar::before { top:0; transform: rotate(45deg); }
.menu-toggle-input:checked ~ .mobile-toggle .toggle-bar::after { top:0; transform: rotate(-45deg); }
```

### 6c. 滚动阴影

- `<script>` 监听 scroll，`scrollY > 10` 添加 `.scrolled`
- `.top-nav.scrolled { box-shadow: var(--shadow-nav-scroll) }`

---

## Workstream 7：骨架屏 Loading

### 7a. Skeleton 组件

**新建:** `packages/site-astro/src/components/Skeleton.astro`

Props: `width`, `height`, `borderRadius` — 使用 `shimmer` keyframe

### 7b. SkeletonCard 组件

**新建:** `packages/site-astro/src/components/SkeletonCard.astro`

模拟 classmate-card 布局

### 7c. 应用

- `MessageWall.vue`：3 个骨架消息
- `DashboardView.vue`：3 个骨架统计卡
- `StudentsView.vue`、`AlbumsView.vue`：骨架行

### 7d. 按钮加载旋转器

```css
.btn-loading::after { content:''; width:14px; height:14px; border:2px solid rgba(255,255,255,.3);
  border-top-color:#fff; border-radius:50%; animation:spin .6s linear infinite; margin-left:6px; }
```

---

## Workstream 8：管理后台改进

### 8a. Toast

- `<Transition name="toast">` — 退出时上滑消失
- `--shadow-elevated` + `--z-toast`

### 8b. 卡片 hover

- `.card:hover { translateY(-2px); box-shadow: var(--shadow-card-hover) }`

### 8c. 侧边栏导航

- `.router-link-active::before` — 左侧 3px 竖线（`--color-primary`）

### 8d. 模态框

- `<Transition name="modal">` — 遮罩 fade + 内部卡片 scale(0.95)+translateY(8px) 弹入

### 8e. 侧边栏折叠

- `transition: width var(--duration-normal) var(--ease-out-quart)`

### 8f. focus-visible

- 所有按钮、输入框、导航项添加 focus-visible 环

---

## 实施顺序

1. **WS 1** Token → 必须先落地
2. **WS 2** SVG 图标 → 可与 3-8 并行
3. **WS 3** 滚动渐显 → 依赖 Token
4. **WS 4** 组件动画 → 依赖 Token（最大工作流）
5. **WS 5** 灯箱 → 依赖 Token + SVG
6. **WS 6** 导航 → 依赖 Token + SVG
7. **WS 7** 骨架屏 → 依赖 Token shimmer
8. **WS 8** 管理后台 → 依赖 Token

---

## 关键修改文件

### 修改

| 文件 | 改动 |
|------|------|
| `packages/shared/src/tokens.css` | Shadow/Transition/Z-index Token + reduced-motion |
| `packages/site-astro/src/styles/tokens.css` | 同步副本 |
| `packages/site-astro/src/styles/global.css` | @keyframes、fade-in、按钮/输入/卡片 |
| `packages/admin/src/styles/admin.css` | @keyframes、toast/modal/card/focus |
| `packages/site-astro/src/components/TopNav.astro` | 导航指示器/汉堡动画/滚动阴影/品牌 SVG |
| `packages/site-astro/src/components/AlbumGrid.vue` | 灯箱动画 + SVG 图标 |
| `packages/site-astro/src/components/PhotoWall.vue` | hover 统一 |
| `packages/site-astro/src/components/MessageWall.vue` | TransitionGroup |
| `packages/site-astro/src/components/RosterSearch.vue` | 搜索过滤动画 |
| `packages/site-astro/src/components/NameGate.vue` | 入场动画 |
| `packages/site-astro/src/layouts/MainLayout.astro` | ScrollReveal 引入 |
| `packages/site-astro/src/pages/*.astro` | fade-in 类（6 个页面） |
| `packages/admin/src/views/AdminLayout.vue` | SVG 图标 + 导航动画 |
| `packages/admin/src/views/StudentsView.vue` | 模态框 Transition |
| `packages/admin/src/views/AlbumsView.vue` | 模态框 Transition |
| `packages/site-astro/src/components/StudentHero.astro` | Star SVG |

### 新建

| 文件 | 用途 |
|------|------|
| `packages/site-astro/src/components/ScrollReveal.astro` | IntersectionObserver 滚动渐显 |
| `packages/site-astro/src/components/Skeleton.astro` | 可复用骨架块 |
| `packages/site-astro/src/components/SkeletonCard.astro` | 骨架卡片 |
| `packages/site-astro/src/components/icons/*.astro` | 6 个公开站 SVG 图标 |
| `packages/admin/src/components/icons/*.astro` | 7 个后台 SVG 图标 |

---

## 验证方法

```bash
pnpm --filter site-astro build    # Astro SSG 构建
pnpm --filter admin build         # TypeScript 检查
pnpm --filter worker test         # Worker 测试不受影响
```

手动验证清单：
- [ ] 滚动页面各 section 依次淡入上移
- [ ] 同学录卡片 hover 有 -3px 提升 + 阴影
- [ ] 相册灯箱有遮罩淡入 + 图片缩放进入
- [ ] 汉堡菜单点击旋转为 X
- [ ] 导航当前页有圆点指示器
- [ ] 后台侧边栏有 active 竖线
- [ ] 后台模态框有缩放弹入动画
- [ ] 系统"减少动态效果"时所有动画为瞬时
