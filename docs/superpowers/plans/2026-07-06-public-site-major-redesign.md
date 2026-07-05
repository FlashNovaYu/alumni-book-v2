# Public Site Major Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the public alumni book major redesign into a consistent responsive vintage paper archive, closing the previous unfinished page migrations and stabilizing animation/performance.

**Architecture:** Keep the existing Astro 5 + Vue islands structure. Add stronger static and Playwright guardrails first, then migrate pages by experience layer: design system, entry/login/navigation, browsing pages, profile/interaction modules, final performance and visual QA. Avoid backend schema changes; use existing API data and lazy-loading patterns.

**Tech Stack:** Astro 5, Vue 3 islands, TypeScript, pnpm workspace, Vitest static tests, Playwright, CSS-first responsive layout.

---

## Scope Check

This plan implements the approved spec:

- `docs/superpowers/specs/2026-07-06-public-site-major-redesign-design.md`

It intentionally focuses on the public site only:

- Do modify `packages/site-astro`.
- Do not rewrite Worker schema or Admin UI.
- Do not remove shared museum tokens globally until all public consumers are migrated.
- Do not introduce new heavy animation, 3D, panorama, or texture dependencies.

## File Structure And Responsibilities

- `packages/site-astro/tests/public-site-major-redesign-static.test.ts`
  - Static regression tests for page shell migration, legacy `museum-*` cleanup, homepage smooth scroll hook, homepage minimal nav, and GSAP ownership.
- `packages/site-astro/tests/public-site-major-redesign-visual.spec.ts`
  - Playwright smoke tests for mobile overflow, page skeleton visibility, and key responsive selectors.
- `packages/site-astro/package.json`
  - Include the new static and Playwright tests in existing scripts.
- `packages/site-astro/src/styles/tokens.css`
  - Add or refine missing vintage archive tokens only if needed.
- `packages/site-astro/src/styles/global.css`
  - Add shared page and component utilities: `content-grid`, `archive-card`, `paper-page`, `paper-note`, `paper-photo-frame`, reduced motion rules, and explicit smooth scroll behavior.
- `packages/site-astro/src/components/MuseumHero.astro`
  - Add explicit smooth scroll behavior for the cover CTA.
- `packages/site-astro/src/components/TopNav.astro`
  - Add homepage minimal logged-out nav state, paper drawer mobile menu, stable login state class.
- `packages/site-astro/src/pages/preface.astro`
  - Migrate to `page-shell` / `page-header`.
- `packages/site-astro/src/components/PrefaceWall.vue`
  - Use paper reading panel and signature cards.
- `packages/site-astro/src/pages/roster.astro`
  - Migrate to `page-shell` / `page-header`, clean old deploy comment.
- `packages/site-astro/src/components/RosterWall.vue`
  - Replace `museum-paper` with paper archive search.
- `packages/site-astro/src/components/ArchiveRosterCard.vue`
  - Replace old museum tokens with `archive-card` and paper tokens.
- `packages/site-astro/src/components/RankingsPanel.vue`
  - Replace generic `card` / plugin-like styling with paper panel styling.
- `packages/site-astro/src/components/ClassGraphPreview.vue`
  - Replace `museum-paper` with paper highlight panel.
- `packages/site-astro/src/components/SeatMapPreview.vue`
  - Replace `museum-paper` with paper highlight panel.
- `packages/site-astro/src/pages/album.astro`
  - Migrate to `page-shell` / `page-header`.
- `packages/site-astro/src/components/AlbumGrid.vue`
  - Refine filters, album panels, mobile filter scrolling, and photo frames.
- `packages/site-astro/src/pages/timeline.astro`
  - Migrate to `page-shell` / `page-header`; paper timeline and mobile single-side layout.
- `packages/site-astro/src/pages/yearbook.astro`
  - Add screen-only paper preview styling while preserving print.
- `packages/site-astro/src/components/StudentProfile.vue`
  - Restructure as personal archive, remove profile-level ScrollTrigger ownership, preserve existing fields and self-edit flow.
- `packages/site-astro/src/components/PhotoWall.vue`
  - Remove ScrollTrigger dependency; use CSS/IntersectionObserver-safe reveal and stable photo frames.
- `packages/site-astro/src/components/MessageWall.vue`
  - Tighten sticker hierarchy, mobile stability, paper tokens.
- `packages/site-astro/src/components/ProfileCompleteness.vue`
  - Replace `museum-paper` and old museum tokens with paper progress card.

---

### Task 1: Add Major Redesign Guardrail Tests

**Files:**
- Create: `packages/site-astro/tests/public-site-major-redesign-static.test.ts`
- Create: `packages/site-astro/tests/public-site-major-redesign-visual.spec.ts`
- Modify: `packages/site-astro/package.json`

- [ ] **Step 1: Create the static guardrail test**

