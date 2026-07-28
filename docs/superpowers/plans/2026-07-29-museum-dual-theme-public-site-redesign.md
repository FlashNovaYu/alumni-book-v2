# 同学录“存忆馆”双主题公开站点重构实施计划

> **执行说明：** 按下列任务顺序在当前会话内逐项执行、逐项验证；不使用子 Agent。每个任务完成后仅提交该任务拥有的干净文件，绝不暂存或覆盖既有的班级空间投稿、个人编辑、共享类型及 Worker 改动。

**目标：** 将公开站点重构为日夜共用语义配色的“存忆馆”，准确交付“序 / 花名录 / 班级空间 / 年度册 / 更多”主导航与已确认的页面编排，同时保持全部既有会话、数据和交互契约。

**架构：** 先在共享令牌之上建立站点级语义色层，并把旧纸页变量别名到该层，避免组件同时维护日夜色值。接着按导航、序与花名录、班级空间、年度册与更多的依赖顺序实施；所有动态数据继续走现有 Astro SSG 拉取和 Vue 客户端 SWR/会话路径，只有 DOM、样式与文案层级改变。

**技术栈：** Astro 7 SSG、Vue 3 islands、TypeScript、CSS 自定义属性与 View Transitions、Vitest、Playwright、pnpm。

---

## 实施前边界与完成标准

- 保持 `MainLayout.astro` 的首次加载和客户端导航会话守卫；受保护页面不能因为视觉改动而向未登录访客暴露。
- 不修改 API、数据库、Worker、共享类型、上传、私信、群聊、专属模板 sandbox 与音效运行时；`ClassSpaceAlbumRail.vue`、`SelfEditPanel.vue`、`ClassSpaceAlbumSubmission.vue` 及已有脏文件不是本计划的编辑目标。
- `paper` 与 `night` 仍是 `alumni_theme` 的唯一存储值；无存储值时遵从系统偏好；减少动态偏好时主题立即完成切换。
- 所有页面颜色从语义层取得，正文、辅助文字、按钮与焦点环在两主题均可辨识；印刷输出强制使用日间纸本。
- 构建涉及 SSG 时必须显式传入可信的 `VITE_SSG_API_BASE`；不部署、不写线上数据。

## 文件映射

| 文件 | 责任 | 操作 |
| --- | --- | --- |
| `packages/shared/src/tokens.css` | 基础主题变量和旧变量兼容映射 | 修改：加入存忆馆语义别名与两主题映射 |
| `packages/site-astro/src/styles/tokens.css` | 站点纹理、环境层和语义色覆盖 | 修改：统一日夜纹理及阴影变量 |
| `packages/site-astro/src/styles/global.css` | 全局背景、基础纸页兼容类 | 修改：以语义色替代直接纸页变量 |
| `packages/site-astro/src/styles/accessibility.css` | 主题无关焦点环和减弱动效 | 修改：焦点环改用 `--focus-ring` |
| `packages/site-astro/src/layouts/MainLayout.astro` | 主题首次绘制与会话守卫 | 修改：只更新 theme-color 色值和环境装饰 class，不改守卫逻辑 |
| `packages/site-astro/src/scripts/themeRuntime.ts` | 用户主题切换与持久化 | 修改：只更新两主题的 meta 色值和可访问标签 |
| `packages/site-astro/src/components/TopNav.astro` | 桌面主目录、移动抽屉、工具区 | 修改：导航文案、展签式视觉；保留 href、data 属性和会话工具 |
| `packages/site-astro/src/pages/preface.astro` | 序的中轴展厅与两个入口 | 修改：标题、登记簿、双行动与题记层级 |
| `packages/site-astro/src/components/PrefaceWall.vue` | 馆长题记与致谢 | 修改：单栏展签样式；保留配置 SWR |
| `packages/site-astro/src/components/RosterWall.vue` | 花名录检索、12 条分页、规则网格 | 修改：中轴检索区与三列断点布局 |
| `packages/site-astro/src/components/ArchiveRosterCard.vue` | 索引卡内容和悬停视觉 | 修改：档案编号/状态的视觉结构；保留 view-transition 与音效触发 |
| `packages/site-astro/src/components/ClassSpaceHub.vue` | 班级空间三段纵向展陈 | 修改：传入无编号的简化目录资料；保留群聊→影像→大事顺序 |
| `packages/site-astro/src/components/ClassSpaceSectionNav.vue` | 横向居中目录、锚点和活动追踪 | 修改：移除桌面竖条布局与编号显示，保留 IntersectionObserver |
| `packages/site-astro/src/pages/yearbook.astro` | 装帧年鉴和打印样式 | 修改：封面及章节版式，只保留真实数据章节 |
| `packages/site-astro/src/pages/more.astro` | 更新中目录视觉 | 修改：展签式空状态，不增加功能入口 |
| `packages/site-astro/tests/museum-dual-theme-static.test.ts` | 新规格的静态结构回归 | 新建 |
| `packages/site-astro/tests/museum-dual-theme-flow.spec.ts` | 主题、导航、移动布局、打印的浏览器回归 | 新建 |
| `packages/site-astro/package.json` | 将新静态/浏览器回归加入现有命令 | 修改 |

## 任务 1：建立语义双主题令牌与可访问主题切换

