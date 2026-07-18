# 前端设计系统稳定化与后续加固实施计划

> **执行约束：** 按任务顺序逐项实施，每个任务完成后独立验证和提交。遵守项目 AGENTS.md，不调用 `superpowers`；如需分批执行，使用 CCSwitch 管理的必要技能或由主 Agent 在当前会话内执行。

**目标：** 在保留“静谧编辑暖意”视觉方向的前提下，先修复 `cd0ff19` 引入的构建、令牌、分页和回归问题，使项目重新达到完整质量门禁；随后按独立批次处理已经确认的认证、安全、隐私、性能和运维风险。

**架构：** 共享包只承载框架无关的设计令牌、类型和纯函数；Vue 组件先保持包内所有权，只有出现稳定的跨包复用需求时才单独设计 UI 包。前端视觉改造按可独立发布的用户旅程推进，无障碍、响应式、性能与测试随组件同步完成，不放到最后补做。

**技术栈：** pnpm workspace、Astro 7、Vue 3、TypeScript、Hono、Cloudflare Pages/Workers、D1、R2、Vitest、Playwright。

---

## 一、范围与非目标

### 本计划包含

- 稳定当前本地提交 `cd0ff19` 及其后续未提交设计系统工作。
- 恢复站点设计令牌入口和夜读主题。
- 修复后台缺失 UI 组件导致的生产构建失败。
- 修复分页重复页码和人物长廊共享元素返回回归。
- 更新因组件抽取、类名调整和令牌迁移而过时的测试，但不删除仍有业务价值的回归契约。
- 收敛没有实际消费者的 UI 组件，并让保留组件进入类型检查和测试门禁。
- 在前端重新全绿后，统一同学 Session Token 校验。
- 将其余已发现问题登记为后续独立实施批次。

### 本计划明确不包含

- 不重新引入 GSAP、ScrollTrigger 或其他大型动画依赖。
- 不添加聊天/私聊附件、自动保存、批量删除、批量停用、记住我、slug 自动生成或 Monaco/CodeMirror。
- 不一次性删除所有 `.paper-*`、`.museum-*` 和旧令牌；兼容层只能在全仓零引用后删除。
- 不同时重构所有公开页面和全部后台视图。
- 不从本机发布生产，不修改生产 D1/R2，不执行具有生产副作用的认证烟测。

---

## 二、当前基线与已确认问题

### Git 基线

- 当前本地 `main`：`cd0ff19`，比 `origin/main` 超前 1 个提交。
- `origin/main`：`3028589`。
- `cd0ff19` 修改 22 个文件，新增约 5,365 行，没有同步增加测试。
- 计划编写时工作区已有用户未提交修改：
  - `packages/site-astro/src/styles/global.css`
  - `packages/site-astro/src/styles/base.css`
  - `packages/site-astro/src/styles/typography.css`
  - `packages/site-astro/src/styles/layout.css`
  - `packages/site-astro/src/styles/components.css`
  - `packages/site-astro/src/styles/animations.css`
  - `packages/site-astro/src/styles/view-transitions.css`
  - `packages/site-astro/src/styles/custom-cursor.css`
  - `packages/site-astro/src/styles/accessibility.css`
  - `packages/admin/src/components/ui/UiDataTable.vue`
  - `.audit/before/*.png`

执行本计划时必须保留这些改动，先审阅再继续，不得覆盖或回滚。

### 已运行门禁

- `pnpm verify:admin`：失败；Vite 找不到 `admin/src/components/ui/UiSkeleton.vue`。
- `pnpm --filter site-astro typecheck`：通过，0 个错误。
- `pnpm --filter site-astro test`：11 项断言失败。

### 已确认的真实问题

1. `packages/admin/src/views/DashboardView.vue` 引用了后台不存在的 `UiSkeleton`、`UiEmptyState`、`UiBadge`。
2. 站点样式入口使用 `--bg`、`--font-body` 等共享变量，但当前模块化入口仍未导入 `packages/shared/src/tokens.css` 和站点纹理覆盖。
3. `UiPagination.vue` 在 2 页和 3 页场景会重复追加页码。
4. `RosterWall.vue` 改为只渲染 `paginatedClassmates` 后，跨页或搜索返回时的新文档可能不存在共享元素目标。
5. `packages/site-astro/tsconfig.json` 排除了整个 `src/components/ui`，未被消费者引用的组件可能绕过类型检查。
6. 新建组件中多数尚无真实消费者；`UiModal`、`UiTabs` 等有状态组件还缺少完整键盘、焦点和清理行为。
7. 现有失败测试同时包含真实回归和文件所有权变化导致的过时断言，必须逐项分类，不能直接删除或批量改绿。

