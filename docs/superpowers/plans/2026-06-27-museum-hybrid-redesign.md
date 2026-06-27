# Museum Hybrid Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the confirmed “青春纪念馆 + 互动手账 + 少量数据档案馆” redesign while preserving Phase 9 animation and performance guarantees.

**Architecture:** Keep the existing Astro public site, Vue islands, Vue admin SPA, shared types, Hono Worker API, D1, and R2 architecture. Add focused view-model helpers and small visual components instead of rewriting the app; API/schema changes are incremental and remain compatible with current `students.info` JSON storage.

**Tech Stack:** Astro 5, Vue 3, TypeScript, Vitest, Cloudflare Worker/Hono, D1, R2, pnpm workspace, CSS-first animation, IntersectionObserver, lazy-loaded heavy visual modules.

---

## Scope Check

The approved spec covers public UI, admin data entry, API/data shape, animation policy, and future highlight features. This plan keeps it executable by splitting work into four phases:

- Phase 10.1: visual system, homepage, roster, student profile, sticker-style messages.
- Phase 10.2: admin/data connectivity, content audit, settings-driven display switches.
- Phase 10.3: gallery and timeline as “影像馆/校史走廊”.
- Phase 10.4: graph, seat map, and collection statistics as lazy-loaded highlights.

Phase 10.1 and 10.2 are the first implementation batch. Phase 10.3 and 10.4 are planned but should be executed after the core experience is stable.

## File Structure And Boundaries

### Shared

- Modify `packages/shared/src/tokens.css`: add museum theme tokens without removing existing tokens.
- Modify `packages/shared/src/types.ts`: extend `StudentInfo`, `ClassmateEntry`, `SiteConfig`, `Album`, `Photo`, and add small view-facing types used by admin/site.

### Site

- Modify `packages/site-astro/src/styles/global.css`: add reusable museum surface utilities and safe CSS-only motion classes.
- Create `packages/site-astro/src/utils/profileCompleteness.ts`: pure helper for profile completeness, missing fields, and tags.
- Create `packages/site-astro/src/utils/museumViewModels.ts`: pure helper to convert raw student/classmate/album/timeline data to display view models.
- Create `packages/site-astro/src/components/MuseumHero.astro`: homepage “入馆仪式” wrapper.
- Create `packages/site-astro/src/components/VisitorPass.vue`: visual wrapper around the existing name gate interaction.
- Modify `packages/site-astro/src/components/NameGate.vue`: emit/accept museum visual states while keeping API behavior.
- Create `packages/site-astro/src/components/ArchiveRosterCard.vue`: focused roster card.
- Modify `packages/site-astro/src/components/RosterWall.vue`: archive search/filter shell and cards.
- Create `packages/site-astro/src/components/ProfileCompleteness.vue`: completeness and missing-field prompt.
- Modify `packages/site-astro/src/components/StudentProfile.vue`: museum profile sections and lazy sections.
- Modify `packages/site-astro/src/components/MessageWall.vue`: sticker wall visual treatment without changing endpoint semantics.
- Modify `packages/site-astro/src/pages/index.astro`, `roster.astro`, `student/[slug].astro`, `album.astro`, `timeline.astro`, `yearbook.astro`: page-level museum framing.
- Modify `packages/site-astro/tests/feature-static.test.ts`: feature visibility checks.
- Modify `packages/site-astro/tests/performance-static.test.ts`: guard against GSAP/ScrollTrigger regressions.
- Create `packages/site-astro/tests/museum-viewmodels.test.ts`: unit tests for pure helpers.

### Admin

- Create `packages/admin/src/utils/profileCompleteness.ts`: duplicate the same pure completeness constants used by the site, because the admin package must not import from `packages/site-astro/src`.
- Modify `packages/admin/src/views/StudentEditView.vue`: add complete field groups and completeness guidance.
- Modify `packages/admin/src/views/DashboardView.vue`: formalize content audit panel and quick actions.
- Modify `packages/admin/src/views/SettingsView.vue`: add museum theme/content switches.
- Modify `packages/admin/src/views/AlbumsView.vue`: expose tags, sort, featured cover.
- Modify `packages/admin/src/views/TimelineEventsView.vue`: expose event type and resource association.

### Worker/API

- Modify `workers/api/src/index.ts`: enrich public classmates/config/stats payloads and audit alerts.
- Modify `workers/api/src/routes/students.ts`: preserve new student info fields and admin updates.
- Modify `workers/api/src/routes/config.ts`: validate and persist museum config keys.
- Modify `workers/api/src/routes/albums.ts`: tags, featured cover, linked students.
- Modify `workers/api/src/routes/timeline.ts`: event type, linked album/student/photo.
- Modify `workers/api/tests/api.test.ts`: API shape and data persistence.
- Modify `workers/api/tests/security.test.ts`: privacy fields remain protected.

### Scripts/Docs

- Modify `scripts/perf-budget.mjs`: add explicit first-screen constraints for new highlight modules if bundle names are stable enough.
- Create or update `docs/phase-10-acceptance-report.md` at the end of execution.

---

## [x] Task 1: Add Museum Contract Tests

**Files:**
- Modify: `packages/site-astro/tests/feature-static.test.ts`
- Modify: `packages/site-astro/tests/performance-static.test.ts`
- Create: `packages/site-astro/tests/museum-viewmodels.test.ts`
- Test command: `pnpm --filter site-astro test:with-build`

- [ ] **Step 1: Add failing feature visibility tests**

Append these tests to `packages/site-astro/tests/feature-static.test.ts`:

```ts
it('ships the museum redesign markers on core public pages', () => {
  const homeHtml = readDistHtml('index.html')
  const rosterHtml = readDistHtml('roster/index.html')
  const studentHtml = readDistHtml('student/template/index.html')

  expect(homeHtml).toContain('CLASS MEMORY MUSEUM')
  expect(homeHtml).toContain('访客登记')
  expect(rosterHtml).toContain('人物长廊')
  expect(rosterHtml).toContain('档案检索')
  expect(studentHtml).toContain('档案展柜')
  expect(studentHtml).toContain('资料完整度')
})

it('keeps visible empty states for incomplete content instead of hiding features', () => {
  const rosterHtml = readDistHtml('roster/index.html')
  const yearbookHtml = readDistHtml('yearbook/index.html')

  expect(rosterHtml).toContain('页面待完善')
  expect(rosterHtml).toContain('补全资料')
  expect(yearbookHtml).toContain('馆藏缺失提示')
})
```

- [ ] **Step 2: Add failing helper tests**

