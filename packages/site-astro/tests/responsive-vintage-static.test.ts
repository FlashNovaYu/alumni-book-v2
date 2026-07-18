import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const srcRoot = path.resolve(__dirname, '../src')

function read(relativePath: string) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf-8')
}

describe('responsive vintage paper redesign static constraints', () => {
  it('defines the vintage paper token family used by public pages', () => {
    const tokens = fs.readFileSync(path.resolve(__dirname, '../../shared/src/tokens.css'), 'utf-8')

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

  it('homepage scroll entry uses CSS-first progressive reveal motion', () => {
    const hero = read('components/MuseumHero.astro')

    expect(hero).toContain('home-scroll-reveal')
    expect(hero).toContain('animation-timeline: view()')
    expect(hero).toContain('@supports (animation-timeline: view())')
    expect(hero).toContain('@media (prefers-reduced-motion: reduce)')
    expect(hero).not.toContain('import gsap')
    expect(hero).not.toContain('ScrollTrigger')
  })

  it('homepage cover has CSS-first geometric entrance and ambient floating motion', () => {
    const hero = read('components/MuseumHero.astro')

    expect(hero).toContain('home-cover__shape')
    expect(hero).toContain('home-cover__copy-reveal')
    expect(hero).toContain('@keyframes homeShapeEnter')
    expect(hero).toContain('@keyframes homeShapeFloat')
    expect(hero).toContain('@keyframes homeCopyReveal')
    expect(hero).toContain('animation-delay')
    expect(hero).toContain('--shape-rotate')
    expect(hero).toContain('--reveal-delay')
    expect(hero).toContain('home-cover__scroll')
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

  it('top nav delegates transition lifecycle cleanup to the navigation singleton', () => {
    const nav = read('components/TopNav.astro')
    const runtime = read('scripts/navRuntime.ts')

    expect(nav).toContain('mobile-page-title')
    expect(runtime).toContain('window.__alumniNavRuntime')
    expect(runtime).toContain('astro:before-swap')
  })
})