---

## 三、文件职责

### 共享基础

- `packages/shared/src/tokens.css`：日间/夜读基础令牌、兼容旧令牌映射。
- `packages/shared/src/pagination.ts`：与框架无关的唯一分页项目生成函数。
- `packages/shared/src/index.ts`：导出共享纯函数和类型。

### 公开站点样式

- `packages/site-astro/src/styles/global.css`：唯一全局入口，只负责按顺序导入模块和极少量全局响应式覆盖。
- `packages/site-astro/src/styles/tokens.css`：站点纹理和装饰性覆盖，不重复定义基础色板。
- `base.css`：重置和文档根元素。
- `typography.css`：排版工具。
- `layout.css`：容器、页面壳和网格。
- `components.css`：仍被多个页面共享的 CSS 基元。
- `animations.css`：CSS 动画和显隐工具。
- `view-transitions.css`：Astro View Transitions 规则。
- `custom-cursor.css`：自定义光标样式。
- `accessibility.css`：焦点、跳转链接和减少动态。

### Vue UI 组件

- `packages/site-astro/src/components/ui/`：只保存公开站点已有真实消费者的组件。
- `packages/admin/src/components/ui/`：只保存后台已有真实消费者的组件。
- 本批次不创建跨包 Vue UI 包；先共享令牌和纯函数，避免为了少量复用引入新的包边界。

---

## 四、实施任务

### Task 1：冻结基线并分类现有改动

**文件：**
- Read: `docs/superpowers/plans/2026-07-18-frontend-redesign-stabilization-and-hardening.md`
- Read: `packages/site-astro/src/styles/*.css`
- Read: `packages/admin/src/components/ui/*.vue`
- Read: `packages/site-astro/src/components/ui/*.vue`

- [ ] **Step 1：记录工作区状态**

运行：

```powershell
git status --short
git diff --stat
git diff --check
```

验证：只记录现有改动，不执行 reset、checkout、clean 或覆盖写入。

- [ ] **Step 2：确认失败基线**

运行：

```powershell
pnpm verify:admin
pnpm --filter site-astro typecheck
pnpm --filter site-astro test
```

预期：后台构建仍因缺失组件失败；站点类型检查通过；站点测试存在与当前审查一致的失败。

- [ ] **Step 3：建立失败分类清单**

将失败分为三类并写入实施记录：

- 真实行为回归：必须修实现。
- 所有权/类名迁移：验证行为保持后更新测试定位。
- 原计划已取消的视觉契约：必须先明确替代行为，再修改测试。

此步骤不修改测试。

---

### Task 2：恢复站点令牌和模块化 CSS 入口

**文件：**
- Modify: `packages/site-astro/src/styles/global.css`
- Modify: `packages/site-astro/src/styles/tokens.css`
- Modify as needed: `packages/site-astro/src/styles/base.css`
- Test: `packages/site-astro/tests/motion-theme-static.test.ts`
- Test: `packages/site-astro/tests/responsive-vintage-static.test.ts`
- Create: `packages/site-astro/tests/design-system-static.test.ts`

- [ ] **Step 1：先写入口契约测试**

在 `design-system-static.test.ts` 中验证：

```ts
expect(globalCss).toContain("@import '../../../shared/src/tokens.css';")
expect(globalCss).toContain("@import './tokens.css';")
expect(globalCss.indexOf("../../../shared/src/tokens.css"))
  .toBeLessThan(globalCss.indexOf("./tokens.css"))
expect(globalCss).toContain("@import './base.css';")
expect(sharedTokens).toContain("html[data-theme='night']")
```

- [ ] **Step 2：运行测试确认失败**

运行：

```powershell
pnpm --filter site-astro exec vitest run tests/design-system-static.test.ts
```

预期：共享令牌和站点覆盖尚未由入口导入，测试失败。

- [ ] **Step 3：最小修复导入顺序**

`global.css` 顶部采用以下顺序：

