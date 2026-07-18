# 公开站点运行时性能实施计划

> **For agentic workers:** 按当前仓库 AGENTS 规则使用本地协作调度和阶段性审查；本仓库禁止调用 `superpowers` 技能。

**目标：** 用原生增强替换不必要的全局 Vue/ClientRouter 成本，同时保持导航、登录、筛选、相册、会话和视觉反馈不变。

**架构：** 原生文档导航加 CSS 跨文档过渡替代 ClientRouter；首页门控、导航状态、音效、名册/相册/时间轴筛选拆成小型 TypeScript 模块；班级空间、信箱、账号和真正复杂的个人交互保留 Vue。

**技术栈：** Astro、TypeScript、Vue islands、原生 View Transitions API、Playwright、Vitest。

---

### Task 1：建立真实浏览器性能预算

**文件：**
- Create: `packages/site-astro/tests/runtime-performance.spec.ts`
- Modify: `packages/site-astro/tests/performance-network.spec.ts`
- Modify: `packages/site-astro/tests/performance-static.test.ts`
- Modify: `packages/site-astro/package.json`

- [ ] **Step 1：写失败测试**

在 `runtime-performance.spec.ts` 中添加以下断言：静态首页、时间轴、更多和年度册不请求包含 `vue`、`runtime-core`、`ClientRouter` 的脚本；在 `page.addInitScript` 中使用 `PerformanceObserver` 累加 long task，断言 4× CPU 下首页 TBT 小于 600ms；点击名册和年度册链接，断言导航完成时间分别小于 700ms 和 1200ms。

- [ ] **Step 2：运行确认失败**

运行：`$env:PLAYWRIGHT_SKIP_WEBSERVER='0'; pnpm --filter site-astro exec playwright test tests/runtime-performance.spec.ts`

预期：当前工作树因全局 `UiVolumeToggle client:load` 或 ClientRouter 资源/时间断言失败。

- [ ] **Step 3：接入测试脚本**

将 `runtime-performance.spec.ts` 加入 `test:perf-network`，并在 `performance-static.test.ts` 增加静态页面脚本依赖扫描，禁止回退到全局 Vue runtime。

- [ ] **Step 4：重新运行确认仍失败**

运行：`pnpm --filter site-astro test:perf-network`

预期：旧实现仍只在新增预算断言处失败，原有懒加载断言保持通过。

### Task 2：移除 ClientRouter，添加原生导航反馈

**文件：**
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
- Modify: `packages/site-astro/src/scripts/navRuntime.ts`
- Modify: `packages/site-astro/src/styles/view-transitions.css`
- Modify: `packages/site-astro/tests/navigation.test.ts`
- Modify: `packages/site-astro/tests/navigation-marker-direction.spec.ts`

- [ ] **Step 1：删除 `ClientRouter` 导入和组件挂载，保留当前链接目标、会话守卫和导航方向数据属性。**
- [ ] **Step 2：将 `astro:before-preparation`/`astro:before-swap` 逻辑改为 `pageshow`、`pagehide` 和普通点击处理；页面离开时取消正在运行的 RAF、事件监听器和进度线。**
- [ ] **Step 3：在 `view-transitions.css` 中加入 `@view-transition { navigation: auto; }`、进度线和 reduced-motion 覆盖；不使用脚本快照或强制布局读取。**
- [ ] **Step 4：运行 `pnpm --filter site-astro test -- tests/navigation.test.ts tests/navigation-marker-direction.spec.ts`，预期导航路径、会话守卫和方向回归通过。**
- [ ] **Step 5：运行 Task 1 的浏览器测试，预期切换耗时断言通过；提交 `perf(site): replace client router with native navigation`。**

### Task 3：把全局音效和导航会话改为原生模块

**文件：**
- Create: `packages/site-astro/src/runtime/audioSynth.ts`
- Create: `packages/site-astro/src/runtime/volumeToggle.ts`
- Create: `packages/site-astro/src/runtime/navSession.ts`
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
- Modify: `packages/site-astro/src/components/TopNav.astro`
- Delete after migration: `packages/site-astro/src/components/ui/UiVolumeToggle.vue`
- Delete after migration: `packages/site-astro/src/composables/useAudioSynth.ts`
- Modify: `packages/site-astro/tests/animation-ownership.test.ts`
- Modify: `packages/site-astro/tests/performance-static.test.ts`

