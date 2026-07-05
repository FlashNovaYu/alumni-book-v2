# Responsive Vintage Paper Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the confirmed responsive vintage-paper redesign for the public alumni book site, including the dark cover login flow, paper-based site style, mobile/desktop layouts, and animation stability fixes.

**Architecture:** Add a shared paper design system in CSS tokens/global utilities, then migrate pages and components onto those classes in small slices. Keep homepage login as a dedicated two-stage experience: dark cover first, paper login form second. Use static tests and Playwright tests to lock key behavior before visual implementation.

**Tech Stack:** Astro 5, Vue 3 islands, pnpm workspace, Vitest static tests, Playwright E2E, CSS-first responsive layout, existing `@alumni/shared` classmate session helpers.

---

## Scope Check

The approved spec spans homepage, global style system, navigation, multiple public pages, and motion stability. This plan keeps it as one phased redesign because the work shares one design system and one verification pipeline, but it splits implementation into independently testable tasks with commits after each task.

Do not touch Worker or Admin code in this phase unless a public-site test reveals a direct integration regression.

## File Structure And Responsibilities

- `packages/site-astro/src/styles/tokens.css`
  - Add vintage paper color, shadow, spacing, and motion variables.
- `packages/site-astro/src/styles/global.css`
  - Add shared `paper-*`, `page-*`, and responsive layout utilities.
  - Centralize reduced-motion and reveal behavior.
- `packages/site-astro/src/layouts/MainLayout.astro`
  - Preserve auth gate.
  - Keep global reveal initialization stable across Astro transitions.
- `packages/site-astro/src/components/TopNav.astro`
  - Convert nav to paper style.
  - Simplify homepage logged-out state.
  - Prevent duplicate scroll listener binding.
- `packages/site-astro/src/components/MuseumHero.astro`
  - Replace old split hero with dark cover section, reveal CTA section, and paper login section.
- `packages/site-astro/src/components/ClassmateLoginBook.vue`
  - Replace double-page book with responsive paper login form.
  - Preserve IDs and class names used by E2E tests: `#username-input`, `#password-input`, `.login-btn`.
- `packages/site-astro/src/components/FirstLoginPasswordGuide.vue`
  - Align first-login modal to paper style.
- `packages/site-astro/src/pages/preface.astro`
  - Apply shared page shell and paper reading layout.
- `packages/site-astro/src/pages/roster.astro`
  - Apply shared page shell and paper archive layout.
- `packages/site-astro/src/components/RosterWall.vue`
  - Style search as archive strip.
- `packages/site-astro/src/components/ArchiveRosterCard.vue`
  - Refine paper archive cards.
- `packages/site-astro/src/components/RankingsPanel.vue`
  - Match paper visual system and responsive behavior.
- `packages/site-astro/src/components/ClassGraphPreview.vue`
  - Match paper highlight card.
- `packages/site-astro/src/components/SeatMapPreview.vue`
  - Match paper highlight card.
- `packages/site-astro/src/components/StudentProfile.vue`
  - Convert profile to paper archive layout with desktop/mobile structure.
- `packages/site-astro/src/components/MessageWall.vue`
  - Keep sticker fun on desktop, stabilize mobile.
- `packages/site-astro/src/components/PhotoWall.vue`
  - Keep stable aspect ratios and paper photo wall style.
- `packages/site-astro/src/pages/album.astro`
  - Apply paper page shell.
- `packages/site-astro/src/components/AlbumGrid.vue`
  - Refine filters, album sections, photo frames, and lightbox controls.
- `packages/site-astro/src/pages/timeline.astro`
  - Convert to paper yearbook timeline.
- `packages/site-astro/src/pages/yearbook.astro`
  - Align screen preview to paper style while preserving print rules.
- `packages/site-astro/tests/responsive-vintage-static.test.ts`
  - New static tests for design tokens, homepage structure, mobile rules, and motion ownership.
- `packages/site-astro/tests/homepage-cover-login.spec.ts`
  - New Playwright test for scroll CTA and login flow entry.
- `packages/site-astro/tests/classmate-login-flow.spec.ts`
  - Update to click the new cover CTA before filling login form.
- `packages/site-astro/tests/performance-static.test.ts`
  - Extend existing constraints for homepage critical path and reduced motion.
- `packages/site-astro/package.json`
  - Include the new static test in `pnpm test`.

---

### Task 1: Add Static Guardrails For The Redesign

**Files:**
- Create: `packages/site-astro/tests/responsive-vintage-static.test.ts`
- Modify: `packages/site-astro/package.json`

- [ ] **Step 1: Write the failing static test**

Create `packages/site-astro/tests/responsive-vintage-static.test.ts` with this content:

```ts
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const srcRoot = path.resolve(__dirname, '../src')

function read(relativePath: string) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf-8')
}

describe('responsive vintage paper redesign static constraints', () => {
  it('defines the vintage paper token family used by public pages', () => {
    const tokens = read('styles/tokens.css')

    expect(tokens).toContain('--color-paper-bg')
    expect(tokens).toContain('--color-paper-card')
    expect(tokens).toContain('--color-paper-border')
    expect(tokens).toContain('--color-paper-brown')
    expect(tokens).toContain('--color-paper-brown-active')
    expect(tokens).toContain('--color-paper-stamp-red')
    expect(tokens).toContain('--shadow-paper-panel')
  })

  it('defines shared page and paper utility classes', () => {
    const globalCss = read('styles/global.css')

    expect(globalCss).toContain('.page-shell')
    expect(globalCss).toContain('.page-header')
    expect(globalCss).toContain('.paper-panel')
    expect(globalCss).toContain('.paper-card')
    expect(globalCss).toContain('.paper-section-divider')
    expect(globalCss).toContain('@media (max-width: 768px)')
  })

  it('homepage uses cover, reveal CTA, and login section structure', () => {
    const hero = read('components/MuseumHero.astro')

    expect(hero).toContain('home-cover')
    expect(hero).toContain('home-login-cta')
    expect(hero).toContain('home-login-section')
    expect(hero).toContain('data-testid="home-login-cta"')
    expect(hero).toContain('href="#login"')
    expect(hero).not.toContain('museum-hero__inner')
    expect(hero).not.toContain('museum-hero__pass')
  })

  it('login component remains testable and no longer depends on the double-page spine layout', () => {
    const login = read('components/ClassmateLoginBook.vue')

    expect(login).toContain('id="username-input"')
    expect(login).toContain('id="password-input"')
    expect(login).toContain('class="btn-primary login-btn"')
    expect(login).toContain('paper-login')
    expect(login).not.toContain('book-spine')
    expect(login).not.toContain('page-left')
  })

  it('mobile message stickers do not rotate or scale on narrow screens', () => {
    const messageWall = read('components/MessageWall.vue')

    expect(messageWall).toContain('@media (max-width: 768px)')
    expect(messageWall).toContain('.msg-item:nth-child(even)')
    expect(messageWall).toContain('transform: none')
    expect(messageWall).toContain('.msg-style-selector')
    expect(messageWall).toContain('overflow-x: auto')
  })

  it('top nav protects against duplicate scroll listener binding across Astro transitions', () => {
    const nav = read('components/TopNav.astro')

    expect(nav).toContain('let topNavScrollCleanup')
    expect(nav).toContain('topNavScrollCleanup()')
    expect(nav).toContain("document.addEventListener('astro:page-load'")
  })
})
```