**文件：**

- 修改：`packages/shared/src/tokens.css`
- 修改：`packages/site-astro/src/styles/tokens.css`
- 修改：`packages/site-astro/src/styles/global.css`
- 修改：`packages/site-astro/src/styles/accessibility.css`
- 修改：`packages/site-astro/src/layouts/MainLayout.astro`
- 修改：`packages/site-astro/src/scripts/themeRuntime.ts`
- 测试：`packages/site-astro/tests/museum-dual-theme-static.test.ts`
- 测试：`packages/site-astro/tests/motion-theme-flow.spec.ts`

- [ ] **步骤 1：先写令牌与主题不变量的失败测试。**

  新建 `museum-dual-theme-static.test.ts`，先建立本计划后续所有静态断言共用的读取函数：

  ```ts
  import { describe, expect, it } from 'vitest'
  import { readFileSync } from 'fs'
  import { resolve } from 'path'

  const siteRoot = resolve(__dirname, '../src')
  const sharedRoot = resolve(__dirname, '../../shared')
  const readSite = (relative: string) => readFileSync(resolve(siteRoot, relative), 'utf-8')
  const readShared = (relative: string) => readFileSync(resolve(sharedRoot, relative), 'utf-8')
  ```

  接着写入令牌与主题不变量：

  ```ts
  it('为存忆馆提供完整的双主题语义层且旧纸页变量只作别名', () => {
    const shared = readShared('src/tokens.css')
    for (const name of [
      '--surface-canvas', '--surface-sunken', '--surface-raised', '--surface-paper',
      '--text-primary', '--text-secondary', '--text-muted', '--border-subtle',
      '--border-strong', '--accent', '--accent-strong', '--accent-soft', '--stamp',
      '--state-archive-green', '--focus-ring', '--shadow-surface',
    ]) expect(shared).toContain(name)
    expect(shared).toContain("html[data-theme='night']")
    expect(shared).toMatch(/--color-paper-bg:\s*var\(--surface-canvas\)/)
  })

  it('保留系统默认、用户持久化和减少动态主题切换', () => {
    const runtime = readSite('src/scripts/themeRuntime.ts')
    expect(runtime).toContain("localStorage.getItem(themeStorageKey)")
    expect(runtime).toContain("stored === 'paper' || stored === 'night'")
    expect(runtime).toContain("prefers-color-scheme: dark")
    expect(runtime).toContain("prefers-reduced-motion: reduce")
  })
  ```

- [ ] **步骤 2：运行测试，确认它因新令牌尚不存在而失败。**

  运行：`pnpm --filter site-astro exec vitest run tests/museum-dual-theme-static.test.ts`

  预期：FAIL，缺少 `--surface-canvas` 等存忆馆语义变量；不应出现 TypeScript 或现有测试失败。

- [ ] **步骤 3：在共享令牌中定义角色，在站点样式中只写纹理和环境实现。**

  在 `:root` 和 `html[data-theme='night']` 中使用下列角色关系；只在这两个位置写明确定色值，组件一律取语义名：

  ```css
  :root {
    --surface-canvas: #F1E7CE;
    --surface-sunken: #E7D9BA;
    --surface-raised: #FBF6E9;
    --surface-paper: #FFF9EC;
    --text-primary: #221A10;
    --text-secondary: #584B32;
    --text-muted: #7C6C49;
    --border-subtle: rgba(110, 83, 34, .22);
    --border-strong: rgba(110, 83, 34, .48);
    --accent: #6E5322;
    --accent-strong: #4D3915;
    --accent-soft: rgba(110, 83, 34, .12);
    --stamp: #A23B2A;
    --state-archive-green: #4A7159;
    --focus-ring: #6E5322;
    --shadow-surface: 0 16px 38px rgba(62, 43, 15, .16);
  }
  html[data-theme='night'] {
    --surface-canvas: #0B120E;
    --surface-sunken: #101A14;
    --surface-raised: #161F19;
    --surface-paper: #1D2820;
    --text-primary: #EDE6D2;
    --text-secondary: #C5C1AD;
    --text-muted: #93A092;
    --border-subtle: rgba(237, 230, 210, .14);
    --border-strong: rgba(231, 206, 140, .42);
    --accent: #E7CE8C;
    --accent-strong: #F2DFA7;
    --accent-soft: rgba(231, 206, 140, .14);
    --stamp: #B24630;
    --state-archive-green: #4C8267;
    --focus-ring: #E7CE8C;
    --shadow-surface: 0 18px 42px rgba(0, 0, 0, .42);
  }
  ```

  紧接着把 `--bg`、`--bg-surface`、`--text-*`、`--border`、`--color-paper-*` 兼容变量改为引用这些角色；`global.css` 的 `.paper-*` 兼容类同样只引用角色，不删除仍被关联页面使用的类。`tokens.css` 中的纤维/低照度纹理只能是 `pointer-events: none` 的装饰层。