```css
@import '../../../shared/src/tokens.css';
@import './tokens.css';
@import './base.css';
@import './typography.css';
@import './layout.css';
@import './components.css';
@import './animations.css';
@import './view-transitions.css';
@import './custom-cursor.css';
@import './accessibility.css';
```

要求：不在多个模块重复导入共享令牌；不删除仍被页面使用的旧令牌映射。

- [ ] **Step 4：更新令牌测试所有权**

把夜读基础色、纸张兼容色等断言指向 `packages/shared/src/tokens.css`；把纹理覆盖断言保留在站点 `tokens.css`。测试最终语义，不再假定所有变量位于同一个文件。

- [ ] **Step 5：验证站点构建与主题契约**

运行：

```powershell
pnpm --filter site-astro exec vitest run tests/design-system-static.test.ts tests/motion-theme-static.test.ts tests/responsive-vintage-static.test.ts
pnpm --filter site-astro typecheck
pnpm build:site
```

预期：全部通过，构建 CSS 同时包含日间、夜读和站点纹理变量。

- [ ] **Step 6：提交**

```powershell
git add packages/site-astro/src/styles packages/site-astro/tests/design-system-static.test.ts packages/site-astro/tests/motion-theme-static.test.ts packages/site-astro/tests/responsive-vintage-static.test.ts
git commit -m "fix: restore public design token entrypoint"
```

---

### Task 3：修复后台 UI 组件所有权和生产构建

**文件：**
- Create or complete: `packages/admin/src/components/ui/UiSkeleton.vue`
- Create or complete: `packages/admin/src/components/ui/UiEmptyState.vue`
- Create or complete: `packages/admin/src/components/ui/UiBadge.vue`
- Preserve and review: `packages/admin/src/components/ui/UiDataTable.vue`
- Modify only if needed: `packages/admin/src/views/DashboardView.vue`
- Test: `packages/admin/tests/ui-components-static.test.mjs`
- Modify: `packages/admin/package.json`

- [ ] **Step 1：写失败的后台组件解析测试**

测试必须确认 Dashboard 的三个导入目标存在，且组件只依赖共享设计令牌，不跨目录引用 `site-astro`：

```js
for (const name of ['UiSkeleton.vue', 'UiEmptyState.vue', 'UiBadge.vue']) {
  assert.equal(existsSync(resolve(adminRoot, 'src/components/ui', name)), true)
}
assert.equal(dashboard.includes('packages/site-astro'), false)
```

- [ ] **Step 2：运行测试确认失败**

```powershell
pnpm --filter admin exec node tests/ui-components-static.test.mjs
```

预期：缺失组件导致失败。

- [ ] **Step 3：实现后台当前真正需要的三个组件**

约束：

- API 只覆盖 Dashboard 当前用法。
- 不顺带创建 Avatar、Modal、Tabs、Toast 等组件。
- `UiSkeleton` 尊重 `prefers-reduced-motion`。
- `UiEmptyState` 支持标题、描述、紧凑模式和 action slot。
- `UiBadge` 支持当前 `accent/sm`，只增加已经有明确消费者的变体。

- [ ] **Step 4：把测试加入后台默认门禁**

在 `packages/admin/package.json` 的 `test:static` 中加入：

```json
"node tests/ui-components-static.test.mjs"
```

- [ ] **Step 5：验证后台**

```powershell
pnpm verify:admin
```

预期：测试、类型检查、生产构建和产物网络检查全部通过。

- [ ] **Step 6：提交**

```powershell
git add packages/admin/src/components/ui packages/admin/src/views/DashboardView.vue packages/admin/tests/ui-components-static.test.mjs packages/admin/package.json
git commit -m "fix: complete admin dashboard UI primitives"
```

---

### Task 4：修复分页算法和可访问名称

**文件：**
- Create: `packages/shared/src/pagination.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/site-astro/src/components/ui/UiPagination.vue`
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Create: `packages/site-astro/tests/pagination.test.ts`
- Modify: `packages/site-astro/tests/public-ui-feedback-static.test.ts`

- [ ] **Step 1：先写纯函数边界测试**

测试至少覆盖：

```ts
expect(buildPaginationItems(1, 1, 1)).toEqual([1])
expect(buildPaginationItems(1, 2, 1)).toEqual([1, 2])
expect(buildPaginationItems(2, 3, 1)).toEqual([1, 2, 3])
expect(buildPaginationItems(5, 10, 1)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
const numericPages = buildPaginationItems(1, 3, 1)
  .filter((item): item is number => typeof item === 'number')
expect(new Set(numericPages).size).toBe(3)
```