Create `packages/site-astro/tests/public-site-major-redesign-static.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const srcRoot = path.resolve(__dirname, '../src')

function read(relativePath: string) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf-8')
}

describe('public site major redesign constraints', () => {
  it('migrates public browsing pages to shared paper page shells', () => {
    const pages = [
      'pages/preface.astro',
      'pages/roster.astro',
      'pages/album.astro',
      'pages/timeline.astro',
    ]

    for (const page of pages) {
      const source = read(page)
      expect(source, page).toContain('page-shell')
      expect(source, page).toContain('page-header')
      expect(source, page).not.toMatch(/class="[^"]*-page section"/)
    }
  })

  it('keeps yearbook screen preview paper styled while preserving print rules', () => {
    const source = read('pages/yearbook.astro')

    expect(source).toContain('yearbook-page page-shell')
    expect(source).toContain('@media screen')
    expect(source).toContain('.print-section')
    expect(source).toContain('var(--color-paper-card)')
    expect(source).toContain('@media print')
  })

  it('removes legacy museum paper styling from migrated public components', () => {
    const files = [
      'components/RosterWall.vue',
      'components/ArchiveRosterCard.vue',
      'components/RankingsPanel.vue',
      'components/ClassGraphPreview.vue',
      'components/SeatMapPreview.vue',
      'components/ProfileCompleteness.vue',
    ]

    for (const file of files) {
      const source = read(file)
      expect(source, file).not.toContain('museum-paper')
      expect(source, file).not.toContain('color-museum-')
      expect(source, file).not.toContain('shadow-museum-')
    }
  })

  it('homepage CTA has explicit reduced-motion-aware smooth scroll behavior', () => {
    const source = read('components/MuseumHero.astro')

    expect(source).toContain('data-home-login-scroll')
    expect(source).toContain('scrollIntoView')
    expect(source).toContain("behavior: prefersReducedMotion ? 'auto' : 'smooth'")
    expect(source).toContain("document.querySelector('#login')")
  })

  it('top nav supports a minimal logged-out homepage state', () => {
    const source = read('components/TopNav.astro')

    expect(source).toContain('top-nav--home')
    expect(source).toContain('has-session')
    expect(source).toContain('.top-nav--home:not(.has-session)')
    expect(source).toContain('classmate_account_student')
  })

  it('profile and photo wall do not own ScrollTrigger animations', () => {
    const studentProfile = read('components/StudentProfile.vue')
    const photoWall = read('components/PhotoWall.vue')

    expect(studentProfile).not.toContain("import('gsap/ScrollTrigger')")
    expect(studentProfile).not.toContain('scrollTrigger:')
    expect(photoWall).not.toContain("import('gsap/ScrollTrigger')")
    expect(photoWall).not.toContain('scrollTrigger:')
  })
})
```

- [ ] **Step 2: Create the Playwright visual smoke test**

Create `packages/site-astro/tests/public-site-major-redesign-visual.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

const mobilePages = ['/', '/preface/', '/roster/', '/album/', '/timeline/', '/yearbook/', '/student/template/']

test.describe('public site major redesign responsive smoke', () => {
  for (const pathname of mobilePages) {
    test(`mobile page has no horizontal overflow: ${pathname}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(pathname)

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(overflow).toBe(false)
    })
  }

  test('homepage keeps logged-out nav minimal and scrolls to login smoothly', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('.top-nav.top-nav--home')).toBeVisible()
    await expect(page.locator('.top-nav:not(.has-session) .nav-link')).toHaveCount(0)

    await page.getByTestId('home-login-cta').click()
    await expect(page.locator('#login')).toBeInViewport()
  })

  test('core browsing pages expose paper page headers', async ({ page }) => {
    for (const pathname of ['/preface/', '/roster/', '/album/', '/timeline/']) {
      await page.goto(pathname)
      await expect(page.locator('.page-shell')).toBeVisible()
      await expect(page.locator('.page-header')).toBeVisible()
    }
  })
})
```

- [ ] **Step 3: Add the tests to package scripts**

Modify `packages/site-astro/package.json` scripts:

```json
{
  "test": "vitest run tests/navigation.test.ts tests/privacy-static.test.ts tests/feature-static.test.ts tests/performance-static.test.ts tests/student-profile-lifecycle.test.ts tests/animation-ownership.test.ts tests/classmate-auth-static.test.ts tests/responsive-vintage-static.test.ts tests/public-site-major-redesign-static.test.ts",
  "test:perf-network": "playwright test tests/performance-network.spec.ts tests/classmate-login-flow.spec.ts tests/homepage-cover-login.spec.ts tests/public-site-major-redesign-visual.spec.ts"
}
```

- [ ] **Step 4: Run the new tests and verify they fail**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/public-site-major-redesign-static.test.ts
pnpm --filter site-astro exec playwright test tests/public-site-major-redesign-visual.spec.ts
```

Expected:

- Static test fails on page shells, legacy `museum-*`, smooth scroll, home nav state, and ScrollTrigger ownership.
- Playwright test may fail on home nav minimal state and page shell assertions.

- [ ] **Step 5: Commit guardrails**

Run:

```powershell
git add packages/site-astro/tests/public-site-major-redesign-static.test.ts packages/site-astro/tests/public-site-major-redesign-visual.spec.ts packages/site-astro/package.json
git commit -m "test: add public site major redesign guardrails"
```

---

### Task 2: Strengthen Paper Design System Utilities

**Files:**
- Modify: `packages/site-astro/src/styles/global.css`
- Modify: `packages/site-astro/src/styles/tokens.css`

- [ ] **Step 1: Add missing archive and paper utilities**

In `packages/site-astro/src/styles/global.css`, append this section after the existing vintage paper shared layout block:

```css
/* ── Public site major redesign utilities ── */
html {
  scroll-behavior: smooth;
}

.content-grid {
  display: grid;
  gap: var(--spacing-xl);
}

.content-grid--two {
  grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
  align-items: start;
}

.paper-page {
  width: min(860px, 100%);
  margin-inline: auto;
  padding: var(--spacing-xl);
  background:
    linear-gradient(90deg, rgba(143, 101, 60, 0.035) 1px, transparent 1px),
    var(--color-paper-card);
  background-size: 28px 100%, 100% 100%;
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-lg);
  box-shadow: var(--shadow-paper-panel);
}

.paper-note {
  padding: var(--spacing-lg);
  background: var(--color-paper-bg-soft);
  border: 1px solid var(--color-paper-border-soft);
  border-radius: var(--rounded-md);
  color: var(--color-paper-ink-soft);
}

.archive-card {
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-lg);
  box-shadow: var(--shadow-paper-card);
  color: var(--color-paper-ink);
}

.paper-highlight-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-lg);
}

.paper-photo-frame {
  background: var(--color-paper-card);
  border: 6px solid var(--color-paper-card);
  box-shadow: var(--shadow-paper-card);
}

@media (max-width: 768px) {
  html {
    scroll-behavior: auto;
  }

  .content-grid,
  .content-grid--two,
  .paper-highlight-grid {
    grid-template-columns: 1fr;
  }

  .paper-page {
    padding: var(--spacing-lg);
  }
}
```

