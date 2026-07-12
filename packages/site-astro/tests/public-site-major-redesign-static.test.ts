import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const srcRoot = path.resolve(__dirname, '../src')

function read(relativePath: string) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf-8')
}

describe('public site major redesign constraints', () => {
  it('migrates public browsing pages to shared paper page shells', () => {
    const sharedHeader = read('components/PageHeader.astro')
    const pages = [
      'pages/preface.astro',
      'pages/roster.astro',
      'pages/album.astro',
      'pages/timeline.astro',
    ]

    for (const page of pages) {
      const source = read(page)
      expect(source, page).toContain('page-shell')
      expect(source, page).toContain("import PageHeader from '../components/PageHeader.astro'")
      expect(source, page).toContain('<PageHeader')
      expect(source, page).not.toMatch(/class="[^"]*-page section"/)
    }

    expect(sharedHeader).toContain('class="page-header"')
  })

  it('keeps yearbook screen preview paper styled while preserving print rules', () => {
    const source = read('pages/yearbook.astro')

    expect(source).toContain('yearbook-page page-shell')
    expect(source).toContain('@media screen')
    expect(source).toContain('.print-section')
    expect(source).toContain('var(--color-paper-card)')
    expect(source).toContain('@media print')
    expect(source).toContain('class="yearbook-paper"')
    expect(source).toMatch(/\.yearbook-paper\s*\{[^}]*width:\s*min\(960px,\s*100%\);/)
    expect(source).toMatch(/\.yearbook-summary-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/)
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
    const runtime = read('scripts/navRuntime.ts')

    expect(source).toContain('top-nav--home')
    expect(source).toContain('has-session')
    expect(source).toContain('.top-nav--home:not(.has-session)')
    expect(runtime).toContain('getClassmateStudent')
  })

  it('profile and photo wall do not own ScrollTrigger animations', () => {
    const studentProfile = read('components/StudentProfile.vue')
    const photoWall = read('components/PhotoWall.vue')

    expect(studentProfile).not.toContain("import('gsap/ScrollTrigger')")
    expect(studentProfile).not.toContain('scrollTrigger:')
    expect(photoWall).not.toContain("import('gsap/ScrollTrigger')")
    expect(photoWall).not.toContain('scrollTrigger:')
  })

  it('student profile keeps interaction highlights lazy and paper grouped', () => {
    const source = read('components/StudentProfile.vue')

    expect(source).toContain('id="highlights-anchor"')
    expect(source).toContain('class="lazy-anchor"')
    expect(source).toContain('profile-highlights')
    expect(source).toContain('ClassGraphPreview')
    expect(source).toContain('SeatMapPreview')
  })

  it('removes stale deployment verification comments from public pages', () => {
    const roster = read('pages/roster.astro')

    expect(roster).not.toContain('Trigger site deployment verification')
  })
})