Create `packages/site-astro/tests/museum-viewmodels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildInterestTags,
  computeProfileCompleteness,
  getMissingProfileFields,
} from '../src/utils/profileCompleteness'

describe('museum profile helpers', () => {
  it('computes profile completeness from the required museum fields', () => {
    const info = {
      nickname: '小林',
      motto: '保持热爱',
      bestMemory: '运动会',
      favoriteSong: '同桌的你',
      futureSelf: '成为老师',
    }

    expect(computeProfileCompleteness(info)).toBe(25)
  })

  it('returns readable missing profile fields for content audit and self-edit hints', () => {
    const info = { nickname: '小林', motto: '保持热爱' }

    expect(getMissingProfileFields(info).slice(0, 4)).toEqual([
      { key: 'avatarUrl', label: '头像' },
      { key: 'bestMemory', label: '校园回忆' },
      { key: 'favoriteSong', label: '喜欢歌曲' },
      { key: 'futureSelf', label: '十年后的自己' },
    ])
  })

  it('builds stable interest tags without empty values', () => {
    const info = {
      mbti: 'ENFP',
      favoriteSong: '晴天',
      favoriteFood: '',
      bestSubject: '语文',
    }

    expect(buildInterestTags(info)).toEqual(['ENFP', '晴天', '语文'])
  })
})
```

- [ ] **Step 3: Strengthen performance tests**

Append this test to `packages/site-astro/tests/performance-static.test.ts`:

```ts
it('museum redesign does not put graph or panorama modules on the homepage critical path', () => {
  const htmlPath = path.join(distDir, 'index.html')
  expect(fs.existsSync(htmlPath)).toBe(true)

  const scripts = getReferencedScripts(htmlPath)
  expectScriptsNotToReference(scripts, [
    'ClassGraph',
    'SeatMap',
    'Panorama',
    'ScrollTrigger',
    'gsap',
  ])
})
```

- [ ] **Step 4: Run tests and confirm failure**

Run:

```bash
pnpm --filter site-astro test:with-build
```

Expected: tests fail because museum helpers and page markers do not exist yet.

- [ ] **Step 5: Commit failing tests**

```bash
git add packages/site-astro/tests/feature-static.test.ts packages/site-astro/tests/performance-static.test.ts packages/site-astro/tests/museum-viewmodels.test.ts
git commit -m "test: define museum redesign contract"
```

---

## Task 2: Add Shared Museum Tokens And Pure Helpers

**Files:**
- Modify: `packages/shared/src/tokens.css`
- Modify: `packages/shared/src/types.ts`
- Create: `packages/site-astro/src/utils/profileCompleteness.ts`
- Create: `packages/site-astro/src/utils/museumViewModels.ts`
- Test: `packages/site-astro/tests/museum-viewmodels.test.ts`

- [ ] **Step 1: Add museum design tokens**

Append this block inside `:root` in `packages/shared/src/tokens.css` after the existing color tokens:

```css
  /* ── Museum hybrid redesign tokens ── */
  --color-museum-ink: #26303a;
  --color-museum-ink-soft: #52606c;
  --color-museum-gold: #c8a96a;
  --color-museum-gold-soft: #ead9a6;
  --color-museum-paper: #fbf6ec;
  --color-museum-paper-strong: #f0e3cf;
  --color-museum-film-blue: #8aa2b6;
  --color-museum-stamp-red: #a84f3d;
  --shadow-museum-panel: 0 18px 46px rgba(38, 48, 58, 0.14);
  --shadow-museum-paper: 0 10px 28px rgba(92, 74, 48, 0.12);
  --texture-paper-line: linear-gradient(rgba(38, 48, 58, 0.055) 1px, transparent 1px);
```

- [ ] **Step 2: Extend shared types**

Modify `packages/shared/src/types.ts`:

```ts
export interface StudentInfo {
  name: string
  nickname: string
  gender: string
  birthday: string
  school: string
  class: string
  studentId: string
  seatNo: string
  dormNo: string
  groupName?: string
  graduationYear: string
  qq: string
  wechat: string
  weibo: string
  phone: string
  email: string
  address: string
  douyinId: string
  kuaishou: string
  bilibili: string
  mbti: string
  bloodType: string
  astro: string
  strengths: string
  weaknesses: string
  bestSubject: string
  worstSubject: string
  motto: string
  favoriteIdol: string
  favoriteAnime: string
  favoriteMovie: string
  favoriteSong: string
  favoriteGame: string
  favoriteFood: string
  favoriteColor: string
  favoriteSport: string
  bestMemory: string
  bestLesson: string
  deskmateFun: string
  classMeme: string
  embarrassingMoment: string
  proudestAchievement: string
  targetUniversity: string
  targetMajor: string
  futureCareer: string
  futureCity: string
  futureSelf: string
  letterToFuture: string
  letterToClassmates: string
  profileModules?: Array<{
    type?: string
    title: string
    content: string
  }>
  visibility?: Record<string, 'public' | 'classmates' | 'owner' | 'hidden'>
}

export interface ClassmateEntry {
  name: string
  slug: string
  hasPage: boolean
  avatarUrl: string | null
  motto: string
  nickname?: string
  school?: string
  className?: string
  mbti?: string
  seatNo?: string
  dormNo?: string
  groupName?: string
  completion?: number
  tags?: string[]
}

export interface MuseumThemeConfig {
  enabled: boolean
  heroEyebrow: string
  heroTitle: string
  heroSubtitle: string
  particleLevel: 'off' | 'low' | 'medium'
  enableClassGraph: boolean
  enableSeatMap: boolean
}

export interface SiteConfig {
  particles: Record<string, { enabled: boolean; preset: string }>
  museum?: MuseumThemeConfig
  footer: {
    copyright: string
    beian: string
    beianUrl: string
  }
  preface: {
    title: string
    subtitle: string
    content: string
  }
  acknowledgments: Acknowledgment[]
  typography: {
    fontFamily: string
    fontSize: number
  }
}
```

- [ ] **Step 3: Add profile helper**

Create `packages/site-astro/src/utils/profileCompleteness.ts`:

```ts
export interface MissingProfileField {
  key: string
  label: string
}

const REQUIRED_FIELDS: MissingProfileField[] = [
  { key: 'avatarUrl', label: '头像' },
  { key: 'nickname', label: '昵称' },
  { key: 'motto', label: '座右铭' },
  { key: 'bestMemory', label: '校园回忆' },
  { key: 'favoriteSong', label: '喜欢歌曲' },
  { key: 'futureSelf', label: '十年后的自己' },
  { key: 'letterToClassmates', label: '给同学的话' },
  { key: 'profileModules', label: '个人小传' },
  { key: 'favoriteFood', label: '喜欢食物' },
  { key: 'bestSubject', label: '喜欢科目' },
  { key: 'targetUniversity', label: '目标大学' },
  { key: 'futureCareer', label: '未来职业' },
  { key: 'bestLesson', label: '难忘课堂' },
  { key: 'deskmateFun', label: '同桌趣事' },
  { key: 'classMeme', label: '班级经典梗' },
  { key: 'mbti', label: 'MBTI' },
]

function hasValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined && String(value).trim().length > 0
}

export function computeProfileCompleteness(info: Record<string, unknown>, avatarUrl?: string | null): number {
  const filled = REQUIRED_FIELDS.filter((field) => {
    if (field.key === 'avatarUrl') return hasValue(avatarUrl)
    return hasValue(info[field.key])
  }).length
  return Math.round((filled / REQUIRED_FIELDS.length) * 100)
}

export function getMissingProfileFields(info: Record<string, unknown>, avatarUrl?: string | null): MissingProfileField[] {
  return REQUIRED_FIELDS.filter((field) => {
    if (field.key === 'avatarUrl') return !hasValue(avatarUrl)
    return !hasValue(info[field.key])
  })
}

export function buildInterestTags(info: Record<string, unknown>): string[] {
  const keys = ['mbti', 'favoriteSong', 'favoriteFood', 'bestSubject', 'favoriteSport', 'targetMajor']
  return keys
    .map((key) => info[key])
    .filter(hasValue)
    .map((value) => String(value).trim())
    .slice(0, 6)
}
```