- [ ] **Step 2: Keep reduced motion authoritative**

In the existing `@media (prefers-reduced-motion: reduce)` block in `global.css`, ensure it contains:

```css
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 3: Run utility-related tests**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/responsive-vintage-static.test.ts tests/public-site-major-redesign-static.test.ts
```

Expected:

- Existing responsive vintage tests remain passing.
- Major redesign tests still fail on unmigrated components and pages.

- [ ] **Step 4: Commit utilities**

Run:

```powershell
git add packages/site-astro/src/styles/global.css packages/site-astro/src/styles/tokens.css
git commit -m "style: strengthen paper archive utilities"
```

---

### Task 3: Refine Homepage CTA And Minimal Logged-Out Navigation

**Files:**
- Modify: `packages/site-astro/src/components/MuseumHero.astro`
- Modify: `packages/site-astro/src/components/TopNav.astro`
- Modify: `packages/site-astro/tests/homepage-cover-login.spec.ts`

- [ ] **Step 1: Mark homepage CTA anchors for explicit smooth scrolling**

In `MuseumHero.astro`, change the two login anchors:

```astro
<a href="#login" class="home-cover__scroll" data-home-login-scroll aria-label="向下滑动到登录入口">
  <span>向下滑动</span>
</a>
```

```astro
<a href="#login" class="home-login-cta__button home-scroll-reveal" data-testid="home-login-cta" data-home-login-scroll>
  翻开同学录，进入登录
</a>
```

- [ ] **Step 2: Add reduced-motion-aware smooth scroll script**

At the bottom of `MuseumHero.astro`, after the style block, add:

```astro
<script>
  function initHomeLoginScroll() {
    const target = document.querySelector('#login')
    const triggers = document.querySelectorAll('[data-home-login-scroll]')
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!target || !triggers.length) return

    triggers.forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        event.preventDefault()
        target.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start',
        })
        history.replaceState(null, '', '#login')
      })
    })
  }

  initHomeLoginScroll()
  document.addEventListener('astro:page-load', initHomeLoginScroll)
</script>
```

- [ ] **Step 3: Add home-aware classes to top nav**

In `TopNav.astro`, define:

```astro
const isHome = currentPath === base || currentPath === href('/')
---
<nav class={`top-nav ${isHome ? 'top-nav--home' : ''}`}>
```

- [ ] **Step 4: Toggle session state class in the inline nav script**

In `TopNav.astro`, inside `syncNavSession()`, get the nav:

```js
const nav = document.querySelector('.top-nav');
```

When session exists, add:

```js
if (nav) nav.classList.add('has-session');
```

When session does not exist, add:

```js
if (nav) nav.classList.remove('has-session');
```

- [ ] **Step 5: Hide homepage logged-out nav links with CSS**

In `TopNav.astro` styles, add:

```css
.top-nav--home:not(.has-session) {
  width: 220px;
}

.top-nav--home:not(.has-session) .nav-links {
  display: none;
}

.top-nav--home:not(.has-session) .nav-inner {
  justify-content: center;
}

.top-nav--home:not(.has-session) .nav-brand {
  margin-inline: auto;
}
```

Inside the mobile media query, add:

```css
.top-nav--home:not(.has-session) {
  width: min(220px, calc(100% - 1.5rem));
}

.top-nav--home:not(.has-session) .mobile-toggle {
  display: none;
}
```

- [ ] **Step 6: Tighten homepage Playwright assertions**

In `packages/site-astro/tests/homepage-cover-login.spec.ts`, add this test:

```ts
test('homepage logged-out navigation is minimal', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('.top-nav.top-nav--home')).toBeVisible()
  await expect(page.locator('.top-nav:not(.has-session) .nav-link')).toHaveCount(0)
})
```

- [ ] **Step 7: Run homepage tests**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/public-site-major-redesign-static.test.ts
pnpm --filter site-astro exec playwright test tests/homepage-cover-login.spec.ts tests/public-site-major-redesign-visual.spec.ts
```

Expected:

- Static test no longer fails on homepage CTA or nav state.
- Playwright homepage tests pass.
- Static test still fails on page shell, legacy `museum-*`, and ScrollTrigger ownership until later tasks.

- [ ] **Step 8: Commit homepage and nav refinement**

Run:

```powershell
git add packages/site-astro/src/components/MuseumHero.astro packages/site-astro/src/components/TopNav.astro packages/site-astro/tests/homepage-cover-login.spec.ts
git commit -m "feat: refine homepage entry and minimal nav"
```

---

### Task 4: Migrate Core Browsing Pages To Paper Shells

**Files:**
- Modify: `packages/site-astro/src/pages/preface.astro`
- Modify: `packages/site-astro/src/components/PrefaceWall.vue`
- Modify: `packages/site-astro/src/pages/album.astro`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/pages/timeline.astro`
- Modify: `packages/site-astro/src/pages/yearbook.astro`

- [ ] **Step 1: Migrate `preface.astro` shell**

