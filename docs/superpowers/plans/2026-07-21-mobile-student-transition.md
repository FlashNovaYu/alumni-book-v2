# Mobile Student Transition Continuous Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让手机端档案卡进入与返回动画连续展开，并保证背景边界始终包住移动中的头像和姓名。

**Architecture:** 保留现有 Astro View Transitions 状态机和卡片几何变量，只重写移动端 CSS 时间曲线。用静态合同锁定媒体条件和关键帧，用 Playwright 读取 View Transition 伪元素的 clip 与共享元素几何位置，验证同步关系。

**Tech Stack:** Astro View Transitions、CSS keyframes、Vitest、Playwright、pnpm、阿里云自托管发布。

---

## 文件结构

- `packages/site-astro/src/styles/view-transitions.css`：移动端进入、返回、身份元素和详情坍缩的唯一视觉实现。
- `packages/site-astro/tests/active-card-motion-static.test.ts`：锁定媒体查询、时长、缓动和关键帧结构。
- `packages/site-astro/tests/student-identity-transition-flow.spec.ts`：在真实手机视口验证身份元素不越过背景边界。
- `docs/superpowers/specs/2026-07-21-mobile-student-transition-design.md`：已批准设计依据，不在实现阶段继续扩展范围。

### Task 1: 用静态测试锁定第二版 CSS 合同

**Files:**
- Modify: `packages/site-astro/tests/active-card-motion-static.test.ts:82-93`
- Test: `packages/site-astro/tests/active-card-motion-static.test.ts`

- [ ] **Step 1: 将旧“只检查时长”用例替换为第二版合同**

```ts
it('手机端使用连续同步曲线并覆盖触摸横屏', () => {
  const viewTransitions = read('styles/view-transitions.css')
  const mobileMotion = cssBlock(
    viewTransitions,
    '@media (max-width: 768px), (max-width: 900px) and (pointer: coarse)',
  )

  expect(mobileMotion).toMatch(/html\[data-student-transition='edge'\]::view-transition-new\(root\)[\s\S]*?animation-duration:\s*1\.05s/)
  expect(mobileMotion).toMatch(/html\[data-student-transition='return-edge'\]::view-transition-old\(root\)[\s\S]*?animation-duration:\s*0\.98s/)
  expect(mobileMotion).toMatch(/html\[data-student-transition='edge'\]::view-transition-group\(\.student-identity\)[\s\S]*?animation-delay:\s*0\.08s;[\s\S]*?animation-duration:\s*0\.92s/)
  expect(mobileMotion).toMatch(/html\[data-student-transition='return-edge'\]::view-transition-group\(\.student-identity\)[\s\S]*?animation-delay:\s*0\.04s;[\s\S]*?animation-duration:\s*0\.86s/)
  expect(mobileMotion).toMatch(/::view-transition-group\(\.student-card-details\)[\s\S]*?animation-duration:\s*0\.54s/)

  const expand = cssBlock(viewTransitions, '@keyframes student-edge-expand-mobile')
  const contract = cssBlock(viewTransitions, '@keyframes student-edge-contract-mobile')
  expect(expand).toContain('92%')
  expect(expand).not.toContain('2vmax')
  expect(expand).not.toContain('24%')
  expect(contract).toContain('96%')
  expect(contract).not.toContain('76%')
})
```

