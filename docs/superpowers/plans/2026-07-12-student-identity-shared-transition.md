# 同学身份共享转场实施计划

> **面向执行型代理：** REQUIRED SUB-SKILL: 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行。步骤以复选框追踪。

**目标：** 让人物长廊卡片中的头像和姓名以同一位学生的共享元素连续移动至标准个人页 Hero，并在返回时反向恢复。

**架构：** 保留 Astro ClientRouter 和跨文档 View Transitions。被点击卡片仅为头像、姓名写入由 slug 派生的稳定名称；标准个人页以同一 slug 生成目标。返回时，MainLayout 在 astro:before-swap 的 newDocument 中用一次性 session slug 为原卡片补回目标名称。view-transition-class 分别控制头像和姓名的动画时长；浏览器不支持该属性时，view-transition-name 仍会使用默认几何插值。详情页将身份元素与延迟进入的辅助内容分离，避免整体淡入遮挡共享快照。

**技术栈：** Astro 5、Vue 3、原生 View Transitions API、CSS、Vitest、Playwright。

---

## 文件结构

- 修改：packages/site-astro/src/components/ArchiveRosterCard.vue — 仅为被点击的可访问卡片提供头像、姓名共享名称，移除整卡与预淡出。
- 修改：packages/site-astro/src/components/StudentProfile.vue — 为标准详情 Hero 提供同名目标，并分离非身份 Hero 内容。
- 修改：packages/site-astro/src/layouts/MainLayout.astro — 在返回人物长廊的目标文档交换前恢复被点击卡片的共享目标。
- 修改：packages/site-astro/src/styles/global.css — 用身份共享类替换无调用方的 active-card 规则。
- 修改：packages/site-astro/tests/active-card-motion-static.test.ts — 锁定共享边界与减少动态回退。
- 新建：packages/site-astro/tests/student-identity-transition-flow.spec.ts — 验证进入、后退、减少动态。
- 修改：packages/site-astro/package.json — 将新浏览器用例加入预览回归脚本。

### Task 1：先建立身份共享边界的失败测试

**文件：**

- 修改：packages/site-astro/tests/active-card-motion-static.test.ts
- 修改：packages/site-astro/src/components/ArchiveRosterCard.vue
- 修改：packages/site-astro/src/components/StudentProfile.vue
- 修改：packages/site-astro/src/styles/global.css

- [ ] **步骤 1：以以下完整内容替换静态测试。**

~~~ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf-8')

describe('同学身份共享元素转场', () => {
  it('仅在被点击卡片和标准详情 Hero 间共享同一学生的头像与姓名', () => {
    const card = read('components/ArchiveRosterCard.vue')
    const profile = read('components/StudentProfile.vue')

    expect(card).toContain(':style="avatarTransitionStyle"')
    expect(card).toContain(':style="nameTransitionStyle"')
    expect(card).toContain("'student-avatar-' + props.card.slug")
    expect(card).toContain("'student-name-' + props.card.slug")
    expect(card).not.toContain('active-card')
    expect(card).not.toContain('vt-fade-out')

    expect(profile).toContain(':style="avatarTransitionStyle"')
    expect(profile).toContain(':style="nameTransitionStyle"')
    expect(profile).toContain("'student-avatar-' + student.value.slug")
    expect(profile).toContain("'student-name-' + student.value.slug")
    expect(profile).not.toContain('view-transition-name: active-card')
  })

  it('在返回人物长廊的文档交换前恢复被点击卡片的共享目标', () => {
    const card = read('components/ArchiveRosterCard.vue')
    const layout = read('layouts/MainLayout.astro')

    expect(card).toContain('data-student-identity-card')
    expect(card).toContain("sessionStorage.setItem('vt-student-identity-slug', props.card.slug)")
    expect(layout).toContain("const studentIdentityTransitionKey = 'vt-student-identity-slug'")
    expect(layout).toContain('newDocument?: Document')
    expect(layout).toContain('[data-student-identity-card]')
  })

  it('将详情辅助内容与共享身份元素分离，并保留减少动态回退', () => {
    const profile = read('components/StudentProfile.vue')
    const global = read('styles/global.css')

    expect(profile).toContain('class="hero-support detail-content-enter"')
    expect(profile).toContain('class="student-body container detail-content-enter"')
    expect(global).toContain('::view-transition-group(.student-avatar)')
    expect(global).toContain('::view-transition-group(.student-name)')
    expect(global).toContain('.student-page .detail-content-enter')
    expect(global).toContain('view-transition-name: none !important')
    expect(global).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.student-page \.detail-content-enter\s*\{[\s\S]*?animation:\s*none\s*!important;/)
    expect(global).not.toContain('::view-transition-group(active-card)')
  })
})
~~~

