# 同学录核心动效与夜读模式实施计划

> **面向执行型代理：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务执行。步骤以复选框追踪。

**目标：** 在不改变同学录数据模型和页面信息架构的前提下，实现方向感页面转场、一级栏目共享标题变形，以及可持久化的夜读水波主题切换。

**架构：** 延续 Astro `ClientRouter` 与现有 View Transitions。用一个可复用的 `PageHeader` 组件为普通栏目页提供唯一的 `page-heading` 共享元素；用一个小型原生 TypeScript 运行时绑定主题按钮、持久化主题并在支持时触发根级圆形揭幕。主题颜色只通过现有 CSS 设计令牌覆盖，不引入新动画库或改变 Worker/API。

**技术栈：** Astro 5、Vue islands、TypeScript、原生 View Transitions API、CSS keyframes、Vitest、Playwright。

---

## 范围拆分

此计划只实现用户最明确偏好的“动效核心”：导航/页面/标题转场与夜读水波。卡片元信息（照片数、留言数、共同标签）、跨页面卡片表面统一、长档案目录是相互独立的内容与布局改动，保留在设计规格中，另立第二阶段计划，避免把首次动效发布扩大成数据与多个 Vue 组件的重构。

## 文件结构

- 新建：`packages/site-astro/src/components/PageHeader.astro` — 统一普通栏目页的标签、标题、简介，以及 `page-heading` 共享元素边界。
- 新建：`packages/site-astro/src/scripts/themeRuntime.ts` — 只负责读取、写入、应用和切换 `paper`/`night` 主题；不负责导航或页面入场。
- 修改：`packages/site-astro/src/layouts/MainLayout.astro` — 首帧主题初始化、主题运行时生命周期、共享导航顺序。
- 修改：`packages/site-astro/src/components/TopNav.astro` — 桌面/移动端主题按钮与首页未登录状态布局。
- 修改：`packages/site-astro/src/styles/tokens.css` — `html[data-theme='night']` 的令牌覆盖。
- 修改：`packages/site-astro/src/styles/global.css` — `page-heading` 共享标题、文字扫光、主题根揭幕和减少动态偏好回退。
- 修改：`packages/site-astro/src/pages/preface.astro`、`roster.astro`、`class-space.astro`、`album.astro`、`timeline.astro`、`more.astro` — 使用统一 `PageHeader`；`yearbook.astro`、学生详情、信箱、账号页不使用共享标题。
- 新建：`packages/site-astro/tests/motion-theme-static.test.ts` — 静态回归，验证运行时边界、页面接入和 CSS 回退。
- 新建：`packages/site-astro/tests/motion-theme-flow.spec.ts` — 浏览器回归，验证主题持久化、减少动态偏好和栏目标题共享元素。

### Task 1：为主题运行时建立失败测试

**文件：**

- 新建：`packages/site-astro/tests/motion-theme-static.test.ts`
- 新建：`packages/site-astro/src/scripts/themeRuntime.ts`

- [ ] **步骤 1：写入失败测试，锁定主题状态和运行时边界。**

```ts
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const src = (file: string) => resolve(__dirname, '../src', file)
const read = (file: string) => readFileSync(src(file), 'utf-8')

describe('动效与主题运行时', () => {
  it('provides one focused runtime for the persisted paper/night theme', () => {
    const runtimePath = src('scripts/themeRuntime.ts')
    expect(existsSync(runtimePath)).toBe(true)

    const runtime = read('scripts/themeRuntime.ts')
    expect(runtime).toContain("export type AlumniTheme = 'paper' | 'night'")
    expect(runtime).toContain("const themeStorageKey = 'alumni_theme'")
    expect(runtime).toContain('export function initThemeRuntime')
    expect(runtime).toContain('document.startViewTransition')
    expect(runtime).toContain("'[data-theme-toggle]'")
    expect(runtime).toContain("prefers-reduced-motion: reduce")
  })
})
```

- [ ] **步骤 2：运行测试，确认它因运行时尚不存在而失败。**

运行：`pnpm --filter site-astro exec vitest run tests/motion-theme-static.test.ts`

