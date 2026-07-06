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