- [ ] **步骤 2：运行测试并确认红灯。**

运行：

~~~powershell
pnpm --filter site-astro exec vitest run tests/active-card-motion-static.test.ts
~~~

预期：失败，错误指出两个 transition style 尚不存在，且源码仍含 active-card 和 vt-fade-out。

- [ ] **步骤 3：确认红灯前没有生产代码改动。**

运行：

~~~powershell
git diff -- packages/site-astro/tests/active-card-motion-static.test.ts
git diff -- packages/site-astro/src/components/ArchiveRosterCard.vue packages/site-astro/src/components/StudentProfile.vue packages/site-astro/src/styles/global.css
~~~

预期：第一条有测试变更；第二条没有输出。

- [ ] **步骤 4：提交失败测试。**

~~~powershell
git add packages/site-astro/tests/active-card-motion-static.test.ts
git commit -m "test(site): define student identity transition contract"
~~~

### Task 2：实现 Vue 两端的最小共享元素

**文件：**

- 修改：packages/site-astro/src/components/ArchiveRosterCard.vue
- 修改：packages/site-astro/src/components/StudentProfile.vue
- 测试：packages/site-astro/tests/active-card-motion-static.test.ts

- [ ] **步骤 1：替换卡片共享边界。**

将 ArchiveRosterCard.vue 的链接、头像和姓名开头替换为：

~~~vue
<template>
  <a
    :href="card.hasPage ? card.href : '#'"
    class="archive-card"
    :data-student-identity-card="card.slug"
    @click="handleTransition"
  >
    <div class="archive-card__avatar" :style="avatarTransitionStyle">
      <img v-if="card.avatarUrl && !avatarError" ref="avatarImage" :src="avatarSrc" :alt="card.name" width="72" height="72" loading="lazy" decoding="async" style="aspect-ratio: 1" @error="markAvatarError" />
      <span v-else>{{ card.name.charAt(0) }}</span>
    </div>
    <div class="archive-card__body">
      <div class="archive-card__name" :style="nameTransitionStyle">{{ card.name }}</div>
~~~

在 isTransitioning 之后添加：

~~~ts
const avatarTransitionStyle = computed(() => {
  if (!isTransitioning.value || !props.card.hasPage) return undefined
  return {
    viewTransitionName: 'student-avatar-' + props.card.slug,
    viewTransitionClass: 'student-avatar',
  }
})

const nameTransitionStyle = computed(() => {
  if (!isTransitioning.value || !props.card.hasPage) return undefined
  return {
    viewTransitionName: 'student-name-' + props.card.slug,
    viewTransitionClass: 'student-name',
  }
})
~~~

删除组件样式中的 .vt-fade-out 和其减少动态媒体查询。将 handleTransition 保留为点击入口，并在 hasPage 分支设置 vt-student-identity-slug 为 props.card.slug；保留图片错误处理、nextTick 检查和 avatarSrc。

- [ ] **步骤 2：在标准详情页建立同名 Hero 目标。**

将 StudentProfile.vue 的标准页根节点改为：

~~~vue
<div v-else class="student-page page-shell">
~~~

将 Hero 改为如下边界，且把原来 h1 之后的昵称、展柜说明、完整度、格言、标签、信箱操作、专属标记完整移到 hero-support 内：