- [ ] **Step 4: Add view-model helper**

Create `packages/site-astro/src/utils/museumViewModels.ts`:

```ts
import type { ClassmateEntry, Student } from '@alumni/shared'
import { buildInterestTags, computeProfileCompleteness, getMissingProfileFields } from './profileCompleteness'

export interface ArchiveClassmateCard {
  name: string
  slug: string
  href: string
  hasPage: boolean
  avatarUrl: string | null
  motto: string
  tags: string[]
  completion: number
  statusLabel: string
}

export function toArchiveClassmateCard(mate: ClassmateEntry, siteBase: string): ArchiveClassmateCard {
  const completion = mate.completion ?? 0
  return {
    name: mate.name,
    slug: mate.slug,
    href: `${siteBase}${`student/${mate.slug}/`.replace(/^\/+/, '')}`,
    hasPage: mate.hasPage,
    avatarUrl: mate.avatarUrl,
    motto: mate.motto || '这位同学还没有写下座右铭',
    tags: mate.tags || [mate.mbti, mate.school, mate.className].filter(Boolean).map(String).slice(0, 3),
    completion,
    statusLabel: mate.hasPage ? `馆藏完成度 ${completion}%` : '页面待完善',
  }
}

export function toStudentMuseumSummary(student: Student) {
  const info = student.info || {}
  return {
    completion: computeProfileCompleteness(info, student.avatarUrl),
    missingFields: getMissingProfileFields(info, student.avatarUrl),
    tags: buildInterestTags(info),
  }
}
```

- [ ] **Step 5: Run helper tests**

Run:

```bash
pnpm --filter site-astro test -- tests/museum-viewmodels.test.ts
```

Expected: the new helper tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/tokens.css packages/shared/src/types.ts packages/site-astro/src/utils/profileCompleteness.ts packages/site-astro/src/utils/museumViewModels.ts packages/site-astro/tests/museum-viewmodels.test.ts
git commit -m "feat: add museum theme tokens and profile helpers"
```

---

## Task 3: Build Homepage 入馆仪式

**Files:**
- Create: `packages/site-astro/src/components/MuseumHero.astro`
- Create: `packages/site-astro/src/components/VisitorPass.vue`
- Modify: `packages/site-astro/src/components/NameGate.vue`
- Modify: `packages/site-astro/src/pages/index.astro`
- Modify: `packages/site-astro/src/styles/global.css`
- Test: `packages/site-astro/tests/feature-static.test.ts`, `performance-static.test.ts`

- [ ] **Step 1: Add safe museum global utilities**

Append to `packages/site-astro/src/styles/global.css`:

```css
.museum-paper {
  background-color: var(--color-museum-paper);
  background-image: var(--texture-paper-line);
  background-size: 100% 28px;
  border: 1px solid color-mix(in srgb, var(--color-museum-gold) 36%, transparent);
  box-shadow: var(--shadow-museum-paper);
}

.museum-kicker {
  font-size: var(--type-caption-uppercase-size);
  font-weight: var(--type-caption-uppercase-weight);
  letter-spacing: 0.16em;
  color: var(--color-museum-gold);
  text-transform: uppercase;
}

.museum-reveal {
  opacity: 0;
  animation: museumReveal 0.68s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes museumReveal {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .museum-reveal {
    opacity: 1 !important;
    transform: none !important;
    animation: none !important;
  }
}
```

- [ ] **Step 2: Create `VisitorPass.vue`**

Create `packages/site-astro/src/components/VisitorPass.vue`:

```vue
<template>
  <div class="visitor-pass museum-paper">
    <div class="pass-label">访客登记</div>
    <NameGate :api-base="apiBase" />
  </div>
</template>

<script setup lang="ts">
import NameGate from './NameGate.vue'

defineProps<{ apiBase: string }>()
</script>

<style scoped>
.visitor-pass {
  width: min(100%, 460px);
  margin: 0 auto;
  padding: var(--spacing-lg);
  border-radius: var(--rounded-md);
}

.pass-label {
  margin-bottom: var(--spacing-sm);
  font-size: var(--type-caption-uppercase-size);
  letter-spacing: 0.14em;
  color: var(--color-museum-ink-soft);
}
</style>
```

- [ ] **Step 3: Create `MuseumHero.astro`**

Create `packages/site-astro/src/components/MuseumHero.astro`:

```astro
---
import VisitorPass from './VisitorPass.vue'

interface Props {
  apiBase: string
}

const { apiBase } = Astro.props
---

<section class="museum-hero" aria-labelledby="museum-hero-title">
  <div class="museum-hero__backdrop" aria-hidden="true"></div>
  <div class="museum-hero__inner container">
    <div class="museum-hero__copy museum-reveal">
      <p class="museum-kicker">CLASS MEMORY MUSEUM</p>
      <h1 id="museum-hero-title" class="museum-hero__title display-xl">青春纪念馆</h1>
      <p class="museum-hero__subtitle">翻开这本会呼吸的同学录，沿着照片、留言和档案，重新走过我们的青春长廊。</p>
    </div>
    <div class="museum-hero__pass museum-reveal" style="animation-delay: 120ms">
      <VisitorPass client:load apiBase={apiBase} />
    </div>
  </div>
</section>

<style>
.museum-hero {
  position: relative;
  min-height: 100svh;
  display: grid;
  align-items: center;
  padding: calc(var(--nav-height) + var(--spacing-xl)) 0 var(--spacing-section);
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(38, 48, 58, 0.96), rgba(38, 48, 58, 0.72) 48%, rgba(200, 169, 106, 0.58)),
    var(--color-museum-ink);
  color: var(--color-on-dark);
}

.museum-hero__backdrop {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 42px 42px;
  opacity: 0.3;
}

.museum-hero__inner {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 460px);
  gap: var(--spacing-xxl);
  align-items: center;
}