- [ ] **Step 2: 运行测试并确认因旧 CSS 合同失败**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/active-card-motion-static.test.ts
```

Expected: FAIL，报告缺少触摸横屏媒体条件、`0.98s` 返回时长和新的关键帧结构。

- [ ] **Step 3: 提交测试红灯**

```powershell
git add packages/site-astro/tests/active-card-motion-static.test.ts
git commit -m "test: define continuous mobile student timing"
```

### Task 2: 添加身份元素不得越界的浏览器回归

**Files:**
- Modify: `packages/site-astro/tests/student-identity-transition-flow.spec.ts`，放在“手机端档案卡转场”描述块内
- Test: `packages/site-astro/tests/student-identity-transition-flow.spec.ts`

- [ ] **Step 1: 增加可复用的进入/返回几何采样器**

```ts
async function sampleIdentityContainment(
  page: import('@playwright/test').Page,
  selector: string,
  slug: string,
  rootPseudo: '::view-transition-new(root)' | '::view-transition-old(root)',
) {
  return page.locator(selector).first().evaluate(async (element, options) => {
    const rows: Array<{ contained: boolean; rootArea: number }> = []
    const avatarPseudo = `::view-transition-group(student-avatar-${options.slug})`
    const namePseudo = `::view-transition-group(student-name-${options.slug})`

    const insetBounds = (clipPath: string) => {
      const values = Array.from(clipPath.matchAll(/(-?\d+(?:\.\d+)?)px/g), match => Number(match[1]))
      if (values.length !== 4) return null
      return {
        top: values[0],
        right: innerWidth - values[1],
        bottom: innerHeight - values[2],
        left: values[3],
      }
    }
    const groupBounds = (pseudo: string) => {
      const style = getComputedStyle(document.documentElement, pseudo)
      if (style.width === 'auto' || style.transform === 'none') return null
      const matrix = new DOMMatrixReadOnly(style.transform)
      const width = Number.parseFloat(style.width)
      const height = Number.parseFloat(style.height)
      return { top: matrix.m42, right: matrix.m41 + width, bottom: matrix.m42 + height, left: matrix.m41 }
    }
    const contains = (outer: NonNullable<ReturnType<typeof insetBounds>>, inner: NonNullable<ReturnType<typeof groupBounds>>) => (
      inner.top >= outer.top - 2
      && inner.right <= outer.right + 2
      && inner.bottom <= outer.bottom + 2
      && inner.left >= outer.left - 2
    )

    ;(element as HTMLElement).click()
    const startedAt = performance.now()
    await new Promise<void>((resolve) => {
      const sample = () => {
        const root = insetBounds(getComputedStyle(document.documentElement, options.rootPseudo).clipPath)
        const avatar = groupBounds(avatarPseudo)
        const name = groupBounds(namePseudo)
        if (root && avatar && name) {
          rows.push({
            contained: contains(root, avatar) && contains(root, name),
            rootArea: Math.max(0, root.right - root.left) * Math.max(0, root.bottom - root.top),
          })
        }
        if (performance.now() - startedAt < 1150) requestAnimationFrame(sample)
        else resolve()
      }
      requestAnimationFrame(sample)
    })
    return rows
  }, { slug, rootPseudo })
}