预期：失败，断言 `themeRuntime.ts` 不存在。

- [ ] **步骤 3：实现最小主题运行时。**

在 `packages/site-astro/src/scripts/themeRuntime.ts` 写入以下完整实现；运行时仅绑定当前文档中的主题按钮，Astro 换页后由布局重新初始化：

```ts
export type AlumniTheme = 'paper' | 'night'

const themeStorageKey = 'alumni_theme'

declare global {
  interface Window {
    __alumniThemeRuntime?: { destroy(): void }
  }
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readTheme(): AlumniTheme {
  const stored = window.localStorage.getItem(themeStorageKey)
  if (stored === 'paper' || stored === 'night') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'paper'
}

function applyTheme(theme: AlumniTheme, persist = true) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#20252d' : '#f4eddf')
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-pressed', String(theme === 'night'))
    button.setAttribute('aria-label', theme === 'night' ? '切换为纸页模式' : '切换为夜读模式')
  })
  if (persist) window.localStorage.setItem(themeStorageKey, theme)
}

function switchFrom(button: HTMLButtonElement) {
  const next: AlumniTheme = readTheme() === 'night' ? 'paper' : 'night'
  if (prefersReducedMotion() || !document.startViewTransition) {
    applyTheme(next)
    return
  }

  const { left, top, width, height } = button.getBoundingClientRect()
  const x = left + width / 2
  const y = top + height / 2
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  const transition = document.startViewTransition(() => applyTheme(next))
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
    )
  })
}

export function initThemeRuntime() {
  window.__alumniThemeRuntime?.destroy()
  applyTheme(readTheme(), false)

  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]'))
  const onClick = (event: Event) => switchFrom(event.currentTarget as HTMLButtonElement)
  buttons.forEach((button) => button.addEventListener('click', onClick))

  window.__alumniThemeRuntime = {
    destroy() {
      buttons.forEach((button) => button.removeEventListener('click', onClick))
    },
  }
}
```

- [ ] **步骤 4：运行测试，确认主题运行时契约通过。**

运行：`pnpm --filter site-astro exec vitest run tests/motion-theme-static.test.ts`

预期：通过 1 个测试。

- [ ] **步骤 5：提交主题运行时的最小实现。**

```bash
git add packages/site-astro/src/scripts/themeRuntime.ts packages/site-astro/tests/motion-theme-static.test.ts
git commit -m "feat(site): add persisted theme runtime"
```

### Task 2：接入首帧主题与可访问主题按钮

**文件：**

- 修改：`packages/site-astro/src/layouts/MainLayout.astro`
- 修改：`packages/site-astro/src/components/TopNav.astro`
- 修改：`packages/site-astro/tests/motion-theme-static.test.ts`

- [ ] **步骤 1：扩展失败测试，要求首帧主题初始化和双端按钮。**

在同一测试文件新增：

```ts
it('sets the initial theme before paint and exposes an accessible toggle in navigation', () => {
  const layout = read('layouts/MainLayout.astro')
  const nav = read('components/TopNav.astro')

  expect(layout).toContain('is:inline')
  expect(layout).toContain("const storageKey = 'alumni_theme'")
  expect(layout).toContain("document.documentElement.dataset.theme = theme")
  expect(layout).toContain("import { initThemeRuntime } from '../scripts/themeRuntime'")
  expect(layout).toContain('initThemeRuntime()')
  expect(nav.match(/data-theme-toggle/g)?.length).toBe(2)
  expect(nav).toContain('aria-label="切换为夜读模式"')
})
```

- [ ] **步骤 2：运行测试，确认布局和导航尚未满足新契约。**

运行：`pnpm --filter site-astro exec vitest run tests/motion-theme-static.test.ts`

预期：失败，提示缺少内联初始化和 `data-theme-toggle`。

- [ ] **步骤 3：在布局头部同步主题，并在 Astro 生命周期绑定运行时。**

在 `MainLayout.astro` 的 `<head>`、全局样式加载之后放置以下内联脚本；它不得等待 Vue island 或普通模块脚本：