.museum-hero__title {
  margin: var(--spacing-md) 0;
  color: #fff;
  letter-spacing: 0;
}

.museum-hero__subtitle {
  max-width: 560px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 18px;
  line-height: 1.9;
}

@media (max-width: 820px) {
  .museum-hero__inner {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .museum-hero__title {
    font-size: 42px;
  }
}
</style>
```

- [ ] **Step 4: Replace homepage body**

Modify `packages/site-astro/src/pages/index.astro` to import `MuseumHero` and render it:

```astro
---
import MainLayout from '../layouts/MainLayout.astro'
import MuseumHero from '../components/MuseumHero.astro'

const base = process.env.SITE_BASE || import.meta.env.BASE_URL || '/'
const CLIENT_API_BASE = import.meta.env.VITE_API_BASE_URL || (base.endsWith('/') ? base.slice(0, -1) : base)
---

<MainLayout>
  <MuseumHero apiBase={CLIENT_API_BASE} />
</MainLayout>
```

- [ ] **Step 5: Run site tests**

Run:

```bash
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

Expected: homepage feature assertions pass; performance script still reports homepage without GSAP/ScrollTrigger.

- [ ] **Step 6: Commit**

```bash
git add packages/site-astro/src/components/MuseumHero.astro packages/site-astro/src/components/VisitorPass.vue packages/site-astro/src/pages/index.astro packages/site-astro/src/styles/global.css
git commit -m "feat(site): add museum entrance homepage"
```

---

## Task 4: Upgrade Roster To 人物长廊

**Files:**
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/tests/api.test.ts`
- Create: `packages/site-astro/src/components/ArchiveRosterCard.vue`
- Modify: `packages/site-astro/src/components/RosterWall.vue`
- Modify: `packages/site-astro/src/pages/roster.astro`
- Test: `packages/site-astro/tests/feature-static.test.ts`, `workers/api/tests/api.test.ts`

- [ ] **Step 1: Add API test for enriched classmates**

Append to the `GET /api/classmates` test in `workers/api/tests/api.test.ts`:

```ts
expect(body.data[0]).toHaveProperty('completion')
expect(body.data[0]).toHaveProperty('tags')
expect(Array.isArray(body.data[0].tags)).toBe(true)
```

- [ ] **Step 2: Update `/api/classmates` payload**

In `workers/api/src/index.ts`, update the classmates mapper:

```ts
const classmates = (results || []).map((row: any) => {
  const info = JSON.parse(row.info || '{}')
  const required = ['nickname', 'motto', 'bestMemory', 'favoriteSong', 'futureSelf', 'letterToClassmates', 'mbti', 'bestSubject']
  const filled = required.filter((key) => info[key] && String(info[key]).trim()).length + (row.avatar_url ? 1 : 0)
  const tags = [info.mbti, info.favoriteSong, info.bestSubject, info.school || row.school]
    .filter(Boolean)
    .map((value: string) => String(value).trim())
    .slice(0, 4)

  return {
    name: row.name,
    slug: row.slug,
    hasPage: true,
    avatarUrl: row.avatar_url,
    motto: info.motto || '',
    nickname: info.nickname || '',
    school: row.school || info.school || '',
    className: row.class_name || info.class || '',
    mbti: row.mbti || info.mbti || '',
    seatNo: info.seatNo || '',
    dormNo: info.dormNo || '',
    groupName: info.groupName || '',
    completion: Math.round((filled / 9) * 100),
    tags,
  }
})
```

- [ ] **Step 3: Create card component**

Create `packages/site-astro/src/components/ArchiveRosterCard.vue`:

```vue
<template>
  <a :href="card.hasPage ? card.href : '#'" class="archive-card" :class="{ 'is-empty': !card.hasPage }">
    <div class="archive-card__avatar">
      <img v-if="card.avatarUrl && !avatarError" :src="avatarSrc" :alt="card.name" loading="lazy" decoding="async" @error="avatarError = true" />
      <span v-else>{{ card.name.charAt(0) }}</span>
    </div>
    <div class="archive-card__body">
      <div class="archive-card__name">{{ card.name }}</div>
      <p class="archive-card__motto">{{ card.motto }}</p>
      <div class="archive-card__tags">
        <span v-for="tag in card.tags" :key="tag">{{ tag }}</span>
      </div>
      <div class="archive-card__status">{{ card.statusLabel }}</div>
    </div>
  </a>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ArchiveClassmateCard } from '../utils/museumViewModels'

const props = defineProps<{ card: ArchiveClassmateCard; apiBase: string }>()
const avatarError = ref(false)

const avatarSrc = computed(() => {
  if (!props.card.avatarUrl) return ''
  if (props.card.avatarUrl.startsWith('http')) return props.card.avatarUrl
  return `${props.apiBase}${props.card.avatarUrl}`
})
</script>

<style scoped>
.archive-card {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--spacing-md);
  min-height: 152px;
  padding: var(--spacing-lg);
  color: inherit;
  text-decoration: none;
  background: var(--color-museum-paper);
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-md);
  box-shadow: var(--shadow-museum-paper);
  transition: transform var(--duration-normal) var(--ease-out-quart), box-shadow var(--duration-normal) var(--ease-out-quart);
}

.archive-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-museum-panel);
}

.archive-card.is-empty {
  opacity: 0.72;
}

.archive-card__avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--color-museum-paper-strong), var(--color-museum-film-blue));
  color: var(--color-museum-ink);
  font-family: var(--font-display);
  font-size: 30px;
}

.archive-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.archive-card__name {
  font-size: 19px;
  font-weight: 600;
  color: var(--color-museum-ink);
}

.archive-card__motto {
  margin-top: 6px;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.6;
}

.archive-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.archive-card__tags span {
  padding: 2px 8px;
  border-radius: var(--rounded-sm);
  background: rgba(200, 169, 106, 0.18);
  color: var(--color-museum-ink-soft);
  font-size: 12px;
}

.archive-card__status {
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-museum-stamp-red);
}
</style>
```

- [ ] **Step 4: Use archive cards in `RosterWall.vue`**

Update `RosterWall.vue` to import helpers and component:

```ts
import ArchiveRosterCard from './ArchiveRosterCard.vue'
import { toArchiveClassmateCard } from '../utils/museumViewModels'
```

Replace the card loop with:

```vue
<div class="archive-grid">
  <ArchiveRosterCard
    v-for="mate in filteredClassmates"
    :key="mate.slug"
    :card="toArchiveClassmateCard(mate, siteBase)"
    :api-base="apiBase"
  />
</div>
```

Add visible headings/labels:

```vue
<div class="archive-search museum-paper">
  <p class="museum-kicker">人物长廊</p>
  <input v-model="keyword" type="text" class="text-input search-input" placeholder="档案检索：姓名、昵称、学校、座右铭、MBTI" autocomplete="off" />
  <p class="search-count">{{ keyword.trim() ? `找到 ${filteredClassmates.length} 位同学` : '浏览所有同学档案' }}</p>
