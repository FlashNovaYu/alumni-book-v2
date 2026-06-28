# Phase 11 Stability, Performance, and Experience Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the current acceptance gaps, make animation/loading behavior verifiable in a real browser, and then continue upgrading the alumni book into a faster, richer, more coherent digital museum experience.

**Architecture:** Keep the existing pnpm monorepo, Astro public site, Vue islands, Vue admin SPA, shared types/tokens, Cloudflare Worker/Hono API, D1, and R2. Fix lifecycle/cache/test-gate issues first, then add data-driven museum highlight modules and interface polish behind configuration switches so the redesign stays stable instead of becoming another source of jumpy animations.

**Tech Stack:** Astro 5, Vue 3, TypeScript, Vitest, Playwright, Cloudflare Worker/Hono, D1, R2, pnpm workspace, CSS-first motion, IntersectionObserver, requestIdleCallback fallback, browser network assertions.

---

## Current Issue Register

These problems must be treated as part of this plan, not as optional cleanup:

| ID | Severity | Current Problem | Evidence | Target State |
|---|---:|---|---|---|
| P1 | High | `StudentProfile.vue` declares `pObserver/mObserver/hObserver` inside `onMounted`, but `onUnmounted` references them outside that scope. This can throw at component teardown and invalidates the claimed observer cleanup. | `packages/site-astro/src/components/StudentProfile.vue:438-488`; built asset also contains undefined observer references. | Observers live in component scope, disconnect reliably, and are covered by a regression test. |
| P2 | High | Worker-level `no-store/no-cache` middleware conflicts with ETag/SWR performance work and route-level `public, max-age=60` headers. This risks making the site slower while trying to keep data fresh. | `workers/api/src/index.ts:56-65`, plus route headers at `index.ts:131`, `190`, `281`, `332`. | Public JSON can use ETag revalidation; admin/write responses stay `no-store`; R2 files remain immutable. |
| P3 | Medium | Browser-level performance test exists but cannot run: `pnpm --filter site-astro test:perf-network` fails with `unknown command 'test'` because Playwright is not installed/configured for this package. | `packages/site-astro/tests/performance-network.spec.ts`; command failure during acceptance. | Network test runs locally and in CI/verification, proving initial requests do not include GSAP/ScrollTrigger or lazy highlight chunks. |
| P4 | Medium | Static perf report numbers are stale compared with current `scripts/perf-budget.mjs` output. The conclusion is mostly right, but the document no longer matches exact current evidence. | `docs/phase-10-acceptance-report.md` says home `1.80 KB`; current script reports home `1.96 KB` and roster `4.02 KB`. | Acceptance docs are regenerated from current command output and distinguish static dependency checks from real browser checks. |
| P5 | Medium | `scripts/animations.ts` is no longer wired into `MainLayout`, but remains in source with GSAP/ScrollTrigger imports and stale layout comments still mention it. | `packages/site-astro/src/scripts/animations.ts`; `packages/site-astro/src/layouts/MainLayout.astro:4`. | Dead global GSAP path is removed or quarantined; animation ownership is unambiguous. |
| P6 | Medium | `client:visible` behavior for graph/seat-map modules is only statically inspected. The current budget script counts component URLs, but does not prove when the browser downloads them. | `scripts/perf-budget.mjs`; `packages/site-astro/tests/performance-network.spec.ts` not runnable. | Browser network test proves graph/seat-map chunks are not requested before scrolling near their anchors. |
| P7 | Medium | Museum config fields exist in admin/config, but public pages still render some highlight previews unconditionally. | `packages/admin/src/views/SettingsView.vue`; `packages/site-astro/src/pages/roster.astro`; `packages/site-astro/src/components/StudentProfile.vue`. | `museum.enabled`, `enableClassGraph`, and `enableSeatMap` fully control public highlight display. |
| P8 | Medium | The current highlight components are visual placeholders. They do not yet use real classmates, seats, groups, messages, or admin-configured data. | `ClassGraphPreview.vue`, `SeatMapPreview.vue`. | Highlight modules use real API data while staying lazy and lightweight. |
| P9 | Medium | Site package has no Vue/Astro typecheck gate, so runtime-scope mistakes in Vue SFCs can pass `astro build` and Vitest. | P1 passed `pnpm verify:all`. | Site verification includes SFC type/static checks that catch lifecycle-scope errors earlier. |
| P10 | Low | `runWhenIdle` fallback waits the full timeout when `requestIdleCallback` is unavailable, which can delay data refresh on some browsers. | `packages/site-astro/src/utils/deferredFetch.ts:1-8`. | Fallback schedules soon without stealing first paint. |
| P11 | Low | `StudentMusicPlayer` preloads audio aggressively once mounted, which can hurt slow networks if background music is present. | `packages/site-astro/src/components/StudentMusicPlayer.vue` rendered from `StudentProfile.vue`. | Audio uses `metadata` or `none` preload unless the user explicitly plays or autoplay succeeds. |
| P12 | Low | Working tree contains product changes plus untracked local tooling script; implementation agents must not accidentally drop or misclassify them. | `git status --short` currently shows 5 modified product files and `scripts/start-brainstorm-stable.ps1`. | Tooling artifact is either committed intentionally as local support tooling or ignored/documented separately from product work. |

## File Structure And Boundaries

### Site Stability And Animation

- Modify `packages/site-astro/src/components/StudentProfile.vue`: lifecycle observer scope, dynamic import cancellation, visit-count scheduling, highlight config props.
- Modify `packages/site-astro/src/components/PhotoWall.vue`: dynamic import cancellation and CSS-first fallback.
- Modify `packages/site-astro/src/components/StudentMusicPlayer.vue`: audio preload strategy.
- Modify `packages/site-astro/src/layouts/MainLayout.astro`: remove stale GSAP comment.
- Delete or quarantine `packages/site-astro/src/scripts/animations.ts`: remove dead global animation path.
- Modify `packages/site-astro/src/utils/deferredFetch.ts`: safer idle fallback and fetch-cache policy.
- Create `packages/site-astro/tests/student-profile-lifecycle.test.ts`: static regression for observer scope.
- Create `packages/site-astro/tests/animation-ownership.test.ts`: guard against reintroducing global GSAP owner.

### Performance Quality Gates