- [ ] **步骤 4：收口主题初始色与焦点环，不改主题存储协议或会话脚本。**

  将 `MainLayout.astro` 和 `themeRuntime.ts` 的 meta 色从旧 `#f4eddf/#20252d` 更新为下列值，并保持 `paper`/`night`、`alumni_theme`、`applyTheme` 和 `switchFrom` 函数签名不变：

  ```ts
  const themeColor = theme === 'night' ? '#0B120E' : '#F1E7CE'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor)
  ```

  在 `accessibility.css` 中将 focus-visible 的轮廓替换为：

  ```css
  outline: 3px solid var(--focus-ring) !important;
  ```

  不修改 `MainLayout.astro` 中 `classmate_account_token`、管理员回退或 `ClientRouter` 的任意判断；主题过渡仍仅由根层 opacity/clip-path 表现，并由已存在的减弱动效分支立即结束。

- [ ] **步骤 5：运行主题单测和既有浏览器回归。**

  运行：

  ```powershell
  pnpm --filter site-astro exec vitest run tests/museum-dual-theme-static.test.ts tests/motion-theme-static.test.ts tests/design-system-static.test.ts
  pnpm --filter site-astro exec playwright test tests/motion-theme-flow.spec.ts --workers=1
  ```

  预期：全部 PASS；`paper` 与 `night` 均可持久化，减少动态用例不留下 `theme-transition`。

- [ ] **步骤 6：提交本任务拥有的主题文件。**

  ```powershell
  git add packages/shared/src/tokens.css packages/site-astro/src/styles/tokens.css packages/site-astro/src/styles/global.css packages/site-astro/src/styles/accessibility.css packages/site-astro/src/layouts/MainLayout.astro packages/site-astro/src/scripts/themeRuntime.ts packages/site-astro/tests/museum-dual-theme-static.test.ts
  git commit -m "feat(site): add museum dual-theme tokens"
  ```

## 任务 2：把一级目录迁移为存忆馆导航

**文件：**

- 修改：`packages/site-astro/src/components/TopNav.astro`
- 修改：`packages/site-astro/src/layouts/MainLayout.astro`
- 修改：`packages/site-astro/tests/museum-dual-theme-static.test.ts`
- 测试：`packages/site-astro/tests/museum-dual-theme-flow.spec.ts`

- [ ] **步骤 1：为精确导航顺序、路由与保留工具区写失败测试。**

  ```ts
  it('在桌面与移动目录中使用同一套存忆馆一级导航', () => {
    const nav = readSite('src/components/TopNav.astro')
    expect(nav).toContain("{ href: '/preface', label: '序' }")
    expect(nav).toContain("{ href: '/roster', label: '花名录' }")
    expect(nav).toMatch(/'序'[\s\S]*'花名录'[\s\S]*'班级空间'[\s\S]*'年度册'[\s\S]*'更多'/)
    expect(nav).toContain("href={href('/mailbox')}")
    expect(nav).toContain('data-theme-toggle')
    expect(nav).toContain('data-volume-toggle')
  })
  ```

- [ ] **步骤 2：运行静态测试，确认旧“前言/同学档案”文案导致失败。**

  运行：`pnpm --filter site-astro exec vitest run tests/museum-dual-theme-static.test.ts`

  预期：FAIL，导航 labels 仍为 `前言` 和 `同学档案`。

- [ ] **步骤 3：只替换 `navItems` 标签与展签式外观。**

  将唯一的 `navItems` 常量改为：

  ```ts
  const navItems = [
    { href: '/preface', label: '序' },
    { href: '/roster', label: '花名录' },
    { href: '/class-space', label: '班级空间' },
    { href: '/yearbook', label: '年度册' },
    { href: '/more', label: '更多' },
  ]
  ```

  保持目录与移动抽屉都由该常量映射，保留 `href()` 的 base-path 处理、`data-nav-*`、`data-audio-hover`、账号/信箱/音效/主题/条件化管理入口。将票根虚线、硬编码纸页颜色和活动块改为细边框、标签和金色底线，颜色使用 `--surface-*`、`--text-*`、`--border-*`、`--accent`、`--stamp`；不得把 `/album` 写入 `navItems`。

- [ ] **步骤 4：确认页面转场目录仍覆盖新的五个一级路由。**

  保持 `MainLayout.astro` 中的顺序数组为：

  ```ts
  const order = ['/', '/preface/', '/roster/', '/class-space/', '/yearbook/', '/more/']
  ```

  仅在需要让活跃目录标记读取新 class 时调整其选择器；不能移除学生身份转场、邮件转场或会话初始化逻辑。

- [ ] **步骤 5：实现桌面与移动 Playwright 断言。**

  在 `museum-dual-theme-flow.spec.ts` 中使用已存在的 `mockClassmateAdminEntry`、`mockClassmateInboxSummary` 和登录 seed，添加：

  ```ts
  test('主目录和移动抽屉按存忆馆顺序导航', async ({ page }) => {
    await seedClassmateSession(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })
    await expect(page.locator('[data-nav-directory] .nav-link')).toHaveText(['序', '花名录', '班级空间', '年度册', '更多'])
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('[data-nav-open]').click()
    await expect(page.locator('.drawer-links .drawer-link')).toHaveText(['序', '花名录', '班级空间', '年度册', '更多'])
  })
  ```

- [ ] **步骤 6：运行导航回归。**

  运行：

  ```powershell
  pnpm --filter site-astro exec vitest run tests/museum-dual-theme-static.test.ts tests/motion-theme-static.test.ts
  pnpm --filter site-astro exec playwright test tests/museum-dual-theme-flow.spec.ts tests/motion-theme-flow.spec.ts --workers=1
  ```

  预期：全部 PASS；移动页标题跟随“序/花名录”等新文案，工具区不重叠。