```astro
<meta name="theme-color" content="#f4eddf" />
<script is:inline>
  (() => {
    const storageKey = 'alumni_theme'
    const stored = localStorage.getItem(storageKey)
    const theme = stored === 'paper' || stored === 'night'
      ? stored
      : matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'paper'
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#20252d' : '#f4eddf')
  })()
</script>
```

在现有页面脚本中增加：

```ts
import { initThemeRuntime } from '../scripts/themeRuntime'

initThemeRuntime()
document.addEventListener('astro:before-swap', () => window.__alumniThemeRuntime?.destroy())
document.addEventListener('astro:page-load', () => initThemeRuntime())
```

主题运行时必须与 `initNavRuntime()` 并列调用，不得放入 `navRuntime.ts`；两者的职责不同。

- [ ] **步骤 4：在 `TopNav.astro` 增加主题按钮和移动布局。**

在 `.nav-utilities` 中、账号和信箱按钮之前加入桌面按钮：

```astro
<button class="nav-theme-button" type="button" data-theme-toggle aria-label="切换为夜读模式" aria-pressed="false" title="切换夜读模式">
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.64 5.64l1.77 1.77M16.59 16.59l1.77 1.77M18.36 5.64l-1.77 1.77M7.41 16.59l-1.77 1.77" />
    <circle cx="12" cy="12" r="3.5" />
  </svg>
</button>
```

在移动导航的右侧保留第二个同样的 `data-theme-toggle` 按钮，使用相同 SVG 和可访问标签；桌面按钮在 `max-width: 768px` 隐藏，移动按钮在桌面隐藏。把移动 `.nav-inner` 网格改为 `44px minmax(0, 1fr) auto`，并让 `.nav-utilities` 的主题与信箱按钮各占 44px。首页未登录状态保留主题按钮：品牌绝对居中，工具组贴右，账号和信箱仍遵循其既有 `hidden` 状态。

- [ ] **步骤 5：运行静态测试，确认初始状态和控件接入。**

运行：`pnpm --filter site-astro exec vitest run tests/motion-theme-static.test.ts`

预期：通过 2 个测试。

- [ ] **步骤 6：提交主题首帧与导航控件。**

```bash
git add packages/site-astro/src/layouts/MainLayout.astro packages/site-astro/src/components/TopNav.astro packages/site-astro/tests/motion-theme-static.test.ts
git commit -m "feat(site): add accessible night theme toggle"
```

### Task 3：实现夜读令牌与水波根级样式

**文件：**

- 修改：`packages/site-astro/src/styles/tokens.css`
- 修改：`packages/site-astro/src/styles/global.css`
- 修改：`packages/site-astro/tests/motion-theme-static.test.ts`

- [ ] **步骤 1：扩展失败测试，锁定令牌覆盖和水波回退。**

```ts
it('keeps night mode token-based and isolates the root ripple from the mailbox ripple', () => {
  const tokens = read('styles/tokens.css')
  const global = read('styles/global.css')

  expect(tokens).toContain("html[data-theme='night']")
  expect(tokens).toContain('--color-paper-bg: #20252d')
  expect(tokens).toContain('--color-paper-card: #28313c')
  expect(global).toContain('html.theme-transition::view-transition-new(root)')
  expect(global).toContain('html[data-theme=\'night\'] .page-shell')
  expect(global).toContain('prefers-reduced-motion: reduce')
  expect(global).toContain('html.vt-mailbox::view-transition-new(root)')
})
```

- [ ] **步骤 2：运行测试，确认夜读变量和主题根规则尚不存在。**

运行：`pnpm --filter site-astro exec vitest run tests/motion-theme-static.test.ts`

预期：失败，提示缺少 `html[data-theme='night']` 选择器。

- [ ] **步骤 3：添加完整夜读令牌覆盖。**

在 `tokens.css` 最后一个 `:root` 规则之后添加：