</div>
```

- [ ] **Step 5: Update roster page title**

In `packages/site-astro/src/pages/roster.astro`, change visible header text to include:

```astro
<p class="roster-label">· ARCHIVE CORRIDOR ·</p>
<h1 class="roster-title display-lg">人物长廊</h1>
<p class="roster-subtitle">用档案检索重新遇见每一位同学</p>
```

- [ ] **Step 6: Run tests**

```bash
pnpm verify:worker
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

Expected: worker API shape passes; roster feature markers pass; perf budget remains green.

- [ ] **Step 7: Commit**

```bash
git add workers/api/src/index.ts workers/api/tests/api.test.ts packages/site-astro/src/components/ArchiveRosterCard.vue packages/site-astro/src/components/RosterWall.vue packages/site-astro/src/pages/roster.astro
git commit -m "feat(site): upgrade roster to archive corridor"
```

---

## Task 5: Build Student 档案展柜

**Files:**
- Create: `packages/site-astro/src/components/ProfileCompleteness.vue`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/src/components/SelfEditPanel.vue`
- Modify: `packages/site-astro/tests/feature-static.test.ts`

- [ ] **Step 1: Create `ProfileCompleteness.vue`**

Create `packages/site-astro/src/components/ProfileCompleteness.vue`:

```vue
<template>
  <aside class="profile-completeness museum-paper" aria-label="资料完整度">
    <div class="profile-completeness__top">
      <span>资料完整度</span>
      <strong>{{ completion }}%</strong>
    </div>
    <div class="profile-completeness__track">
      <div class="profile-completeness__bar" :style="{ width: completion + '%' }"></div>
    </div>
    <p v-if="missingFields.length" class="profile-completeness__hint">
      还缺 {{ missingFields.slice(0, 3).map((item) => item.label).join('、') }}
    </p>
    <p v-else class="profile-completeness__hint">这份档案已经很完整了</p>
  </aside>
</template>

<script setup lang="ts">
import type { MissingProfileField } from '../utils/profileCompleteness'

defineProps<{
  completion: number
  missingFields: MissingProfileField[]
}>()
</script>

<style scoped>
.profile-completeness {
  padding: var(--spacing-md);
  border-radius: var(--rounded-md);
}

.profile-completeness__top {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-md);
  color: var(--color-museum-ink);
}

.profile-completeness__track {
  height: 8px;
  margin: var(--spacing-sm) 0;
  overflow: hidden;
  border-radius: var(--rounded-pill);
  background: rgba(38, 48, 58, 0.1);
}

.profile-completeness__bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--color-museum-gold), var(--color-primary));
  transition: width var(--duration-slow) var(--ease-out-quart);
}

.profile-completeness__hint {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.6;
}
</style>
```

- [ ] **Step 2: Wire profile summary in `StudentProfile.vue`**

Add imports:

```ts
import ProfileCompleteness from './ProfileCompleteness.vue'
import { toStudentMuseumSummary } from '../utils/museumViewModels'
```

Add computed summary:

```ts
const museumSummary = computed(() => {
  if (!student.value) return { completion: 0, missingFields: [], tags: [] }
  return toStudentMuseumSummary(student.value)
})
```

Inside the standard personal page, near the hero content, add:

```vue
<p class="museum-kicker">档案展柜</p>
<ProfileCompleteness
  :completion="museumSummary.completion"
  :missing-fields="museumSummary.missingFields"
/>
```

- [ ] **Step 3: Rename visible sections while keeping data logic**

In `StudentProfile.vue`, keep existing computed field groups but change visible section labels:

```vue
<h2 class="section-title display-sm">身份档案</h2>
<h2 class="section-title display-sm">联系方式</h2>
<h2 class="section-title display-sm">个性标签</h2>
<h2 class="section-title display-sm">兴趣馆藏</h2>
<h2 class="section-title display-sm">校园回忆</h2>
<h2 class="section-title display-sm">时间胶囊</h2>
<h2 class="section-title display-sm">个人小传</h2>
```

- [ ] **Step 4: Add keyword tags**

Add this block after hero motto:

```vue
<div v-if="museumSummary.tags.length" class="hero-tags">
  <span v-for="tag in museumSummary.tags" :key="tag">{{ tag }}</span>
</div>
```

Add scoped styles:

```css
.hero-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: var(--spacing-sm);
}