- [ ] **步骤 7：提交导航任务。**

  ```powershell
  git add packages/site-astro/src/components/TopNav.astro packages/site-astro/src/layouts/MainLayout.astro packages/site-astro/tests/museum-dual-theme-static.test.ts packages/site-astro/tests/museum-dual-theme-flow.spec.ts
  git commit -m "feat(site): rename primary archive navigation"
  ```

## 任务 3：实施“序”的中轴展厅与真实登记簿

**文件：**

- 修改：`packages/site-astro/src/pages/preface.astro`
- 修改：`packages/site-astro/src/components/PrefaceWall.vue`
- 修改：`packages/site-astro/tests/museum-dual-theme-static.test.ts`
- 测试：`packages/site-astro/tests/museum-dual-theme-flow.spec.ts`

- [ ] **步骤 1：写入序页结构的失败测试。**

  ```ts
  it('序页只有两个主行动，并把正文降为居中的馆长题记', () => {
    const preface = readSite('src/pages/preface.astro')
    const wall = readSite('src/components/PrefaceWall.vue')
    expect(preface).toContain('class="preface-register"')
    expect(preface).toContain('翻开花名录')
    expect(preface).toContain('前往班级空间')
    expect(preface.match(/class="btn-primary"/g)).toHaveLength(1)
    expect(preface).not.toContain('翻阅同学档案')
    expect(wall).toContain('馆长题记')
    expect(wall).toContain('preface-wall--curator-note')
  })
  ```

- [ ] **步骤 2：运行测试，确认当前序页没有登记簿和新 CTA。**

  运行：`pnpm --filter site-astro exec vitest run tests/museum-dual-theme-static.test.ts`

  预期：FAIL，缺少 `.preface-register` 和“翻开花名录”。

- [ ] **步骤 3：在 Astro 层汇总真实数量并渲染中轴登记簿。**

  复用现有 `getSsgApiBase()`，在不新增 API 的前提下并行读取既有公开学生、相册和时间轴数据；请求失败沿用本页现有 `fetchWithRetry` 的构建失败行为。将数值限定为真实结果的 `length`，没有数据即呈现 `0`；不得写死示例数字。

  置于 `PageHeader` 之后、`PrefaceWall` 之前的结构固定为：

  ```astro
  <section class="preface-register" aria-label="入馆登记簿">
    <p class="preface-register__label">ARCHIVE REGISTER</p>
    <dl class="preface-register__counts">
      <div><dt>在册同学</dt><dd>{studentCount}</dd></div>
      <div><dt>班级影像</dt><dd>{photoCount}</dd></div>
      <div><dt>共同篇章</dt><dd>{timelineCount}</dd></div>
    </dl>
  </section>
  ```

  标题、标签、登记簿、两个 action 与题记容器均使用 `margin-inline: auto` 和单栏/对称 grid。只保留下列入口，且第一个为唯一主按钮：

  ```astro
  <a href={href('/roster')} class="btn-primary">翻开花名录</a>
  <a href={href('/class-space')} class="btn-secondary">前往班级空间</a>
  ```

- [ ] **步骤 4：将正文和致谢保留为“馆长题记”，不改变客户端刷新。**

  在 `PrefaceWall.vue` 给外层追加 `preface-wall--curator-note`，在正文前加入：

  ```vue
  <p class="preface-wall__label">CURATOR'S NOTE</p>
  <h2 class="preface-wall__title">馆长题记</h2>
  ```

  保留 `initialConfig`、`apiBase`、`runWhenIdle`、`isDeepEqual` 和致谢数组过滤；只将文本对齐与卡片边框迁移到语义变量。移动端两个按钮允许纵排但必须居中，不能引入第三个入口。

- [ ] **步骤 5：加入浏览器布局断言并运行。**

  ```ts
  test('序页登记簿和两项行动保持中轴布局', async ({ page }) => {
    await seedClassmateSession(page)
    await page.goto('./preface/', { waitUntil: 'networkidle' })
    await expect(page.locator('.preface-register__counts > div')).toHaveCount(3)
    await expect(page.getByRole('link', { name: '翻开花名录' })).toHaveCount(1)
    await expect(page.getByRole('link', { name: '前往班级空间' })).toHaveCount(1)
  })
  ```

  运行：

  ```powershell
  pnpm --filter site-astro exec vitest run tests/museum-dual-theme-static.test.ts tests/motion-theme-static.test.ts
  pnpm --filter site-astro exec playwright test tests/museum-dual-theme-flow.spec.ts --workers=1
  ```

  预期：PASS；无横向溢出，双按钮数量准确。

- [ ] **步骤 6：提交序页任务。**

  ```powershell
  git add packages/site-astro/src/pages/preface.astro packages/site-astro/src/components/PrefaceWall.vue packages/site-astro/tests/museum-dual-theme-static.test.ts packages/site-astro/tests/museum-dual-theme-flow.spec.ts
  git commit -m "feat(site): create centered archive preface"
  ```

## 任务 4：实施花名录的中轴索引册

**文件：**

