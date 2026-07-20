# 同学档案卡双向边缘转场实施计划

**目标：** 在自托管站点中恢复稳定的跨页面共享元素能力，并实现卡片四边背景外扩、非身份信息内坍缩、头像姓名连续移动到个人页 Hero 的双向边缘转场。

**架构：** 使用 Astro `ClientRouter` 驱动同一文档上下文内的页面交换，点击捕获阶段记录档案卡矩形并写入 CSS 自定义属性；View Transition 的 root 新快照从卡片矩形开始向外展开，头像和姓名通过同名共享元素组完成连续移动。根页面不再叠加整页左右位移；不支持 View Transition API 或减少动态效果时回退为普通导航。

**技术栈：** Astro 5、Vue 3、Astro View Transitions、CSS View Transition pseudo-elements、TypeScript、Vitest、Playwright。

---

## 文件边界

- 修改 `packages/site-astro/src/layouts/MainLayout.astro`：恢复受控 ClientRouter、捕获档案卡矩形、设置/清理转场状态、保留主题/信箱运行时。
- 修改 `packages/site-astro/src/styles/view-transitions.css`：移除全局禁用规则，新增矩形外扩、信息坍缩和共享身份层级动画；保留减少动态效果退化。
- 修改 `packages/site-astro/src/components/ArchiveRosterCard.vue`：区分头像姓名与其他卡片信息，并在点击时只为标准个人页设置共享身份名。
- 修改 `packages/site-astro/src/components/StudentProfile.vue`：让个人页 Hero 头像与姓名继续使用与卡片一致的共享身份名。
- 修改 `packages/site-astro/tests/motion-theme-static.test.ts`：将旧的“关闭跨文档转场”断言改为受控导航契约。
- 新建 `packages/site-astro/tests/student-dual-edge-transition-static.test.ts`：锁定双向边缘 CSS/布局契约。
- 修改 `packages/site-astro/tests/student-identity-transition-flow.spec.ts`：验证导航仍可完成、身份目标存在、减少动态效果下不出现共享动画。
- 修改 `packages/site-astro/tests/motion-theme-flow.spec.ts`：确认普通栏目允许标题共享过渡，且明暗模式水波不被档案卡转场改动。
- 修改 `docs/superpowers/specs/2026-07-20-student-card-dual-edge-transition-design.md`：记录已确认的不叠加整页左右位移决策。

## Task 1：先写并验证失败的静态契约

**Files:**
- Create: `packages/site-astro/tests/student-dual-edge-transition-static.test.ts`

- [ ] **Step 1: 写失败断言**

测试应读取真实源码并断言以下契约：

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const layout = readFileSync(resolve(root, 'src/layouts/MainLayout.astro'), 'utf8')
const transitions = readFileSync(resolve(root, 'src/styles/view-transitions.css'), 'utf8')
const card = readFileSync(resolve(root, 'src/components/ArchiveRosterCard.vue'), 'utf8')
const profile = readFileSync(resolve(root, 'src/components/StudentProfile.vue'), 'utf8')

describe('同学档案卡双向边缘转场契约', () => {
  it('恢复受控页面交换但不叠加整页左右位移', () => {
    expect(layout).toContain("import { ClientRouter } from 'astro:transitions'")
    expect(layout).toContain('<ClientRouter />')
    expect(transitions).toContain('@view-transition')
    expect(transitions).toContain('navigation: auto')
    expect(transitions).toContain('student-edge-expand')
    expect(transitions).not.toContain('navigation: none')
  })

  it('保留身份共享元素并为非身份内容提供坍缩层', () => {
    expect(card).toContain('student-identity')
    expect(card).toContain('student-card-details')
    expect(profile).toContain('student-avatar-')
    expect(profile).toContain('student-name-')
    expect(transitions).toContain('student-card-details')
  })

  it('包含减少动态效果和普通导航退化', () => {
    expect(layout).toContain('prefers-reduced-motion')
    expect(transitions).toContain('@media (prefers-reduced-motion: reduce)')
    expect(layout).toContain('startViewTransition')
  })
})
```

- [ ] **Step 2: 运行静态测试确认红灯**

运行：`pnpm --filter site-astro exec vitest run tests/student-dual-edge-transition-static.test.ts`

预期：失败，原因是当前布局仍无 `ClientRouter`，样式仍设置 `navigation: none`，且没有 `student-edge-expand` 契约。

## Task 2：先写浏览器流程回归测试

**Files:**
- Modify: `packages/site-astro/tests/student-identity-transition-flow.spec.ts`

- [ ] **Step 1: 添加转场事件探针**

在现有登录辅助函数后增加以下测试，监听 `astro:before-preparation` 与 `astro:page-load`，同时读取根元素的矩形转场标记：

```ts
test('档案卡导航保留身份元素并使用卡片矩形作为转场起点', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    ;(window as Window & { __dualEdgeEvents?: string[] }).__dualEdgeEvents = []
    document.addEventListener('astro:before-preparation', () => {
      ;(window as Window & { __dualEdgeEvents?: string[] }).__dualEdgeEvents?.push('preparation')
    }, { once: true })
    document.addEventListener('astro:page-load', () => {
      ;(window as Window & { __dualEdgeEvents?: string[] }).__dualEdgeEvents?.push('page-load')
    }, { once: true })
  })

  const card = page.locator('.roster-card[href]:visible').first()
  await card.click()
  await expect(page).toHaveURL(/\/student\//)
  await expect.poll(() => page.evaluate(() => ({
    events: (window as Window & { __dualEdgeEvents?: string[] }).__dualEdgeEvents || [],
    avatarName: document.querySelector<HTMLElement>('.student-hero__avatar')?.style.viewTransitionName || '',
    nameName: document.querySelector<HTMLElement>('.student-hero__name')?.style.viewTransitionName || '',
  }))).toMatchObject({ events: ['preparation', 'page-load'] })
})
```

- [ ] **Step 2: 运行该测试确认红灯**

运行：`pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/student-identity-transition-flow.spec.ts`

预期：新增用例失败于 `astro:before-preparation` 未触发，旧有身份恢复用例保持可见结果，便于区分新增契约与已有功能。

## Task 3：恢复受控 Astro 页面交换并记录卡片矩形

**Files:**
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`