- [ ] **Step 2: Add the new static test to the site test script**

Modify `packages/site-astro/package.json` so the `test` script includes `tests/responsive-vintage-static.test.ts` at the end:

```json
"test": "vitest run tests/navigation.test.ts tests/privacy-static.test.ts tests/feature-static.test.ts tests/performance-static.test.ts tests/student-profile-lifecycle.test.ts tests/animation-ownership.test.ts tests/classmate-auth-static.test.ts tests/responsive-vintage-static.test.ts"
```

- [ ] **Step 3: Run the new static test and verify it fails**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/responsive-vintage-static.test.ts
```

Expected: FAIL because the new paper tokens, homepage classes, and nav cleanup do not exist yet.

- [ ] **Step 4: Commit the guardrail test**

Run:

```powershell
git add packages/site-astro/tests/responsive-vintage-static.test.ts packages/site-astro/package.json
git commit -m "test: add vintage paper redesign guardrails"
```

---

### Task 2: Add Vintage Paper Tokens And Shared Layout Utilities

**Files:**
- Modify: `packages/site-astro/src/styles/tokens.css`
- Modify: `packages/site-astro/src/styles/global.css`

- [ ] **Step 1: Extend `tokens.css` with the vintage paper token family**

Add this block near the existing museum token block in `packages/site-astro/src/styles/tokens.css`:

```css
  /* ── Vintage paper redesign tokens ── */
  --color-paper-bg: #f4eddf;
  --color-paper-bg-soft: #fbf7ef;
  --color-paper-card: #fffaf2;
  --color-paper-card-muted: #f8f1e6;
  --color-paper-border: #ded2bd;
  --color-paper-border-soft: #e8decd;
  --color-paper-ink: #2f2a23;
  --color-paper-ink-soft: #5f5548;
  --color-paper-muted: #827565;
  --color-paper-brown: #ad8051;
  --color-paper-brown-active: #8f653c;
  --color-paper-brown-soft: #d8ceb8;
  --color-paper-gold: #c8a96a;
  --color-paper-stamp-red: #bc4f3c;
  --shadow-paper-panel: 0 14px 36px rgba(76, 59, 38, 0.1);
  --shadow-paper-card: 0 8px 24px rgba(77, 59, 37, 0.08);
  --texture-paper-fiber:
    radial-gradient(circle at 20% 20%, rgba(80, 62, 42, 0.035), transparent 22%),
    radial-gradient(circle at 80% 0%, rgba(173, 128, 81, 0.045), transparent 26%),
    linear-gradient(rgba(80, 62, 42, 0.035) 1px, transparent 1px);
```

- [ ] **Step 2: Add shared utility classes to `global.css`**

Append this section after `.museum-motion-soft` in `packages/site-astro/src/styles/global.css`:

```css
/* ── Vintage paper shared layout ── */
.page-shell {
  min-height: 100vh;
  padding-top: calc(var(--nav-height) + var(--spacing-section));
  padding-bottom: var(--spacing-section);
  background:
    var(--texture-paper-fiber),
    var(--color-paper-bg);
  background-size: 100% 100%, 100% 26px;
}

.page-header {
  max-width: 760px;
  margin: 0 auto var(--spacing-xl);
  text-align: center;
}

.page-header__label {
  margin-bottom: var(--spacing-md);
  color: var(--color-paper-brown);
  font-size: var(--type-caption-uppercase-size);
  font-weight: var(--type-caption-uppercase-weight);
  letter-spacing: var(--type-caption-uppercase-letter-spacing);
  text-transform: uppercase;
}

.page-header__subtitle {
  margin-top: var(--spacing-sm);
  color: var(--color-paper-muted);
  font-size: var(--type-body-sm-size);
  line-height: 1.8;
}

.paper-panel,
.paper-card {
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  color: var(--color-paper-ink);
}

.paper-panel {
  border-radius: var(--rounded-lg);
  box-shadow: var(--shadow-paper-panel);
}

.paper-card {
  border-radius: var(--rounded-md);
  box-shadow: var(--shadow-paper-card);
}

.paper-section-divider {
  border: none;
  border-top: 1px solid var(--color-paper-border);
}

.paper-kicker {
  color: var(--color-paper-brown);
  font-size: var(--type-caption-uppercase-size);
  font-weight: var(--type-caption-uppercase-weight);
  letter-spacing: var(--type-caption-uppercase-letter-spacing);
  text-transform: uppercase;
}

.paper-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border-radius: var(--rounded-sm);
  background: color-mix(in srgb, var(--color-paper-brown) 12%, var(--color-paper-card));
  color: var(--color-paper-ink-soft);
  font-size: 12px;
}

.btn-primary {
  background-color: var(--color-paper-brown);
}

.btn-primary:hover {
  background-color: var(--color-paper-brown-active);
}

.btn-secondary {
  background-color: var(--color-paper-card);
  border-color: var(--color-paper-border);
  color: var(--color-paper-ink);
}

.btn-secondary:hover {
  background-color: var(--color-paper-card-muted);
}

.text-input {
  background-color: var(--color-paper-card);
  border-color: var(--color-paper-border);
}

.text-input:focus {
  border-color: var(--color-paper-brown);
}

@media (max-width: 768px) {
  .page-shell {
    padding-top: calc(var(--nav-height) + var(--spacing-xl));
    padding-bottom: var(--spacing-xxl);
  }

  .page-header {
    margin-bottom: var(--spacing-lg);
    text-align: left;
  }

  .page-header .display-lg {
    font-size: var(--type-display-md-size);
  }
}
```

- [ ] **Step 3: Run the token utility test**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/responsive-vintage-static.test.ts
```

Expected: still FAIL because homepage, login, message wall, and nav are not updated yet. Token and utility assertions should pass.

- [ ] **Step 4: Commit tokens and utilities**

Run:

```powershell
git add packages/site-astro/src/styles/tokens.css packages/site-astro/src/styles/global.css
git commit -m "style: add vintage paper design tokens"
```

---

### Task 3: Build The Cover Login Homepage