- 修改：`packages/site-astro/src/pages/roster.astro`
- 修改：`packages/site-astro/src/components/RosterWall.vue`
- 修改：`packages/site-astro/src/components/ArchiveRosterCard.vue`
- 修改：`packages/site-astro/tests/museum-dual-theme-static.test.ts`
- 测试：`packages/site-astro/tests/roster-pagination.spec.ts`
- 测试：`packages/site-astro/tests/museum-dual-theme-flow.spec.ts`

- [ ] **步骤 1：为规则三列、索引字段与原有分页行为写失败测试。**

  ```ts
  it('花名录在桌面是规则三列索引册，在移动端不横向滚动', () => {
    const wall = readSite('src/components/RosterWall.vue')
    const card = readSite('src/components/ArchiveRosterCard.vue')
    expect(wall).toMatch(/\.roster-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
    expect(wall).toContain('const PAGE_SIZE = 12')
    expect(card).toContain('roster-card__archive-id')
    expect(card).toContain('roster-card__status')
    expect(card).not.toContain('randomRotate')
  })
  ```

- [ ] **步骤 2：运行测试，确认当前自适应列与缺少编号造成失败。**

  运行：`pnpm --filter site-astro exec vitest run tests/museum-dual-theme-static.test.ts tests/pagination.test.ts`

  预期：FAIL，仅新规格断言失败；分页基础测试保持 PASS。

- [ ] **步骤 3：在不改变搜索、分页和转场状态的前提下改造网格。**

  保留 `PAGE_SIZE = 12`、`filteredClassmates`、稳定页高、`roster-page-*` transition、陀螺仪授权、`data-student-identity-card` 与现有 `RosterSearch` 事件。仅将 `.roster-grid` 改为显式断点：

  ```css
  .roster-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 960px) { .roster-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .roster-grid { grid-template-columns: 1fr; } }
  ```

  将标题、说明、搜索、结果数、分页置于中轴容器；搜索实际 label 继续为“档案检索”。不修改 API 请求或个人页返回的 sessionStorage 键。

- [ ] **步骤 4：让索引卡展示真实编号和最小字段，保留身份转场与音效。**

  以当前页内顺序形成纯展示编号（例如 `ARCHIVE-${String(index + 1).padStart(3, '0')}`），由 `RosterWall` 作为 `archive-id` prop 传入；不将该编号写入后端或 URL。卡片保留头像、姓名、`statusLabel`、`data-audio-hover`、`handleTransition` 和所有 view-transition style。座右铭/标签在卡片上隐藏或简化为不撑高的状态行，详细信息仍在个人档案页。

  新卡片结构至少包含：

  ```vue
  <p class="roster-card__archive-id">{{ archiveId }}</p>
  <div class="roster-card__name" :style="nameTransitionStyle">{{ card.name }}</div>
  <div v-if="card.statusLabel" class="roster-card__status">{{ card.statusLabel }}</div>
  ```

- [ ] **步骤 5：扩展浏览器回归，验证 12 条与三列。**

  在已有 `roster-pagination.spec.ts` 的 13 名 mock 上添加桌面断言：

  ```ts
  await page.setViewportSize({ width: 1440, height: 900 })
  const columns = await page.locator('.roster-grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(3)
  await expect(page.locator('.roster-card:visible')).toHaveCount(12)
  ```

  在 `museum-dual-theme-flow.spec.ts` 加入 390px 页面检查 `document.documentElement.scrollWidth <= innerWidth`。

- [ ] **步骤 6：运行花名录回归。**

  运行：

  ```powershell
  pnpm --filter site-astro exec vitest run tests/museum-dual-theme-static.test.ts tests/pagination.test.ts tests/student-dual-edge-transition-static.test.ts
  pnpm --filter site-astro exec playwright test tests/roster-pagination.spec.ts tests/museum-dual-theme-flow.spec.ts --workers=1
  ```

  预期：PASS；检索会重置至第 1 页，12 条分页和身份转场契约不回归。

- [ ] **步骤 7：提交花名录任务。**

  ```powershell
  git add packages/site-astro/src/pages/roster.astro packages/site-astro/src/components/RosterWall.vue packages/site-astro/src/components/ArchiveRosterCard.vue packages/site-astro/tests/museum-dual-theme-static.test.ts packages/site-astro/tests/museum-dual-theme-flow.spec.ts packages/site-astro/tests/roster-pagination.spec.ts
  git commit -m "feat(site): restyle roster as archive index"
  ```

## 任务 5：把班级空间改为横向目录、纵向展陈

**文件：**

- 修改：`packages/site-astro/src/pages/class-space.astro`
- 修改：`packages/site-astro/src/components/ClassSpaceHub.vue`
- 修改：`packages/site-astro/src/components/ClassSpaceSectionNav.vue`
- 修改：`packages/site-astro/tests/class-space-navigation-static.test.ts`
- 修改：`packages/site-astro/tests/museum-dual-theme-static.test.ts`
- 测试：`packages/site-astro/tests/class-space-flow.spec.ts`
- 测试：`packages/site-astro/tests/museum-dual-theme-flow.spec.ts`