```css
html[data-theme='night'] {
  --color-canvas: #20252d;
  --color-surface-soft: #252e38;
  --color-surface-card: #28313c;
  --color-surface-cream: #222a34;
  --color-surface-cream-strong: #34404d;
  --color-ink: #f4ead9;
  --color-body-strong: #eee2cf;
  --color-body: #d7cab6;
  --color-muted: #b4a790;
  --color-muted-soft: #938876;
  --color-hairline: #4b5865;
  --color-hairline-soft: #3c4855;
  --color-paper-bg: #20252d;
  --color-paper-bg-soft: #252e38;
  --color-paper-card: #28313c;
  --color-paper-card-muted: #303b47;
  --color-paper-border: #52606c;
  --color-paper-border-soft: #43505d;
  --color-paper-ink: #f4ead9;
  --color-paper-ink-soft: #d2c4af;
  --color-paper-muted: #ae9f89;
  --color-paper-brown: #d2a56d;
  --color-paper-brown-active: #e2bd88;
  --color-paper-brown-soft: #7c6a55;
  --color-paper-gold: #ddbd78;
  --color-paper-stamp-red: #d37a67;
  --shadow-paper-panel: 0 16px 42px rgba(0, 0, 0, 0.26);
  --shadow-paper-card: 0 10px 26px rgba(0, 0, 0, 0.2);
  --texture-paper-fiber: radial-gradient(circle at 20% 20%, rgba(225, 189, 120, 0.05), transparent 24%), linear-gradient(rgba(244, 234, 217, 0.028) 1px, transparent 1px);
}
```

- [ ] **步骤 4：隔离主题水波样式。**

在 `themeRuntime.ts` 的 `switchFrom` 中，`document.startViewTransition` 前添加 `document.documentElement.classList.add('theme-transition')`，并在 `transition.finished.finally(() => document.documentElement.classList.remove('theme-transition'))` 中清除。然后在 `global.css` 的既有 `vt-mailbox` 规则之后添加：

```css
html.theme-transition::view-transition-old(root) {
  animation: none;
  z-index: 1;
}

html.theme-transition::view-transition-new(root) {
  animation: none;
  z-index: 2147483646;
}

html[data-theme='night'] .page-shell {
  background-color: var(--color-paper-bg);
}

@media (prefers-reduced-motion: reduce) {
  html.theme-transition::view-transition-old(root),
  html.theme-transition::view-transition-new(root) {
    animation: none !important;
  }
}
```

不要在 CSS 中创建无限循环水波；圆形路径只由 Task 1 的一次性 Web Animations API 调用控制。

- [ ] **步骤 5：运行静态测试，确认夜读与信箱水波可共存。**

运行：`pnpm --filter site-astro exec vitest run tests/motion-theme-static.test.ts`

预期：通过 3 个测试。

- [ ] **步骤 6：提交主题令牌和水波隔离规则。**

```bash
git add packages/site-astro/src/styles/tokens.css packages/site-astro/src/styles/global.css packages/site-astro/src/scripts/themeRuntime.ts packages/site-astro/tests/motion-theme-static.test.ts
git commit -m "feat(site): add night theme ripple transition"
```

### Task 4：为普通栏目页建立共享标题组件

**文件：**

- 新建：`packages/site-astro/src/components/PageHeader.astro`
- 修改：`packages/site-astro/src/pages/preface.astro`
- 修改：`packages/site-astro/src/pages/roster.astro`
- 修改：`packages/site-astro/src/pages/class-space.astro`
- 修改：`packages/site-astro/src/pages/album.astro`
- 修改：`packages/site-astro/src/pages/timeline.astro`
- 修改：`packages/site-astro/src/pages/more.astro`
- 修改：`packages/site-astro/tests/motion-theme-static.test.ts`

- [ ] **步骤 1：扩展失败测试，要求有且仅有一套共享标题入口。**

```ts
it('uses one shared page-heading only on ordinary content-page headers', () => {
  const headerPath = src('components/PageHeader.astro')
  expect(existsSync(headerPath)).toBe(true)
  const header = read('components/PageHeader.astro')
  expect(header).toContain('view-transition-name: page-heading')
  expect(header).toContain('page-header__title-sweep')

  for (const page of ['preface.astro', 'roster.astro', 'class-space.astro', 'album.astro', 'timeline.astro', 'more.astro']) {
    expect(read(`pages/${page}`)).toContain("import PageHeader from '../components/PageHeader.astro'")
    expect(read(`pages/${page}`)).toContain('<PageHeader')
  }

  expect(read('pages/yearbook.astro')).not.toContain('page-heading')
  expect(read('pages/mailbox.astro')).not.toContain('page-heading')
})
```