~~~vue
<div class="hero-content container">
  <div class="hero-avatar" :style="avatarTransitionStyle">
    <img v-if="avatarSrc && !avatarError" :src="avatarSrc" :alt="student.name" loading="eager" decoding="async" style="aspect-ratio: 1" @error="avatarError = true" />
    <span v-else class="avatar-char">{{ student.name.charAt(0) }}</span>
  </div>
  <h1 class="hero-name display-md" :style="nameTransitionStyle">{{ student.name }}</h1>
  <div class="hero-support detail-content-enter">
    <p v-if="student.info?.nickname" class="hero-nickname">「 {{ student.info.nickname }} 」</p>
    <p class="museum-kicker">档案展柜</p>
    <ProfileCompleteness
      :completion="museumSummary.completion"
      :missing-fields="museumSummary.missingFields"
    />
    <p v-if="student.info?.motto" class="hero-motto">「 {{ student.info.motto }} 」</p>
    <div v-if="museumSummary.tags.length" class="hero-tags">
      <span v-for="tag in museumSummary.tags" :key="tag">{{ tag }}</span>
    </div>
    <div class="profile-mail-actions">
      <a class="btn-secondary" :href="siteUrl('mailbox/?to=' + encodeURIComponent(studentSlug))">给 TA 写信</a>
      <a v-if="isCurrentOwner" class="btn-secondary" :href="siteUrl('mailbox/')">查看我的邮箱</a>
    </div>
    <span v-if="student.isOwner" class="owner-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      专属页面
    </span>
  </div>
</div>
~~~

把正文容器改为：

~~~vue
<div class="student-body container detail-content-enter">
~~~

在 avatarSrc 计算属性之后添加：

~~~ts
const avatarTransitionStyle = computed(() => {
  if (!student.value) return undefined
  return {
    viewTransitionName: 'student-avatar-' + student.value.slug,
    viewTransitionClass: 'student-avatar',
  }
})

const nameTransitionStyle = computed(() => {
  if (!student.value) return undefined
  return {
    viewTransitionName: 'student-name-' + student.value.slug,
    viewTransitionClass: 'student-name',
  }
})
~~~

在组件样式加入：

~~~css
.hero-support {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
}
~~~

专属 iframe 分支保持原样，它没有 Hero，也不写共享名称。

- [ ] **步骤 3：运行静态测试确认 Vue 边界转绿。**

运行：

~~~powershell
pnpm --filter site-astro exec vitest run tests/active-card-motion-static.test.ts
~~~

预期：第一条通过；第二条失败，原因仅为 global.css 尚未提供身份类别和减少动态规则。

- [ ] **步骤 4：提交 Vue 实现。**

~~~powershell
git add packages/site-astro/src/components/ArchiveRosterCard.vue packages/site-astro/src/components/StudentProfile.vue packages/site-astro/tests/active-card-motion-static.test.ts
git commit -m "feat(site): share student avatar and name across profile routes"
~~~

- [ ] **步骤 5：为返回目标接入一次性 slug 恢复。**

在 MainLayout.astro 的现有初始化代码后加入，并把现有 astro:before-swap 监听器替换为以下版本：

~~~ts
const studentIdentityTransitionKey = 'vt-student-identity-slug'

function restoreStudentIdentityTarget(event: Event) {
  try {
    const slug = sessionStorage.getItem(studentIdentityTransitionKey)
    const targetDocument = (event as Event & { newDocument?: Document }).newDocument
    if (!slug || !targetDocument) return

    const card = Array.from(targetDocument.querySelectorAll<HTMLElement>('[data-student-identity-card]'))
      .find((element) => element.dataset.studentIdentityCard === slug)
    if (!card) {
      const fromPath = (event as Event & { from?: URL }).from?.pathname || ''
      if (fromPath.includes('/student/')) sessionStorage.removeItem(studentIdentityTransitionKey)
      return
    }

    const avatar = card.querySelector<HTMLElement>('.archive-card__avatar')
    const name = card.querySelector<HTMLElement>('.archive-card__name')
    if (!avatar || !name) return

    avatar.style.viewTransitionName = 'student-avatar-' + slug
    avatar.style.setProperty('view-transition-class', 'student-avatar')
    name.style.viewTransitionName = 'student-name-' + slug
    name.style.setProperty('view-transition-class', 'student-name')
    sessionStorage.removeItem(studentIdentityTransitionKey)
  } catch {}
}