**Files:**
- Modify: `packages/site-astro/src/components/MuseumHero.astro`
- Modify: `packages/site-astro/src/components/VisitorPass.vue`
- Modify: `packages/site-astro/src/components/ClassmateLoginBook.vue`
- Modify: `packages/site-astro/src/components/FirstLoginPasswordGuide.vue`
- Create: `packages/site-astro/tests/homepage-cover-login.spec.ts`
- Modify: `packages/site-astro/tests/classmate-login-flow.spec.ts`
- Modify: `packages/site-astro/package.json`

- [ ] **Step 1: Write the homepage cover Playwright test**

Create `packages/site-astro/tests/homepage-cover-login.spec.ts` with this content:

```ts
import { test, expect } from '@playwright/test'

test('homepage reveals the paper login section from the dark cover CTA', async ({ page }) => {
  await page.route('**/api/classmate-auth/login', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          token: 'token-normal-login',
          mustChangePassword: false,
          student: { name: '测试同学', slug: 'test_init', avatarUrl: null },
        },
      }),
    })
  })

  await page.goto('/')

  await expect(page.locator('.home-cover')).toBeVisible()
  await expect(page.locator('#login')).toBeVisible()
  await expect(page.locator('#username-input')).toBeVisible()

  const cta = page.getByTestId('home-login-cta')
  await expect(cta).toBeVisible()
  await cta.click()

  await expect(page.locator('#username-input')).toBeInViewport()
  await page.locator('#username-input').fill('测试同学')
  await page.locator('#password-input').fill('123456')
  await page.locator('.login-btn').click()

  await expect(page).toHaveURL(/\/preface/, { timeout: 15000 })
})

test('homepage cover keeps the form out of the initial visual center on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const coverBox = await page.locator('.home-cover').boundingBox()
  const formBox = await page.locator('#login').boundingBox()

  expect(coverBox).not.toBeNull()
  expect(formBox).not.toBeNull()
  expect(formBox!.y).toBeGreaterThan(coverBox!.height * 0.72)
})
```

- [ ] **Step 2: Add homepage Playwright test to `test:perf-network`**

Modify `packages/site-astro/package.json`:

```json
"test:perf-network": "playwright test tests/performance-network.spec.ts tests/classmate-login-flow.spec.ts tests/homepage-cover-login.spec.ts"
```

- [ ] **Step 3: Run the homepage test and verify it fails**

Run:

```powershell
pnpm --filter site-astro exec playwright test tests/homepage-cover-login.spec.ts
```

Expected: FAIL because `.home-cover` and `data-testid="home-login-cta"` do not exist yet.

- [ ] **Step 4: Replace `MuseumHero.astro` with the cover flow**

In `packages/site-astro/src/components/MuseumHero.astro`, keep the existing props and `VisitorPass` import, then replace the markup with:

```astro
<section class="home-cover" aria-labelledby="museum-hero-title">
  <div class="home-cover__ambient" aria-hidden="true">
    <span class="home-cover__paper home-cover__paper--one"></span>
    <span class="home-cover__paper home-cover__paper--two"></span>
    <span class="home-cover__paper home-cover__paper--three"></span>
    <span class="home-cover__film"></span>
    <span class="home-cover__ghost">翻开我们的青春</span>
  </div>

  <div class="home-cover__copy container">
    <p class="home-cover__kicker">{heroEyebrow}</p>
    <h1 id="museum-hero-title" class="home-cover__title">
      <span>翻开青春</span>
      <span>遇见同窗</span>
    </h1>
    <p class="home-cover__subtitle">{heroSubtitle}</p>
  </div>

  <a href="#login" class="home-cover__scroll" aria-label="向下滑动到登录入口">
    <span>向下滑动</span>
  </a>
</section>

<section class="home-login-cta" aria-label="进入登录">
  <a href="#login" class="home-login-cta__button" data-testid="home-login-cta">
    翻开同学录，进入登录
  </a>
</section>

<section id="login" class="home-login-section" aria-labelledby="home-login-title">
  <div class="home-login-section__inner container">
    <div class="home-login-section__copy">
      <p class="paper-kicker">CLASSMATE PASS</p>
      <h2 id="home-login-title" class="display-sm">身份验证</h2>
      <p>选择或输入自己的同学账号，使用初始密码进入。首次登录后会引导你设置新密码。</p>
    </div>
    <VisitorPass client:load apiBase={apiBase} />
  </div>
</section>
```

Replace the component `<style>` block with CSS that includes these selectors:

```css
.home-cover {
  position: relative;
  min-height: 100svh;
  display: grid;
  place-items: center;
  overflow: hidden;
  padding: calc(var(--nav-height) + var(--spacing-xl)) 0 var(--spacing-xxl);
  background:
    linear-gradient(180deg, rgba(10, 10, 9, 0.1), rgba(10, 10, 9, 0.86)),
    radial-gradient(circle at 18% 28%, rgba(200, 169, 106, 0.16), transparent 30%),
    radial-gradient(circle at 78% 72%, rgba(188, 79, 60, 0.16), transparent 34%),
    #11100e;
  color: var(--color-on-dark);
}

.home-cover__ambient {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.home-cover__paper {
  position: absolute;
  height: 54px;
  width: 260px;
  border-radius: var(--rounded-pill);
  border: 1px solid rgba(251, 246, 236, 0.12);
  background: rgba(251, 246, 236, 0.04);
}

.home-cover__paper--one { left: -42px; top: 20%; width: 360px; transform: rotate(-13deg); }
.home-cover__paper--two { right: 12%; top: 16%; transform: rotate(19deg); background: rgba(200, 169, 106, 0.07); }
.home-cover__paper--three { right: -58px; bottom: 18%; width: 320px; transform: rotate(-16deg); background: rgba(188, 79, 60, 0.06); }

.home-cover__film {
  position: absolute;
  left: 7%;
  bottom: 12%;
  width: 190px;
  height: 44px;
  border-radius: var(--rounded-md);
  border: 1px solid rgba(251, 246, 236, 0.11);
  background:
    repeating-linear-gradient(90deg, rgba(251,246,236,0.08) 0 10px, transparent 10px 20px),
    rgba(251, 246, 236, 0.025);
  transform: rotate(-8deg);
}

.home-cover__ghost {
  position: absolute;
  left: 50%;
  top: 52%;
  transform: translate(-50%, -50%);
  color: rgba(255, 255, 255, 0.035);
  font-family: var(--font-display);
  font-size: clamp(58px, 11vw, 128px);
  font-weight: 700;
  white-space: nowrap;
}

.home-cover__copy {
  position: relative;
  z-index: 1;
  text-align: center;
}

.home-cover__kicker {
  color: var(--color-paper-gold);
  font-size: var(--type-caption-uppercase-size);
  font-weight: var(--type-caption-uppercase-weight);
  letter-spacing: var(--type-caption-uppercase-letter-spacing);
  text-transform: uppercase;
}

.home-cover__title {
  margin: var(--spacing-md) 0;
  display: grid;
  gap: var(--spacing-xs);
  font-family: var(--font-display);
  font-size: clamp(52px, 8vw, 96px);
  line-height: 1.04;
  letter-spacing: 0;
  color: #fffaf0;
  text-shadow: 0 14px 42px rgba(0, 0, 0, 0.72);
}

.home-cover__subtitle {
  max-width: 620px;
  margin: 0 auto;
  color: rgba(247, 239, 224, 0.68);
  font-size: 16px;
  line-height: 1.9;
}

.home-cover__scroll {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: grid;
  gap: var(--spacing-xs);
  justify-items: center;
  color: rgba(247, 239, 224, 0.62);
  font-size: 12px;
  text-decoration: none;
}

.home-cover__scroll::after {
  content: "";
  width: 1px;
  height: 36px;
  background: linear-gradient(transparent, var(--color-paper-gold), transparent);
}

.home-login-cta {
  min-height: 34svh;
  display: grid;
  place-items: center;
  padding: var(--spacing-xxl) var(--spacing-lg);
  background: #161410;
}

.home-login-cta__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: min(360px, 100%);
  min-height: 52px;
  padding: 0 var(--spacing-lg);
  border-radius: var(--rounded-pill);
  border: 1px solid rgba(234, 217, 166, 0.46);
  background: linear-gradient(90deg, rgba(188, 79, 60, 0.96), rgba(200, 169, 106, 0.92));
  color: #fffaf0;
  font-weight: 700;
  text-decoration: none;
  box-shadow: 0 12px 32px rgba(188, 79, 60, 0.24);
}

.home-login-section {
  padding: var(--spacing-section) 0;
  background:
    var(--texture-paper-fiber),
    var(--color-paper-bg);
  background-size: 100% 100%, 100% 26px;
}

.home-login-section__inner {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(320px, 1fr);
  gap: var(--spacing-xl);
  align-items: center;
  max-width: 980px;
}

.home-login-section__copy {
  color: var(--color-paper-ink);
}

.home-login-section__copy p:last-child {
  margin-top: var(--spacing-sm);
  color: var(--color-paper-muted);
  line-height: 1.8;
}

@media (max-width: 768px) {
  .home-cover {
    padding-inline: var(--spacing-lg);
  }

  .home-cover__title {
    font-size: 48px;
  }

  .home-cover__subtitle {
    font-size: 14px;
  }

  .home-cover__paper--one,
  .home-cover__paper--two,
  .home-cover__paper--three {
    opacity: 0.55;
  }

  .home-login-section__inner {
    grid-template-columns: 1fr;
    gap: var(--spacing-lg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-login-cta__button {
    transition: none;
  }
}
```

- [ ] **Step 5: Convert `VisitorPass.vue` to a transparent login wrapper**

In `packages/site-astro/src/components/VisitorPass.vue`, replace the style block with:

```css
.visitor-pass {
  width: min(100%, 520px);
  margin: 0 auto;
  padding: 0;
  border: none;
  box-shadow: none;
  background: transparent;
}

.pass-label {
  display: none;
}
```

- [ ] **Step 6: Replace the double-page login form with a paper form**

In `packages/site-astro/src/components/ClassmateLoginBook.vue`, keep the `<script setup>` logic unchanged. Replace the `<template>` with a single paper panel that keeps existing input IDs:

```vue
<template>
  <div class="paper-login" data-testid="paper-login-form">
    <div class="paper-login__header">
      <p class="paper-login__eyebrow">CLASSMATE PASS</p>
      <h3>入馆凭证</h3>
      <p>输入你的同学账号和密码，翻开属于我们的同学录。</p>
    </div>

    <div class="paper-login__form">
      <div class="form-group">
        <label class="form-label" for="username-input">你的姓名或账号</label>
        <input
          id="username-input"
          v-model="username"
          type="text"
          class="text-input"
          placeholder="请输入你的真实姓名或账号"
          autocomplete="username"
          @keydown.enter="handleLogin"
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="password-input">入馆密码</label>
        <input
          id="password-input"
          v-model="password"
          type="password"
          class="text-input"
          placeholder="请输入你的初始密码或新密码"
          autocomplete="current-password"
          @keydown.enter="handleLogin"
        />
      </div>

      <p class="paper-login__hint">首次登录会引导你设置自己的新密码。</p>
      <div v-if="error" class="error-msg">{{ error }}</div>

      <button class="btn-primary login-btn" @click="handleLogin" :disabled="loading">
        {{ loading ? '翻阅中...' : '确认入馆' }}
      </button>
    </div>

    <FirstLoginPasswordGuide
      v-if="showChangePasswordModal"
      :api-base="apiBase"
      :slug="username.trim()"
      :old-password="password"
      @completed="handlePasswordChanged"
      @cancel="handlePasswordCancel"
    />
  </div>
</template>
```

Replace the scoped style with:

```css
.paper-login {
  width: 100%;
  padding: var(--spacing-xl);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-lg);
  background: var(--color-paper-card);
  box-shadow: var(--shadow-paper-panel);
}

.paper-login__header {
  padding-bottom: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--color-paper-border);
}

.paper-login__eyebrow {
  color: var(--color-paper-brown);
  font-size: var(--type-caption-uppercase-size);
  font-weight: var(--type-caption-uppercase-weight);
  letter-spacing: var(--type-caption-uppercase-letter-spacing);
}

.paper-login__header h3 {
  margin: var(--spacing-xs) 0;
  color: var(--color-paper-ink);
  font-family: var(--font-display);
  font-size: 28px;
}

.paper-login__header p,
.paper-login__hint {
  color: var(--color-paper-muted);
  font-size: var(--type-body-sm-size);
  line-height: 1.7;
}

.paper-login__form {
  display: grid;
  gap: var(--spacing-md);
}

.form-group {
  display: grid;
  gap: var(--spacing-xs);
}

.form-label {
  color: var(--color-paper-ink-soft);
  font-size: var(--type-body-sm-size);
  font-weight: 600;
}

.login-btn {
  width: 100%;
  margin-top: var(--spacing-xs);
}

.error-msg {
  color: var(--color-error);
  font-size: var(--type-body-sm-size);
}

@media (max-width: 768px) {
  .paper-login {
    padding: var(--spacing-lg);
  }
}
```

- [ ] **Step 7: Update first-login modal to use the paper token family**

In `packages/site-astro/src/components/FirstLoginPasswordGuide.vue`, keep logic unchanged and replace hard-coded colors in the scoped style:

```css
.change-password-modal {
  width: 90%;
  max-width: 420px;
  background-color: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  box-shadow: var(--shadow-paper-panel);
  padding: 2.25rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.ink-title-sm {
  color: var(--color-paper-ink);
}

.form-hint {
  color: var(--color-paper-muted);
}

.form-label {
  color: var(--color-paper-ink-soft);
}

.text-input {
  background-color: var(--color-paper-card);
  border-color: var(--color-paper-border);
}

.text-input:focus {
  border-color: var(--color-paper-brown);
}

.btn-cancel {
  border-color: var(--color-paper-border);
  color: var(--color-paper-ink-soft);
}

.btn-cancel:hover {
  background-color: var(--color-paper-card-muted);
}

.change-password-btn {
  background-color: var(--color-paper-brown);
}

.change-password-btn:hover {
  background-color: var(--color-paper-brown-active);
}
```

- [ ] **Step 8: Update existing first-login E2E to click the cover CTA**

In `packages/site-astro/tests/classmate-login-flow.spec.ts`, insert this after `await page.goto('/')`:

```ts
  await page.getByTestId('home-login-cta').click()
  await expect(page.locator('#username-input')).toBeInViewport()
```

- [ ] **Step 9: Run homepage tests**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/responsive-vintage-static.test.ts
pnpm --filter site-astro exec playwright test tests/homepage-cover-login.spec.ts tests/classmate-login-flow.spec.ts
```

Expected: static test still FAILS only on nav/message wall assertions. Playwright homepage tests PASS.

- [ ] **Step 10: Commit homepage flow**

Run:

```powershell
git add packages/site-astro/src/components/MuseumHero.astro packages/site-astro/src/components/VisitorPass.vue packages/site-astro/src/components/ClassmateLoginBook.vue packages/site-astro/src/components/FirstLoginPasswordGuide.vue packages/site-astro/tests/homepage-cover-login.spec.ts packages/site-astro/tests/classmate-login-flow.spec.ts packages/site-astro/package.json
git commit -m "feat: add cover based classmate login homepage"
```

---

### Task 4: Convert Navigation And Layout Motion Ownership

**Files:**
- Modify: `packages/site-astro/src/components/TopNav.astro`
- Modify: `packages/site-astro/src/layouts/MainLayout.astro`
- Modify: `packages/site-astro/src/scripts/globalReveal.ts`
- Modify: `packages/site-astro/tests/animation-ownership.test.ts`

- [ ] **Step 1: Add static assertions for stable reveal initialization**

Append this test to `packages/site-astro/tests/animation-ownership.test.ts`:

```ts
  it('global reveal can be reinitialized per Astro page load without stacking duplicate state', () => {
    const reveal = read('scripts/globalReveal.ts')
    const layout = read('layouts/MainLayout.astro')

    expect(reveal).toContain('let activeObserver')
    expect(reveal).toContain('activeObserver.disconnect()')
    expect(layout).toContain('initGlobalReveal(true)')
  })
```

- [ ] **Step 2: Run animation tests and verify failure**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/animation-ownership.test.ts
```

Expected: FAIL because `activeObserver` and forced reinitialization do not exist yet.

- [ ] **Step 3: Update `globalReveal.ts` to own and clean its observer**

Replace `packages/site-astro/src/scripts/globalReveal.ts` with:

```ts
import { prefersReducedMotion } from '../utils/motion'

let initialized = false
let activeObserver: IntersectionObserver | null = null

export function initGlobalReveal(force = false) {
  if (force) {
    initialized = false
    activeObserver?.disconnect()
    activeObserver = null
  }

  if (initialized) return
  initialized = true

  const revealEls = Array.from(document.querySelectorAll<HTMLElement>('[data-motion="global-reveal"]'))
  if (!revealEls.length) return

  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => {
      el.dataset.motionState = 'done'
      el.style.opacity = '1'
      el.style.visibility = 'visible'
      el.style.transform = 'none'
    })
    return
  }

  activeObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      const el = entry.target as HTMLElement
      el.dataset.motionState = 'done'
      el.classList.add('motion-visible')
      activeObserver?.unobserve(el)
    })
  }, { rootMargin: '0px 0px -10% 0px' })

  revealEls.forEach((el) => activeObserver?.observe(el))
}
```

- [ ] **Step 4: Force reveal reinitialization after Astro page loads**

In `packages/site-astro/src/layouts/MainLayout.astro`, change:

```ts
initGlobalReveal()
```

to:

```ts
initGlobalReveal(true)
```

inside the `astro:page-load` listener.

- [ ] **Step 5: Make TopNav paper styled and cleanup-safe**

In `packages/site-astro/src/components/TopNav.astro`, update CSS colors to paper tokens:

```css
.top-nav {
  background-color: color-mix(in srgb, var(--color-paper-card) 88%, transparent);
  border: 1px solid var(--color-paper-border);
  box-shadow: var(--shadow-paper-card);
}

.top-nav.scrolled {
  background-color: color-mix(in srgb, var(--color-paper-card) 94%, transparent);
  box-shadow: var(--shadow-paper-panel);
}

.nav-link.active {
  color: var(--color-paper-brown);
}

.lamp-glow {
  background-color: var(--color-paper-brown);
  box-shadow:
    0 0 10px color-mix(in srgb, var(--color-paper-brown) 70%, transparent),
    0 0 20px color-mix(in srgb, var(--color-paper-brown) 35%, transparent);
}

.nav-links {
  background-color: color-mix(in srgb, var(--color-paper-card) 96%, transparent);
}
```

Replace the bottom scroll script with:

```astro
<script>
  let topNavScrollCleanup

  function initScroll() {
    if (typeof topNavScrollCleanup === 'function') {
      topNavScrollCleanup()
      topNavScrollCleanup = undefined
    }

    const nav = document.querySelector('.top-nav')
    if (!nav) return

    const onScroll = () => {
      nav.classList.toggle('scrolled', window.scrollY > 10)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    topNavScrollCleanup = () => window.removeEventListener('scroll', onScroll)
    onScroll()
  }

  initScroll()
  document.addEventListener('astro:page-load', initScroll)
</script>
```