- [ ] **Step 2：运行测试确认失败**

```powershell
pnpm --filter site-astro exec vitest run tests/pagination.test.ts
```

预期：共享函数尚不存在。

- [ ] **Step 3：实现唯一分页算法**

要求：

- 始终返回升序项目。
- 数字页码不重复。
- 省略号不连续。
- 当前页被限制在 `1..totalPages`。
- `totalPages <= 1` 返回 `[1]`。

- [ ] **Step 4：让 UiPagination 使用纯函数**

同时补充：

```vue
<button
  type="button"
  :aria-label="`第 ${page} 页`"
  :aria-current="page === modelValue ? 'page' : undefined"
>
```

上一页、下一页和页码按钮全部显式 `type="button"`。

- [ ] **Step 5：恢复分页后的滚动行为**

`RosterWall` 使用显式更新处理器：

```vue
<UiPagination
  :model-value="currentPage"
  :total-pages="totalPages"
  @update:model-value="goToPage"
/>
```

`goToPage()` 校验边界、更新页码并滚动到名录顶部；尊重减少动态时使用 `behavior: 'auto'`。

- [ ] **Step 6：验证**

```powershell
pnpm --filter site-astro exec vitest run tests/pagination.test.ts tests/public-ui-feedback-static.test.ts
pnpm --filter site-astro typecheck
```

- [ ] **Step 7：提交**

```powershell
git add packages/shared/src/pagination.ts packages/shared/src/index.ts packages/site-astro/src/components/ui/UiPagination.vue packages/site-astro/src/components/RosterWall.vue packages/site-astro/tests/pagination.test.ts packages/site-astro/tests/public-ui-feedback-static.test.ts
git commit -m "fix: make roster pagination unique and accessible"
```

---

### Task 5：恢复人物长廊共享元素返回契约

**文件：**
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Preserve: `packages/site-astro/src/layouts/MainLayout.astro`
- Test: `packages/site-astro/tests/active-card-motion-static.test.ts`
- Test: `packages/site-astro/tests/roster-pagination.spec.ts`
- Test: `packages/site-astro/tests/student-identity-transition-flow.spec.ts`

- [ ] **Step 1：保留现有失败契约**

不删除以下要求：

- 返回名录前，新文档中存在原卡片目标。
- 搜索词和页码恢复。
- `visibleSlugs` 只显示原分页结果。
- 减少动态时不执行额外运动。

- [ ] **Step 2：运行针对性测试确认失败**

```powershell
pnpm --filter site-astro exec vitest run tests/active-card-motion-static.test.ts
```

- [ ] **Step 3：采用最小兼容实现**

名录恢复为渲染完整 `classmates`，使用 `v-show="isCardVisible(mate)"` 控制当前分页。保留新的 `UiPagination`、空状态和搜索视觉，不重写 MainLayout 的恢复协议。

理由：班级规模有限，完整 DOM 成本低于重新设计跨文档目标注入协议的复杂度。

- [ ] **Step 4：验证静态与浏览器流程**

```powershell
pnpm --filter site-astro exec vitest run tests/active-card-motion-static.test.ts tests/public-state-regressions.test.ts
pnpm --filter site-astro test:with-build
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/roster-pagination.spec.ts tests/student-identity-transition-flow.spec.ts
```

预期：首页、搜索页和非第一页进入详情后均能返回原状态。

- [ ] **Step 5：提交**

```powershell
git add packages/site-astro/src/components/RosterWall.vue packages/site-astro/tests/active-card-motion-static.test.ts packages/site-astro/tests/roster-pagination.spec.ts packages/site-astro/tests/student-identity-transition-flow.spec.ts
git commit -m "fix: preserve roster identity transitions"
```

---

### Task 6：迁移而不是削弱现有回归测试

**文件：**
- Modify: `packages/site-astro/tests/motion-theme-static.test.ts`
- Modify: `packages/site-astro/tests/responsive-vintage-static.test.ts`
- Modify: `packages/site-astro/tests/public-ui-feedback-static.test.ts`
- Modify: `packages/site-astro/tests/ui-reliability-static.test.ts`
- Modify: `packages/site-astro/tests/feature-static.test.ts`
- Modify: `packages/site-astro/tests/post-office-static.test.ts`
- Modify only after behavior decision: `packages/site-astro/tests/active-card-motion-static.test.ts`