.hero-tags span {
  padding: 4px 10px;
  border-radius: var(--rounded-sm);
  background: rgba(200, 169, 106, 0.18);
  color: var(--color-museum-ink);
  font-size: 12px;
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

Expected: `档案展柜` and `资料完整度` appear in built student template; no new first-screen GSAP/ScrollTrigger regression.

- [ ] **Step 6: Commit**

```bash
git add packages/site-astro/src/components/ProfileCompleteness.vue packages/site-astro/src/components/StudentProfile.vue packages/site-astro/src/components/SelfEditPanel.vue
git commit -m "feat(site): add student archive showcase"
```

---

## Task 6: Refine 留言贴纸墙

**Files:**
- Modify: `packages/site-astro/src/components/MessageWall.vue`
- Modify: `workers/api/tests/api.test.ts`
- Test: `pnpm verify:worker`, `pnpm --filter site-astro test:with-build`

- [ ] **Step 1: Add API assertion for message style persistence**

In `workers/api/tests/api.test.ts`, add a message POST test if one is not already present:

```ts
it('POST /api/messages/:slug preserves sticker card style', async () => {
  const req = new Request('http://localhost/api/messages/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authorName: '李四',
      content: '祝你毕业快乐',
      cardStyle: 'letter',
    }),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)

  expect(res.status).toBe(200)
  const body = await res.json() as any
  expect(body.success).toBe(true)

  const row = await env.DB.prepare('SELECT card_style FROM messages WHERE author_name = ? ORDER BY created_at DESC LIMIT 1').bind('李四').first() as any
  expect(row.card_style).toBe('letter')
})
```

- [ ] **Step 2: Update visible section naming**

In `MessageWall.vue`, change title:

```vue
<h2 class="section-title display-sm">祝福贴纸墙</h2>
```

Change form placeholder:

```vue
placeholder="把这句话贴进 TA 的青春档案里…"
```

- [ ] **Step 3: Replace emoji text in pinned badge with accessible text**

Use:

```vue
<div v-if="msg.pinned" class="pinned-badge" aria-label="置顶留言">置顶贴纸</div>
```

- [ ] **Step 4: Preserve CSS-first animation**

Ensure `.fade-in-msg` remains CSS-only and add reduced-motion override:

```css
@media (prefers-reduced-motion: reduce) {
  .fade-in-msg {
    opacity: 1 !important;
    transform: none !important;
    animation: none !important;
  }
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm verify:worker
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

Expected: message API test passes, site build passes, performance script remains green.

- [ ] **Step 6: Commit**

```bash
git add packages/site-astro/src/components/MessageWall.vue workers/api/tests/api.test.ts
git commit -m "feat(site): refine messages as sticker wall"
```

---

## Task 7: Complete Admin Field Connectivity

**Files:**
- Modify: `packages/admin/src/views/StudentEditView.vue`
- Modify: `packages/shared/src/types.ts`
- Modify: `workers/api/src/routes/students.ts`
- Modify: `workers/api/tests/api.test.ts`
- Test: `pnpm verify:worker`, `pnpm verify:admin`

- [ ] **Step 1: Add worker test for full student info preservation**

Extend the existing `PUT /api/classmate/students/test` test or add an admin update test:

```ts
expect(info.letterToClassmates).toBe('同学们未来见')
expect(info.groupName).toBe('第一小组')
expect(info.seatNo).toBe('3-2')
expect(info.dormNo).toBe('A302')
```

Use this payload in the test body:

```ts
info: {
  nickname: '测试昵称',
  groupName: '第一小组',
  seatNo: '3-2',
  dormNo: 'A302',
  letterToClassmates: '同学们未来见',
  profileModules: [
    { title: '模块1', content: '小传测试内容' }
  ],
  visibility: {
    phone: 'owner',
    wechat: 'classmates'
  }
}
```

- [ ] **Step 2: Add missing form groups in `StudentEditView.vue`**

Add these input rows under the personal data card:

```vue
<div class="form-row">
  <div class="form-group">
    <label class="form-label">座位号</label>
    <input v-model="student.info.seatNo" type="text" class="text-input" />
  </div>
  <div class="form-group">
    <label class="form-label">宿舍号</label>
    <input v-model="student.info.dormNo" type="text" class="text-input" />
  </div>
  <div class="form-group">
    <label class="form-label">小组/圈子</label>
    <input v-model="student.info.groupName" type="text" class="text-input" />
  </div>
</div>
```

Add a “校园回忆与未来” card:

```vue
<div class="card">
  <h2 class="title-md section-heading">校园回忆与未来</h2>
  <div class="form-group">
    <label class="form-label">最难忘的一件事</label>
    <textarea v-model="student.info.bestMemory" class="textarea" rows="3"></textarea>
  </div>
  <div class="form-group">
    <label class="form-label">同桌趣事</label>
    <textarea v-model="student.info.deskmateFun" class="textarea" rows="3"></textarea>
  </div>
  <div class="form-group">
    <label class="form-label">班级经典梗</label>
    <textarea v-model="student.info.classMeme" class="textarea" rows="3"></textarea>
  </div>
  <div class="form-group">
    <label class="form-label">十年后的自己</label>
    <textarea v-model="student.info.futureSelf" class="textarea" rows="3"></textarea>
  </div>
  <div class="form-group">
    <label class="form-label">给同学的话</label>
    <textarea v-model="student.info.letterToClassmates" class="textarea" rows="3"></textarea>
  </div>
</div>
```

- [ ] **Step 3: Ensure loaded student info has defaults**

After `student.value.info = res.data.info`, merge defaults:

```ts
student.value.info = {
  nickname: '',
  gender: '',
  birthday: '',
  school: '',
  class: '',
  studentId: '',
  seatNo: '',
  dormNo: '',
  groupName: '',
  graduationYear: '',
  motto: '',
  bestMemory: '',
  deskmateFun: '',
  classMeme: '',
  futureSelf: '',
  letterToClassmates: '',
  ...student.value.info,
}
```

- [ ] **Step 4: Run validation**

```bash
pnpm verify:worker
pnpm verify:admin
```

Expected: worker tests and admin typecheck/build pass.

- [ ] **Step 5: Commit**

```bash
git add packages/admin/src/views/StudentEditView.vue packages/shared/src/types.ts workers/api/src/routes/students.ts workers/api/tests/api.test.ts
git commit -m "feat(admin): complete student profile field editing"
```

---

## Task 8: Formalize Content Audit Panel

**Files:**
- Modify: `workers/api/src/index.ts`
- Modify: `packages/admin/src/views/DashboardView.vue`
- Test: `workers/api/tests/api.test.ts`, `pnpm verify:admin`

- [ ] **Step 1: Add admin stats test for audit alerts**

Add to `workers/api/tests/api.test.ts` after auth setup with admin token:

```ts
it('GET /api/admin/stats includes content audit alerts for incomplete records', async () => {
  const loginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin888' }),
  })
  const loginCtx = createExecutionContext()
  const loginRes = await worker.fetch(loginReq, env, loginCtx)
  await waitOnExecutionContext(loginCtx)
  const loginBody = await loginRes.json() as any

  const req = new Request('http://localhost/api/admin/stats', {
    headers: { Authorization: `Bearer ${loginBody.data.token}` },
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)

  expect(res.status).toBe(200)
  const body = await res.json() as any
  expect(Array.isArray(body.data.auditAlerts)).toBe(true)
})
```

- [ ] **Step 2: Replace warning-only wording**

In `DashboardView.vue`, rename:

```vue
<h2 class="panel-title text-warning">同学录内容巡检</h2>
```

Add summary text:

```vue
<p class="audit-summary">这里列出会影响前台显示、隐私或资料完整度的问题。</p>
```

- [ ] **Step 3: Add direct action labels**

For each alert row, render a stable item:

```vue
<li v-for="(alert, idx) in stats.auditAlerts" :key="idx" class="audit-item">
  <span>{{ alert }}</span>
</li>
```

- [ ] **Step 4: Run validation**

```bash
pnpm verify:worker
pnpm verify:admin
```

Expected: stats API and admin build pass.

- [ ] **Step 5: Commit**

```bash
git add workers/api/src/index.ts packages/admin/src/views/DashboardView.vue workers/api/tests/api.test.ts
git commit -m "feat(admin): formalize content audit panel"
```

---

## Task 9: Add Museum Site Settings

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/src/routes/config.ts`
- Modify: `packages/admin/src/views/SettingsView.vue`
- Modify: `packages/site-astro/src/pages/index.astro`
- Test: `workers/api/tests/api.test.ts`, `pnpm verify:admin`, `pnpm --filter site-astro test:with-build`

- [ ] **Step 1: Add config API assertions**

In the existing `GET /api/config` test:

```ts
expect(body.data.museum).toBeDefined()
expect(body.data.museum.heroEyebrow).toBe('CLASS MEMORY MUSEUM')
expect(body.data.museum.particleLevel).toBe('low')
```

- [ ] **Step 2: Add default config in Worker**

In `workers/api/src/index.ts`, return:

```ts
museum: config.museum || {
  enabled: true,
  heroEyebrow: 'CLASS MEMORY MUSEUM',
  heroTitle: '青春纪念馆',
  heroSubtitle: '翻开这本会呼吸的同学录，重新走过我们的青春长廊。',
  particleLevel: 'low',
  enableClassGraph: false,
  enableSeatMap: false,
},
```

