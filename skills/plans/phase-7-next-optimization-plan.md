# Phase 7: 新版验收后的分步优化计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task. Keep each task independently verifiable. Do not batch unrelated refactors.

**Goal:** 将当前新版同学录从“功能已扩展但体验和链路不稳定”的状态，推进到“动画流畅、前后台数据贯通、新功能完整显现、测试可守护”的稳定版本。

**Architecture:** 本阶段不重写项目架构。继续沿用 Astro 5 SSG + Vue islands + Vue Admin SPA + Cloudflare Worker + D1/R2。优化顺序以用户已经遇到的问题为中心：先解决动画重复和跳变，再统一数据连通，再补齐新增功能显示闭环，最后做体验增强和质量门禁。

**Tech Stack:** Astro 5 + Vue 3 + Vite + TypeScript + Cloudflare Workers (Hono) + D1 + R2 + Vitest + GitHub Pages

---

## 1. 背景与当前问题

本轮检查确认：新版已经加入了留言墙增强、个人小传、自助编辑、排行榜、年度册、隐私级别、相册增强等功能雏形，但它们之间还没有形成稳定闭环。

用户实际遇到的问题可以归为三类：

| 类别 | 用户现象 | 代码层原因 | 影响 |
|---|---|---|---|
| 动画重复与卡顿 | 页面加载时重复动画、跳变、卡顿 | `ScrollReveal.astro`、全局 GSAP、组件级 GSAP 同时接管同一批元素；SWR 数据刷新后重复触发动画 | 首屏不稳、列表闪烁、移动端卡顿 |
| 数据连通不完整 | 后台配置了，但前台部分功能不可用或不显示 | 前台 Vue 组件读取 API base 的方式不一致；部分组件没有接收父级传入的 `apiBase` | GitHub Pages、非主域名、本地 Worker 联调时容易请求错 API |
| 新功能未完整显现 | 新增功能不够丰富，部分入口隐藏或体验弱 | 后台、Worker、前台页面、导航、测试之间缺少字段矩阵和验收链路 | 功能像半成品，维护时难判断哪里断了 |

---

## 2. 总体优先级

| 阶段 | 主题 | 优先级 | 目标 |
|---|---|---|---|
| P0 | 稳定性止血 | 必做 | 修复动画重复、API base 不一致、站点测试失败 |
| P1 | 数据闭环 | 必做 | 建立后台字段到前台显示的完整映射和测试 |
| P2 | 新功能显性化 | 重要 | 让留言、年度册、排行榜、小传、相册增强成为用户能感知的功能 |
| P3 | 体验与性能 | 重要 | 优化移动端、空状态、骨架屏、图片加载和动效质感 |
| P4 | 运营与长期质量 | 后续 | 增加内容审计、备份、监控、质量门禁 |

---

## 3. 文件影响范围

重点文件：