- [ ] **Step 1: 恢复 ClientRouter 挂载**

在现有布局 frontmatter 引入 `ClientRouter`，并在 `<head>` 中放置 `<ClientRouter />`。页面 guard、主题初始化和同源 API 配置保持原样。

- [ ] **Step 2: 在点击捕获阶段记录转场状态**

为拥有 `/student/` 目标的 `[data-student-identity-card]` 链接读取 `getBoundingClientRect()`，写入：

```ts
document.documentElement.dataset.studentTransition = 'edge'
document.documentElement.style.setProperty('--student-card-left', `${rect.left}px`)
document.documentElement.style.setProperty('--student-card-top', `${rect.top}px`)
document.documentElement.style.setProperty('--student-card-right', `${innerWidth - rect.right}px`)
document.documentElement.style.setProperty('--student-card-bottom', `${innerHeight - rect.bottom}px`)
sessionStorage.setItem('vt-student-return-slug', slug)
```

仅当 `matchMedia('(prefers-reduced-motion: reduce)').matches` 为 false 且 `document.startViewTransition` 存在时设置 `data-student-transition`；否则保留普通链接行为。

- [ ] **Step 3: 在 Astro 生命周期中清理临时状态**

在 `astro:before-preparation` 为非档案卡导航清除 `data-student-transition`；在 `astro:page-load` 和 `pageshow` 中清除 CSS 变量、方向标记和临时 sessionStorage，确保刷新或返回时不会污染下一次导航。

- [ ] **Step 4: 运行静态类型检查**

运行：`pnpm --filter site-astro typecheck`

预期：通过；若 `astro:transitions` 类型声明或事件类型报错，只修正布局中新增的窄类型，不改动现有 guard/API 逻辑。

## Task 4：实现双向边缘 CSS 与身份层级

**Files:**
- Modify: `packages/site-astro/src/styles/view-transitions.css`
- Modify: `packages/site-astro/src/components/ArchiveRosterCard.vue`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`

- [ ] **Step 1: 取消全局共享元素禁用规则**

将 `@view-transition` 改为 `navigation: auto`；删除会匹配所有 `[style*="view-transition-name"]` 的全局 `none !important`，仅保留 `prefers-reduced-motion` 下的关闭规则。

- [ ] **Step 2: 添加矩形背景外扩**

新增 `::view-transition-new(root)` 规则，从 `inset(var(--student-card-top) var(--student-card-right) var(--student-card-bottom) var(--student-card-left))` 扩展到负 inset；使用 `clip-path`，不设置圆角，确保起点四边与卡片边界重合。

- [ ] **Step 3: 添加身份与非身份层级动画**

在 `ArchiveRosterCard.vue` 中给非身份内容增加 `student-card-details` 包裹层，只为头像姓名设置 `viewTransitionName` 与 `viewTransitionClass: 'student-identity'`；在 `StudentProfile.vue` 为 Hero 两个目标使用相同 class。

CSS 中设置 `::view-transition-group(.student-identity)` 的 z-index 和时长，使其高于 root 覆盖层；为 `student-card-details` 设置缩放至 `0.2`、淡出动画。

- [ ] **Step 4: 验证减少动态效果退化**

在 `@media (prefers-reduced-motion: reduce)` 中关闭 root、identity、details 所有动画和 view-transition name，并保留现有页面可见状态。

## Task 5：绿色验证、构建和阿里云验收

**Files:**
- Modify: `packages/site-astro/tests/motion-theme-flow.spec.ts`（仅在主题测试受影响时）
- Modify: `packages/site-astro/tests/student-identity-transition-flow.spec.ts`

- [ ] **Step 1: 运行静态与目标流程测试**

运行：

```powershell
pnpm --filter site-astro test
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/student-identity-transition-flow.spec.ts tests/motion-theme-flow.spec.ts
```

预期：所有 Vitest 与 Playwright 用例通过；主题圆形水波仍通过，普通栏目标题共享过渡和档案卡转场新增断言通过。

- [ ] **Step 2: 运行站点类型检查与构建**

运行：`pnpm --filter site-astro typecheck; pnpm --filter site-astro build`

预期：构建成功，产物无 Cloudflare 地址回退。

- [ ] **Step 3: 运行自托管构建产物扫描**

运行：`$env:RELEASE_SHA=(git rev-parse HEAD).Trim(); pnpm build:selfhosted -- --api-base http://118.178.88.227; Remove-Item Env:RELEASE_SHA`

预期：`deploy/selfhosted/release.json` 的目标为 `aliyun-selfhosted`，扫描不发现 Cloudflare 地址；不提交生成的 `deploy/selfhosted` 内容，除非仓库现有发布流程明确要求。

- [ ] **Step 4: 执行公网自托管 smoke**

运行：`node scripts/smoke-selfhosted.mjs --base-url http://118.178.88.227`

预期：首页、健康检查、readiness、文件 404 和 release 校验全部通过。

- [ ] **Step 5: 提交本次相关代码**

只暂存本计划涉及的站点源文件、测试、规格与计划；保留工作区中已有的后台、脚本和测试修改。提交信息：`feat(site): restore dual-edge student transition`。