- [ ] **Step 1：逐项验证失败属于哪一类**

必须检查最终 DOM/行为后才能修改断言：

- `.archive-grid` 改为 `.roster-grid`：如果等高卡片行为保留，更新选择器。
- 令牌移动到 shared：更新读取文件，不降低夜读色契约。
- `profile-mail-actions` 改名：继续断言写信和查看邮箱两个链接，而不是只断言类名。
- Admin 导航类名改变：断言 `<nav>` 语义、权限入口和可访问名称，不绑定旧 BEM 类名。
- “档案展柜”等文案改变：断言页面语义和核心区域，不把装饰文案当功能契约。

- [ ] **Step 2：禁止修改的保护项**

以下测试只有实现恢复后才能变绿，不得删除：

- 共享元素返回目标。
- 夜读主题变量和切换。
- `prefers-reduced-motion`。
- 写信入口和信箱入口。
- 权限感知后台导航。
- 九张卡片分页规则。

- [ ] **Step 3：运行完整站点静态测试**

```powershell
pnpm --filter site-astro test
```

预期：全部通过。

- [ ] **Step 4：提交**

```powershell
git add packages/site-astro/tests
git commit -m "test: align UI contracts with component ownership"
```

---

### Task 7：收敛和质量化 UI 组件目录

**文件：**
- Modify: `packages/site-astro/tsconfig.json`
- Review/Delete if unused: `packages/site-astro/src/components/ui/UiAvatar.vue`
- Review/Delete if unused: `packages/site-astro/src/components/ui/UiBadge.vue`
- Review/Delete if unused: `packages/site-astro/src/components/ui/UiButton.vue`
- Review/Delete if unused: `packages/site-astro/src/components/ui/UiCard.vue`
- Review/Delete if unused: `packages/site-astro/src/components/ui/UiInput.vue`
- Review/Delete if unused: `packages/site-astro/src/components/ui/UiModal.vue`
- Review/Delete if unused: `packages/site-astro/src/components/ui/UiTabs.vue`
- Review/Delete if unused: `packages/site-astro/src/components/ui/UiToast.vue`
- Preserve: `packages/site-astro/src/components/ui/UiEmptyState.vue`
- Preserve: `packages/site-astro/src/components/ui/UiPagination.vue`
- Preserve: `packages/site-astro/src/components/ui/UiSkeleton.vue`

- [ ] **Step 1：生成真实消费者清单**

```powershell
rg -n "Ui(Avatar|Badge|Button|Card|EmptyState|Input|Modal|Pagination|Skeleton|Tabs|Toast)" packages/site-astro/src packages/admin/src --glob '!**/components/ui/**'
```

- [ ] **Step 2：删除站点 UI 排除规则**

从 `packages/site-astro/tsconfig.json` 删除：

```json
"src/components/ui"
```

确保所有保留组件进入 Astro/Vue 类型门禁。

- [ ] **Step 3：处理无消费者组件**

规则：

- 没有真实消费者且不是下一独立批次立即需要的组件，从当前提交删除。
- 不保留“以后也许用到”的 Modal、Tabs、Toast。
- 后续页面真正需要时，以测试先行重新加入。
- 如果决定保留 Modal 或 Tabs，必须在同一任务补焦点陷阱、焦点恢复、键盘方向键、禁用态、多实例隔离和事件清理测试；否则不得保留。

- [ ] **Step 4：验证类型和构建**

```powershell
pnpm --filter site-astro typecheck
pnpm build:site
```

- [ ] **Step 5：提交**

```powershell
git add packages/site-astro/tsconfig.json packages/site-astro/src/components/ui
git commit -m "refactor: keep only verified UI primitives"
```

---

### Task 8：前端完整质量门禁和视觉验收

**文件：**
- Create: `docs/frontend-redesign-stabilization-acceptance.md`
- Update only if generated intentionally: visual snapshots under test result artifacts

- [ ] **Step 1：运行完整门禁**

```powershell
pnpm verify:all
git diff --check
```

预期：Worker、shared、admin、site、Playwright、构建和网络产物检查全部通过。

- [ ] **Step 2：验证非根路径**