- [ ] **步骤 2：运行测试，确认组件和迁移尚未存在。**

运行：`pnpm --filter site-astro exec vitest run tests/motion-theme-static.test.ts`

预期：失败，提示 `PageHeader.astro` 不存在。

- [ ] **步骤 3：创建 `PageHeader.astro`。**

```astro
---
interface Props {
  label: string
  title: string
  subtitle?: string
  shared?: boolean
}

const { label, title, subtitle, shared = true } = Astro.props
const transitionStyle = shared ? 'view-transition-name: page-heading' : undefined
---

<header class="page-header fade-in">
  <p class="page-header__label">{label}</p>
  <div class="page-header__title-wrap" style={transitionStyle} data-page-heading={shared ? '' : undefined}>
    <h1 class="display-lg">{title}</h1>
    <span class="page-header__title-sweep" aria-hidden="true"></span>
  </div>
  {subtitle && <p class="page-header__subtitle">{subtitle}</p>}
</header>
```

- [ ] **步骤 4：迁移六个普通栏目页。**

每个页面在 `MainLayout` import 之后添加 `PageHeader` import；将原 `<header class="page-header fade-in">…</header>` 替换为下列形式，保留其余 API 获取、island 和页面容器：

```astro
<PageHeader
  label="ARCHIVE CORRIDOR"
  title="人物长廊"
  subtitle="用档案检索重新遇见每一位同学"
/>
```

对应属性固定为：

| 页面 | label | title | subtitle |
| --- | --- | --- | --- |
| `preface.astro` | `PREFACE LETTER` | `{config.preface?.title || '致青春岁月'}` | `{config.preface?.subtitle || '写在翻开同学录之前'}` |
| `roster.astro` | `ARCHIVE CORRIDOR` | `人物长廊` | `用档案检索重新遇见每一位同学` |
| `class-space.astro` | `CLASS SPACE` | `班级空间` | `汇聚班级温情，留存青春足迹` |
| `album.astro` | `IMAGE GALLERY` | `影像馆` | `每一幅影像，都是一段珍贵的回忆` |
| `timeline.astro` | `CLASS TIMELINE` | `时光轴` | `把重要瞬间按时间慢慢装订成册` |
| `more.astro` | `FURTHER CHAPTERS` | `更多功能` | `新的章节正在整理，敬请期待。` |

不迁移 `yearbook.astro`，因为它是可打印封面；不迁移学生详情，避免和 `active-card` 共享元素转场冲突；不迁移信箱与账号页，它们不是该组“栏目标题变形”的一部分。

- [ ] **步骤 5：运行静态测试，确认所有共享标题边界正确。**

运行：`pnpm --filter site-astro exec vitest run tests/motion-theme-static.test.ts`

预期：通过 4 个测试。

- [ ] **步骤 6：提交标题组件和页面迁移。**

```bash
git add packages/site-astro/src/components/PageHeader.astro packages/site-astro/src/pages/preface.astro packages/site-astro/src/pages/roster.astro packages/site-astro/src/pages/class-space.astro packages/site-astro/src/pages/album.astro packages/site-astro/src/pages/timeline.astro packages/site-astro/src/pages/more.astro packages/site-astro/tests/motion-theme-static.test.ts
git commit -m "feat(site): share ordinary page headings in transitions"
```

### Task 5：实现共享标题的换写、扫光与页面文字节奏

**文件：**

- 修改：`packages/site-astro/src/styles/global.css`
- 修改：`packages/site-astro/src/layouts/MainLayout.astro`
- 修改：`packages/site-astro/tests/motion-theme-static.test.ts`

- [ ] **步骤 1：扩展失败测试，锁定共享标题的前进/后退动画和导航顺序。**