- Modify `packages/site-astro/package.json`: add site typecheck and Playwright performance scripts.
- Create `packages/site-astro/playwright.config.ts`: preview server and browser settings.
- Modify `packages/site-astro/tests/performance-network.spec.ts`: initial-load and scroll-trigger network assertions.
- Modify `scripts/perf-budget.mjs`: separate static dependency budget from real browser notes.
- Modify root `package.json`: include network/type checks in `verify:site` only after dependencies are ready.

### Worker Cache And Data

- Modify `workers/api/src/index.ts`: route-aware cache middleware and public config helpers.
- Modify `workers/api/tests/api.test.ts`: cache/ETag behavior tests.
- Modify `workers/api/src/routes/config.ts`: make museum config validation explicit.
- Modify `packages/shared/src/types.ts`: add highlight config and payload types if missing.

### Museum Feature Connectivity

- Modify `packages/site-astro/src/pages/roster.astro`: pass museum config and conditionally render highlights.
- Modify `packages/site-astro/src/pages/student/[slug].astro`: pass museum config into `StudentProfile`.
- Modify `packages/site-astro/src/pages/student/template.astro`: pass default museum config into `StudentProfile`.
- Modify `packages/site-astro/src/components/ClassGraphPreview.vue`: render API-backed graph summary.
- Modify `packages/site-astro/src/components/SeatMapPreview.vue`: render API-backed seat/group summary.
- Create `workers/api/src/routes/highlights.ts`: public lightweight highlight endpoints.
- Modify `workers/api/src/index.ts`: mount highlight routes.
- Create `workers/api/tests/highlights.test.ts`: graph and seat-map payload tests.

### Admin And Documentation

- Modify `packages/admin/src/views/SettingsView.vue`: clarify that feature switches control public highlight rendering.
- Modify `packages/admin/src/views/DashboardView.vue`: add quality/audit reminders for missing seat/group/message data.
- Modify `docs/phase-10-acceptance-report.md`: update stale numbers and residual risks.
- Create `docs/phase-11-acceptance-report.md`: final acceptance evidence for this plan.

---

## Task 0: Protect Current Worktree And Classify Local Artifacts

**Files:**
- Inspect only: all current dirty files.
- Possible modify: `.gitignore`
- Possible keep: `scripts/start-brainstorm-stable.ps1`

- [ ] **Step 1: Capture current status before touching code**

Run:

```powershell
git status --short --branch
git diff --stat
git diff -- packages/site-astro/src/components/NameGate.vue packages/site-astro/src/components/PrefaceWall.vue packages/site-astro/src/components/RankingsPanel.vue packages/site-astro/src/utils/deferredFetch.ts workers/api/src/index.ts
```

Expected:

```text
The command shows the current modified product files and the untracked scripts/start-brainstorm-stable.ps1 file.
No files are reverted.
```

- [ ] **Step 2: Decide how to handle `scripts/start-brainstorm-stable.ps1`**

If this repository should keep the local visual companion launcher, commit it as tooling:

```powershell
git add scripts/start-brainstorm-stable.ps1
git commit -m "chore(tooling): add stable local brainstorming launcher"
```

If this repository should not keep local tool scripts, add this exact ignore entry:

```gitignore
# 本机视觉伴随/brainstorming 辅助脚本，避免混入产品提交
scripts/start-brainstorm-stable.ps1
```

Run:

```powershell
git status --short
```

Expected:

```text
Either the script is tracked in an intentional tooling commit, or it no longer appears as an untracked product artifact.
```

---

## Task 1: Fix StudentProfile Observer Lifecycle

**Files:**
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Create: `packages/site-astro/tests/student-profile-lifecycle.test.ts`
- Modify: `packages/site-astro/package.json`

- [ ] **Step 1: Add the failing lifecycle regression test**

Create `packages/site-astro/tests/student-profile-lifecycle.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const sourcePath = path.resolve(__dirname, '../src/components/StudentProfile.vue')

describe('StudentProfile lazy observer lifecycle', () => {
  it('keeps lazy IntersectionObserver handles in component scope so unmount can disconnect them', () => {
    const source = fs.readFileSync(sourcePath, 'utf-8')
    const onMountedIndex = source.indexOf('onMounted(() => {')
    const onUnmountedIndex = source.indexOf('onUnmounted(() => {')

    expect(onMountedIndex).toBeGreaterThan(0)
    expect(onUnmountedIndex).toBeGreaterThan(onMountedIndex)

    for (const name of ['pObserver', 'mObserver', 'hObserver']) {
      const firstDeclaration = source.indexOf(`let ${name}`)
      expect(firstDeclaration, `${name} should be declared before onMounted`).toBeGreaterThan(0)
      expect(firstDeclaration, `${name} should be declared in component setup scope`).toBeLessThan(onMountedIndex)

      const mountedBody = source.slice(onMountedIndex, onUnmountedIndex)
      expect(mountedBody, `${name} must not be redeclared inside onMounted`).not.toContain(`let ${name}`)
      expect(source.slice(onUnmountedIndex), `${name} should be disconnected on unmount`).toContain(`${name}?.disconnect()`)
    }
  })
})
```

Modify `packages/site-astro/package.json` so the test script includes this file:

```json
"test": "vitest run tests/navigation.test.ts tests/privacy-static.test.ts tests/feature-static.test.ts tests/performance-static.test.ts tests/student-profile-lifecycle.test.ts"
```

- [ ] **Step 2: Run the test and verify it fails before the fix**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/student-profile-lifecycle.test.ts
```

Expected:

```text
FAIL with a message that pObserver should be declared before onMounted.
```

- [ ] **Step 3: Move observer handles to component setup scope**

In `packages/site-astro/src/components/StudentProfile.vue`, near the existing lazy anchor state, replace this block:

```ts
const highlightsAnchor = ref<HTMLElement | null>(null)
const highlightsVisible = ref(false)
```

with:

```ts
const highlightsAnchor = ref<HTMLElement | null>(null)
const highlightsVisible = ref(false)

let pObserver: IntersectionObserver | null = null
let mObserver: IntersectionObserver | null = null
let hObserver: IntersectionObserver | null = null
```

Then remove the inner declarations currently inside `onMounted`:

```ts
let pObserver: IntersectionObserver | null = null
let mObserver: IntersectionObserver | null = null
let hObserver: IntersectionObserver | null = null
```

- [ ] **Step 4: Make cleanup idempotent**

Replace the current `onUnmounted` block with:

```ts
onUnmounted(() => {
  pObserver?.disconnect()
  mObserver?.disconnect()
  hObserver?.disconnect()
  pObserver = null
  mObserver = null
  hObserver = null

  if (gsapCtx) {
    gsapCtx.revert()
    gsapCtx = null
  }
})
```

- [ ] **Step 5: Verify fix**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/student-profile-lifecycle.test.ts
pnpm --filter site-astro test:with-build
```