- Modify: `packages/site-astro/src/layouts/MainLayout.astro` - 收敛全局动画入口。
- Modify: `packages/site-astro/src/components/ScrollReveal.astro` - 移除或改为降级 fallback。
- Modify: `packages/site-astro/src/scripts/animations.ts` - 改成唯一全局动画调度器。
- Modify: `packages/site-astro/src/components/StudentProfile.vue` - 修复重复动画、SWR 刷新、子组件 API base 传递。
- Modify: `packages/site-astro/src/components/RosterWall.vue` - 搜索和刷新时避免整批卡片闪烁。
- Modify: `packages/site-astro/src/components/MessageWall.vue` - 接收 `apiBase`，补齐留言交互状态。
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue` - 接收 `apiBase`，保存后刷新父页面。
- Modify: `packages/site-astro/src/components/PhotoWall.vue` - 接收 `apiBase`，修复照片 URL。
- Modify: `packages/site-astro/src/components/RankingsPanel.vue` - 改为标准 Vue island 数据注入。
- Modify: `packages/site-astro/src/components/AlbumGrid.vue` - 统一 API base 与相册空状态。
- Modify: `packages/site-astro/src/components/TopNav.astro` - 增加年度册或更多入口。
- Modify: `packages/site-astro/src/pages/roster.astro` - 移除手动 `createApp`，统一 islands。
- Modify: `packages/site-astro/src/pages/album.astro` - 移除手动 `createApp`，统一 islands。
- Modify: `packages/site-astro/src/pages/yearbook.astro` - 从隐藏页升级为正式功能页。
- Modify: `packages/site-astro/tests/navigation.test.ts` - 修复测试内构建竞态。
- Create: `packages/site-astro/src/utils/apiBase.ts` - 统一前台客户端 API 地址解析。
- Create: `docs/feature-field-matrix.md` - 后台字段、Worker API、前台展示、测试矩阵。
- Create: `packages/site-astro/tests/api-base.test.ts` - API base 静态与运行时检查。
- Create: `packages/site-astro/tests/animation-static.test.ts` - 动画入口静态约束测试。

---

## 4. P0：稳定性止血

### Task 1: 收敛动画系统，解决重复加载与跳变

**Problem:** 当前同时存在三层动画控制：

- `ScrollReveal.astro` 使用 IntersectionObserver 给 `.fade-in` 加 `.visible`。
- `scripts/animations.ts` 使用 GSAP `ScrollTrigger.batch()` 处理 `.fade-in`。
- 多个 Vue/Astro 页面组件单独导入 GSAP，处理 `.classmate-card`、`.msg-item`、`.photo-item`、`.timeline-node`、`.student-body`。

**Decision:** 只保留一个主动画系统。推荐保留 GSAP + ScrollTrigger，移除 `ScrollReveal.astro` 的 DOM 接管。

- [ ] Step 1: 从 `MainLayout.astro` 移除 `ScrollReveal` import 和组件渲染。
- [ ] Step 2: `animations.ts` 增加 idempotent guard，避免重复初始化：

```ts
let initialized = false

export function initAnimations() {
  if (initialized) return
  initialized = true
  // existing animation registration
}
```

- [ ] Step 3: 所有组件级 GSAP 改为局部 root ref，不使用全局选择器。
- [ ] Step 4: `StudentProfile.vue` 中动画只在首次有内容后执行一次；SWR 刷新只更新数据，不重新播放入场动画。
- [ ] Step 5: 组件卸载时清理 GSAP context 和 ScrollTrigger。
- [ ] Step 6: `prefers-reduced-motion` 下所有动画即时完成。

**Acceptance Criteria:**

- 页面刷新时 `.fade-in` 元素只由一个系统处理。
- 学生详情页不会在初始数据和 SWR 数据之间重复滑入。
- 搜索同学时卡片不会整体闪烁。
- `rg "ScrollReveal" packages/site-astro/src` 只在历史文档或删除记录中出现，不在运行页面中出现。

---

### Task 2: 修复学生详情页动画重复触发

**Files:**

- Modify: `packages/site-astro/src/components/StudentProfile.vue`

- [ ] Step 1: 新增 `animationReady` 或 `hasAnimated` ref。
- [ ] Step 2: `onMounted()` 里先使用 `initialStudent` 渲染，动画只在 `nextTick()` 后执行一次。
- [ ] Step 3: SWR fetch 成功后只替换 `student.value`，不调用完整入场动画。
- [ ] Step 4: 背景视差单独初始化，避免每次刷新注册新的 ScrollTrigger。

**Acceptance Criteria:**

- `triggerGSAPAnimations()` 不会在同一次 mount 中被调用两次。
- 滚动触发器不会随着 SWR 刷新重复增加。
- 学生页首屏无明显二次跳动。

---

### Task 3: 修复同学录列表搜索闪烁

**Files:**

- Modify: `packages/site-astro/src/components/RosterWall.vue`

- [ ] Step 1: 首次加载时允许卡片入场动画。
- [ ] Step 2: 搜索关键词变化时只做 CSS 过滤或轻量 transition，不执行 `gsap.set(cards, { autoAlpha: 0 })`。
- [ ] Step 3: SWR 刷新后只对新增卡片做动画，已有卡片保持位置和透明度。
- [ ] Step 4: 给卡片容器设置稳定 grid 尺寸，减少布局跳动。

**Acceptance Criteria:**

- 输入搜索关键词时已有卡片不会突然消失再出现。
- 数据刷新后不会造成全列表重放入场动画。

---

### Task 4: 统一前台客户端 API base

**Problem:** 父组件传了 `apiBase`，但部分子组件没有声明或使用该 prop。

已发现的直接问题：

- `MessageWall.vue` 没有接收 `apiBase`，仍读 `import.meta.env.VITE_API_BASE_URL || ''`。
- `SelfEditPanel.vue` 没有接收 `apiBase`。
- `PhotoWall.vue` 没有接收 `apiBase`。
- `roster.astro` 中 `RankingsPanel` 手动 `createApp`，并自行读取 env。
- `album.astro` 中 `AlbumGrid` 手动 `createApp`，并自行读取 env。

**Files:**

- Create: `packages/site-astro/src/utils/apiBase.ts`
- Modify: `packages/site-astro/src/components/MessageWall.vue`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/site-astro/src/components/PhotoWall.vue`
- Modify: `packages/site-astro/src/components/RankingsPanel.vue`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`

- [ ] Step 1: 新建统一 helper：

```ts
export function normalizeApiBase(apiBase?: string): string {
  return (apiBase || '').replace(/\/$/, '')
}