document.addEventListener('astro:before-swap', (event) => {
  window.__alumniThemeRuntime?.destroy()
  restoreStudentIdentityTarget(event)
})
~~~

该写入发生在 Astro 调用 event.swap() 前，因此新文档的卡片会进入返回方向的目标快照。

### Task 3：替换整卡 CSS 并完成降级

**文件：**

- 修改：packages/site-astro/src/styles/global.css
- 测试：packages/site-astro/tests/active-card-motion-static.test.ts

- [ ] **步骤 1：删除孤立的 active-card 样式。**

删除从注释“卡片点击四周延展与差时淡入动效”开始，到 detailContentFadeUp 关键帧结束的全部规则。不得保留 activeCardFadeOut、activeCardFadeIn、detailContentFadeUp 这三个无调用方关键帧。

- [ ] **步骤 2：在同一位置加入身份元素与详情辅助内容样式。**

~~~css
/* 3. 人物档案：只让头像与姓名作为跨页共享身份移动 */
::view-transition-group(.student-avatar) {
  animation-duration: 0.5s;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

::view-transition-group(.student-name) {
  animation-duration: 0.4s;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

.student-page .detail-content-enter {
  animation: detail-content-enter 0.52s cubic-bezier(0.16, 1, 0.3, 1) 0.18s both;
}

@keyframes detail-content-enter {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
~~~

在既有 prefers-reduced-motion 媒体查询中追加：

~~~css
  .student-page .detail-content-enter {
    animation: none !important;
  }
~~~

保留现有 [style*="view-transition-name"] 规则，它会在减少动态下清除两端的内联名称。不得修改 vt-mailbox、theme-transition、page-heading 或 page-shell。

- [ ] **步骤 3：运行静态测试确认完全转绿。**

运行：

~~~powershell
pnpm --filter site-astro exec vitest run tests/active-card-motion-static.test.ts
~~~

预期：2 个测试全部通过。

- [ ] **步骤 4：确认已无旧方案调用。**

运行：

~~~powershell
rg -n "active-card|vt-fade-out|activeCardFade|detailContentFadeUp" packages/site-astro/src
~~~

预期：没有输出。

- [ ] **步骤 5：提交 CSS 与回退。**

~~~powershell
git add packages/site-astro/src/styles/global.css packages/site-astro/tests/active-card-motion-static.test.ts
git commit -m "feat(site): animate profile identity instead of whole card"
~~~

### Task 4：浏览器覆盖进入、返回与减少动态

**文件：**

- 新建：packages/site-astro/tests/student-identity-transition-flow.spec.ts
- 修改：packages/site-astro/package.json

- [ ] **步骤 1：创建 Playwright 用例。**

~~~ts
import { expect, test } from '@playwright/test'

async function signInForNavigation(page: import('@playwright/test').Page) {
  await page.goto('./')
  await page.evaluate(() => {
    sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学', slug: 'test_init', avatarUrl: null }))
  })
}

test('点击卡片后身份元素进入 Hero，并在返回时恢复到原卡片', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  const card = page.locator('.archive-card[href]:not([href="#"])').first()
  const href = await card.getAttribute('href')
  expect(href).not.toBeNull()
  const slug = href!.split('/').filter(Boolean).at(-1)!
  const avatarName = 'student-avatar-' + slug
  const nameName = 'student-name-' + slug

  await card.click()
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await expect(page.locator('.hero-avatar')).toHaveCSS('view-transition-name', avatarName)
  await expect(page.locator('.hero-name')).toHaveCSS('view-transition-name', nameName)

  await page.evaluate(() => {
    document.addEventListener('astro:before-swap', (event) => {
      const targetDocument = (event as Event & { newDocument?: Document }).newDocument
      const targetCard = targetDocument?.querySelector<HTMLElement>('[data-student-identity-card]')
      const targetAvatar = targetCard?.querySelector<HTMLElement>('.archive-card__avatar')
      const targetName = targetCard?.querySelector<HTMLElement>('.archive-card__name')
      ;(window as Window & {
        __studentIdentityReturnTarget?: { avatar: string; name: string }
      }).__studentIdentityReturnTarget = {
        avatar: targetAvatar?.style.viewTransitionName || '',
        name: targetName?.style.viewTransitionName || '',
      }
    }, { once: true })
  })
  await page.goBack({ waitUntil: 'networkidle' })
  await expect(card).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as Window & {
    __studentIdentityReturnTarget?: { avatar: string; name: string }
  }).__studentIdentityReturnTarget)).toEqual({
    avatar: avatarName,
    name: nameName,
  })
})