Expected:

```text
The lifecycle test passes.
The full site build and static test suite pass.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add packages/site-astro/src/components/StudentProfile.vue packages/site-astro/tests/student-profile-lifecycle.test.ts packages/site-astro/package.json
git commit -m "fix(site): disconnect lazy student observers on unmount"
```

---

## Task 2: Restore Cache And ETag Performance Semantics

**Files:**
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/tests/api.test.ts`
- Modify: `packages/site-astro/src/utils/deferredFetch.ts`
- Modify: `packages/site-astro/src/components/NameGate.vue`
- Modify: `packages/site-astro/src/components/PrefaceWall.vue`
- Modify: `packages/site-astro/src/components/RankingsPanel.vue`

- [ ] **Step 1: Add cache behavior tests**

Append these tests to `workers/api/tests/api.test.ts` inside the `Public API` describe block:

```ts
it('GET /api/classmates uses revalidation-friendly cache headers instead of no-store', async () => {
  const req = new Request('http://localhost/api/classmates')
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)

  expect(res.status).toBe(200)
  const cacheControl = res.headers.get('Cache-Control') || ''
  expect(cacheControl).toContain('no-cache')
  expect(cacheControl).not.toContain('no-store')
})

it('GET /api/config supports ETag conditional revalidation', async () => {
  const firstReq = new Request('http://localhost/api/config')
  const firstCtx = createExecutionContext()
  const firstRes = await worker.fetch(firstReq, env, firstCtx)
  await waitOnExecutionContext(firstCtx)

  const etag = firstRes.headers.get('ETag')
  expect(firstRes.status).toBe(200)
  expect(etag).toBeTruthy()

  const secondReq = new Request('http://localhost/api/config', {
    headers: { 'If-None-Match': etag || '' },
  })
  const secondCtx = createExecutionContext()
  const secondRes = await worker.fetch(secondReq, env, secondCtx)
  await waitOnExecutionContext(secondCtx)

  expect(secondRes.status).toBe(304)
})
```

- [ ] **Step 2: Run tests and verify current behavior fails**

Run:

```powershell
pnpm verify:worker
```

Expected:

```text
At least the no-store assertion fails before the middleware is changed.
```

- [ ] **Step 3: Replace broad no-store middleware with route-aware cache policy**

In `workers/api/src/index.ts`, replace the current `/api/*` cache middleware with:

```ts
const PUBLIC_REVALIDATED_GET_PREFIXES = [
  '/api/classmates',
  '/api/students',
  '/api/config',
  '/api/albums',
  '/api/rankings',
  '/api/messages',
  '/api/timeline',
  '/api/highlights',
]

function isPublicRevalidatedGet(path: string) {
  return PUBLIC_REVALIDATED_GET_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

// 动态 API 缓存策略：
// - 公开 GET JSON 允许浏览器保存并用 ETag 重新验证，避免重复下载完整响应。
// - 管理、认证、写操作仍禁用存储，避免隐私与后台状态污染。
// - R2 文件路由保留后续专用 immutable 缓存头。
app.use('/api/*', async (c, next) => {
  await next()

  const path = c.req.path
  if (path.startsWith('/api/files/')) return

  if (c.req.method === 'GET' && isPublicRevalidatedGet(path)) {
    c.res.headers.set('Cache-Control', 'no-cache, max-age=0, must-revalidate')
    return
  }

  c.res.headers.set('Cache-Control', 'no-store, must-revalidate')
  c.res.headers.set('Pragma', 'no-cache')
  c.res.headers.set('Expires', '0')
})
```

- [ ] **Step 4: Keep SWR helper as the single freshness owner**

In `packages/site-astro/src/utils/deferredFetch.ts`, keep `cache: 'no-cache'` only in `fetchJsonIfChanged`, because that helper sends `If-None-Match` and can consume `304`:

```ts
const res = await fetch(url, { headers, cache: 'no-cache' })
```

In one-off non-SWR requests, remove unnecessary `cache: 'no-cache'` unless the request must always bypass a possibly fresh cache:

```ts
// NameGate.vue
const res = await fetch(url)

// PrefaceWall.vue can keep SWR later; for now use default fetch.
const res = await fetch(`${props.apiBase}/api/config`)

// RankingsPanel.vue can use default fetch because server revalidation controls freshness.
const res = await fetch(`${props.apiBase}/api/rankings`)
```

- [ ] **Step 5: Verify cache and app tests**

Run:

```powershell
pnpm verify:worker
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

Expected:

```text
Worker tests pass.
Site tests pass.
Perf budget remains under current thresholds.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add workers/api/src/index.ts workers/api/tests/api.test.ts packages/site-astro/src/utils/deferredFetch.ts packages/site-astro/src/components/NameGate.vue packages/site-astro/src/components/PrefaceWall.vue packages/site-astro/src/components/RankingsPanel.vue
git commit -m "fix(api): restore etag revalidation for public json"
```

---

## Task 3: Add Site Typecheck And Browser Network Performance Gate

**Files:**
- Modify: `packages/site-astro/package.json`
- Create: `packages/site-astro/playwright.config.ts`
- Modify: `packages/site-astro/tests/performance-network.spec.ts`
- Modify: root `package.json`

- [ ] **Step 1: Add dependencies and scripts**

Run:

```powershell
pnpm --filter site-astro add -D @playwright/test vue-tsc
```

Modify `packages/site-astro/package.json` scripts:

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "npm run build:data && astro build",
    "build:data": "tsx scripts/fetch-data.ts",
    "preview": "astro preview",
    "typecheck": "vue-tsc --noEmit",
    "test": "vitest run tests/navigation.test.ts tests/privacy-static.test.ts tests/feature-static.test.ts tests/performance-static.test.ts tests/student-profile-lifecycle.test.ts tests/animation-ownership.test.ts",
    "test:with-build": "pnpm build && pnpm test",
    "test:perf-network": "pnpm build && playwright test tests/performance-network.spec.ts"
  }
}
```

- [ ] **Step 2: Add Playwright config**

Create `packages/site-astro/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4329',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm preview --host 127.0.0.1 --port 4329',
    url: 'http://127.0.0.1:4329',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
```

- [ ] **Step 3: Replace network tests with initial-load and scroll assertions**

Replace `packages/site-astro/tests/performance-network.spec.ts` with:

```ts
import { test, expect } from '@playwright/test'

function isJsRequest(url: string) {
  return url.endsWith('.js') || url.includes('.js?')
}

function hasAsset(requests: string[], token: string) {
  return requests.some((url) => isJsRequest(url) && url.toLowerCase().includes(token.toLowerCase()))
}

test('home page does not request GSAP or ScrollTrigger on initial load', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (req) => requests.push(req.url()))

  await page.goto('/', { waitUntil: 'networkidle' })

  expect(hasAsset(requests, 'scrolltrigger')).toBe(false)
  expect(hasAsset(requests, 'gsap')).toBe(false)
})

test('timeline page keeps animation libraries out of initial load', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (req) => requests.push(req.url()))

  await page.goto('/timeline/', { waitUntil: 'networkidle' })

  expect(hasAsset(requests, 'scrolltrigger')).toBe(false)
  expect(hasAsset(requests, 'gsap')).toBe(false)
})

test('roster highlight chunks are loaded only after scrolling near the highlight area', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (req) => requests.push(req.url()))

  await page.setViewportSize({ width: 1280, height: 640 })
  await page.goto('/roster/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  expect(hasAsset(requests, 'ClassGraphPreview')).toBe(false)
  expect(hasAsset(requests, 'SeatMapPreview')).toBe(false)

  await page.locator('.lazy-highlights').scrollIntoViewIfNeeded()
  await page.waitForLoadState('networkidle')

  expect(hasAsset(requests, 'ClassGraphPreview')).toBe(true)
  expect(hasAsset(requests, 'SeatMapPreview')).toBe(true)
})

test('student template remains interactive without console errors on hydrate and unmount', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await page.goto('/student/template/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.student-loading-container, .student-page, .student-error-container').first()).toBeVisible()
  await page.goto('/roster/', { waitUntil: 'domcontentloaded' })

  expect(consoleErrors).toEqual([])
})
```

- [ ] **Step 4: Wire verification**

Modify root `package.json`:

```json
"verify:site": "pnpm --filter site-astro typecheck && pnpm --filter site-astro test:with-build && pnpm --filter site-astro test:perf-network"
```

- [ ] **Step 5: Install browser once on machines without Playwright browsers**

Run:

```powershell
pnpm --filter site-astro exec playwright install chromium
```

Expected:

```text
Chromium browser is installed or already present.
```

- [ ] **Step 6: Verify**

Run:

```powershell
pnpm --filter site-astro typecheck
pnpm --filter site-astro test:perf-network
pnpm verify:all
```

Expected:

```text
All commands pass.
Browser-level network assertions are now part of the site quality gate.
```

- [ ] **Step 7: Commit**

Run:

```powershell
git add package.json packages/site-astro/package.json packages/site-astro/playwright.config.ts packages/site-astro/tests/performance-network.spec.ts pnpm-lock.yaml
git commit -m "test(site): add browser network performance gate"
```

---

## Task 4: Clean Animation Ownership And Dynamic Import Cancellation

**Files:**
- Delete: `packages/site-astro/src/scripts/animations.ts`
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/PhotoWall.vue`
- Create: `packages/site-astro/tests/animation-ownership.test.ts`
- Modify: `packages/site-astro/package.json`

- [ ] **Step 1: Add animation ownership regression test**

Create `packages/site-astro/tests/animation-ownership.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const siteRoot = path.resolve(__dirname, '../src')

function read(relative: string) {
  return fs.readFileSync(path.join(siteRoot, relative), 'utf-8')
}

describe('animation ownership', () => {
  it('does not keep the old global GSAP animation owner wired into the layout', () => {
    const layout = read('layouts/MainLayout.astro')

    expect(layout).not.toContain('../scripts/animations')
    expect(layout).not.toContain('initAnimations')
    expect(layout).toContain('../scripts/globalReveal')
  })

  it('does not keep the old global animations source file with top-level GSAP imports', () => {
    const animationPath = path.join(siteRoot, 'scripts/animations.ts')
    if (!fs.existsSync(animationPath)) {
      expect(fs.existsSync(animationPath)).toBe(false)
      return
    }

    const source = fs.readFileSync(animationPath, 'utf-8')
    expect(source).not.toContain("import gsap from 'gsap'")
    expect(source).not.toContain("from 'gsap/ScrollTrigger'")
  })
})
```

- [ ] **Step 2: Remove stale layout comment**

In `packages/site-astro/src/layouts/MainLayout.astro`, replace:

```astro
// GSAP 动画系统 — 见 scripts/animations.ts
import '../styles/global.css'
```

with:

```astro
// 全局样式与轻量 reveal 动效；页面级重动画必须按需加载
import '../styles/global.css'
```

- [ ] **Step 3: Delete the dead global animation file**

Run:

```powershell
Remove-Item -LiteralPath packages/site-astro/src/scripts/animations.ts
```

- [ ] **Step 4: Guard lazy GSAP imports in `StudentProfile.vue`**

In `StudentProfile.vue`, add a disposed flag near `let gsapCtx`:

```ts
let gsapCtx: any = null
let disposed = false
```

At the beginning of `onMounted`, set:

```ts
disposed = false
```

Inside `triggerGSAPAnimations`, after each dynamic import resolves and before using DOM refs, check:

```ts
if (disposed || !rootRef.value) return
```

In `onUnmounted`, set:

```ts
disposed = true
```

- [ ] **Step 5: Guard lazy GSAP imports in `PhotoWall.vue`**

In `PhotoWall.vue`, add:

```ts
let disposed = false
```

Update `onMounted`:

```ts
onMounted(() => {
  disposed = false
  isMounted.value = true
  import('gsap/ScrollTrigger').then(({ ScrollTrigger }) => {
    if (disposed) return
    import('gsap').then(({ default: gsap }) => {
      if (disposed || !photoWallRoot.value) return
      gsap.registerPlugin(ScrollTrigger)
      gsapCtx = gsap.context(() => {
        gsap.fromTo('.photo-item', { autoAlpha: 0, y: 24 },
          {
            autoAlpha: 1,
            y: 0,
            stagger: 0.08,
            duration: 0.45,
            ease: 'back.out(1.4)',
            scrollTrigger: { trigger: '.photo-wall', start: 'top 85%', once: true },
          }
        )
      }, photoWallRoot.value)
    })
  })
})
```

Update `onUnmounted`:

```ts
onUnmounted(() => {
  disposed = true
  if (gsapCtx) {
    gsapCtx.revert()
    gsapCtx = null
  }
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
```

- [ ] **Step 6: Verify**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/animation-ownership.test.ts
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

Expected:

```text
Animation ownership test passes.
Site build passes.
Perf budget does not include global GSAP/ScrollTrigger on home, timeline, or roster.
```

- [ ] **Step 7: Commit**

Run:

```powershell
git add packages/site-astro/src/layouts/MainLayout.astro packages/site-astro/src/components/StudentProfile.vue packages/site-astro/src/components/PhotoWall.vue packages/site-astro/tests/animation-ownership.test.ts packages/site-astro/package.json
git add -u packages/site-astro/src/scripts/animations.ts
git commit -m "fix(site): clarify animation ownership and lazy import cleanup"
```

---

## Task 5: Wire Museum Feature Switches To Public Pages

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/site-astro/src/pages/roster.astro`
- Modify: `packages/site-astro/src/pages/student/[slug].astro`
- Modify: `packages/site-astro/src/pages/student/template.astro`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/tests/feature-static.test.ts`
- Modify: `workers/api/tests/api.test.ts`

- [ ] **Step 1: Add static feature switch tests**

Append to `packages/site-astro/tests/feature-static.test.ts`:

```ts
it('keeps museum highlight switches visible in generated pages as configuration-driven islands', () => {
  const rosterHtml = readDistHtml('roster/index.html')
  const studentHtml = readDistHtml('student/template/index.html')

  expect(rosterHtml).toContain('client="visible"')
  expect(rosterHtml).toContain('ClassGraphPreview')
  expect(rosterHtml).toContain('SeatMapPreview')
  expect(studentHtml).toContain('StudentProfile')
})
```

This test protects the current built markers. Task 7 adds data-driven endpoint tests.

- [ ] **Step 2: Define a shared museum config shape**

In `packages/shared/src/types.ts`, ensure this type exists:

```ts
export interface MuseumConfig {
  enabled: boolean
  heroEyebrow: string
  heroTitle: string
  heroSubtitle: string
  particleLevel: 'off' | 'low' | 'medium' | 'high'
  enableClassGraph: boolean
  enableSeatMap: boolean
}
```

- [ ] **Step 3: Pass config into `StudentProfile`**

In `StudentProfile.vue`, extend props:

```ts
const props = defineProps<{
  initialStudent: Student | null
  studentSlug: string
  apiBase: string
  museum?: {
    enabled?: boolean
    enableClassGraph?: boolean
    enableSeatMap?: boolean
  }
}>()
```

Add computed switches:

```ts
const museumHighlightsEnabled = computed(() => props.museum?.enabled !== false)
const classGraphEnabled = computed(() => museumHighlightsEnabled.value && props.museum?.enableClassGraph === true)
const seatMapEnabled = computed(() => museumHighlightsEnabled.value && props.museum?.enableSeatMap === true)
const anyHighlightEnabled = computed(() => classGraphEnabled.value || seatMapEnabled.value)
```

Change the lazy highlight template:

```vue
<div v-if="anyHighlightEnabled" ref="highlightsAnchor">
  <div v-if="highlightsVisible" class="lazy-highlights">
    <ClassGraphPreview v-if="classGraphEnabled" :sampleNames="['张三', '李四', '王五']" />
    <SeatMapPreview v-if="seatMapEnabled" :seats="['1-1', '1-2', '2-1', '2-2']" />
  </div>
</div>
```

- [ ] **Step 4: Fetch and pass config in student pages**

In `packages/site-astro/src/pages/student/[slug].astro`, fetch config along with student data and pass:

```astro
let museum = {
  enabled: true,
  enableClassGraph: false,
  enableSeatMap: false,
}

try {
  const configRes = await fetch(`${API_BASE}/api/config`)
  const configJson = await configRes.json()
  museum = { ...museum, ...(configJson.data?.museum || {}) }
} catch {}

<StudentProfile client:load initialStudent={student} studentSlug={slug} apiBase={CLIENT_API_BASE} museum={museum} />
```

In `packages/site-astro/src/pages/student/template.astro`, pass the same default object.

- [ ] **Step 5: Gate roster highlights**

In `packages/site-astro/src/pages/roster.astro`, fetch config:

```astro
let museum = {
  enabled: true,
  enableClassGraph: false,
  enableSeatMap: false,
}

try {
  const configRes = await fetch(`${API_BASE}/api/config`)
  const configJson = await configRes.json()
  museum = { ...museum, ...(configJson.data?.museum || {}) }
} catch {}
```

Change highlight rendering:

```astro
{museum.enabled && (museum.enableClassGraph || museum.enableSeatMap) && (
  <div class="lazy-highlights">
    {museum.enableClassGraph && <ClassGraphPreview client:visible sampleNames={classmates.slice(0, 5).map((c) => c.name)} />}
    {museum.enableSeatMap && <SeatMapPreview client:visible seats={classmates.map((c: any) => c.seatNo).filter(Boolean).slice(0, 8)} />}
  </div>
)}
```

- [ ] **Step 6: Verify**

Run:

```powershell
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

Expected:

```text
Build passes.
Feature tests pass.
Perf budget stays under threshold whether highlights are present or absent.
```

- [ ] **Step 7: Commit**

Run:

```powershell
git add packages/shared/src/types.ts packages/site-astro/src/pages/roster.astro packages/site-astro/src/pages/student/[slug].astro packages/site-astro/src/pages/student/template.astro packages/site-astro/src/components/StudentProfile.vue packages/site-astro/tests/feature-static.test.ts workers/api/tests/api.test.ts
git commit -m "feat(site): honor museum highlight feature switches"
```

---

## Task 6: Replace Highlight Placeholders With Lightweight Data APIs

**Files:**
- Create: `workers/api/src/routes/highlights.ts`
- Modify: `workers/api/src/index.ts`
- Create: `workers/api/tests/highlights.test.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/site-astro/src/components/ClassGraphPreview.vue`
- Modify: `packages/site-astro/src/components/SeatMapPreview.vue`
- Modify: `packages/site-astro/tests/feature-static.test.ts`

- [ ] **Step 1: Define shared payload types**

Add to `packages/shared/src/types.ts`:

```ts
export interface ClassGraphNode {
  slug: string
  name: string
  groupName?: string
  mbti?: string
  favoriteSong?: string
  messageCount: number
}

export interface ClassGraphEdge {
  from: string
  to: string
  reason: 'group' | 'message' | 'interest'
  weight: number
}

export interface ClassGraphPayload {
  nodes: ClassGraphNode[]
  edges: ClassGraphEdge[]
}

export interface SeatMapSeat {
  slug: string
  name: string
  seatNo: string
  groupName?: string
}

export interface SeatMapPayload {
  seats: SeatMapSeat[]
  missingSeatCount: number
}
```

- [ ] **Step 2: Add Worker highlight routes**

Create `workers/api/src/routes/highlights.ts`:

```ts
import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
}

export const highlightsRoutes = new Hono<{ Bindings: Bindings }>()

function parseInfo(value: unknown) {
  try {
    return JSON.parse(String(value || '{}'))
  } catch {
    return {}
  }
}

highlightsRoutes.get('/class-graph', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare(`
    SELECT s.slug, s.name, s.mbti, s.info, COUNT(m.id) AS message_count
    FROM students s
    LEFT JOIN messages m ON m.student_slug = s.slug AND m.is_approved = 1 AND m.is_hidden = 0
    GROUP BY s.slug
    ORDER BY s.name
  `).all()

  const nodes = (results || []).map((row: any) => {
    const info = parseInfo(row.info)
    return {
      slug: row.slug,
      name: row.name,
      groupName: info.groupName || '',
      mbti: row.mbti || info.mbti || '',
      favoriteSong: info.favoriteSong || '',
      messageCount: Number(row.message_count || 0),
    }
  })

  const edges: any[] = []
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]
      const b = nodes[j]
      if (a.groupName && a.groupName === b.groupName) {
        edges.push({ from: a.slug, to: b.slug, reason: 'group', weight: 3 })
      } else if (a.favoriteSong && a.favoriteSong === b.favoriteSong) {
        edges.push({ from: a.slug, to: b.slug, reason: 'interest', weight: 1 })
      }
    }
  }

  return c.json({ success: true, data: { nodes, edges: edges.slice(0, 40) } })
})

highlightsRoutes.get('/seat-map', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare('SELECT slug, name, info FROM students ORDER BY name').all()

  let missingSeatCount = 0
  const seats = (results || []).flatMap((row: any) => {
    const info = parseInfo(row.info)
    if (!info.seatNo) {
      missingSeatCount += 1
      return []
    }
    return [{
      slug: row.slug,
      name: row.name,
      seatNo: info.seatNo,
      groupName: info.groupName || '',
    }]
  })

  return c.json({ success: true, data: { seats, missingSeatCount } })
})
```

Mount it in `workers/api/src/index.ts`:

```ts
import { highlightsRoutes } from './routes/highlights'

app.route('/api/highlights', highlightsRoutes)
```

- [ ] **Step 3: Add Worker tests**

Create `workers/api/tests/highlights.test.ts`:

```ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it, beforeAll } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.prepare(`
    UPDATE students
    SET info = ?
    WHERE slug = 'test'
  `).bind(JSON.stringify({
    groupName: '第一小组',
    seatNo: '3-2',
    favoriteSong: '同桌的你',
  })).run()
})

describe('Highlight APIs', () => {
  it('GET /api/highlights/class-graph returns graph payload', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/highlights/class-graph'), env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.nodes)).toBe(true)
    expect(Array.isArray(body.data.edges)).toBe(true)
  })

  it('GET /api/highlights/seat-map returns seats and missing count', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/highlights/seat-map'), env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.seats)).toBe(true)
    expect(typeof body.data.missingSeatCount).toBe('number')
  })
})
```

- [ ] **Step 4: Update preview components to fetch real payloads after hydration**

In `ClassGraphPreview.vue`, add props and fetch:

```ts
const props = defineProps<{
  apiBase?: string
  sampleNames?: string[]
}>()

const loading = ref(false)
const graph = ref<{ nodes: any[]; edges: any[] } | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch(`${props.apiBase || ''}/api/highlights/class-graph`)
    const json = await res.json()
    if (json.success) graph.value = json.data
  } finally {
    loading.value = false
  }
})
```

Render summary text:

```vue
<p v-if="graph">已整理 {{ graph.nodes.length }} 位同学与 {{ graph.edges.length }} 条关系线索。</p>
<p v-else-if="loading">正在整理班级关系线索...</p>
<p v-else>根据兴趣、座位、小组和留言互动生成的班级关系入口。</p>
```

In `SeatMapPreview.vue`, fetch `/api/highlights/seat-map` and render:

```vue
<p v-if="seatMap">已收录 {{ seatMap.seats.length }} 个座位，{{ seatMap.missingSeatCount }} 位同学待补充。</p>
```

- [ ] **Step 5: Verify**

Run:

```powershell
pnpm verify:worker
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

Expected:

```text
Highlight APIs pass tests.
Site build remains below performance budget.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add workers/api/src/routes/highlights.ts workers/api/src/index.ts workers/api/tests/highlights.test.ts packages/shared/src/types.ts packages/site-astro/src/components/ClassGraphPreview.vue packages/site-astro/src/components/SeatMapPreview.vue packages/site-astro/tests/feature-static.test.ts
git commit -m "feat(highlights): add data-driven class graph and seat map previews"
```

---

## Task 7: Improve Perceived Loading Speed

**Files:**
- Modify: `packages/site-astro/src/utils/deferredFetch.ts`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/StudentMusicPlayer.vue`
- Modify: `packages/site-astro/tests/performance-static.test.ts`

- [ ] **Step 1: Make idle fallback fast but non-blocking**

Replace `runWhenIdle` in `packages/site-astro/src/utils/deferredFetch.ts`:

```ts
export function runWhenIdle(task: () => void, timeout = 2500) {
  if (typeof window === 'undefined') return
  if ('requestIdleCallback' in window) {
    ;(window as any).requestIdleCallback(task, { timeout })
    return
  }
  window.setTimeout(task, Math.min(timeout, 80))
}
```

- [ ] **Step 2: Move visit counter out of the first critical moment**

In `StudentProfile.vue`, wrap visit-count fetch with `runWhenIdle`:

```ts
const visitKey = `visited_${slugVal.value}`
if (!sessionStorage.getItem(visitKey)) {
  sessionStorage.setItem(visitKey, '1')
  runWhenIdle(() => {
    fetch(`${props.apiBase}/api/students/${slugVal.value}/visit`, { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (d.success && student.value) {
          student.value.visitCount = d.data.visitCount
        }
      })
      .catch(() => {})
  }, 1200)
}
```

- [ ] **Step 3: Reduce audio preload pressure**

In `StudentMusicPlayer.vue`, change audio preload:

```vue
<audio
  ref="audioRef"
  :src="getPhotoUrl(musicUrl)"
  loop
  :preload="musicAutoplay ? 'metadata' : 'none'"
  @play="onMusicPlay"
  @pause="onMusicPause"
></audio>
```

- [ ] **Step 4: Add a static guard for audio preload**

Append to `packages/site-astro/tests/performance-static.test.ts`:

```ts
it('does not ship eager audio preload by default', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/components/StudentMusicPlayer.vue'), 'utf-8')
  expect(source).not.toContain('preload="auto"')
  expect(source).toContain(":preload=\"musicAutoplay ? 'metadata' : 'none'\"")
})
```

- [ ] **Step 5: Verify**

Run:

```powershell
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

Expected:

```text
Site tests pass.
No performance budget regression.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add packages/site-astro/src/utils/deferredFetch.ts packages/site-astro/src/components/StudentProfile.vue packages/site-astro/src/components/StudentMusicPlayer.vue packages/site-astro/tests/performance-static.test.ts
git commit -m "perf(site): reduce noncritical student page loading pressure"
```

---

## Task 8: Strengthen Admin To Public Data Connectivity

**Files:**
- Modify: `packages/admin/src/views/SettingsView.vue`
- Modify: `packages/admin/src/views/DashboardView.vue`
- Modify: `packages/admin/src/views/StudentEditView.vue`
- Modify: `workers/api/tests/api.test.ts`
- Modify: `packages/site-astro/tests/feature-static.test.ts`

- [ ] **Step 1: Add API persistence test for museum switches**

Append to `workers/api/tests/api.test.ts` in an admin/config describe block:

```ts
it('PUT /api/config persists museum highlight switches used by public pages', async () => {
  const loginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin888' }),
  })
  const loginCtx = createExecutionContext()
  const loginRes = await worker.fetch(loginReq, env, loginCtx)
  await waitOnExecutionContext(loginCtx)
  const loginBody = await loginRes.json() as any

  const req = new Request('http://localhost/api/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginBody.data.token}`,
    },
    body: JSON.stringify({
      museum: {
        enabled: true,
        heroEyebrow: 'CLASS MEMORY MUSEUM',
        heroTitle: '青春纪念馆',
        heroSubtitle: '测试副标题',
        particleLevel: 'low',
        enableClassGraph: true,
        enableSeatMap: true,
      },
    }),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)

  expect(res.status).toBe(200)

  const readCtx = createExecutionContext()
  const readRes = await worker.fetch(new Request('http://localhost/api/config'), env, readCtx)
  await waitOnExecutionContext(readCtx)
  const readBody = await readRes.json() as any

  expect(readBody.data.museum.enableClassGraph).toBe(true)
  expect(readBody.data.museum.enableSeatMap).toBe(true)
})
```

- [ ] **Step 2: Make admin settings copy explicit**

In `SettingsView.vue`, change the label text near `enableClassGraph` and `enableSeatMap` to:

```vue
<span>在公开页展示班级图谱入口</span>
<span>在公开页展示座位记忆入口</span>
```

Add helper text below the switches:

```vue
<p class="form-hint">关闭后公开页不会渲染对应入口，也不会下载对应的懒加载组件。</p>
```

- [ ] **Step 3: Add dashboard audit hints for highlight data**

In `DashboardView.vue`, add audit items when students lack `seatNo` or `groupName` in the admin stats payload. If the current stats endpoint does not provide counts, add frontend copy only after backend support exists in the same commit:

```vue
<li v-if="stats.auditAlerts?.some(a => a.type === 'missingSeatNo')">
  座位记忆缺少座位号，请在学生档案中补全 seatNo。
</li>
<li v-if="stats.auditAlerts?.some(a => a.type === 'missingGroupName')">
  班级图谱缺少小组信息，请在学生档案中补全 groupName。
</li>
```

- [ ] **Step 4: Ensure student edit form exposes graph/seat data fields**

In `StudentEditView.vue`, verify these fields exist and persist:

```vue
<input v-model="form.info.groupName" class="text-input" placeholder="例如：第一小组" />
<input v-model="form.info.seatNo" class="text-input" placeholder="例如：3-2" />
<input v-model="form.info.dormNo" class="text-input" placeholder="例如：A302" />
```

If any field is missing, add it to the identity/profile section and include it in the existing save payload.

- [ ] **Step 5: Verify**

Run:

```powershell
pnpm verify:worker
pnpm verify:admin
pnpm --filter site-astro test:with-build
```

Expected:

```text
Admin build passes.
Config persistence tests pass.
Public build still includes the expected museum markers.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add packages/admin/src/views/SettingsView.vue packages/admin/src/views/DashboardView.vue packages/admin/src/views/StudentEditView.vue workers/api/tests/api.test.ts packages/site-astro/tests/feature-static.test.ts
git commit -m "feat(admin): connect museum switches and highlight data hints"
```

---

## Task 9: Visual Polish Without Reintroducing Jank

**Files:**
- Modify: `packages/site-astro/src/styles/global.css`
- Modify: `packages/site-astro/src/components/ArchiveRosterCard.vue`
- Modify: `packages/site-astro/src/components/MessageWall.vue`
- Modify: `packages/site-astro/src/components/ClassGraphPreview.vue`
- Modify: `packages/site-astro/src/components/SeatMapPreview.vue`
- Modify: `packages/site-astro/tests/performance-static.test.ts`

- [ ] **Step 1: Add a single museum motion utility**

In `global.css`, add:

```css
.museum-motion-soft {
  transition:
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 180ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.museum-motion-soft:hover {
  transform: translateY(-2px);
}

@media (prefers-reduced-motion: reduce) {
  .museum-motion-soft,
  .museum-motion-soft:hover {
    transition: none !important;
    transform: none !important;
  }
}
```

- [ ] **Step 2: Apply the utility to card-like museum elements**

Add `museum-motion-soft` to:

```vue
<!-- ArchiveRosterCard.vue -->
<a class="archive-card museum-motion-soft" ...>

<!-- MessageWall.vue -->
<div class="msg-item fade-in-msg museum-motion-soft" ...>

<!-- ClassGraphPreview.vue -->
<section class="graph-preview museum-paper museum-motion-soft">

<!-- SeatMapPreview.vue -->
<section class="seat-preview museum-paper museum-motion-soft">
```

- [ ] **Step 3: Guard against large layout shifts in cards**

In `ArchiveRosterCard.vue`, ensure avatar and status areas have stable dimensions:

```css
.archive-card__avatar {
  width: 64px;
  height: 64px;
  flex: 0 0 64px;
}

.archive-card__status {
  min-height: 22px;
}
```

- [ ] **Step 4: Add reduced-motion static guard**

Append to `performance-static.test.ts`:

```ts
it('museum hover motion has reduced-motion overrides', () => {
  const globalCss = fs.readFileSync(path.resolve(__dirname, '../src/styles/global.css'), 'utf-8')
  expect(globalCss).toContain('.museum-motion-soft')
  expect(globalCss).toContain('@media (prefers-reduced-motion: reduce)')
  expect(globalCss).toContain('.museum-motion-soft:hover')
})
```

- [ ] **Step 5: Verify**

Run:

```powershell
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

Expected:

```text
CSS-only polish passes tests.
No JS budget change.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add packages/site-astro/src/styles/global.css packages/site-astro/src/components/ArchiveRosterCard.vue packages/site-astro/src/components/MessageWall.vue packages/site-astro/src/components/ClassGraphPreview.vue packages/site-astro/src/components/SeatMapPreview.vue packages/site-astro/tests/performance-static.test.ts
git commit -m "style(site): polish museum motion without js overhead"
```

---

## Task 10: Update Acceptance Reports And Verification Matrix

**Files:**
- Modify: `docs/phase-10-acceptance-report.md`
- Create: `docs/phase-11-acceptance-report.md`
- Modify: `docs/animation-audit.md`
- Modify: `docs/performance-baseline.md`

- [ ] **Step 1: Capture fresh command evidence**

Run:

```powershell
pnpm verify:all
node scripts/perf-budget.mjs
pnpm --filter site-astro test:perf-network
git status --short
```

Expected:

```text
All verification commands pass.
git status shows only intentional documentation changes before the final commit.
```

- [ ] **Step 2: Update Phase 10 report with residual-risk note**

In `docs/phase-10-acceptance-report.md`, add this section near the top:

```md
## 验收后修正记录

Phase 10 初始验收发现三个需要在 Phase 11 修复的问题：

1. `StudentProfile.vue` 的懒加载观察器声明位置导致卸载清理存在运行时错误风险。
2. Worker 全局 `no-store` 缓存头与 ETag/SWR 性能目标冲突。
3. 浏览器级网络性能测试文件存在，但 Playwright 未安装配置，未进入质量门。

这些问题已纳入 `docs/superpowers/plans/2026-06-28-phase-11-stability-performance-experience.md`。
```

- [ ] **Step 3: Create Phase 11 acceptance report**

Create `docs/phase-11-acceptance-report.md`:

```md
# Phase 11 稳定性、性能与体验提升验收报告

报告日期: 2026-06-28

## 修复范围

1. 修复学生详情页懒加载观察器卸载清理作用域问题。
2. 恢复公开 JSON API 的 ETag 重新验证语义，避免 `no-store` 破坏 SWR 缓存。
3. 接入 Playwright 浏览器级网络性能测试。
4. 清理旧全局 GSAP 动画入口，明确动画所有权。
5. 将纪念馆亮点入口接入后台配置开关和真实数据 API。
6. 优化非关键请求、音频预加载和 CSS-only 动效。

## 验证命令

```powershell
pnpm verify:all
node scripts/perf-budget.mjs
pnpm --filter site-astro test:perf-network
```

## 验收标准

- 首页、时间轴、同学录初始加载不请求 GSAP/ScrollTrigger。
- 图谱与座位记忆在滚动前不下载对应组件 chunk。
- 学生详情页跳转卸载不产生控制台错误。
- 公开 API 支持 ETag revalidation，后台/写操作仍禁止存储。
- `museum.enabled`、`enableClassGraph`、`enableSeatMap` 能控制公开页显示。
```

- [ ] **Step 4: Update animation and performance docs**

In `docs/animation-audit.md`, add:

```md
## Phase 11 动画所有权约束

- 全站不再保留旧 `scripts/animations.ts` 作为全局 GSAP owner。
- 首页、列表、留言、时间轴默认使用 CSS-first 动效。
- GSAP/ScrollTrigger 只能出现在局部组件的懒加载路径中，并必须带有卸载清理和 reduced-motion 降级。
```

In `docs/performance-baseline.md`, update the current numbers from `node scripts/perf-budget.mjs`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add docs/phase-10-acceptance-report.md docs/phase-11-acceptance-report.md docs/animation-audit.md docs/performance-baseline.md
git commit -m "docs: record phase 11 acceptance evidence"
```

---

## Final Verification Checklist

Run these commands after all tasks:

```powershell
pnpm verify:all
node scripts/perf-budget.mjs
pnpm --filter site-astro test:perf-network
git status --short --branch
```

Expected final state:

```text
All tests and builds pass.
Perf budget passes.
Browser network performance tests pass.
Working tree is clean except for intentionally ignored local artifacts.
```

## Acceptance Criteria

- P1 fixed: `StudentProfile` no longer has undefined observer references at unmount.
- P2 fixed: public JSON responses are revalidation-friendly and no longer globally `no-store`.
- P3 fixed: Playwright network test runs and is part of site verification.
- P4 fixed: documentation numbers match fresh command output.
- P5 fixed: dead global GSAP owner is removed or no longer contains top-level GSAP imports.
- P6 fixed: browser test proves lazy highlight chunks are downloaded only after scroll.
- P7 fixed: museum feature switches control public rendering.
- P8 improved: graph and seat-map previews use real API data.
- P9 fixed: site package has a typecheck/static lifecycle gate that catches SFC mistakes earlier.
- P10 improved: idle fallback does not delay refresh for 2.5 seconds on browsers without `requestIdleCallback`.
- P11 improved: background audio does not preload full media by default.
- P12 resolved: local tooling script is intentionally tracked or ignored, not left as ambiguous dirty state.

## Self-Review

- Spec coverage: every current acceptance issue P1-P12 maps to at least one task.
- Placeholder scan: the plan contains no `TBD`, no vague “add tests” step without code, and no unspecified validation commands.
- Type consistency: `MuseumConfig`, `ClassGraphPayload`, and `SeatMapPayload` names are consistent across shared types, Worker payloads, and Vue preview components.
