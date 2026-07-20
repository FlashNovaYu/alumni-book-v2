# Roster Pagination Motion Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the stronger timing character of the older page transition while keeping roster pagination height-stable and making its horizontal motion strictly bidirectional.

**Architecture:** Keep the existing keyed `.roster-page` transition and measured `.roster-page-viewport`; change only the transition parameters and their browser assertions. A responsive CSS custom property controls travel distance, while forward and backward classes use mirrored X-axis signs.

**Tech Stack:** Vue 3 SFC transitions, scoped CSS, Astro, Playwright, TypeScript

---

## File map

- Modify `packages/site-astro/src/components/RosterWall.vue`: define responsive travel distance and asymmetric enter/leave timing while preserving the current transition structure.
- Modify `packages/site-astro/tests/roster-pagination.spec.ts`: assert the actual CSS transition keyframe endpoints on mobile and desktop in both directions.
- Reference `docs/superpowers/specs/2026-07-20-roster-pagination-motion-enhancement-design.md`: source of approved parameters and acceptance criteria.

### Task 1: Lock the stronger bidirectional motion in a failing browser test

**Files:**
- Modify: `packages/site-astro/tests/roster-pagination.spec.ts:74`

- [x] **Step 1: Add a helper that reads transform transition endpoints**

Add this helper near `seedClassmateSession`:

```ts
async function transitionXEndpoints(locator: any) {
  return locator.evaluate((element: Element) => {
    const values = element.getAnimations().flatMap((animation) => {
      const effect = animation.effect as KeyframeEffect | null
      return effect?.getKeyframes()
        .filter((frame) => typeof frame.transform === 'string')
        .map((frame) => new DOMMatrix(String(frame.transform)).m41) ?? []
    })
    return { min: Math.min(...values), max: Math.max(...values) }
  })
}
```

- [x] **Step 2: Replace partial-progress assertions with endpoint assertions**

In `roster switches whole pages horizontally without collapsing the grid or changing scroll position`, inspect endpoints immediately after the active transition classes appear:

```ts
const [outgoingEndpoints, incomingEndpoints, transitionHeight] = await Promise.all([
  transitionXEndpoints(firstPage),
  transitionXEndpoints(secondPage),
  viewport.evaluate((element) => element.getBoundingClientRect().height),
])
expect(outgoingEndpoints.min).toBeLessThanOrEqual(-95)
expect(incomingEndpoints.max).toBeGreaterThanOrEqual(95)
```

Use the mirrored assertions for backward pagination:

```ts
expect(backwardOutgoingEndpoints.max).toBeGreaterThanOrEqual(95)
expect(backwardIncomingEndpoints.min).toBeLessThanOrEqual(-95)
```

After the backward transition completes, resize to 1440px, move forward once more, and assert the incoming endpoint is capped at 280px:

```ts
await page.setViewportSize({ width: 1440, height: 900 })
await page.getByRole('button', { name: '第 2 页' }).click()
await expect(secondPage).toHaveClass(/roster-page-forward-enter-active/)
const desktopIncomingEndpoints = await transitionXEndpoints(secondPage)
expect(desktopIncomingEndpoints.max).toBeCloseTo(280, 0)
```

- [x] **Step 3: Run the browser test and verify RED**

Run:

```powershell
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/roster-pagination.spec.ts --workers=1
```

Expected: FAIL because the current transition endpoints are only `30px`, below the mobile `95px` threshold and the desktop `280px` target.

### Task 2: Implement the approved responsive, asymmetric motion

**Files:**
- Modify: `packages/site-astro/src/components/RosterWall.vue:447`

- [x] **Step 1: Define the responsive distance on the stable viewport**

```css
.roster-page-viewport {
  --roster-page-shift: clamp(96px, 22vw, 280px);
  position: relative;
}
```

- [x] **Step 2: Give entry and exit their historical asymmetric timing**

Replace the shared four-state transition block with:

```css
.roster-page-forward-enter-active,
.roster-page-backward-enter-active {
  transition:
    opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;
}

.roster-page-forward-leave-active,
.roster-page-backward-leave-active {
  position: absolute;
  inset: 0;
  width: 100%;
  transition:
    opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;
}
```

- [x] **Step 3: Mirror the responsive distance across directions**

```css
.roster-page-forward-enter-from {
  opacity: 0;
  transform: translateX(var(--roster-page-shift)) scale(0.95);
}

.roster-page-forward-leave-to {
  opacity: 0;
  transform: translateX(calc(0px - var(--roster-page-shift))) scale(0.95);
}

.roster-page-backward-enter-from {
  opacity: 0;
  transform: translateX(calc(0px - var(--roster-page-shift))) scale(0.95);
}

.roster-page-backward-leave-to {
  opacity: 0;
  transform: translateX(var(--roster-page-shift)) scale(0.95);
}
```

- [x] **Step 4: Rebuild and run the focused browser test for GREEN**

Run:

```powershell
$env:VITE_SSG_API_BASE='http://118.178.88.227'
pnpm --filter site-astro exec astro build
Remove-Item Env:VITE_SSG_API_BASE
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/roster-pagination.spec.ts --workers=1
```

Expected: all roster pagination tests PASS, including mobile `96px`, desktop `280px`, mirrored direction, stable height, and `window.scrollY` changing by no more than 2px.

### Task 3: Run adjacent regressions and commit the implementation

**Files:**
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Modify: `packages/site-astro/tests/roster-pagination.spec.ts`
- Add: `docs/superpowers/plans/2026-07-20-roster-pagination-motion-enhancement.md`

- [x] **Step 1: Run type and static checks**

```powershell
pnpm --filter site-astro typecheck
pnpm --filter site-astro test
```

Expected: zero type errors and all site static/unit tests PASS.

- [x] **Step 2: Run adjacent mobile and visual browser checks**

```powershell
pnpm --filter site-astro exec tsx scripts/run-playwright-preview.ts tests/roster-pagination.spec.ts tests/mobile-gyro-flow.spec.ts tests/public-site-major-redesign-visual.spec.ts --workers=1
```

Expected: all tests PASS; 390px and 430px roster layouts remain two columns with no horizontal overflow.

- [x] **Step 3: Verify the scoped diff**

```powershell
git diff --check -- packages/site-astro/src/components/RosterWall.vue packages/site-astro/tests/roster-pagination.spec.ts docs/superpowers/plans/2026-07-20-roster-pagination-motion-enhancement.md
git diff --stat -- packages/site-astro/src/components/RosterWall.vue packages/site-astro/tests/roster-pagination.spec.ts docs/superpowers/plans/2026-07-20-roster-pagination-motion-enhancement.md
```

Expected: no whitespace errors and no unrelated files in the scoped diff.

- [x] **Step 4: Commit only the approved implementation files**

```powershell
git add -- packages/site-astro/src/components/RosterWall.vue packages/site-astro/tests/roster-pagination.spec.ts docs/superpowers/plans/2026-07-20-roster-pagination-motion-enhancement.md
git commit -m "feat: strengthen roster pagination motion"
```

Expected: one commit containing only the component, its browser regression test, and this implementation plan.