- [ ] **Step 6: Run static and animation tests**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/animation-ownership.test.ts tests/responsive-vintage-static.test.ts
```

Expected: animation tests PASS. `responsive-vintage-static.test.ts` still FAILS only on message wall mobile assertions if Task 6 has not been completed.

- [ ] **Step 7: Commit navigation and motion ownership**

Run:

```powershell
git add packages/site-astro/src/components/TopNav.astro packages/site-astro/src/layouts/MainLayout.astro packages/site-astro/src/scripts/globalReveal.ts packages/site-astro/tests/animation-ownership.test.ts
git commit -m "fix: stabilize paper navigation and reveal ownership"
```

---

### Task 5: Apply Paper Page Shell To Preface And Roster

**Files:**
- Modify: `packages/site-astro/src/pages/preface.astro`
- Modify: `packages/site-astro/src/components/PrefaceWall.vue`
- Modify: `packages/site-astro/src/pages/roster.astro`
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Modify: `packages/site-astro/src/components/ArchiveRosterCard.vue`
- Modify: `packages/site-astro/src/components/RankingsPanel.vue`
- Modify: `packages/site-astro/src/components/ClassGraphPreview.vue`
- Modify: `packages/site-astro/src/components/SeatMapPreview.vue`

- [ ] **Step 1: Replace page wrappers with `page-shell` classes**

In `packages/site-astro/src/pages/preface.astro`, change:

```astro
<div class="preface-page section">
```

to:

```astro
<div class="preface-page page-shell">
```

Remove this CSS line from the same file:

```css
.preface-page { padding-top: calc(var(--nav-height) + var(--spacing-section)); }
```

In `packages/site-astro/src/pages/roster.astro`, change:

```astro
<div class="roster-page section">
```

to:

```astro
<div class="roster-page page-shell">
```

Remove this CSS line:

```css
.roster-page { padding-top: calc(var(--nav-height) + var(--spacing-section)); }
```

- [ ] **Step 2: Convert page headers to shared structure**

In `preface.astro`, keep `PrefaceWall` but remove unused local `.preface-header`, `.preface-label`, `.preface-subtitle`, `.preface-body`, `.preface-text`, `.hairline`, `.acknowledgment`, `.ack-*` styles that are owned by `PrefaceWall.vue`.

In `roster.astro`, replace the header block classes:

```astro
<div class="roster-header fade-in">
  <p class="page-header__label">ARCHIVE CORRIDOR</p>
  <h1 class="display-lg">人物长廊</h1>
  <p class="page-header__subtitle">用档案检索重新遇见每一位同学</p>
</div>
```

and set:

```html
class="page-header"
```

on the wrapper.

- [ ] **Step 3: Style PrefaceWall as a paper reading page**

In `packages/site-astro/src/components/PrefaceWall.vue`, add scoped styles:

```css
.preface-header {
  max-width: 760px;
  margin: 0 auto var(--spacing-xl);
  text-align: center;
}

.preface-label {
  color: var(--color-paper-brown);
  font-size: var(--type-caption-uppercase-size);
  font-weight: var(--type-caption-uppercase-weight);
  letter-spacing: var(--type-caption-uppercase-letter-spacing);
}

.preface-subtitle {
  margin-top: var(--spacing-sm);
  color: var(--color-paper-muted);
}

.preface-body {
  max-width: 760px;
  margin: 0 auto;
  padding: var(--spacing-xl);
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-lg);
  box-shadow: var(--shadow-paper-panel);
}

.preface-text {
  color: var(--color-paper-ink);
  line-height: 2.1;
  text-indent: 2em;
  text-align: justify;
}

.hairline {
  border: none;
  border-top: 1px solid var(--color-paper-border);
}

.acknowledgment {
  max-width: 760px;
  margin: 0 auto;
  text-align: center;
}

.ack-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-lg);
}

.ack-avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--color-paper-card-muted);
  border: 2px solid var(--color-paper-border);
}

.ack-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  color: var(--color-paper-muted);
  font-family: var(--font-display);
  font-size: 24px;
}

.ack-role {
  color: var(--color-paper-muted);
  font-size: var(--type-body-sm-size);
}

@media (max-width: 768px) {
  .preface-header {
    text-align: left;
  }

  .preface-body {
    padding: var(--spacing-lg);
  }
}
```

- [ ] **Step 4: Style RosterWall search and grid**

In `packages/site-astro/src/components/RosterWall.vue`, update styles:

```css
.archive-search {
  max-width: 760px;
  margin: 0 auto var(--spacing-xl);
  padding: var(--spacing-lg) var(--spacing-xl);
  border-radius: var(--rounded-lg);
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  box-shadow: var(--shadow-paper-card);
}

.search-input {
  background: var(--color-paper-bg-soft);
  text-align: left;
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

- [ ] **Step 5: Style archive cards and highlight cards with paper tokens**

In `ArchiveRosterCard.vue`, replace museum-token backgrounds with paper tokens:

```css
.archive-card {
  background: var(--color-paper-card);
  border-color: var(--color-paper-border);
  box-shadow: var(--shadow-paper-card);
}

.archive-card__avatar {
  background: linear-gradient(135deg, var(--color-paper-card-muted), var(--color-paper-brown-soft));
  color: var(--color-paper-ink);
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

In `RankingsPanel.vue`, set `.rankings-card` background, border, and shadow to paper tokens and remove `var(--shadow-sm)` usage:

```css
background: var(--color-paper-card);
border-color: var(--color-paper-border);
box-shadow: var(--shadow-paper-card);
```

In `ClassGraphPreview.vue` and `SeatMapPreview.vue`, change root classes from `museum-paper` to `paper-panel` in templates.

- [ ] **Step 6: Run static tests and build**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/responsive-vintage-static.test.ts tests/navigation.test.ts
pnpm --filter site-astro typecheck
pnpm --filter site-astro build
```

Expected: static tests still FAIL only for message wall mobile assertions if Task 6 is pending. Typecheck and build PASS.

- [ ] **Step 7: Commit preface and roster paper migration**

Run:

```powershell
git add packages/site-astro/src/pages/preface.astro packages/site-astro/src/components/PrefaceWall.vue packages/site-astro/src/pages/roster.astro packages/site-astro/src/components/RosterWall.vue packages/site-astro/src/components/ArchiveRosterCard.vue packages/site-astro/src/components/RankingsPanel.vue packages/site-astro/src/components/ClassGraphPreview.vue packages/site-astro/src/components/SeatMapPreview.vue
git commit -m "style: migrate preface and roster to paper layout"
```

---

### Task 6: Redesign Student Profile And Stabilize Message Wall Mobile

**Files:**
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/MessageWall.vue`
- Modify: `packages/site-astro/src/components/PhotoWall.vue`
- Modify: `packages/site-astro/tests/student-profile-lifecycle.test.ts`

- [ ] **Step 1: Add a static assertion for mobile sticker stability**

If Task 1 already added message wall assertions, do not duplicate them. Instead add this test to `packages/site-astro/tests/student-profile-lifecycle.test.ts`:

```ts
it('student profile keeps lazy component anchors with stable min-height placeholders', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/components/StudentProfile.vue'), 'utf-8')

  expect(source).toContain('id="photo-wall-anchor"')
  expect(source).toContain('id="message-wall-anchor"')
  expect(source).toContain('id="highlights-anchor"')
  expect(source).toContain('class="lazy-anchor"')
})
```

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/student-profile-lifecycle.test.ts tests/responsive-vintage-static.test.ts
```

Expected: FAIL because `lazy-anchor` is not present.

