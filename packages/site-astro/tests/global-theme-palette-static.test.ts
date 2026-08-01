import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const siteRoot = resolve(__dirname, '../src')
const sharedRoot = resolve(__dirname, '../../shared/src')
const readSite = (relative: string) => readFileSync(resolve(siteRoot, relative), 'utf8')
const readShared = () => readFileSync(resolve(sharedRoot, 'tokens.css'), 'utf8')

describe('全局主题配色契约', () => {
  it('提供统一的表面、强调、状态、星空和首页封面角色', () => {
    const shared = readShared()

    for (const name of [
      '--surface-overlay',
      '--on-accent',
      '--stamp-soft',
      '--border-glass',
      '--star-core-rgb',
      '--star-halo-rgb',
      '--star-mix-mode',
      '--hero-ink',
      '--hero-ink-soft',
      '--hero-scrim',
      '--text-tertiary',
    ]) {
      expect(shared).toContain(name)
    }

    expect(shared).toContain("html[data-theme='night']")
    expect(shared).toContain('--on-accent: #FBF6E9')
    expect(shared).toContain('--on-accent: #1B1508')
  })

  it('让星空和页面壳不再持有独立的固定主题颜色', () => {
    const starfield = readSite('components/StarfieldCanvas.astro')
    const layout = readSite('styles/layout.css')

    expect(starfield).toContain("readRgb(styles, '--star-core-rgb'")
    expect(starfield).toContain("readRgb(styles, '--star-halo-rgb'")
    expect(layout).not.toContain('--page-shell-star-core: rgba(')
    expect(layout).not.toContain('--page-shell-star-halo: rgba(')
  })

  it('移除公共组件中的旧主题 fallback 并让正文使用可读的 muted 角色', () => {
    const account = readSite('components/AccountCenter.vue')
    const calendar = readSite('components/CalendarDatePicker.vue')
    const hero = readSite('components/MuseumHero.astro')
    const rosterWall = readSite('components/RosterWall.vue')
    const emptyState = readSite('components/ui/UiEmptyState.vue')
    const messageWall = readSite('components/MessageWall.vue')
    const layout = readSite('layouts/MainLayout.astro')

    expect(account).not.toContain('#cc785c')
    expect(calendar).not.toContain('#cc785c')
    expect(hero).not.toContain('#fffaf2')
    expect(rosterWall).not.toContain('color: var(--text-dim)')
    expect(emptyState).not.toContain('color: var(--text-dim)')
    expect(messageWall).not.toContain('background: #fcfaf2')
    expect(messageWall).not.toContain('background: #1e2d2f')
    expect(layout).toContain('content="#F1E7CE"')
  })
})