- [ ] **步骤 1：把视觉目录约束写成失败测试，不动正在修改的投稿组件。**

  ```ts
  it('班级空间使用无编号横向目录并保持三个纵向展区', () => {
    const hub = read('components/ClassSpaceHub.vue')
    const nav = read('components/ClassSpaceSectionNav.vue')
    expect(hub).toMatch(/id="group-chat"[\s\S]*id="albums"[\s\S]*id="timeline"/)
    expect(nav).not.toContain('section.index')
    expect(nav).not.toContain('position: sticky')
    expect(nav).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(nav).toContain('IntersectionObserver')
  })
  ```

- [ ] **步骤 2：运行测试，确认旧 01/02/03 和桌面竖条导致失败。**

  运行：`pnpm --filter site-astro exec vitest run tests/class-space-navigation-static.test.ts tests/museum-dual-theme-static.test.ts`

  预期：FAIL，仅目录视觉新断言失败；群聊、影像与时间轴现有存在性断言仍 PASS。

- [ ] **步骤 3：简化目录资料，保留 count 与锚点观察。**

  在 `ClassSpaceHub.vue` 仅删除 `index` 字段，保持数据顺序、id、count 和组件调用：

  ```ts
  const sections = computed(() => overviewData.value ? [
    { id: 'group-chat', label: '班级群聊', description: '此刻的对话', count: overviewData.value.counts.groupMessages },
    { id: 'albums', label: '精选影像', description: '值得翻看的照片', count: overviewData.value.counts.albums },
    { id: 'timeline', label: '班级大事', description: '由我们郑重记下', count: overviewData.value.counts.timelineItems },
  ] : [])
  ```

  不修改 `GroupChatStage` 的 props、相册 rail、时间轴 rail、`fetchClassSpaceOverview` 或任何投稿/上传代码。

- [ ] **步骤 4：重写目录模板和 CSS，保留活动追踪。**

  从 `ClassSpaceSection` 接口删除 `index`，移除 `.section-index` 节点与所有左侧红条规则。桌面端以等宽横向三项呈现，当前项用 `border-bottom: 2px solid var(--accent)` 与 `--surface-raised` 区分；不出现固定定位、滚动容器或编号。移动端降为全宽纵向可点击项：

  ```css
  .class-space-section-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 700px) { .class-space-section-nav { grid-template-columns: 1fr; } }
  ```

  保留 `href="#${section.id}"`、点击时更新 `activeId`、IntersectionObserver 的 `rootMargin`/`disconnect`，确保锚点滚动与活动跟踪仍然有效。

- [ ] **步骤 5：只为页头补充居中布局，保留内容区顺序。**

  在 `class-space.astro` 用局部样式令 `PageHeader` 和 `ClassSpaceHub` 的目录区域居中；不能将 `ClassSpaceHub` 的三段 section 排成并列卡片。源码顺序必须仍为 `#group-chat`、`#albums`、`#timeline`。

- [ ] **步骤 6：加入实际锚点与移动布局断言。**

  ```ts
  test('班级空间目录横向居中且锚点顺序保持群聊、影像、大事', async ({ page }) => {
    await seedClassmateSession(page)
    await page.goto('./class-space/', { waitUntil: 'networkidle' })
    await expect(page.locator('.class-space-section-nav a')).toHaveText(['班级群聊', '精选影像', '班级大事'])
    await page.locator('.class-space-section-nav a[href="#albums"]').click()
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#albums')
  })
  ```

- [ ] **步骤 7：运行班级空间回归。**

  运行：

  ```powershell
  pnpm --filter site-astro exec vitest run tests/class-space-navigation-static.test.ts tests/chat-rework-static.test.ts tests/museum-dual-theme-static.test.ts
  pnpm --filter site-astro exec playwright test tests/class-space-flow.spec.ts tests/museum-dual-theme-flow.spec.ts --workers=1
  ```

  预期：PASS；现有群聊、影像投稿入口、时间轴入口、移动滚动和锚点仍可用。

- [ ] **步骤 8：提交班级空间导航任务，明确排除用户改动文件。**

  ```powershell
  git add packages/site-astro/src/pages/class-space.astro packages/site-astro/src/components/ClassSpaceHub.vue packages/site-astro/src/components/ClassSpaceSectionNav.vue packages/site-astro/tests/class-space-navigation-static.test.ts packages/site-astro/tests/museum-dual-theme-static.test.ts packages/site-astro/tests/museum-dual-theme-flow.spec.ts
  git commit -m "feat(site): center class space section navigation"
  ```

## 任务 6：重装年度册并迁移“更多”视觉

**文件：**

- 修改：`packages/site-astro/src/pages/yearbook.astro`
- 修改：`packages/site-astro/src/pages/more.astro`
- 修改：`packages/site-astro/tests/public-site-major-redesign-static.test.ts`
- 修改：`packages/site-astro/tests/museum-dual-theme-static.test.ts`
- 测试：`packages/site-astro/tests/museum-dual-theme-flow.spec.ts`