```ts
it('animates the page-heading separately from page-main and shares the complete primary navigation order', () => {
  const global = read('styles/global.css')
  const layout = read('layouts/MainLayout.astro')

  expect(global).toContain('::view-transition-old(page-heading)')
  expect(global).toContain('::view-transition-new(page-heading)')
  expect(global).toContain('@keyframes page-heading-enter-right')
  expect(global).toContain('@keyframes page-heading-exit-left')
  expect(global).toContain('@keyframes page-heading-sweep')
  expect(layout).toContain("'/class-space/'")
  expect(layout).toContain("'/yearbook/'")
  expect(layout).toContain("'/more/'")
})
```

- [ ] **步骤 2：运行测试，确认共享标题 CSS 和完整顺序尚不存在。**

运行：`pnpm --filter site-astro exec vitest run tests/motion-theme-static.test.ts`

预期：失败，提示缺少 `page-heading` 伪元素规则。

- [ ] **步骤 3：补齐 `MainLayout.astro` 的导航顺序。**

将现有只含首页、前言、档案、相册、时间轴、信箱的 `order` 替换为：

```ts
const order = ['/', '/preface/', '/roster/', '/class-space/', '/yearbook/', '/more/']
```

`/album/`、`/timeline/`、`/mailbox/` 不是一级栏目时不参与前后方向判定，保持当前的默认 View Transition 行为。不要把 `navItems` 从 Astro 组件跨运行时导入；数组相同但层级职责不同，避免前端运行时引用 `.astro` 模块。

- [ ] **步骤 4：在 `global.css` 添加共享标题动画。**

紧接现有 `page-main` 前进/后退规则添加：

```css
::view-transition-group(page-heading) {
  animation-duration: 0.34s;
  animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
}

html[data-nav-dir='forward']::view-transition-old(page-heading) { animation: 0.22s cubic-bezier(0.22, 1, 0.36, 1) both page-heading-exit-left; }
html[data-nav-dir='forward']::view-transition-new(page-heading) { animation: 0.34s cubic-bezier(0.22, 1, 0.36, 1) both page-heading-enter-right; }
html[data-nav-dir='back']::view-transition-old(page-heading) { animation: 0.22s cubic-bezier(0.22, 1, 0.36, 1) both page-heading-exit-right; }
html[data-nav-dir='back']::view-transition-new(page-heading) { animation: 0.34s cubic-bezier(0.22, 1, 0.36, 1) both page-heading-enter-left; }

@keyframes page-heading-exit-left { to { opacity: 0; transform: translateX(-12px); filter: blur(2px); } }
@keyframes page-heading-enter-right { from { opacity: 0; transform: translateX(12px); filter: blur(3px); } to { opacity: 1; transform: translateX(0); filter: blur(0); } }
@keyframes page-heading-exit-right { to { opacity: 0; transform: translateX(12px); filter: blur(2px); } }
@keyframes page-heading-enter-left { from { opacity: 0; transform: translateX(-12px); filter: blur(3px); } to { opacity: 1; transform: translateX(0); filter: blur(0); } }

.page-header__title-wrap { position: relative; display: inline-block; }
.page-header__title-sweep { position: absolute; inset: auto 0 -7px; height: 2px; background: linear-gradient(90deg, transparent, var(--color-paper-gold), transparent); transform: scaleX(0); transform-origin: left; animation: page-heading-sweep 0.68s 0.12s cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes page-heading-sweep { 0% { opacity: 0; transform: scaleX(0); } 45% { opacity: 0.85; transform: scaleX(1); } 100% { opacity: 0; transform: scaleX(1); } }

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(page-heading),
  ::view-transition-old(page-heading),
  ::view-transition-new(page-heading),
  .page-header__title-sweep { animation: none !important; }
}
```

现有通用 `.fade-in` 保留，但标题共享元素的动画由上述 View Transition 规则优先承担；不得对正文段落、搜索结果或聊天内容增加逐字动画。

- [ ] **步骤 5：运行静态测试，确认共享标题 CSS 和方向顺序通过。**

运行：`pnpm --filter site-astro exec vitest run tests/motion-theme-static.test.ts`

预期：通过 5 个测试。

- [ ] **步骤 6：提交共享标题视觉效果。**