test('进入和返回过程中背景边界始终包住头像与姓名', async ({ page }) => {
  await signInForNavigation(page)
  await page.goto('./roster/', { waitUntil: 'networkidle' })

  const card = page.locator('.roster-card[href]:not([href="#"]):visible').first()
  const href = await card.getAttribute('href')
  expect(href).not.toBeNull()
  const slug = href!.split('/').filter(Boolean).at(-1)!

  const enter = await sampleIdentityContainment(page, '.roster-card[href]:not([href="#"]):visible', slug, '::view-transition-new(root)')
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '$'))
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.studentTransition || '')).toBe('')
  const back = await sampleIdentityContainment(page, 'a[href*="/roster/"]', slug, '::view-transition-old(root)')

  expect(enter.length).toBeGreaterThan(20)
  expect(back.length).toBeGreaterThan(20)
  expect(enter.every(sample => sample.contained)).toBe(true)
  expect(back.every(sample => sample.contained)).toBe(true)
  expect(enter.at(-1)!.rootArea).toBeGreaterThan(enter[0].rootArea)
  expect(back.at(-1)!.rootArea).toBeLessThan(back[0].rootArea)
})
```

- [ ] **Step 2: 增加触摸横屏媒体规则的真实浏览器用例**

```ts
test.describe('手机横屏档案卡转场', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

  test('触摸横屏继续使用手机端扩散时长', async ({ page }) => {
    await signInForNavigation(page)
    await page.goto('./roster/', { waitUntil: 'networkidle' })
    const duration = page.evaluate(() => new Promise<string>((resolve) => {
      document.addEventListener('astro:before-swap', () => {
        requestAnimationFrame(() => resolve(
          getComputedStyle(document.documentElement, '::view-transition-new(root)').animationDuration,
        ))
      }, { once: true })
    }))
    await page.locator('.roster-card[href]:not([href="#"]):visible').first().click()
    expect(await duration).toBe('1.05s')
  })
})
```

- [ ] **Step 3: 运行当前动画并确认几何和横屏用例失败**

Run:

```powershell
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/student-identity-transition-flow.spec.ts --workers=1
```

Expected: FAIL at `enter.every(...)`，且横屏得到桌面端 `0.82s`；当前进入动画约 460ms 时身份元素越过背景边界。

- [ ] **Step 4: 提交行为测试红灯**

```powershell
git add packages/site-astro/tests/student-identity-transition-flow.spec.ts
git commit -m "test: prevent mobile identity from outrunning edge"
```

### Task 3: 实现连续同步型手机曲线

**Files:**
- Modify: `packages/site-astro/src/styles/view-transitions.css:240-308`
- Test: `packages/site-astro/tests/active-card-motion-static.test.ts`
- Test: `packages/site-astro/tests/student-identity-transition-flow.spec.ts`

- [ ] **Step 1: 用第二版媒体覆盖替换现有手机规则**

```css
@media (max-width: 768px), (max-width: 900px) and (pointer: coarse) {
  html[data-student-transition='edge']::view-transition-old(root) {
    animation-duration: 1.05s;
    animation-timing-function: cubic-bezier(0.25, 0.1, 0.25, 1);
  }

  html[data-student-transition='edge']::view-transition-new(root) {
    animation-name: student-edge-expand-mobile;
    animation-duration: 1.05s;
    animation-timing-function: cubic-bezier(0.25, 0.1, 0.25, 1);
  }

  html[data-student-transition='return-edge']::view-transition-old(root) {
    animation-name: student-edge-contract-mobile;
    animation-duration: 0.98s;
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }

  html[data-student-transition='edge']::view-transition-group(.student-identity) {
    animation-delay: 0.08s;
    animation-duration: 0.92s;
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }

  html[data-student-transition='return-edge']::view-transition-group(.student-identity) {
    animation-delay: 0.04s;
    animation-duration: 0.86s;
    animation-timing-function: cubic-bezier(0.25, 0.1, 0.25, 1);
  }

  ::view-transition-group(.student-card-details) {
    animation-duration: 0.54s;
  }
}
```

- [ ] **Step 2: 用连续插值关键帧替换停顿式关键帧**

```css
@keyframes student-edge-expand-mobile {
  0% {
    clip-path: inset(var(--student-card-top) var(--student-card-right) var(--student-card-bottom) var(--student-card-left));
  }
  92% { clip-path: inset(-1vmax -1vmax -1vmax -1vmax); }
  100% { clip-path: inset(-8vmax -8vmax -8vmax -8vmax); }
}

@keyframes student-edge-contract-mobile {
  0% {
    opacity: 1;
    clip-path: inset(-8vmax -8vmax -8vmax -8vmax);
  }
  8% {
    opacity: 1;
    clip-path: inset(-1vmax -1vmax -1vmax -1vmax);
  }
  96% {
    opacity: 0.72;
    clip-path: inset(var(--student-card-top) var(--student-card-right) var(--student-card-bottom) var(--student-card-left));
  }
  100% {
    opacity: 0;
    clip-path: inset(var(--student-card-top) var(--student-card-right) var(--student-card-bottom) var(--student-card-left));
  }
}
```

- [ ] **Step 3: 运行静态与浏览器测试并验证通过**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/active-card-motion-static.test.ts tests/student-dual-edge-transition-static.test.ts
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/student-identity-transition-flow.spec.ts --workers=1
```

Expected: PASS。若几何测试仍失败，停止提交并回到根因分析；不得修改路由状态机或放宽 2px 容差掩盖失败。

- [ ] **Step 4: 提交最小实现**