- [ ] **步骤 1：写年度册章节、打印和更多页真实性的失败测试。**

  ```ts
  it('年度册是装帧年鉴，数据报告是章节且打印固定日间纸本', () => {
    const yearbook = readSite('src/pages/yearbook.astro')
    expect(yearbook).toContain('class="yearbook-paper"')
    expect(yearbook).toMatch(/class="print-section[^"]*"[\s\S]*?青春数据报告/)
    expect(yearbook).toContain('@media print')
    expect(yearbook).toMatch(/@media print[\s\S]*?--surface-canvas:\s*#F1E7CE/)
  })
  it('更多页只声明更新中，不增加虚构链接', () => {
    const more = readSite('src/pages/more.astro')
    expect(more).toContain('新的章节正在整理')
    expect(more).not.toContain('href=')
  })
  ```

- [ ] **步骤 2：运行测试，确认当前打印不显式固定存忆馆日间变量。**

  运行：`pnpm --filter site-astro exec vitest run tests/public-site-major-redesign-static.test.ts tests/museum-dual-theme-static.test.ts`

  预期：FAIL，至少缺少 print 主题变量断言。

- [ ] **步骤 3：只改变年鉴的装帧层级与语义 CSS，不重排真实数据章节。**

  保留封面、班级寄语、青春数据报告、同窗名录、青春瞬间、时光足迹、精选留言的现有 DOM 顺序、数据来源、`window.print()` 按钮和响应式媒体 `srcset`。把封面和章节统一为居中年鉴页边、展签 label、细分隔线；不要把 `totalVisits` 或排行做成封面主角，也不新增任何精确数字。

  在 `@media print` 开头固定纸本变量，使夜间界面导出的 PDF 仍是高对比日间版本：

  ```css
  @media print {
    :global(html) {
      --surface-canvas: #F1E7CE;
      --surface-paper: #FFF9EC;
      --text-primary: #221A10;
      --text-secondary: #584B32;
      --border-subtle: rgba(110, 83, 34, .22);
    }
    .yearbook-paper { background: var(--surface-paper); color: var(--text-primary); }
  }
  ```

  同时保留现有的 `.no-print`、`.print-section`、分页规则和 A4 样式。

- [ ] **步骤 4：把更多页收口为更新目录。**

  保持一个纯说明 section，不加入按钮或导航链接；用下列真实文案和语义样式：

  ```astro
  <p>ARCHIVE IN PROGRESS</p>
  <strong>新的章节正在整理</strong>
  <span>馆藏仍在归档，敬请期待。</span>
  ```

- [ ] **步骤 5：运行静态、浏览器和打印验证。**

  运行：

  ```powershell
  pnpm --filter site-astro exec vitest run tests/public-site-major-redesign-static.test.ts tests/museum-dual-theme-static.test.ts
  pnpm --filter site-astro exec playwright test tests/museum-dual-theme-flow.spec.ts --workers=1
  ```

  在浏览器测试中设置 `alumni_theme=night`，打开年度册后调用 `page.emulateMedia({ media: 'print' })`，断言 `.yearbook-paper` 的背景色不等于夜间底色且打印按钮不可见。预期：PASS。

- [ ] **步骤 6：提交年鉴与更多页任务。**

  ```powershell
  git add packages/site-astro/src/pages/yearbook.astro packages/site-astro/src/pages/more.astro packages/site-astro/tests/public-site-major-redesign-static.test.ts packages/site-astro/tests/museum-dual-theme-static.test.ts packages/site-astro/tests/museum-dual-theme-flow.spec.ts
  git commit -m "feat(site): frame yearbook as printed archive"
  ```

## 任务 7：关联页令牌收口与完整验证

**文件：**

- 仅在检索到硬编码旧色且可用语义变量等价替换时修改：`packages/site-astro/src/pages/album.astro`
- 仅在检索到硬编码旧色且可用语义变量等价替换时修改：`packages/site-astro/src/pages/student/[slug].astro`
- 仅在检索到硬编码旧色且可用语义变量等价替换时修改：`packages/site-astro/src/pages/mailbox.astro`
- 修改：`packages/site-astro/package.json`
- 修改：`packages/site-astro/tests/museum-dual-theme-static.test.ts`
- 修改：`packages/site-astro/tests/museum-dual-theme-flow.spec.ts`

- [ ] **步骤 1：先执行窄范围只读检索，决定是否需要关联页 CSS 微调。**

  运行：

  ```powershell
  rg -n --glob '*.astro' --glob '*.vue' '#[0-9A-Fa-f]{3,8}|rgba\(' packages/site-astro/src/pages/album.astro packages/site-astro/src/pages/student/[slug].astro packages/site-astro/src/pages/mailbox.astro
  ```

  预期：记录直接写入颜色的准确行号。若没有与主题表面/正文/边框直接相关的硬编码颜色，不修改这些关联页；不得为了“统一”重构其数据或交互。

- [ ] **步骤 2：为关联页面的不可变契约写静态测试。**

  ```ts
  it('关联页面继承语义主题且保留行为边界', () => {
    const student = readSite('src/pages/student/[slug].astro')
    const mailbox = readSite('src/pages/mailbox.astro')
    expect(student).toContain('sandbox')
    expect(mailbox).toContain('MainLayout')
    expect(readSite('src/components/ClassSpaceAlbumRail.vue')).toContain('ClassSpaceAlbumSubmission')
  })
  ```