Replace the page wrapper in `preface.astro`:

```astro
<MainLayout>
  <div class="preface-page page-shell">
    <div class="container">
      <header class="page-header fade-in">
        <p class="page-header__label">PREFACE LETTER</p>
        <h1 class="display-lg">{config.preface?.title || '致青春岁月'}</h1>
        <p class="page-header__subtitle">{config.preface?.subtitle || '写在翻开同学录之前'}</p>
      </header>

      <PrefaceWall client:load initialConfig={config} apiBase={CLIENT_API_BASE} />

      <div class="bottom-actions fade-in">
        <a href={href('/album')} class="btn-primary">进入班级相册</a>
        <a href={href('/roster')} class="btn-secondary">进入同学录主页</a>
      </div>
    </div>
  </div>
</MainLayout>
```

Remove these old unused selectors and their complete rule blocks from the style block:

```text
.preface-page
.preface-header
.preface-label
.preface-subtitle
.preface-body
.preface-text
.hairline
.acknowledgment
.ack-title
.ack-grid
.ack-person
.ack-avatar
.ack-avatar img
.avatar-placeholder
.ack-name
.ack-role
```

Keep and update only:

```css
.bottom-actions {
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
  margin-top: var(--spacing-xxl);
  padding-top: var(--spacing-xl);
  border-top: 1px solid var(--color-paper-border);
}

@media (max-width: 768px) {
  .bottom-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
```

- [ ] **Step 2: Paper-style `PrefaceWall.vue`**

In `PrefaceWall.vue`, keep all data logic and update the main reading wrapper classes to use:

```vue
<section class="preface-wall paper-page fade-in">
```

For acknowledgment/signature items, use:

```vue
<div class="ack-person paper-note">
```

Ensure styles use paper tokens:

```css
.preface-wall {
  color: var(--color-paper-ink);
}

.preface-content {
  color: var(--color-paper-ink-soft);
  line-height: 2.15;
}

.ack-person {
  color: var(--color-paper-ink);
}

.ack-role {
  color: var(--color-paper-muted);
}
```

- [ ] **Step 3: Migrate `album.astro` shell**

In `album.astro`, change the wrapper and header to:

```astro
<div class="album-page page-shell">
  <div class="container">
    <header class="page-header fade-in">
      <p class="page-header__label">IMAGE GALLERY</p>
      <h1 class="display-lg">影像馆</h1>
      <p class="page-header__subtitle">每一幅影像，都是一段珍贵的回忆</p>
    </header>
    <AlbumGrid client:load albums={albums} apiBase={CLIENT_API_BASE} />
  </div>
</div>
```

Remove the old `.album-page` padding rule and any old album header-specific rules that duplicate `page-header`, including `.album-header`, `.album-label`, and `.album-subtitle` if present.

- [ ] **Step 4: Paper-style `AlbumGrid.vue`**

Update `AlbumGrid.vue` styles:

```css
.tags-filter-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-xl);
}

.tag-filter-btn {
  min-height: 36px;
  border: 1px solid var(--color-paper-border);
  background: var(--color-paper-card);
  color: var(--color-paper-muted);
}

.tag-filter-btn.active {
  border-color: var(--color-paper-brown);
  background: var(--color-paper-brown);
  color: #fffaf2;
}

.album-section {
  margin-bottom: var(--spacing-xxl);
  padding: var(--spacing-xl);
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-lg);
  box-shadow: var(--shadow-paper-card);
}

.photo-item {
  aspect-ratio: 1;
  border: 6px solid var(--color-paper-card);
  background: var(--color-paper-card-muted);
  box-shadow: var(--shadow-paper-card);
}

@media (max-width: 768px) {
  .tags-filter-bar {
    justify-content: flex-start;
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .tag-filter-btn {
    flex: 0 0 auto;
  }

  .album-section {
    padding: var(--spacing-lg);
  }
}
```

- [ ] **Step 5: Migrate `timeline.astro` shell and paper timeline**

In `timeline.astro`, change:

```astro
<div class="timeline-page page-shell" data-base-url={base} data-api-base={CLIENT_API_BASE}>
  <div class="container">
    <header class="page-header fade-in">
      <p class="page-header__label">CLASS TIMELINE</p>
      <h1 class="display-lg">时光轴</h1>
      <p class="page-header__subtitle">把重要瞬间按时间慢慢装订成册</p>
    </header>
```

Update timeline styles:

```css
.timeline-tabs {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-xxl);
}

.tab-btn {
  min-height: 36px;
  padding: 0 var(--spacing-md);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-sm);
  background: var(--color-paper-card);
  color: var(--color-paper-muted);
}

.tab-btn.active {
  background: var(--color-paper-brown);
  border-color: var(--color-paper-brown);
  color: #fffaf2;
}

.timeline-line::before {
  background: var(--color-paper-border);
}

.tl-dot {
  background: var(--color-paper-brown);
}

.tl-card {
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  box-shadow: var(--shadow-paper-card);
}

.tl-date,
.tl-desc {
  color: var(--color-paper-muted);
}

.tl-link {
  color: var(--color-paper-brown);
}

@media (max-width: 768px) {
  .timeline-tabs {
    justify-content: flex-start;
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .tab-btn {
    flex: 0 0 auto;
  }

  .timeline-item {
    grid-template-columns: 24px minmax(0, 1fr);
  }
}
```

- [ ] **Step 6: Paper screen preview for `yearbook.astro`**

In `yearbook.astro`, change:

```astro
<div class="yearbook-page page-shell">
```

Add screen-only styling before the existing print block:

```css
@media screen {
  .yearbook-page {
    color: var(--color-paper-ink);
  }

  .print-section {
    width: min(980px, calc(100% - 2 * var(--spacing-lg)));
    margin: var(--spacing-xl) auto;
    padding: var(--spacing-xl);
    background: var(--color-paper-card);
    border: 1px solid var(--color-paper-border);
    border-radius: var(--rounded-lg);
    box-shadow: var(--shadow-paper-card);
  }

  .section-title {
    color: var(--color-paper-ink);
    border-bottom: 1px solid var(--color-paper-border);
  }
}
```

Keep the existing `@media print` block and verify it still resets page backgrounds for printing.

- [ ] **Step 7: Run browsing page tests**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/public-site-major-redesign-static.test.ts tests/navigation.test.ts tests/performance-static.test.ts
pnpm --filter site-astro build
```

Expected:

- Page shell assertions pass.
- Static test still fails on roster-related legacy `museum-*` and profile/photo ScrollTrigger until later tasks.
- Build passes.

- [ ] **Step 8: Commit browsing page migration**

Run:

```powershell
git add packages/site-astro/src/pages/preface.astro packages/site-astro/src/components/PrefaceWall.vue packages/site-astro/src/pages/album.astro packages/site-astro/src/components/AlbumGrid.vue packages/site-astro/src/pages/timeline.astro packages/site-astro/src/pages/yearbook.astro
git commit -m "style: migrate browsing pages to paper shells"
```

---

### Task 5: Rebuild Roster Archive Components

**Files:**
- Modify: `packages/site-astro/src/pages/roster.astro`
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Modify: `packages/site-astro/src/components/ArchiveRosterCard.vue`
- Modify: `packages/site-astro/src/components/RankingsPanel.vue`
- Modify: `packages/site-astro/src/components/ClassGraphPreview.vue`
- Modify: `packages/site-astro/src/components/SeatMapPreview.vue`

- [ ] **Step 1: Migrate `roster.astro` shell**

Replace the wrapper and header:

```astro
<MainLayout>
  <div class="roster-page page-shell">
    <div class="container">
      <header class="page-header fade-in">
        <p class="page-header__label">ARCHIVE CORRIDOR</p>
        <h1 class="display-lg">人物长廊</h1>
        <p class="page-header__subtitle">用档案检索重新遇见每一位同学</p>
      </header>

      <RankingsPanel client:visible apiBase={CLIENT_API_BASE} />

      <RosterWall client:load initialClassmates={classmates} apiBase={CLIENT_API_BASE} siteBase={base} />

      {museum.enabled && (museum.enableClassGraph || museum.enableSeatMap) && (
        <div class="lazy-highlights paper-highlight-grid">
          {museum.enableClassGraph && <ClassGraphPreview client:visible apiBase={CLIENT_API_BASE} sampleNames={classmates.slice(0, 5).map((c) => c.name)} />}
          {museum.enableSeatMap && <SeatMapPreview client:visible apiBase={CLIENT_API_BASE} seats={classmates.map((c: any) => c.seatNo).filter(Boolean).slice(0, 8)} />}
        </div>
      )}
    </div>
  </div>
</MainLayout>
```

Delete the stale comment:

```astro
<!-- Trigger site deployment verification on push - try 2 -->
```

Remove old unused `.roster-page`, `.roster-header`, `.roster-label`, `.classmate-grid`, `.classmate-card`, `.card-avatar`, `.card-name`, `.card-motto` styles if no longer referenced.

- [ ] **Step 2: Convert `RosterWall.vue` search strip**

Change the template search wrapper:

```vue
<div class="archive-search paper-panel">
```

Update styles:

```css
.archive-search {
  max-width: 760px;
  margin: 0 auto var(--spacing-xl);
  padding: var(--spacing-lg) var(--spacing-xl);
}

.search-input {
  min-height: 44px;
  background: var(--color-paper-bg-soft);
  border: 1px solid var(--color-paper-border);
  color: var(--color-paper-ink);
}

.search-input:focus {
  border-color: var(--color-paper-brown);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-paper-brown) 16%, transparent);
}

.search-count {
  color: var(--color-paper-muted);
}

.archive-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-lg);
}

@media (max-width: 768px) {
  .archive-search {
    padding: var(--spacing-lg);
  }

  .archive-grid {
    grid-template-columns: 1fr;
    gap: var(--spacing-md);
  }
}
```

- [ ] **Step 3: Convert `ArchiveRosterCard.vue` to `archive-card`**

In the root card template, ensure the class includes:

```vue
class="archive-card"
```

Replace old museum-token styles with:

```css
.archive-card {
  display: grid;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  text-decoration: none;
  transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart);
}

.archive-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-paper-panel);
}

.archive-card__avatar {
  background: linear-gradient(135deg, var(--color-paper-card-muted), var(--color-paper-brown-soft));
  color: var(--color-paper-ink);
  border: 1px solid var(--color-paper-border);
}

.archive-card__name {
  color: var(--color-paper-ink);
}

.archive-card__motto {
  color: var(--color-paper-muted);
}

.archive-card__tags span {
  background: color-mix(in srgb, var(--color-paper-brown) 12%, var(--color-paper-card));
  color: var(--color-paper-ink-soft);
}

.archive-card__status {
  color: var(--color-paper-stamp-red);
}
```

- [ ] **Step 4: Convert `RankingsPanel.vue` to paper**

Change root class:

```vue
<div v-if="hasData" class="rankings-card paper-panel">
```

Update styles:

```css
.rankings-card {
  margin-bottom: var(--spacing-xl);
  padding: var(--spacing-xl);
  color: var(--color-paper-ink);
}

.ranking-item {
  background: var(--color-paper-bg-soft);
  border: 1px solid var(--color-paper-border-soft);
}