```powershell
git add packages/site-astro/src/styles/view-transitions.css
git commit -m "fix: synchronize mobile student edge transition"
```

### Task 4: 完成风险相称的验证

**Files:**
- No production file changes.

- [ ] **Step 1: 运行站点静态测试和类型检查**

```powershell
pnpm --filter site-astro test
pnpm --filter site-astro typecheck
```

Expected: 站点测试全部通过，类型检查 0 errors。

- [ ] **Step 2: 使用 390×844、844×390 和 4 倍 CPU 降速复核**

先运行包含竖屏和横屏用例的档案转场测试：

```powershell
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/student-identity-transition-flow.spec.ts --workers=1
```

然后启动本地产物预览，在另一个 PowerShell 中执行以下 4 倍 CPU 诊断：

```powershell
pnpm --filter site-astro exec astro preview --host 127.0.0.1 --port 4328
```

```powershell
@'
const { chromium } = require('@playwright/test')
;(async () => {
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await page.goto('http://127.0.0.1:4328/')
await page.evaluate(() => {
  sessionStorage.setItem('classmate_account_token', 'test-classmate-token')
  sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学', slug: 'test_init', avatarUrl: null }))
})
await page.goto('http://127.0.0.1:4328/roster/', { waitUntil: 'networkidle' })
const gaps = await page.locator('.roster-card[href]:not([href="#"])').first().evaluate(async (card) => {
  const rows = []
  let previous = performance.now()
  card.click()
  await new Promise((resolve) => {
    const frame = (now) => {
      const gap = now - previous
      if (gap > 25) rows.push(gap)
      previous = now
      if (rows.length < 120 && document.documentElement.dataset.studentTransition) requestAnimationFrame(frame)
      else resolve()
    }
    requestAnimationFrame(frame)
  })
  return rows
})
if (gaps.filter(gap => gap > 100).length > 1) throw new Error(`4x CPU frame gaps: ${gaps.join(', ')}`)
console.log({ frameGaps: gaps })
await browser.close()
})().catch((error) => { console.error(error); process.exit(1) })
'@ | node -
```

Expected：进入/返回完成、身份元素不越界；4 倍 CPU 下不出现两个以上超过 100ms 的帧间隔。

- [ ] **Step 3: 检查差异只包含任务文件**

```powershell
git diff --check
git status --short
git log -5 --oneline
```

Expected: 本任务仅包含规格、计划、两份测试和 `view-transitions.css`；用户已有后台、自助编辑、邮箱测试和修复计划改动保持未暂存。

### Task 5: 推送、阿里云发布与 exact-SHA 验收

**Files:**
- Build artifact: `deploy/selfhosted` in a clean detached worktree.

- [ ] **Step 1: 推送并等待 GitHub Verify**

```powershell
git push origin main
gh run list --branch main --limit 5
```

Expected: 当前提交对应的 Verify 成功；失败时停止发布并读取失败日志。

- [ ] **Step 2: 从干净 worktree 构建阿里云产物**

```powershell
$env:RELEASE_SHA = (git rev-parse HEAD).Trim()
pnpm build:selfhosted -- --api-base http://118.178.88.227
Remove-Item Env:RELEASE_SHA
```

Expected: `deploy/selfhosted/release.json` 的 `source` 为完整当前 SHA，`target` 为 `aliyun-selfhosted`。

- [ ] **Step 3: 原子发布并验证**

将产物上传到唯一临时目录，校验归档 SHA-256 和 `release.json`，移动到 `/www/wwwroot/releases/<SHA>`，原子切换 `/www/wwwroot/alumni-book` symlink，并用同一 SHA 重建现有 API 容器元数据。失败时恢复旧 symlink 和旧 `RELEASE_SHA`。

验证：

```powershell
Invoke-RestMethod http://118.178.88.227/release.json
Invoke-RestMethod http://118.178.88.227/api/health
Invoke-RestMethod http://118.178.88.227/api/readiness
```

Expected: 静态与 API SHA 等于发布提交，health 为 `ok`，readiness 为 `true`；`/roster/`、学生页和发布 CSS 返回 200，未知路径返回 404。