- [ ] **Step 3: Add Settings form controls**

In `SettingsView.vue`, initialize `config.museum` in the default config object:

```ts
const defaultMuseumConfig = {
  enabled: true,
  heroEyebrow: 'CLASS MEMORY MUSEUM',
  heroTitle: '青春纪念馆',
  heroSubtitle: '翻开这本会呼吸的同学录，重新走过我们的青春长廊。',
  particleLevel: 'low' as const,
  enableClassGraph: false,
  enableSeatMap: false,
}

const config = ref<SiteConfig>({
  particles: {},
  museum: defaultMuseumConfig,
  footer: { copyright: '', beian: '', beianUrl: '' },
  preface: { title: '', subtitle: '', content: '' },
  acknowledgments: [],
  typography: { fontFamily: 'default', fontSize: 15 },
})
```

After loading config, merge defaults:

```ts
if (res.data) {
  config.value = {
    ...res.data,
    museum: { ...defaultMuseumConfig, ...res.data.museum },
  }
}
```

Then add a card bound to `config.museum`:

```vue
<div class="card">
  <h2 class="title-md section-heading">纪念馆主题</h2>
  <label class="form-check">
    <input type="checkbox" v-model="config.museum.enabled" />
    启用青春纪念馆主题
  </label>
  <div class="form-group">
    <label class="form-label">首页英文标识</label>
    <input v-model="config.museum.heroEyebrow" class="text-input" />
  </div>
  <div class="form-group">
    <label class="form-label">首页标题</label>
    <input v-model="config.museum.heroTitle" class="text-input" />
  </div>
  <div class="form-group">
    <label class="form-label">首页副标题</label>
    <textarea v-model="config.museum.heroSubtitle" class="textarea" rows="3"></textarea>
  </div>
  <div class="form-group">
    <label class="form-label">装饰粒子强度</label>
    <select v-model="config.museum.particleLevel" class="text-input">
      <option value="off">关闭</option>
      <option value="low">低</option>
      <option value="medium">中</option>
    </select>
  </div>
</div>
```

- [ ] **Step 4: Pass settings into homepage**

In `MuseumHero.astro`, accept and render these props:

```astro
interface Props {
  apiBase: string
  heroEyebrow: string
  heroTitle: string
  heroSubtitle: string
}

const { apiBase, heroEyebrow, heroTitle, heroSubtitle } = Astro.props
```

Replace hard-coded text:

```astro
<p class="museum-kicker">{heroEyebrow}</p>
<h1 id="museum-hero-title" class="museum-hero__title display-xl">{heroTitle}</h1>
<p class="museum-hero__subtitle">{heroSubtitle}</p>
```

In `packages/site-astro/src/pages/index.astro`, fetch config at build time:

```astro
const API_BASE = import.meta.env.VITE_WORKER_URL || 'https://alumni-book-api.chenyuhao2263.workers.dev'
let museum = {
  heroEyebrow: 'CLASS MEMORY MUSEUM',
  heroTitle: '青春纪念馆',
  heroSubtitle: '翻开这本会呼吸的同学录，重新走过我们的青春长廊。',
}

try {
  const res = await fetch(`${API_BASE}/api/config`)
  const data = await res.json() as any
  museum = { ...museum, ...(data.data?.museum || {}) }
} catch {}
```

Render:

```astro
<MuseumHero
  apiBase={CLIENT_API_BASE}
  heroEyebrow={museum.heroEyebrow}
  heroTitle={museum.heroTitle}
  heroSubtitle={museum.heroSubtitle}
/>
```

- [ ] **Step 5: Run validation**

```bash
pnpm verify:worker
pnpm verify:admin
pnpm --filter site-astro test:with-build
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts workers/api/src/index.ts workers/api/src/routes/config.ts packages/admin/src/views/SettingsView.vue packages/site-astro/src/components/MuseumHero.astro packages/site-astro/src/pages/index.astro workers/api/tests/api.test.ts
git commit -m "feat: add museum theme settings"
```

---

## Task 10: Upgrade Gallery And Timeline

**Files:**
- Modify: `packages/site-astro/src/pages/album.astro`
- Modify: `packages/site-astro/src/components/AlbumGrid.vue`
- Modify: `packages/site-astro/src/pages/timeline.astro`
- Modify: `packages/admin/src/views/AlbumsView.vue`
- Modify: `packages/admin/src/views/TimelineEventsView.vue`
- Modify: `workers/api/src/routes/albums.ts`
- Modify: `workers/api/src/routes/timeline.ts`
- Modify: `workers/api/tests/api.test.ts`

- [ ] **Step 1: Add API tests for tags and event type**

Add assertions:

```ts
const albumsReq = new Request('http://localhost/api/albums')
const albumsCtx = createExecutionContext()
const albumsRes = await worker.fetch(albumsReq, env, albumsCtx)
await waitOnExecutionContext(albumsCtx)
const albumsBody = await albumsRes.json() as any
expect(albumsBody.success).toBe(true)
if (albumsBody.data[0]) {
  expect(albumsBody.data[0]).toHaveProperty('tags')
}
```

Add this concrete timeline assertion after creating or reading events:

```ts
const timelineReq = new Request('http://localhost/api/timeline')
const timelineCtx = createExecutionContext()
const timelineRes = await worker.fetch(timelineReq, env, timelineCtx)
await waitOnExecutionContext(timelineCtx)
const timelineBody = await timelineRes.json() as any
expect(timelineBody.success).toBe(true)
if (timelineBody.data.find((item: any) => item.type === 'event')) {
  const eventItem = timelineBody.data.find((item: any) => item.type === 'event')
  expect(eventItem).toHaveProperty('eventType')
  expect(['class_event', 'activity', 'exam', 'graduation', 'funny']).toContain(eventItem.eventType)
}
```

- [ ] **Step 2: Rename public page framing**

Album page visible markers:

```astro
<p class="museum-kicker">IMAGE GALLERY</p>
<h1 class="display-lg">影像馆</h1>
```

Timeline page visible markers:

```astro
<p class="museum-kicker">CLASS HISTORY CORRIDOR</p>
<h1 class="display-lg">校史走廊</h1>
```

- [ ] **Step 3: Admin fields**

Add album fields in `AlbumsView.vue`:

```vue
<input v-model="album.tagsInput" class="text-input" placeholder="标签，用逗号分隔，例如 运动会,毕业照" />
<label><input type="checkbox" v-model="album.featured" /> 设为影像馆精选</label>
```

Add timeline event type selector:

```vue
<select v-model="event.eventType" class="text-input">
  <option value="class_event">班级大事</option>
  <option value="activity">活动</option>
  <option value="exam">考试节点</option>
  <option value="graduation">毕业节点</option>
  <option value="funny">班级趣事</option>
</select>
```