- [ ] **Step 2: Convert `StudentProfile.vue` outer layout to paper archive style**

In `StudentProfile.vue`, update standard template wrappers:

```vue
<div v-else class="student-page page-shell">
```

Change hero section class names to paper archive classes while keeping data and component logic:

```vue
<section class="student-archive-hero paper-panel">
```

Change `student-body` wrapper:

```vue
<div class="student-body container">
```

Keep all sections and computed fields unchanged.

- [ ] **Step 3: Give lazy anchors stable class and height**

Replace inline anchor styles:

```vue
<div ref="photoWallAnchor" id="photo-wall-anchor" class="lazy-anchor">
```

```vue
<div ref="messageWallAnchor" id="message-wall-anchor" class="lazy-anchor">
```

```vue
<div v-if="anyHighlightEnabled" ref="highlightsAnchor" id="highlights-anchor" class="lazy-anchor">
```

Add CSS:

```css
.lazy-anchor {
  min-height: 24px;
}
```

- [ ] **Step 4: Replace profile styles with responsive paper layout**

In `StudentProfile.vue`, adapt the existing scoped styles to include:

```css
.student-page {
  color: var(--color-paper-ink);
}

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
}

.hero-content {
  position: relative;
  z-index: 1;
}

.hero-avatar {
  border-color: var(--color-paper-border);
  background: var(--color-paper-card-muted);
}

.hero-name,
.section-title {
  color: var(--color-paper-ink);
}

.hero-nickname,
.hero-motto {
  color: var(--color-paper-muted);
}

.student-body {
  padding-top: var(--spacing-xl);
  padding-bottom: var(--spacing-section);
}

.profile-section {
  margin-bottom: var(--spacing-xl);
  padding: var(--spacing-xl);
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  border-radius: var(--rounded-lg);
  box-shadow: var(--shadow-paper-card);
}

.section-title {
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-paper-border);
}

.info-item {
  padding: var(--spacing-sm);
  border-radius: var(--rounded-sm);
  background: var(--color-paper-bg-soft);
}

.info-label {
  color: var(--color-paper-muted);
}

.info-value {
  color: var(--color-paper-ink);
}

.seal-area {
  border-top-color: var(--color-paper-border);
}

.seal {
  color: var(--color-paper-stamp-red);
  border-color: var(--color-paper-stamp-red);
}

@media (min-width: 960px) {
  .student-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
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

  .share-trigger-container {
    right: var(--spacing-md);
    bottom: var(--spacing-md);
  }
}
```

- [ ] **Step 5: Stabilize MessageWall mobile stickers**

In `MessageWall.vue`, keep desktop sticker styles. Add this mobile override to the scoped style:

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
    transform: none;
  }

  .msg-item:hover {
    box-shadow: var(--shadow-paper-card);
  }

  .reply-form {
    flex-direction: column;
    align-items: stretch;
  }
}
```

Also replace `.msg-item` base colors with paper tokens:

```css
.msg-item {
  background: var(--color-paper-card);
  border: 1px solid var(--color-paper-border);
  box-shadow: var(--shadow-paper-card);
}
```

- [ ] **Step 6: Style PhotoWall with paper frames and stable image boxes**

In `PhotoWall.vue`, update styles:

```css
.photo-wall {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
}

.photo-item {
  aspect-ratio: 1;
  border: 6px solid var(--color-paper-card);
  border-radius: var(--rounded-sm);
  background: var(--color-paper-card-muted);
  box-shadow: var(--shadow-paper-card);
}