.ranking-label,
.ranking-meta {
  color: var(--color-paper-muted);
}
```

- [ ] **Step 5: Convert highlight cards**

In `ClassGraphPreview.vue`, change root:

```vue
<section class="graph-preview paper-panel museum-motion-soft">
```

In `SeatMapPreview.vue`, change root:

```vue
<section class="seat-preview paper-panel museum-motion-soft">
```

Replace old color tokens in both files:

```css
background: var(--color-paper-card);
border-color: var(--color-paper-border);
color: var(--color-paper-ink);
box-shadow: var(--shadow-paper-card);
```

Use `var(--color-paper-brown)` for active accents and `var(--color-paper-muted)` for descriptions.

- [ ] **Step 6: Run roster tests**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/public-site-major-redesign-static.test.ts tests/responsive-vintage-static.test.ts
pnpm --filter site-astro exec playwright test tests/performance-network.spec.ts --grep "roster page"
pnpm --filter site-astro build
```

Expected:

- Legacy `museum-*` assertions pass for roster components.
- Roster network test still confirms lazy-loading and no GSAP / ScrollTrigger.
- Static test still fails only on profile/photo ScrollTrigger until Task 6.

- [ ] **Step 7: Commit roster archive rebuild**

Run:

```powershell
git add packages/site-astro/src/pages/roster.astro packages/site-astro/src/components/RosterWall.vue packages/site-astro/src/components/ArchiveRosterCard.vue packages/site-astro/src/components/RankingsPanel.vue packages/site-astro/src/components/ClassGraphPreview.vue packages/site-astro/src/components/SeatMapPreview.vue
git commit -m "style: rebuild roster archive components"
```

---

### Task 6: Rework Profile Archive And Remove ScrollTrigger Ownership

**Files:**
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/PhotoWall.vue`
- Modify: `packages/site-astro/src/components/MessageWall.vue`
- Modify: `packages/site-astro/src/components/ProfileCompleteness.vue`
- Modify: `packages/site-astro/tests/student-profile-lifecycle.test.ts`
- Modify: `packages/site-astro/tests/performance-network.spec.ts`

- [ ] **Step 1: Add profile animation ownership assertions**

In `packages/site-astro/tests/student-profile-lifecycle.test.ts`, add:

```ts
it('student profile and photo wall avoid ScrollTrigger ownership after redesign', () => {
  const profile = fs.readFileSync(path.resolve(__dirname, '../src/components/StudentProfile.vue'), 'utf-8')
  const photoWall = fs.readFileSync(path.resolve(__dirname, '../src/components/PhotoWall.vue'), 'utf-8')

  expect(profile).not.toContain("import('gsap/ScrollTrigger')")
  expect(profile).not.toContain('scrollTrigger:')
  expect(photoWall).not.toContain("import('gsap/ScrollTrigger')")
  expect(photoWall).not.toContain('scrollTrigger:')
})
```

- [ ] **Step 2: Run profile tests and verify failure**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/student-profile-lifecycle.test.ts tests/public-site-major-redesign-static.test.ts
```

Expected: FAIL because `StudentProfile.vue` and `PhotoWall.vue` currently contain ScrollTrigger imports/usages.

- [ ] **Step 3: Remove GSAP state and functions from `StudentProfile.vue`**

In `StudentProfile.vue`, delete:

```ts
let gsapCtx: any = null
```

Delete the full `triggerGSAPAnimations()` function, including dynamic imports of `gsap/ScrollTrigger` and `gsap`.

Remove calls to:

```ts
triggerGSAPAnimations()
```

Remove the `ScrollTrigger.refresh()` dynamic import block after lazy component loads.

In `onBeforeUnmount`, remove:

```ts
if (gsapCtx) {
  gsapCtx.revert()
  gsapCtx = null
}
```

- [ ] **Step 4: Replace profile hero parallax with CSS-only stability**

In `StudentProfile.vue` styles, ensure:

```css
.student-archive-hero {
  position: relative;
  width: min(1120px, calc(100% - 2 * var(--spacing-lg)));
  margin: calc(var(--nav-height) + var(--spacing-xl)) auto 0;
  padding: var(--spacing-xl);
  overflow: hidden;
  background: var(--color-paper-card);
}

.student-archive-hero .hero-bg {
  opacity: 0.1;
  transform: none;
}

.profile-section {
  margin-bottom: var(--spacing-xl);
  padding: var(--spacing-xl);
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-lg);
  box-shadow: var(--shadow-paper-card);
}

@media (max-width: 768px) {
  .student-archive-hero {
    width: calc(100% - 2 * var(--spacing-md));
    margin-top: calc(var(--nav-height) + var(--spacing-lg));
    padding: var(--spacing-lg);
  }

  .profile-section {
    padding: var(--spacing-lg);
  }
}
```

- [ ] **Step 5: Convert `ProfileCompleteness.vue` to paper tokens**

Change root:

```vue
<aside class="profile-completeness paper-card" aria-label="资料完整度">
```

Update styles:

```css
.profile-completeness {
  padding: var(--spacing-md);
  border-radius: var(--rounded-md);
}

.profile-completeness__top {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-md);
  color: var(--color-paper-ink);
}

.profile-completeness__track {
  height: 8px;
  margin: var(--spacing-sm) 0;
  overflow: hidden;
  border-radius: var(--rounded-pill);
  background: color-mix(in srgb, var(--color-paper-brown) 10%, var(--color-paper-card));
}

.profile-completeness__bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-paper-brown), var(--color-paper-gold));
  transition: width var(--duration-slow) var(--ease-out-quart);
}

.profile-completeness__hint {
  color: var(--color-paper-muted);
  font-size: 13px;
  line-height: 1.6;
}
```