- [ ] **Step 1：先写原生模块测试**，验证 `createAudioSynth()` 首次播放前不创建 AudioContext、连续 hover 在 100ms 内只创建一个噪声 buffer、`localStorage.site_audio_muted` 读写一致。
- [ ] **Step 2：运行 `pnpm --filter site-astro test -- tests/animation-ownership.test.ts tests/performance-static.test.ts`，预期新模块接口尚不存在而失败。**
- [ ] **Step 3：实现 `audioSynth.ts`：模块级复用 AudioContext、短 buffer 和 throttle；按钮只调用 `data-audio-toggle`，不创建 Vue island。**
- [ ] **Step 4：实现 `navSession.ts`：读取现有 `classmate_account_token`、`classmate_account_student` 和 `admin_token`，只更新现有 session DOM，不改变 token 名称和退出语义。**
- [ ] **Step 5：从 `MainLayout.astro` 删除 `UiVolumeToggle client:load`，改为静态按钮和 `import('../runtime/volumeToggle')` 的原生脚本。**
- [ ] **Step 6：运行 `pnpm build:site`、静态测试和浏览器网络测试，确认静态页不再请求 Vue runtime；提交 `perf(site): remove global vue audio island`。**

### Task 4：原生化低复杂度页面交互

**文件：**
- Create: `packages/site-astro/src/runtime/nameGate.ts`
- Create: `packages/site-astro/src/runtime/rosterRuntime.ts`
- Create: `packages/site-astro/src/runtime/albumRuntime.ts`
- Create: `packages/site-astro/src/runtime/timelineRuntime.ts`
- Modify: `packages/site-astro/src/components/VisitorPass.vue`
- Modify: `packages/site-astro/src/pages/roster.astro`
- Modify: `packages/site-astro/src/pages/album.astro`
- Modify: `packages/site-astro/src/pages/timeline.astro`
- Modify: `packages/site-astro/src/pages/preface.astro`
- Remove only after parity tests: `packages/site-astro/src/components/RosterWall.vue`, `packages/site-astro/src/components/AlbumGrid.vue`, `packages/site-astro/src/components/PrefaceWall.vue`

- [ ] **Step 1：为每个现有 Vue island 写行为回归测试**：姓名匹配/错误提示/登录跳转、名册关键词与分页、相册灯箱键盘关闭、时间轴筛选、前言配置展示。
- [ ] **Step 2：运行对应旧 Vue 流程测试作为基线，记录通过结果和请求数量。**
- [ ] **Step 3：将现有 SSR 输出保留为 HTML，原生脚本只绑定事件、更新 class/ARIA 和调用既有 API；不改变 API 路径、sessionStorage key 或组件文本。**
- [ ] **Step 4：将鼠标倾斜改为事件节流加 CSS 自定义属性，避免 `getBoundingClientRect()` 后触发 Vue 响应式重渲染。**
- [ ] **Step 5：运行 `pnpm --filter site-astro test:with-build` 和 `pnpm --filter site-astro test:perf-network`，确认功能和资源门禁均通过；提交 `perf(site): native enhance lightweight public pages`。**

### Task 5：拆分学生页首屏与自助功能

**文件：**
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/pages/student/[slug].astro`
- Modify: `packages/site-astro/src/pages/student/template.astro`
- Create: `packages/site-astro/src/components/StudentEditIsland.vue`
- Create: `packages/site-astro/src/components/StudentMediaIsland.vue`
- Modify: `packages/site-astro/tests/performance-network.spec.ts`
- Modify: `packages/site-astro/tests/student-profile-lifecycle.test.ts`

- [ ] **Step 1：为首屏静态资料、照片墙、留言墙、图谱、座位图和自助编辑分别增加网络断言；首屏不得请求后三类 chunk。**
- [ ] **Step 2：把 `StudentProfile.vue` 中自助编辑、分享卡、音乐和复杂弹窗移入独立 async island；静态资料字段先在 Astro 输出。**
- [ ] **Step 3：保留现有 `IntersectionObserver` 变量在组件作用域声明，并在 `onUnmounted` 统一 disconnect；所有媒体图片继续带尺寸。**
- [ ] **Step 4：运行学生登录、自助编辑、生命周期和浏览器性能测试，确认功能不变、初始 chunk 至少减少 30%；提交 `perf(site): split student profile feature islands`。**

### Task 6：自适应背景和动效清理

**文件：**
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
- Modify: `packages/site-astro/src/components/MuseumHero.astro`
- Modify: `packages/site-astro/src/styles/global.css`
- Modify: `packages/site-astro/src/styles/animations.css`
- Modify: `packages/site-astro/tests/motion-theme-static.test.ts`
- Modify: `packages/site-astro/tests/motion-theme-flow.spec.ts`

- [ ] **Step 1：添加 CSS 能力分级测试，要求 coarse pointer/窄屏关闭 blur、mix-blend-mode 尘粒和视差；reduced-motion 关闭全部连续动画。**
- [ ] **Step 2：实现 `data-motion-tier` 初始化：桌面高性能、触控移动、reduced-motion 三档；不读取布局尺寸。**
- [ ] **Step 3：将自定义光标 RAF 改为鼠标首次移动后启动、鼠标离开暂停、页面隐藏暂停，并在 `pagehide` 清理。**
- [ ] **Step 4：运行 `pnpm --filter site-astro test -- tests/motion-theme-static.test.ts tests/motion-theme-flow.spec.ts` 和 Task 1 性能测试；提交 `perf(site): tier background motion by device capability`。**
