import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const site = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf-8')

describe('首页星空氛围与导航材质', () => {
  it('以可降级的分层星空作为全站背景层', () => {
    const layout = site('layouts/MainLayout.astro')
    const starfield = site('components/StarfieldCanvas.astro')
    const pageShell = site('styles/layout.css')
    const viewTransitions = site('styles/view-transitions.css')

    expect(layout).toContain('<StarfieldCanvas />')
    expect(starfield).toContain('data-starfield-canvas')
    expect(starfield).toContain('starfield__mist--gold')
    expect(starfield).toContain('starfield__mist--stamp')
    expect(starfield).toContain('[data-theme="paper"] .starfield')
    expect(starfield).toContain('z-index: 0')
    expect(pageShell).toContain('var(--page-shell-surface)')
    expect(starfield).toContain('opacity: 0.62')
    expect(pageShell).toContain('color-mix(in srgb, var(--bg) 86%, transparent)')
    expect(pageShell).toContain('color-mix(in srgb, var(--bg) 80%, transparent)')
    expect(pageShell).toContain('--page-shell-star-opacity: 0.46')
    expect(pageShell).toContain('--page-shell-star-opacity: 0.82')
    expect(pageShell).toContain('.page-shell > *')
    expect(viewTransitions).not.toContain("background-color: var(--color-paper-bg);")
  })

  it('只让首页两个入口在精细鼠标设备上产生轻量牵引', () => {
    const hero = site('components/MuseumHero.astro')

    expect(hero.match(/data-hero-magnetic>/g)?.length).toBe(2)
    expect(hero).toContain('function initHeroMagnetic()')
    expect(hero).toContain("(hover: hover) and (pointer: fine)")
    expect(hero).toContain('prefers-reduced-motion: reduce')
    expect(hero).toContain("style.setProperty('--hero-magnetic-x'")
  })

  it('在书签导航上增加内高光与滚动后的材质层次', () => {
    const nav = site('components/TopNav.astro')

    expect(nav).toContain('.museum-nav-shell::before')
    expect(nav).toContain('color-mix(in srgb, var(--surface-raised) 90%, transparent)')
    expect(nav).toContain('.top-nav.is-scrolled .museum-nav-shell')
    expect(nav).toContain('inset 0 1px 0')
    expect(nav).toContain('backdrop-filter: blur(18px) saturate(1.05)')
  })
})