@media (max-width: 768px) {
  .photo-wall {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

- [ ] **Step 7: Run student and responsive tests**

Run:

```powershell
pnpm --filter site-astro exec vitest run tests/student-profile-lifecycle.test.ts tests/responsive-vintage-static.test.ts
pnpm --filter site-astro typecheck
```

Expected: PASS for the new responsive static test if Tasks 1-6 are complete. Typecheck PASS.

- [ ] **Step 8: Commit student profile and message wall**

Run:

```powershell
git add packages/site-astro/src/components/StudentProfile.vue packages/site-astro/src/components/MessageWall.vue packages/site-astro/src/components/PhotoWall.vue packages/site-astro/tests/student-profile-lifecycle.test.ts
git commit -m "style: redesign student profile with stable paper sections"
```

---

### Task 7: Migrate Album, Timeline, And Yearbook To Paper Layout

**Files:**
- Modify: `packages/site-astro/src/pages/album.astro`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/pages/timeline.astro`
- Modify: `packages/site-astro/src/pages/yearbook.astro`

- [ ] **Step 1: Apply `page-shell` to album and timeline pages**

In `album.astro`, change:

```astro
<div class="album-page section">
```

to:

```astro
<div class="album-page page-shell">
```

Replace the header with:

```astro
<div class="album-header page-header fade-in">
  <p class="page-header__label">IMAGE GALLERY</p>
  <h1 class="display-lg">影像馆</h1>
  <p class="page-header__subtitle">每一幅影像，都是一段珍贵的回忆</p>
</div>
```

Remove `.album-page { padding-top: ... }` from the style block.

In `timeline.astro`, change:

```astro
<div class="timeline-page section" data-base-url={base} data-api-base={CLIENT_API_BASE}>
```

to:

```astro
<div class="timeline-page page-shell" data-base-url={base} data-api-base={CLIENT_API_BASE}>
```

Replace the header with shared `page-header` classes and remove `.timeline-page { padding-top: ... }`.

- [ ] **Step 2: Convert AlbumGrid to paper filters and sections**

In `AlbumGrid.vue`, update selectors:

```css
.tags-filter-bar {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: var(--spacing-xl);
}

.tag-filter-btn {
  background: var(--color-paper-card);
  color: var(--color-paper-muted);
  border-color: var(--color-paper-border);
}

.tag-filter-btn.active {
  background: var(--color-paper-brown);
  border-color: var(--color-paper-brown);
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

.album-header-container {
  border-bottom-color: var(--color-paper-border);
}

.album-desc {
  color: var(--color-paper-muted);
}

.album-tag-badge {
  background: color-mix(in srgb, var(--color-paper-brown) 12%, var(--color-paper-card));
  color: var(--color-paper-ink-soft);
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

- [ ] **Step 3: Convert timeline cards to paper yearbook style**

In `timeline.astro`, update CSS:

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
  color: #fffaf2;
  border-color: var(--color-paper-brown);
}

.timeline-line::before {
  background: var(--color-paper-border);
}

.tl-dot {
  background: var(--color-paper-brown);
}

.tl-card {
  background: var(--color-paper-card);
  border-color: var(--color-paper-border);
  box-shadow: var(--shadow-paper-card);
}

.tl-date {
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
}
```

- [ ] **Step 4: Align yearbook screen preview without breaking print**

In `yearbook.astro`, change `.yearbook-page`:

```css
.yearbook-page {
  padding-top: var(--nav-height);
  max-width: 980px;
  margin: 0 auto;
  padding-bottom: 80px;
  color: var(--color-paper-ink);
}
```

Set `.print-section` to use paper card styling for screen only:

```css
@media screen {
  .print-section {
    margin: var(--spacing-xl) var(--spacing-lg);
    padding: var(--spacing-xl);
    background: var(--color-paper-card);
    border: 1px solid var(--color-paper-border);
    border-radius: var(--rounded-lg);
    box-shadow: var(--shadow-paper-card);
  }
}
```

Keep the existing `@media print` block and ensure it still resets cards to white.

- [ ] **Step 5: Run build and navigation tests**

Run:

```powershell
pnpm --filter site-astro build
pnpm --filter site-astro exec vitest run tests/navigation.test.ts tests/performance-static.test.ts
```

Expected: PASS. If `performance-static.test.ts` fails on JS size, inspect which new dependency was introduced and remove it. This task should be CSS-first and add no dependency.

- [ ] **Step 6: Commit album, timeline, and yearbook migration**

Run:

```powershell
git add packages/site-astro/src/pages/album.astro packages/site-astro/src/components/AlbumGrid.vue packages/site-astro/src/pages/timeline.astro packages/site-astro/src/pages/yearbook.astro
git commit -m "style: migrate album timeline and yearbook to paper layout"
```

---

### Task 8: Final Performance And Visual Regression Pass

**Files:**
- Modify: `packages/site-astro/tests/performance-static.test.ts`
- Modify: `packages/site-astro/tests/performance-network.spec.ts`
- Modify: `packages/site-astro/tests/homepage-cover-login.spec.ts`

- [ ] **Step 1: Extend static performance tests for homepage cover constraints**

Append this test to `packages/site-astro/tests/performance-static.test.ts`:

```ts
  it('homepage cover flow stays CSS-first and does not ship heavy visual dependencies', () => {
    const hero = fs.readFileSync(path.resolve(__dirname, '../src/components/MuseumHero.astro'), 'utf-8')

    expect(hero).not.toContain("import gsap")
    expect(hero).not.toContain('ScrollTrigger')
    expect(hero).not.toContain('<img')
    expect(hero).toContain('home-cover')
    expect(hero).toContain('home-login-section')
  })
```

- [ ] **Step 2: Extend network test forbidden tokens for homepage**

In `performance-network.spec.ts`, in the home page test, keep:

```ts
const forbidden = ['scrolltrigger', 'gsap', 'classgraphpreview', 'seatmappreview']
```

Add:

```ts
expect(requests.some(url => url.toLowerCase().includes('/api/classmates'))).toBe(false)
```

after visiting the homepage, because the new homepage must not fetch classmate lists on first paint.

If this fails because `ClassmateLoginBook` fetches classmates indirectly, keep the test and remove that fetch from the homepage path. The login component should authenticate only after user submits.

- [ ] **Step 3: Add mobile screenshot smoke test**

Append this test to `homepage-cover-login.spec.ts`:

```ts
test('homepage cover and login section fit mobile viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)

  await page.getByTestId('home-login-cta').click()
  await expect(page.locator('#login')).toBeInViewport()
  await page.screenshot({ path: 'test-results/homepage-cover-mobile.png', fullPage: true })
})
```

- [ ] **Step 4: Run full site verification**

Run:

```powershell
pnpm verify:site
```

Expected:

- `pnpm --filter site-astro typecheck`: PASS
- `pnpm --filter site-astro test:with-build`: PASS
- `pnpm --filter site-astro test:perf-network`: PASS

- [ ] **Step 5: Run full workspace verification if public site passes**

Run:

```powershell
pnpm verify:all
```

Expected: PASS for worker, admin, and site.

- [ ] **Step 6: Commit final verification hardening**

Run:

```powershell
git add packages/site-astro/tests/performance-static.test.ts packages/site-astro/tests/performance-network.spec.ts packages/site-astro/tests/homepage-cover-login.spec.ts
git commit -m "test: verify responsive paper redesign performance"
```

---

### Task 9: Manual Visual QA Checklist

**Files:**
- No product file changes expected.
- Screenshots generated under `test-results/`.

- [ ] **Step 1: Start a local preview**

Run:

```powershell
pnpm --filter site-astro build
pnpm --filter site-astro preview -- --host 127.0.0.1
```

Expected: preview prints a `http://127.0.0.1:<port>/` URL.

- [ ] **Step 2: Check desktop pages**

Open these pages in a desktop viewport around `1440 x 900`:

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

- Homepage first viewport is a dark cover, not a login form.
- Homepage CTA scrolls to the login section.
- Site pages use consistent paper backgrounds, cards, and borders.
- Navigation no longer flickers after page changes.
- Student profile lazy sections do not jump when they appear.

- [ ] **Step 3: Check mobile pages**

Use a mobile viewport around `390 x 844` and check:

```text
/
/roster/
/album/
/timeline/
/student/template/
```

Expected:

- No horizontal overflow.
- Homepage title fits and CTA is reachable.
- Roster cards are readable.
- Album filters do not create an oversized first screen.
- Timeline is single-side.
- Message stickers do not rotate or scale on mobile.

- [ ] **Step 4: Capture before finishing**

Capture screenshots:

```text
test-results/visual-home-desktop.png
test-results/visual-home-mobile.png
test-results/visual-roster-mobile.png
test-results/visual-student-mobile.png
```

Use Playwright or browser screenshots. Do not commit screenshots unless the team wants visual artifacts in git.

- [ ] **Step 5: Final status**

Run:

```powershell
git status --short
```

Expected: only intentional product/test files are modified. `test-results/` and `playwright-report/` remain ignored.

---

## Self-Review Checklist

- Spec coverage:
  - Homepage cover login flow: Task 3 and Task 8.
  - Vintage paper design system: Task 2.
  - Desktop and mobile page layout rules: Tasks 5, 6, and 7.
  - Animation duplication and jumpiness: Tasks 4 and 8.
  - Performance and lazy loading: Tasks 6 and 8.
  - Visual QA: Task 9.

- Placeholder scan:
  - No unresolved placeholder markers.
  - No deferred-work wording.
  - No vague error-handling instructions.

- Type and selector consistency:
  - Homepage CTA selector: `data-testid="home-login-cta"` in plan and tests.
  - Login form selectors remain `#username-input`, `#password-input`, `.login-btn`.
  - Paper utility names match static tests: `.page-shell`, `.page-header`, `.paper-panel`, `.paper-card`, `.paper-section-divider`.
  - Motion cleanup names match static tests: `activeObserver`, `topNavScrollCleanup`.