export function joinApiUrl(apiBase: string, path: string): string {
  const base = normalizeApiBase(apiBase)
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
```

- [ ] Step 2: 所有前台 Vue 组件显式声明：

```ts
const props = defineProps<{
  apiBase: string
}>()
```

如果组件已有其他 props，就合并进去。

- [ ] Step 3: 替换所有组件内部的：

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
```

改为使用 `props.apiBase`。

- [ ] Step 4: `PhotoWall.vue` 中照片 URL 使用 `props.apiBase`，并修复父级传参类型。
- [ ] Step 5: `MessageWall.vue` 和 `SelfEditPanel.vue` 中所有 fetch 都走 `joinApiUrl(props.apiBase, '/api/...')`。

**Acceptance Criteria:**

- `rg "VITE_API_BASE_URL \\|\\| ''" packages/site-astro/src/components` 无命中。
- GitHub Pages 子路径环境下，留言、自助编辑、照片墙、排行榜、相册都请求 Worker API。
- 本地 Worker 联调只需要配置一个明确的 `VITE_API_BASE_URL`。

---

### Task 5: 修复 site-astro 测试构建竞态

**Problem:** `navigation.test.ts` 的 `beforeAll()` 会删除 `.astro` 和 `dist`，然后在 Vitest 内部运行 `npx tsx scripts/fetch-data.ts && npx astro build`。当其他测试也读取 `dist` 时，容易出现构建产物被删除或读取半成品的问题。

**Files:**

- Modify: `packages/site-astro/tests/navigation.test.ts`
- Modify: `packages/site-astro/tests/privacy-static.test.ts`
- Modify: `packages/site-astro/package.json`

- [ ] Step 1: 将构建动作从测试文件移出。
- [ ] Step 2: `navigation.test.ts` 只读取已存在的 `dist`，如果不存在则给出清晰错误。
- [ ] Step 3: package script 改为：

```json
{
  "scripts": {
    "test": "vitest run tests/navigation.test.ts tests/privacy-static.test.ts",
    "test:with-build": "pnpm build && pnpm test"
  }
}
```

- [ ] Step 4: CI 或本地验收使用 `pnpm --filter site-astro test:with-build`。

**Acceptance Criteria:**

- `site-astro test` 不再删除 `dist`。
- `site-astro test:with-build` 可重复运行。
- 不再出现 `Cannot find module ... dist/pages/index.astro.mjs`。

---

## 5. P1：前后台数据闭环

### Task 6: 建立功能字段矩阵

**Files:**

- Create: `docs/feature-field-matrix.md`

- [ ] Step 1: 列出所有用户可感知功能。
- [ ] Step 2: 对每个功能标注后台入口、Worker 接口、数据库字段、前台展示位置、测试文件。
- [ ] Step 3: 用表格暴露缺口。

建议矩阵：

| 功能 | 后台入口 | Worker API | DB 字段/表 | 前台展示 | 当前状态 | 测试 |
|---|---|---|---|---|---|---|
| 个人小传 | StudentEditView / SelfEditPanel | `/api/students/:slug` | `students.info.profileModules` | StudentProfile | 已有但需验收 | 待补 |
| 留言款式 | MessageWall | `/api/messages/:slug` | `messages.card_style` | MessageWall / MessagesView | 已有 | 待补 |
| 留言置顶 | MessagesView | `/api/admin/messages/:id/pin` | `messages.pinned` | MessageWall | 已有 | 待补 |
| 主人回复 | MessageWall | `/api/messages/:id/reply` | `messages.reply` | MessageWall | 已有但需验证权限 | 待补 |
| 隐私级别 | StudentEditView / SelfEditPanel | `/api/students/:slug` | `students.privacy_level`, `info.visibility` | StudentProfile | 需要矩阵验收 | 部分已有 |
| 排行榜 | RankingsPanel | `/api/rankings` | visits/messages/reactions | Roster | 入口弱 | 待补 |
| 年度册 | yearbook.astro | 多接口聚合 | 多表 | `/yearbook` | 隐藏入口 | 待补 |
| 相册标签/封面 | AlbumsView | `/api/albums` | albums/photos | AlbumGrid | 需确认 | 待补 |

**Acceptance Criteria:**

- 每个新增功能都能回答：后台在哪改、接口怎么传、前台在哪看、失败怎么测。
- 矩阵中不得出现“未知接口”“未知字段”。

---

### Task 7: 学生资料字段连通验收

**Files:**

- Modify: `workers/api/src/routes/students.ts`
- Modify: `packages/admin/src/views/StudentEditView.vue`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Test: `workers/api/tests/api.test.ts`

- [ ] Step 1: 对 `StudentInfo` 字段做一次全量映射审计。
- [ ] Step 2: 后台可编辑字段必须在 Worker PUT 中被保留，不被覆盖丢失。
- [ ] Step 3: 前台展示字段必须使用同一组 label 和 key，避免后台写了但前台不认。
- [ ] Step 4: 自助编辑保存后触发页面刷新事件。
- [ ] Step 5: Worker 测试覆盖 `profileModules`、`visibility`、`backgroundUrl`、`musicUrl`、`privacyLevel`。

**Acceptance Criteria:**

- 后台修改任一资料字段后，公开页或本人视图能在对应权限下看到。
- 自助编辑保存成功后，无需手动刷新即可看到最新资料，或给出明确刷新提示。

---

### Task 8: 留言系统闭环验收

**Files:**

- Modify: `workers/api/src/routes/messages.ts`
- Modify: `packages/site-astro/src/components/MessageWall.vue`
- Modify: `packages/admin/src/views/MessagesView.vue`
- Test: `workers/api/tests/api.test.ts`

- [ ] Step 1: 留言提交后显示“待审核”说明，并保持输入状态清晰。
- [ ] Step 2: 后台审核通过后，公开学生页能显示留言。
- [ ] Step 3: 置顶留言在学生页最前显示。
- [ ] Step 4: 隐藏留言不在学生页和年度册显示。
- [ ] Step 5: 表情反应更新后立即反馈，并避免重复点击造成 UI 卡死。
- [ ] Step 6: 主人回复需要有效 classmate token。

**Acceptance Criteria:**

- 留言从提交、审核、展示、置顶、回复、隐藏、删除形成完整闭环。
- 前台和后台显示的留言状态一致。

---

### Task 9: 相册系统闭环验收

**Files:**

- Modify: `packages/admin/src/views/AlbumsView.vue`
- Modify: `workers/api/src/routes/albums.ts`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/pages/album.astro`

- [ ] Step 1: 后台上传照片后，前台相册页能稳定显示。
- [ ] Step 2: 相册封面、标签、排序字段若已存在，前台必须显性展示。
- [ ] Step 3: AlbumGrid 改成标准 Astro Vue island，不再手动 `createApp`。
- [ ] Step 4: 空相册状态增加引导文案，但不暴露后台敏感路径。
- [ ] Step 5: 图片 URL 全部支持相对 `/api/files/...` 与完整 URL。

**Acceptance Criteria:**

- 后台新增/删除/排序照片后，前台刷新可见。
- 相册页不会因 API base 为空而请求错误地址。

---

## 6. P2：新功能显性化

### Task 10: 年度册升级为正式入口

**Files:**

- Modify: `packages/site-astro/src/components/TopNav.astro`
- Modify: `packages/site-astro/src/pages/yearbook.astro`

- [ ] Step 1: 顶部导航增加“年度册”或“纪念册”入口。
- [ ] Step 2: 年度册页增加空状态：无留言、无照片、无统计时仍好看。
- [ ] Step 3: 年度册增加打印/PDF 样式检查。
- [ ] Step 4: 年度册只使用 public 数据，不显示隐私字段。
- [ ] Step 5: 年度册增加精选模块：
  - 班级寄语
  - 同学头像墙
  - 人气主页
  - 精选留言
  - 精选照片
  - 班级时间轴

**Acceptance Criteria:**

- 用户从导航可进入年度册。
- 年度册在数据为空或数据丰富时都能正常展示。
- 打印预览不出现导航、按钮和页面截断问题。

---

### Task 11: 排行榜和最近动态显性化

**Files:**

- Modify: `workers/api/src/index.ts`
- Modify: `packages/site-astro/src/components/RankingsPanel.vue`
- Modify: `packages/site-astro/src/pages/roster.astro`

- [ ] Step 1: `/api/rankings` 返回访问排行、留言排行、最近更新。
- [ ] Step 2: `RankingsPanel` 改为标准 island，并接收 `apiBase`。
- [ ] Step 3: 同学录页顶部展示轻量排行，而不是大面积抢主内容。
- [ ] Step 4: 移动端使用横向滑动或折叠显示，避免挤压同学卡片。

**Acceptance Criteria:**

- 排行榜能加载、失败时有降级提示。
- 排行项点击可进入对应同学页。

---

### Task 12: 个人主页新增功能丰富化

**Files:**

- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`

- [ ] Step 1: 个人小传模块增加不同类型视觉：
  - 现在的我
  - 校园回忆
  - 写给未来
  - 一句话
- [ ] Step 2: 联系方式按隐私状态展示提示，例如“仅本人可见”不直接暴露值。
- [ ] Step 3: 音乐功能增加明确播放控件，避免浏览器阻止 autoplay 后用户无感知。
- [ ] Step 4: 分享卡增加复制链接和下载提示。
- [ ] Step 5: 页面主人可见“编辑我的资料”，非主人不显示。

**Acceptance Criteria:**

- 新功能不只是保存字段，而是在页面中有可感知的展示形态。
- 浏览器阻止音乐自动播放时不会让功能看起来失效。

---

### Task 13: 后台管理显示完整功能入口

**Files:**

- Modify: `packages/admin/src/views/AdminLayout.vue`
- Modify: `packages/admin/src/views/DashboardView.vue`
- Modify: `packages/admin/src/views/StudentEditView.vue`
- Modify: `packages/admin/src/views/AlbumsView.vue`
- Modify: `packages/admin/src/views/MessagesView.vue`
- Modify: `packages/admin/src/views/TimelineEventsView.vue`

- [ ] Step 1: Dashboard 增加待审核留言、资料缺失、最近更新、访问排行。
- [ ] Step 2: 学生编辑页将“基础资料、隐私、音乐、背景、小传、专属模板”分区清楚。
- [ ] Step 3: 留言管理增加状态筛选、批量操作、置顶状态、隐藏状态。
- [ ] Step 4: 相册管理增加封面、标签、排序入口。
- [ ] Step 5: 时间轴管理增加预览字段和是否在年度册中展示。

**Acceptance Criteria:**

- 后台能找到所有已实现功能入口。
- 后台改完的内容在前台有明确去处可预览。

---

## 7. P3：体验与性能打磨

### Task 14: 图片加载和布局稳定

**Files:**

- Modify: `packages/site-astro/src/components/*.vue`
- Modify: `packages/site-astro/src/pages/*.astro`
- Modify: `packages/site-astro/src/styles/global.css`

- [ ] Step 1: 所有头像、相册图、背景图设置稳定尺寸或 `aspect-ratio`。
- [ ] Step 2: 首屏关键头像可 eager，其余图片 lazy。
- [ ] Step 3: 相册灯箱预加载上一张和下一张。
- [ ] Step 4: 图片失败时显示占位，不显示破图。

**Acceptance Criteria:**

- 页面加载时布局不因图片尺寸变化大幅跳动。
- 慢网下仍有稳定骨架或占位。

---

### Task 15: 移动端体验整理

**Files:**

- Modify: `packages/site-astro/src/styles/global.css`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/site-astro/src/components/MessageWall.vue`
- Modify: `packages/admin/src/styles/admin.css`

- [ ] Step 1: 自助编辑在手机端使用底部 sheet 或全屏编辑。
- [ ] Step 2: 留言样式选择器在小屏不换行挤压按钮。
- [ ] Step 3: 固定按钮避免互相遮挡，例如“分享 TA”和“编辑我的资料”。
- [ ] Step 4: 管理后台表格在手机端改为卡片布局或横向滚动。

**Acceptance Criteria:**

- 375px 宽度下无文字重叠。
- 固定按钮不挡住主要操作。

---

### Task 16: 空状态、错误状态与加载状态补齐

**Files:**

- Modify: `packages/site-astro/src/components/*.vue`
- Modify: `packages/admin/src/views/*.vue`

- [ ] Step 1: 所有 fetch 失败都有用户可读提示。
- [ ] Step 2: 所有空列表都有温和空状态。
- [ ] Step 3: 所有提交按钮都有 loading 和 disabled 状态。
- [ ] Step 4: 关键保存失败保留用户输入，不清空表单。

**Acceptance Criteria:**

- 断网、接口 500、空数据时页面不白屏。
- 用户提交失败后不会丢内容。

---

## 8. P4：运营与长期质量

### Task 17: 内容完整度与运营提醒

**Files:**

- Modify: `workers/api/src/index.ts`
- Modify: `packages/admin/src/views/DashboardView.vue`
- Create: `scripts/audit-content.ts`

- [ ] Step 1: 增加内容完整度算法。
- [ ] Step 2: 检查空头像、空小传、无留言、无编辑口令、公开联系方式。
- [ ] Step 3: Dashboard 展示需要处理的同学和内容。
- [ ] Step 4: 脚本可本地运行，输出 Markdown 或 JSON 报告。

**Acceptance Criteria:**

- 管理员能知道哪些内容还没填、哪些配置有风险。

---

### Task 18: 端到端验收脚本

**Files:**

- Modify: `package.json`
- Modify: `packages/site-astro/package.json`
- Modify: `.github/workflows/*.yml`

- [ ] Step 1: 根目录增加：

```json
{
  "scripts": {
    "verify:worker": "pnpm --filter worker exec vitest run",
    "verify:admin": "pnpm --filter admin typecheck && pnpm --filter admin build",
    "verify:site": "pnpm --filter site-astro build && pnpm --filter site-astro test",
    "verify:all": "pnpm verify:worker && pnpm verify:admin && pnpm verify:site"
  }
}
```

- [ ] Step 2: CI 部署前必须运行 `verify:all` 或等价矩阵。
- [ ] Step 3: 失败时阻止部署。

**Acceptance Criteria:**

- 核心链路坏掉时不会部署到线上。

---

## 9. 推荐执行顺序

1. Task 1-5：先解决动画、API base、测试竞态。这是用户当前最能感知的问题。
2. Task 6-9：建立字段矩阵，修通学生资料、留言、相册的数据闭环。
3. Task 10-13：把新功能从“藏着能用”变成“入口明确、体验完整”。
4. Task 14-16：做移动端、加载、空状态和图片稳定性。
5. Task 17-18：补运营提醒和长期质量门禁。

---

## 10. 验收命令

建议每个任务完成后至少运行相关局部验证；阶段完成后运行：

```bash
pnpm --filter worker exec vitest run
pnpm --filter admin typecheck
pnpm --filter admin build
pnpm --filter site-astro build
pnpm --filter site-astro test
```

如果修复了测试竞态并新增根级脚本，则最终运行：

```bash
pnpm verify:all
```

---

## 11. 不要做

- 不要重写为纯 SPA 或更换 Astro 架构。
- 不要为了动画问题全量删除所有动效；目标是“收敛控制权”，不是取消质感。
- 不要让每个组件各自猜 API 地址。
- 不要继续用手动 `createApp` 绕开 Astro island 数据传递。
- 不要在一次提交中同时改动画、数据模型、后台 UI 和 CI；这些必须分任务验收。
- 不要把隐私字段直接塞进静态 HTML。
- 不要在测试文件里删除构建产物并重建，构建应由脚本或 CI 前置完成。

---

## 12. 最终完成标准

- 动画加载无重复、无明显跳变，搜索和 SWR 刷新不会重播整页动画。
- 留言、自助编辑、照片墙、相册、排行榜在 GitHub Pages 和本地环境都请求正确 API。
- 后台配置的资料、小传、隐私、留言、相册字段都能在前台找到对应展示。
- 年度册、排行榜、新增小传等功能有明确入口和空状态。
- `site-astro test` 不再因构建竞态失败。
- `worker/admin/site` 的核心验证命令全部通过。