test.describe('减少动态偏好', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('个人页立即显示身份元素和辅助资料', async ({ page }) => {
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })
    await page.locator('.archive-card[href]:not([href="#"])').first().click()

    await expect(page.locator('.hero-avatar')).toHaveCSS('view-transition-name', 'none')
    await expect(page.locator('.hero-name')).toHaveCSS('view-transition-name', 'none')
    await expect(page.locator('.hero-support')).toHaveCSS('opacity', '1')
    await expect(page.locator('.student-body')).toHaveCSS('opacity', '1')
  })
})
~~~

- [ ] **步骤 2：构建站点并运行新浏览器测试。**

运行：

~~~powershell
pnpm --filter site-astro build
pnpm --filter site-astro exec playwright test tests/student-identity-transition-flow.spec.ts --project=chromium
~~~

预期：测试先失败时，检查失败是否来自新用例期望与实现的真实不一致；修复实现，不降低断言强度。实现正确后两个用例通过。

- [ ] **步骤 3：把用例加入现有预览回归命令。**

将 packages/site-astro/package.json 内 test:perf-network 值的末尾追加：

~~~text
 tests/student-identity-transition-flow.spec.ts
~~~

- [ ] **步骤 4：运行直接相关的完整验证。**

~~~powershell
pnpm --filter site-astro exec vitest run tests/active-card-motion-static.test.ts tests/motion-theme-static.test.ts
pnpm --filter site-astro typecheck
pnpm --filter site-astro exec playwright test tests/student-identity-transition-flow.spec.ts tests/motion-theme-flow.spec.ts --project=chromium
~~~

预期：全部通过。

- [ ] **步骤 5：在 1440px 与 390px 完成人工验收。**

1. 卡片点击后，头像移动放大、姓名移动至 Hero，未先消失。
2. Hero 辅助信息和正文在身份元素稳定后进入，未遮挡头像或姓名。
3. 浏览器返回时，两项身份元素回到原卡片。
4. 减少动态下所有内容立即可见。
5. 信箱水波、夜读水波、一级栏目标题转场仍正常。

- [ ] **步骤 6：提交浏览器回归。**

~~~powershell
git add packages/site-astro/tests/student-identity-transition-flow.spec.ts packages/site-astro/package.json
git commit -m "test(site): cover student identity shared transitions"
~~~

### Task 5：最终质量门禁与审查

**文件：**

- 修改：本计划已列出的文件（仅在审查发现问题时）

- [ ] **步骤 1：运行完整站点验证。**

运行：

~~~powershell
pnpm verify:site
~~~

预期：管理后台构建、站点类型检查、站点构建、静态测试和预览网络回归通过。

- [ ] **步骤 2：确认变更范围与旧规则清理完成。**

运行：

~~~powershell
git status --short
git diff 72c3c47..HEAD --stat
rg -n "active-card|vt-fade-out" packages/site-astro
~~~

预期：工作树为空；变更只涉及计划列出的组件、样式、测试与脚本；最后搜索无输出。

- [ ] **步骤 3：请求独立代码审查并修复所有阻断或重要问题。**

审查必须核对：共享名称仅由学生 slug 唯一化；专属 iframe 未参与；减少动态不隐藏内容；详情延迟不包含头像姓名；信箱、主题、栏目标题三种既有转场未被改写。

- [ ] **步骤 4：在审查修复后复跑受影响验证。**

~~~powershell
pnpm --filter site-astro exec vitest run tests/active-card-motion-static.test.ts tests/motion-theme-static.test.ts
pnpm --filter site-astro typecheck
pnpm --filter site-astro exec playwright test tests/student-identity-transition-flow.spec.ts tests/motion-theme-flow.spec.ts --project=chromium
~~~

预期：全部通过，且审查中的阻断或重要问题均已修复。