```bash
git add packages/site-astro/src/styles/global.css packages/site-astro/src/layouts/MainLayout.astro packages/site-astro/tests/motion-theme-static.test.ts
git commit -m "feat(site): animate shared page headings"
```

### Task 6：添加浏览器回归并完成验证

**文件：**

- 新建：`packages/site-astro/tests/motion-theme-flow.spec.ts`
- 修改：`packages/site-astro/package.json`

- [ ] **步骤 1：写入浏览器测试。**

```ts
import { expect, test } from '@playwright/test'

async function signInForNavigation(page: import('@playwright/test').Page) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学', slug: 'test_init', avatarUrl: null }))
  })
}

test('primary navigation shares the page-heading between roster and class space', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })
  await expect(page.locator('[data-page-heading]')).toHaveCount(1)
  await expect(page.locator('[data-page-heading]')).toHaveCSS('view-transition-name', 'page-heading')

  await page.getByRole('link', { name: '班级空间', exact: true }).click()
  await expect(page).toHaveURL(/\/class-space\/?$/)
  await expect(page.locator('[data-page-heading] h1')).toHaveText('班级空间')
  await expect(page.locator('[data-page-heading]')).toHaveCSS('view-transition-name', 'page-heading')
})

test('theme toggle persists the night selection and keeps the button state synchronized', async ({ page }) => {
  await page.goto('./')
  const toggle = page.locator('[data-theme-toggle]').first()
  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
})

test.describe('减少动态偏好', () => {
  test.use({ reducedMotion: 'reduce' })

  test('switches the theme without leaving a transition class behind', async ({ page }) => {
    await page.goto('./')
    await page.locator('[data-theme-toggle]').first().click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'night')
    await expect(page.locator('html')).not.toHaveClass(/theme-transition/)
  })
})
```

- [ ] **步骤 2：把该 spec 加入预览测试脚本。**

在 `package.json` 的 `test:perf-network` 值末尾加入 `tests/motion-theme-flow.spec.ts`，使既有 `run-playwright-preview.ts` 能在构建产物上执行它。

- [ ] **步骤 3：先运行新 spec，确认在实现完成前的预览基线会失败。**

运行：`pnpm --filter site-astro exec playwright test tests/motion-theme-flow.spec.ts`

预期：若本地 `dist` 是旧构建，主题按钮和 `data-page-heading` 缺失导致失败；不要将该失败视为代码问题。

- [ ] **步骤 4：构建并运行所有直接相关验证。**

运行：

```bash
pnpm --filter site-astro build
pnpm --filter site-astro exec vitest run tests/motion-theme-static.test.ts tests/navigation-marker-direction.spec.ts
pnpm --filter site-astro typecheck
pnpm --filter site-astro exec playwright test tests/motion-theme-flow.spec.ts tests/navigation-marker-direction.spec.ts
```

预期：全部通过。若构建因现有线上数据或环境变量失败，记录完整命令与失败原因，再运行不依赖构建的静态 Vitest 与类型检查；不得用跳过测试替代验证。

- [ ] **步骤 5：人工视觉验收。**

在 1440px 和 390px 宽度分别验证：

1. 人物长廊 → 班级空间的标题在同一位置连续换写，页面方向正确，正文没有逐字晃动。
2. 点击主题按钮时水波从按钮中心覆盖页面；再次点击可返回纸页主题。
3. 刷新后主题不闪白；未登录首页仍可切换主题。
4. 系统减少动态偏好下，标题与主题均直接到最终状态。
5. 信箱入口的现有圆形转场、档案卡到详情页的现有共享元素转场仍正常。

- [ ] **步骤 6：提交测试与验证脚本接入。**

```bash
git add packages/site-astro/tests/motion-theme-flow.spec.ts packages/site-astro/tests/motion-theme-static.test.ts packages/site-astro/package.json
git commit -m "test(site): cover theme and shared heading transitions"
```

## 实施后交接

完成此计划后，下一阶段另立计划处理卡片三级反馈、档案探索线索和长档案目录。它们不应与主题和路由动效同批实现，以便任何动效回归都能快速定位。