```powershell
$env:SITE_BASE='/alumni-book-v2'
pnpm build:admin
pnpm --filter site-astro build
Remove-Item Env:SITE_BASE
```

预期：公开站点和后台资源路径正确，不出现根路径硬编码回归。

- [ ] **Step 3：视觉检查矩阵**

检查视口：

- 390×844
- 768×1024
- 1440×900

检查状态：

- 日间主题
- 夜读主题
- `prefers-reduced-motion: reduce`
- 登录前、登录后
- 加载、空状态、错误状态
- 后台主管理员和受限管理员

关键页面：首页、名录、个人页、班级空间、信箱、账号中心、后台 Dashboard。

- [ ] **Step 4：写验收报告**

报告必须记录：

- 精确提交 SHA。
- 每个验证命令与退出码。
- 已检查视口和主题。
- 已知但未纳入本批次的问题。
- 明确声明未执行生产部署。

- [ ] **Step 5：提交**

```powershell
git add docs/frontend-redesign-stabilization-acceptance.md
git commit -m "docs: record frontend stabilization acceptance"
```

---

### Task 9：统一正式同学账号与旧留言回复的 Session 校验

此任务在前端门禁重新全绿后独立实施，不与视觉修复混在同一提交。

**文件：**
- Modify: `workers/api/src/routes/messages.ts`
- Reuse: `workers/api/src/lib/classmateSession.ts`
- Test: `workers/api/tests/security.test.ts`
- Test: `packages/site-astro/tests/classmate-login-flow.spec.ts`

- [ ] **Step 1：写正式账号登录后回复留言的失败测试**

测试流程：

1. 通过 `/api/classmate-auth/login` 登录，取得四段数据库 Session Token。
2. 创建属于该同学个人页的已审核留言。
3. 携带同一 Token 调用 `PUT /api/messages/:id/reply`。
4. 期望 200，且回复内容被保存。
5. 使用另一名同学 Token 期望 403。
6. 登出后再次回复期望 401。

- [ ] **Step 2：运行测试确认当前协议不一致**

```powershell
pnpm --filter worker exec vitest run tests/security.test.ts
```

预期：正式账号 Token 不能通过旧三段 HMAC 校验。

- [ ] **Step 3：删除 messages.ts 中重复的旧 Token 解析**

移除 `fromBase64url`、`base64url`、`hmacSign`、`verifyClassmateToken` 和本地 `authClassmate`，统一调用：

```ts
import { verifyClassmateSession } from '../lib/classmateSession'

const authedSlug = await verifyClassmateSession(
  c.env.DB,
  c.req.header('X-Classmate-Token'),
)
```

保留 `/api/classmate/token` 已签发且写入数据库的兼容 Session，不在本任务移除旧入口。

- [ ] **Step 4：验证 Worker 和登录流程**

```powershell
pnpm verify:worker
pnpm --filter site-astro test:with-build
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/classmate-login-flow.spec.ts
```

- [ ] **Step 5：提交**

```powershell
git add workers/api/src/routes/messages.ts workers/api/tests/security.test.ts packages/site-astro/tests/classmate-login-flow.spec.ts
git commit -m "fix: unify classmate session verification"
```

---

## 五、后续独立实施批次

以下问题已经确认，但不得塞入上述前端稳定化提交。每一项应另写独立计划、测试先行并单独验收。

### P1：认证与防滥用

1. **登录限流**
   - 范围：`/api/auth/login`、`/api/classmate-auth/login`、`/api/classmate/token`。
   - 目标：按 IP + 账号记录失败窗口，返回 429 和 `Retry-After`，成功登录后清理或衰减计数。
   - 验证：并发失败、窗口恢复、不同账号隔离、代理头可信边界。

2. **旧公开留言和反应限流**
   - 范围：`POST /api/messages/:slug`、`PUT /api/messages/:id/react`。
   - 目标：防止匿名刷待审核队列和反应数；评估是否逐步下线旧入口。

3. **访问计数去重**
   - 范围：`POST /api/students/:slug/visit`。
   - 目标：按短期 Session/IP/时间窗去重，避免排行榜被脚本刷高。

4. **移除默认管理密码回退**
   - 范围：`workers/api/src/routes/auth.ts` 中的 `admin888`。
   - 目标：生产配置缺失时失败关闭；测试凭据只存在于测试环境。

### P1：浏览器安全和隐私