- [ ] **Step 6: Remove ScrollTrigger from `PhotoWall.vue`**

In `PhotoWall.vue`, delete:

```ts
let gsapCtx: any = null
```

Delete the dynamic imports:

```ts
import('gsap/ScrollTrigger')
import('gsap')
```

Delete the `gsap.fromTo` animation block and cleanup that reverts `gsapCtx`.

Use CSS reveal instead:

```css
.photo-item {
  opacity: 1;
  transform: none;
  aspect-ratio: 1;
  border: 6px solid var(--color-paper-card);
  background: var(--color-paper-card-muted);
  box-shadow: var(--shadow-paper-card);
}

@media (prefers-reduced-motion: no-preference) {
  .photo-item {
    transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart);
  }

  .photo-item:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-paper-panel);
  }
}

@media (max-width: 768px) {
  .photo-item:hover {
    transform: none;
  }
}
```

- [ ] **Step 7: Tighten `MessageWall.vue` paper and mobile stability**

Ensure mobile overrides contain:

```css
@media (max-width: 768px) {
  .msg-style-selector {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: var(--spacing-xxs);
    -webkit-overflow-scrolling: touch;
  }

  .style-select-btn {
    flex: 0 0 auto;
  }

  .msg-item,
  .msg-item:nth-child(even),
  .msg-item:nth-child(odd),
  .msg-item:hover {
    transform: none !important;
  }

  .reply-form {
    flex-direction: column;
    align-items: stretch;
  }
}
```

Ensure message card base uses:

```css
.msg-item {
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  box-shadow: var(--shadow-paper-card);
}
```

- [ ] **Step 8: Extend student network test to forbid ScrollTrigger**

In `packages/site-astro/tests/performance-network.spec.ts`, inside the student page test after lazy loading completes, add:

```ts
const hasScrollTrigger = requests.some(url => url.toLowerCase().includes('scrolltrigger') && (url.endsWith('.js') || url.includes('.js?')))
expect(hasScrollTrigger, 'Student page should not load ScrollTrigger after CSS-first profile redesign').toBe(false)
```

- [ ] **Step 9: Run profile and network tests**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/student-profile-lifecycle.test.ts tests/public-site-major-redesign-static.test.ts tests/animation-ownership.test.ts
pnpm --filter site-astro exec playwright test tests/performance-network.spec.ts --grep "student page"
pnpm --filter site-astro build
```

Expected:

- Static tests pass for ScrollTrigger ownership.
- Student page network test confirms no ScrollTrigger.
- Build passes.

- [ ] **Step 10: Commit profile and interaction stability work**

Run:

```powershell
git add packages/site-astro/src/components/StudentProfile.vue packages/site-astro/src/components/PhotoWall.vue packages/site-astro/src/components/MessageWall.vue packages/site-astro/src/components/ProfileCompleteness.vue packages/site-astro/tests/student-profile-lifecycle.test.ts packages/site-astro/tests/performance-network.spec.ts
git commit -m "style: rework profile archive and remove scrolltrigger ownership"
```

---

### Task 7: Integrate Interaction Highlights Into The Paper System

**Files:**
- Modify: `packages/site-astro/src/components/ClassGraphPreview.vue`
- Modify: `packages/site-astro/src/components/SeatMapPreview.vue`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/site-astro/tests/public-site-major-redesign-static.test.ts`

- [ ] **Step 1: Add static assertions for highlight placement**

In `public-site-major-redesign-static.test.ts`, add:

```ts
it('student profile keeps interaction highlights lazy and paper grouped', () => {
  const source = read('components/StudentProfile.vue')

  expect(source).toContain('id="highlights-anchor"')
  expect(source).toContain('class="lazy-anchor"')
  expect(source).toContain('profile-highlights')
  expect(source).toContain('ClassGraphPreview')
  expect(source).toContain('SeatMapPreview')
})
```

- [ ] **Step 2: Run static test and verify failure**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/public-site-major-redesign-static.test.ts
```

Expected: FAIL if `profile-highlights` grouping is not present yet.

- [ ] **Step 3: Group student highlights in `StudentProfile.vue`**

In the highlights block, wrap graph and seat modules:

```vue
<div v-if="highlightsVisible" class="profile-highlights paper-highlight-grid">
  <ClassGraphPreview v-if="classGraphEnabled" :apiBase="apiBase" :sampleNames="['张三', '李四', '王五']" />
  <SeatMapPreview v-if="seatMapEnabled" :apiBase="apiBase" :seats="['1-1', '1-2', '2-1', '2-2']" />
</div>
```

Add styles:

```css
.profile-highlights {
  margin-top: var(--spacing-xl);
}
```

- [ ] **Step 4: Make highlight previews feel like archive features**

In `ClassGraphPreview.vue`, ensure heading and description copy are about classmate links, and styles use:

```css
.graph-preview {
  padding: var(--spacing-xl);
  color: var(--color-paper-ink);
}

.graph-preview__eyebrow,
.graph-preview__meta {
  color: var(--color-paper-brown);
}

.graph-preview__description {
  color: var(--color-paper-muted);
}
```

In `SeatMapPreview.vue`, ensure styles use:

```css
.seat-preview {
  padding: var(--spacing-xl);
  color: var(--color-paper-ink);
}

.seat-preview__eyebrow,
.seat-preview__meta {
  color: var(--color-paper-brown);
}

.seat-preview__description {
  color: var(--color-paper-muted);
}