- [ ] **步骤 3：仅替换等价视觉色值并复核不变量。**

  将检索到的背景、正文、边框、强调或阴影硬编码替换为相应 `--surface-*`、`--text-*`、`--border-*`、`--accent`、`--shadow-surface`。不修改：

  ```text
  StudentView 的模板变量替换与 sandbox；
  相册的响应式变体、轻盒和无障碍文本；
  信箱的未读数、线程、私信和群聊行为；
  ClassSpaceAlbumRail.vue、ClassSpaceAlbumSubmission.vue、SelfEditPanel.vue。
  ```

- [ ] **步骤 4：将新回归纳入现有命令。**

  在 `package.json` 的 `test` 末尾追加 `tests/museum-dual-theme-static.test.ts`；在 `test:perf-network` 末尾追加 `tests/museum-dual-theme-flow.spec.ts`，保持现有测试顺序和 `--workers=1`。不创建新的全量测试脚本。

- [ ] **步骤 5：依风险分层运行完整验收。**

  先运行：

  ```powershell
  pnpm --filter site-astro exec vitest run tests/museum-dual-theme-static.test.ts tests/design-system-static.test.ts tests/motion-theme-static.test.ts tests/class-space-navigation-static.test.ts tests/public-site-major-redesign-static.test.ts tests/pagination.test.ts tests/student-dual-edge-transition-static.test.ts
  pnpm --filter site-astro typecheck
  ```

  然后使用可信测试 API 基址构建，环境变量值必须由当前本地/测试 API 的可公开访问地址提供，不能写入仓库：

  ```powershell
  $env:VITE_SSG_API_BASE = 'http://127.0.0.1:8787'
  pnpm --filter site-astro build
  ```

  预期：typecheck 与 build 均 PASS；若本地 API 未运行，停止在构建前并启动/指定测试 API，不使用隐式公网回退。

- [ ] **步骤 6：运行真实预览交互与视觉检查。**

  ```powershell
  pnpm --filter site-astro exec playwright test tests/museum-dual-theme-flow.spec.ts tests/motion-theme-flow.spec.ts tests/roster-pagination.spec.ts tests/class-space-flow.spec.ts tests/mailbox-account-flow.spec.ts tests/student-identity-transition-flow.spec.ts --workers=1
  ```

  预期：PASS，覆盖桌面/390px、日夜主题、序的双 CTA、花名录 12 条与三列、班级空间锚点、年鉴打印、信箱和学生页转场。必要时保存失败截图用于人工复核，不把截图纳入提交。

- [ ] **步骤 7：最后运行全仓质量门禁并检查工作区边界。**

  ```powershell
  pnpm verify:all
  git diff --check
  git status --short
  ```

  预期：质量门禁和 diff 检查 PASS；状态中只新增/修改本计划拥有的公开站点文件，原有 `ClassSpaceAlbumRail.vue`、`SelfEditPanel.vue`、共享类型、Worker 与其测试保持原样且不被暂存。

- [ ] **步骤 8：提交最终收口文件。**

  ```powershell
  git add packages/site-astro/package.json packages/site-astro/tests/museum-dual-theme-static.test.ts packages/site-astro/tests/museum-dual-theme-flow.spec.ts
  git add packages/site-astro/src/pages/album.astro packages/site-astro/src/pages/student/[slug].astro packages/site-astro/src/pages/mailbox.astro
  git commit -m "test(site): verify museum public experience"
  ```

  若步骤 1 没有产生关联页改动，第二条 `git add` 只添加实际变更文件；不要用 `git add -A`。

## 最终人工验收清单

- [ ] 日间和夜间在首页、序、花名录、班级空间、年度册、更多呈现同一馆藏语言，且焦点环、辅助文字、输入框和按钮清晰可辨。
- [ ] 桌面和移动主导航顺序准确为“序、花名录、班级空间、年度册、更多”；相册不占一级位置。
- [ ] 序保持中轴对称，真实登记簿显示三个真实计数，只有“翻开花名录”“前往班级空间”两个主行动。
- [ ] 花名录在桌面为等宽三列，移动端无横向滚动；检索、12 条分页、返回个人档案状态、悬停音效和减弱动效正常。
- [ ] 班级空间没有桌面左侧 01/02/03 竖条；顶部目录横向等宽，内容自上而下仍是班级群聊、精选影像、班级大事。
- [ ] 年度册中的数据报告不是封面；夜间界面打印/PDF 为高对比日间纸本。
- [ ] 更多页只陈述“新的章节正在整理”，没有虚构入口或功能。

## 计划自审

- **规格覆盖：** 主题/可访问性（任务 1）、一级导航（任务 2）、序与双行动（任务 3）、三列花名录与 12 条分页（任务 4）、横向目录和纵向班级空间顺序（任务 5）、年度册打印及更多页（任务 6）、关联页收口与完整验证（任务 7）均有唯一实施任务和验收。
- **占位符检查：** 本计划没有未决占位标记、延后实现指令或未定义的“适当处理”指令；关联页任务以实际检索结果为条件，明确规定无命中即不修改。
- **类型一致性：** `ClassSpaceSection` 删除 `index` 后，`ClassSpaceHub.vue` 的 `sections`、`ClassSpaceSectionNav.vue` props 和模板都只使用 `id`、`label`、`description`、`count`；`archiveId` 作为 `ArchiveRosterCard` 的新增只读展示 prop，由唯一调用方 `RosterWall.vue` 传入；主题值始终限定为既有 `paper | night`。