- [ ] **Step 4: Keep animation light**

Do not add GSAP imports in `AlbumGrid.vue` or `timeline.astro`. Use existing CSS/IntersectionObserver only.

- [ ] **Step 5: Run validation**

```bash
pnpm verify:worker
pnpm verify:admin
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

- [ ] **Step 6: Commit**

```bash
git add packages/site-astro/src/pages/album.astro packages/site-astro/src/components/AlbumGrid.vue packages/site-astro/src/pages/timeline.astro packages/admin/src/views/AlbumsView.vue packages/admin/src/views/TimelineEventsView.vue workers/api/src/routes/albums.ts workers/api/src/routes/timeline.ts workers/api/tests/api.test.ts
git commit -m "feat: upgrade gallery and timeline museum sections"
```

---

## Task 11: Add Lazy Highlight Entrances

**Files:**
- Create: `packages/site-astro/src/components/ClassGraphPreview.vue`
- Create: `packages/site-astro/src/components/SeatMapPreview.vue`
- Modify: `packages/site-astro/src/pages/roster.astro`
- Modify: `packages/site-astro/src/components/StudentProfile.vue`
- Modify: `packages/site-astro/tests/performance-static.test.ts`

- [ ] **Step 1: Create graph preview component**

Create `ClassGraphPreview.vue` as a lightweight preview with no external graph library:

```vue
<template>
  <section class="graph-preview museum-paper">
    <p class="museum-kicker">CLASS GRAPH</p>
    <h2>班级图谱</h2>
    <p>根据兴趣、座位、小组和留言互动生成的班级关系入口。</p>
    <button class="btn-secondary" @click="loaded = true">查看图谱预览</button>
    <div v-if="loaded" class="graph-preview__nodes">
      <span v-for="name in sampleNames" :key="name">{{ name }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ sampleNames: string[] }>()
const loaded = ref(false)
</script>

<style scoped>
.graph-preview {
  padding: var(--spacing-lg);
  border-radius: var(--rounded-md);
}

.graph-preview__nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: var(--spacing-md);
}

.graph-preview__nodes span {
  padding: 6px 10px;
  border-radius: var(--rounded-pill);
  background: rgba(138, 162, 182, 0.18);
}
</style>
```

- [ ] **Step 2: Create seat map preview**

Create `SeatMapPreview.vue`:

```vue
<template>
  <section class="seat-preview museum-paper">
    <p class="museum-kicker">CLASSROOM MEMORY</p>
    <h2>座位记忆</h2>
    <div class="seat-preview__grid">
      <span v-for="seat in seats" :key="seat">{{ seat }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ seats: string[] }>()
</script>

<style scoped>
.seat-preview {
  padding: var(--spacing-lg);
  border-radius: var(--rounded-md);
}

.seat-preview__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(42px, 1fr));
  gap: 8px;
  margin-top: var(--spacing-md);
}

.seat-preview__grid span {
  min-height: 38px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-hairline);
  border-radius: var(--rounded-sm);
  background: var(--color-canvas);
}
</style>
```

- [ ] **Step 3: Mount with `client:visible` only**

Use `client:visible` for these components. Do not use `client:load`.

- [ ] **Step 4: Run performance validation**

```bash
pnpm --filter site-astro test:with-build
node scripts/perf-budget.mjs
```

Expected: homepage critical path test still passes; graph and seat modules are not referenced by homepage scripts.

- [ ] **Step 5: Commit**

```bash
git add packages/site-astro/src/components/ClassGraphPreview.vue packages/site-astro/src/components/SeatMapPreview.vue packages/site-astro/src/pages/roster.astro packages/site-astro/src/components/StudentProfile.vue packages/site-astro/tests/performance-static.test.ts
git commit -m "feat(site): add lazy museum highlight previews"
```

---

## Task 12: Final Verification And Acceptance Report

**Files:**
- Create: `docs/phase-10-acceptance-report.md`
- Modify: `docs/animation-audit.md`
- Modify: `docs/performance-baseline.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm verify:all
node scripts/perf-budget.mjs
```

Expected:

- Worker tests pass.
- Admin typecheck/build pass.
- Site build/tests pass.
- Performance budget remains green.
- Homepage, roster, and timeline first-screen dependency checks still do not pull GSAP/ScrollTrigger.

- [ ] **Step 2: Run optional browser network check**

If local Playwright is available:

```bash
pnpm --filter site-astro preview
pnpm --filter site-astro test:perf-network
```

Expected: no network assertions fail. If Playwright dependencies are unavailable, record that as an environment limitation in the acceptance report.

- [ ] **Step 3: Write acceptance report**

Create `docs/phase-10-acceptance-report.md` with these sections:

```md
# Phase 10 验收报告: 青春纪念馆混合升级

报告日期: 2026-06-27

## 完成范围

- [/] Task 3: 首页“入馆仪式”改造
- [ ] Task 4: 同学录“人物长廊”改造
- [/] Task 5: 个人页“档案展柜”改造个人页
- 祝福贴纸留言墙
- 后台字段联通与内容巡检
- 影像馆与校史走廊
- 懒加载亮点入口

## 验证命令

| 命令 | 结果 |
|---|---|
| `pnpm verify:all` | 通过 |
| `node scripts/perf-budget.mjs` | 通过 |
| `pnpm --filter site-astro test:perf-network` | 通过或记录环境限制 |

## 性能结论

首页、同学录、时间轴首屏仍不加载 GSAP/ScrollTrigger。图谱和座位记忆入口以可见后加载方式进入页面，不进入首页关键路径。

## 残留风险

- 图谱关系质量取决于资料完整度。
- 全景空间若后续引入真实全景图库，需要单独预算和懒加载测试。
- 专属 HTML 模板仍保持独立 iframe，不继承新主题。
```

- [ ] **Step 4: Update existing docs**

Update:

- `docs/animation-audit.md`: add Phase 10 owner matrix row for museum CSS utilities, graph preview, seat preview.
- `docs/performance-baseline.md`: add Phase 10 measured budget table from `scripts/perf-budget.mjs`.

- [ ] **Step 5: Final commit**

```bash
git add docs/phase-10-acceptance-report.md docs/animation-audit.md docs/performance-baseline.md
git commit -m "docs: record phase 10 acceptance results"
```

---

## Execution Notes

- Do not modify unrelated files during a task.
- Preserve existing dirty work unless the task explicitly owns that file.
- Keep `.superpowers/` and `.playwright-mcp/` ignored as local visual/testing artifacts.
- Before each task commit, run `git status --short` and stage only files listed in that task.
- If a task touches animation, run `node scripts/perf-budget.mjs` before committing.
- If a task touches Worker responses, run `pnpm verify:worker` before committing.
- If a task touches admin views or shared types, run `pnpm verify:admin` before committing.
- If a task touches public site UI, run `pnpm --filter site-astro test:with-build` before committing.