1. **收紧 CORS**
   - 只允许明确生产域、批准的 Pages 预览域和本地开发域。
   - 评估自定义 Header 认证下是否需要 `credentials: true`。

2. **补安全响应头**
   - `Content-Security-Policy`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy`
   - `Permissions-Policy`
   - `frame-ancestors`
   - 专属 `srcdoc` 模板必须保留 `sandbox="allow-scripts"` 且不允许 `allow-same-origin`。

3. **公开名录隐私过滤**
   - `/api/classmates` 不应无条件输出真实座位号、宿舍号等字段。
   - 静态 `public/data/classmates.json` 必须在修复后重新构建并检查历史产物。
   - 复用 audience 模型或为名录定义更小的公开 DTO。

4. **Session 存储长期方案**
   - 短期：限制并发 Session、清理过期记录、跨标签页同步登出。
   - 长期：评估同源 Pages Functions 下迁移至 HttpOnly、Secure、SameSite Cookie，并设计 CSRF 防护。

### P2：数据与性能

1. **相册接口 N+1 查询**
   - 把每个相册单独查询照片改为一次批量查询后按 `album_id` 分组，或使用 JOIN。
   - 用查询计数和响应等价测试验收。

2. **列表分页和字段裁剪**
   - 避免大列表 `SELECT *`。
   - 为后台消息、通知、会话和审计日志统一游标或页码上限。

3. **实时通信升级条件**
   - 当前可见性驱动的 5 秒轮询和退避机制继续保留。
   - 只有用户规模、写入量或延迟目标明确超出轮询能力时，才评估 Durable Objects/WebSocket/SSE。

4. **保持现有性能预算**
   - 不接受仅以 Lighthouse ≥80 作为成功标准。
   - 同时检查首屏 JS、首屏请求数、LCP、CLS、INP 和页面离开后的轮询停止。

### P2：数据可靠性与运维

1. **R2 孤儿文件治理**
   - 定期扫描 D1 引用与 R2 Key。
   - 验证上传失败补偿、旧文件删除失败和数据库更新失败路径。

2. **D1 备份恢复演练**
   - 备份成功不等于可恢复；定期在隔离环境执行恢复和基本查询烟测。

3. **Session 和审计保留策略**
   - 清理过期 Session。
   - 为审计日志、通知同步事件和聊天历史定义保留与归档策略。

4. **可观测性**
   - 结构化记录请求 ID、路由、状态码、耗时和错误分类。
   - 监控 5xx、登录失败、限流、D1/R2 错误和备份失败。
   - 区分 `/api/health` 与依赖可用性的 readiness 检查。

5. **双账号认证型烟测**
   - 使用两个专用测试同学账号验证登录、改密、群聊、私聊、留言回复、撤回和已读。
   - 测试结束后由脚本或管理员清理产生的数据。

---

## 六、后续视觉改造顺序

只有 Task 1–8 全绿后，才继续视觉升级。每个波次单独写实施计划，不沿用原计划的一次性 20 天大批次。

1. **公开核心旅程**：首页登录 → 人物长廊 → 个人档案。
2. **应用型页面**：班级空间 → 信箱 → 账号中心。
3. **后台高频旅程**：AdminLayout → Dashboard → Students → Messages。
4. **次要展示页面**：相册 → 时光轴 → 年度册 → 前言。

每个波次必须同步完成：

- 桌面、平板、移动端。
- 日间、夜读。
- 键盘、焦点、ARIA、减少动态。
- 现有行为测试和新增视觉流程。
- 构建、类型、性能和非根路径验证。

---

## 七、最终完成标准

本计划完成必须同时满足：

- `pnpm verify:all` 退出码 0。
- `git diff --check` 无错误。
- 根路径与 `/alumni-book-v2/` 构建均通过。
- 后台生产构建不再引用不存在的组件。
- 公开站点最终 CSS 包含共享日间/夜读令牌和站点纹理覆盖。
- 2 页、3 页和大页数分页无重复，页码具备完整可访问名称。
- 从搜索结果和非第一页进入学生详情后可以返回原状态。
- 保留 `sandbox="allow-scripts"` 且不出现 `allow-same-origin`。
- 不重新引入 GSAP/ScrollTrigger。
- 不增加原计划中未授权的产品功能。
- 视觉验收报告记录精确提交、视口、主题、命令和已知限制。
- 未执行任何生产发布或生产数据写入。