.seat-cell {
  background: var(--color-paper-bg-soft);
  border: 1px solid var(--color-paper-border);
}
```

- [ ] **Step 5: Paper-style time capsule editing section**

In `SelfEditPanel.vue`, keep existing fields and labels. Style `.edit-section` with:

```css
.edit-section {
  padding: var(--spacing-lg);
  background: var(--color-paper-bg-soft);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-md);
}

.section-label {
  color: var(--color-paper-brown);
}
```

Do not add new backend fields. Use existing time capsule fields already present in the edit panel.

- [ ] **Step 6: Run highlight tests**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/public-site-major-redesign-static.test.ts tests/student-profile-lifecycle.test.ts
pnpm --filter site-astro exec playwright test tests/performance-network.spec.ts --grep "student page"
```

Expected:

- Static highlight grouping passes.
- Student lazy-loading test still passes.

- [ ] **Step 7: Commit highlight integration**

Run:

```powershell
git add packages/site-astro/src/components/ClassGraphPreview.vue packages/site-astro/src/components/SeatMapPreview.vue packages/site-astro/src/components/StudentProfile.vue packages/site-astro/src/components/SelfEditPanel.vue packages/site-astro/tests/public-site-major-redesign-static.test.ts
git commit -m "style: integrate interaction highlights into paper system"
```

---

### Task 8: Final Verification, Visual QA, And Cleanup

**Files:**
- Modify: `packages/site-astro/tests/public-site-major-redesign-static.test.ts`
- Modify: `packages/site-astro/tests/public-site-major-redesign-visual.spec.ts`
- No product files expected unless verification exposes a real issue.

- [ ] **Step 1: Add cleanup assertions for stale deployment comments and legacy classes**

In `public-site-major-redesign-static.test.ts`, add:

```ts
it('removes stale deployment verification comments from public pages', () => {
  const roster = read('pages/roster.astro')

  expect(roster).not.toContain('Trigger site deployment verification')
})
```

- [ ] **Step 2: Run full site verification**

Run:

```powershell
pnpm verify:site
```

Expected:

- `pnpm --filter site-astro typecheck`: PASS.
- `pnpm --filter site-astro test:with-build`: PASS.
- `pnpm --filter site-astro test:perf-network`: PASS.

- [ ] **Step 3: Run full workspace verification**

Run:

```powershell
pnpm verify:all
```

Expected:

- Worker tests pass.
- Admin typecheck and build pass.
- Site verification pass.

- [ ] **Step 4: Manual desktop visual QA**

Start preview:

```powershell
pnpm --filter site-astro build
pnpm --filter site-astro preview -- --host 127.0.0.1
```

Check at desktop viewport `1440 x 900`:

```text
/
/preface/
/roster/
/album/
/timeline/
/yearbook/
/student/template/
```

Expected:

- Homepage first viewport is dark cover.
- Homepage logged-out nav is brand-only.
- CTA smoothly scrolls to login.
- Browsing pages use `page-shell` and `page-header`.
- Roster cards, rankings, graph preview, and seat preview share paper styling.
- Student page no longer visibly jumps from profile-level ScrollTrigger.
- Yearbook screen preview is paper styled; print preview remains clean.

- [ ] **Step 5: Manual mobile visual QA**

Check at mobile viewport `390 x 844`:

```text
/
/preface/
/roster/
/album/
/timeline/
/yearbook/
/student/template/
```

Expected:

- No horizontal overflow.
- Text does not overlap.
- Navigation drawer is usable.
- Album filters and timeline tabs scroll horizontally.
- Roster cards are readable.
- Message stickers do not rotate or jump.
- Photo grid remains stable.

- [ ] **Step 6: Capture final QA screenshots**

Using Playwright or the browser screenshot tool, capture these files under `test-results/`:

```text
test-results/major-redesign-home-desktop.png
test-results/major-redesign-home-mobile.png
test-results/major-redesign-roster-mobile.png
test-results/major-redesign-student-mobile.png
test-results/major-redesign-yearbook-desktop.png
```

Do not commit screenshots unless the project explicitly wants visual artifacts in git.

- [ ] **Step 7: Confirm clean worktree**

Run:

```powershell
git status --short
```

Expected:

- No uncommitted product/test files.
- `test-results/` and `playwright-report/` are ignored or intentionally left untracked.

- [ ] **Step 8: Commit final test cleanup if needed**

If Task 8 modified tests, run:

```powershell
git add packages/site-astro/tests/public-site-major-redesign-static.test.ts packages/site-astro/tests/public-site-major-redesign-visual.spec.ts
git commit -m "test: finalize public site major redesign verification"
```

If no files changed, skip this commit.

---

## Self-Review Checklist

- Spec coverage:
  - Homepage minimal login entry: Task 3.
  - Explicit smooth CTA scroll: Task 3.
  - Paper design system utilities: Task 2.
  - Preface, album, timeline, yearbook page shells: Task 4.
  - Roster page and legacy `museum-*` cleanup: Task 5.
  - Profile archive, message wall, photo wall, completeness card: Task 6.
  - Interaction highlight grouping: Task 7.
  - Performance, mobile, visual QA: Task 8.

- Test coverage:
  - Static migration and old-token cleanup: Task 1.
  - Mobile overflow and page header visibility: Task 1.
  - Homepage login flow remains covered by existing homepage tests and Task 3.
  - Network constraints remain covered by `performance-network.spec.ts`.

- Placeholder scan:
  - No `TBD`.
  - No `TODO`.
  - No unspecified “handle edge cases”.
  - Every task has concrete file paths, commands, and expected outcomes.

- Execution rule:
  - Each task should be committed separately.
  - If a task exposes unrelated dirty files, do not revert them; work only with intended files.
  - If a test fails for a reason outside the task, document the failure before continuing.
