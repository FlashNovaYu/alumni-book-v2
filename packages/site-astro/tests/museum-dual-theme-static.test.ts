import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const siteRoot = resolve(__dirname, '../src')
const sharedRoot = resolve(__dirname, '../../shared')
const readSite = (relative: string) => readFileSync(resolve(siteRoot, relative), 'utf-8')
const readShared = (relative: string) => readFileSync(resolve(sharedRoot, relative), 'utf-8')

describe('museum dual-theme foundation', () => {
  it('defines the complete museum semantic layer and maps paper aliases to it', () => {
    const shared = readShared('src/tokens.css')

    for (const name of [
      '--surface-canvas', '--surface-sunken', '--surface-raised', '--surface-paper',
      '--text-primary', '--text-secondary', '--text-muted', '--border-subtle',
      '--border-strong', '--accent', '--accent-strong', '--accent-soft', '--stamp',
      '--state-archive-green', '--focus-ring', '--shadow-surface',
    ]) {
      expect(shared).toContain(name)
    }

    expect(shared).toContain("html[data-theme='night']")
    expect(shared).toMatch(/--color-paper-bg:\s*var\(--surface-canvas\)/)
    expect(shared).toMatch(/--color-paper-card:\s*var\(--surface-raised\)/)
  })

  it('retains the existing system default, persisted preference, and reduced-motion theme contract', () => {
    const runtime = readSite('scripts/themeRuntime.ts')
    const layout = readSite('layouts/MainLayout.astro')
    const accessibility = readSite('styles/accessibility.css')

    expect(runtime).toContain("localStorage.getItem(themeStorageKey)")
    expect(runtime).toContain("stored === 'paper' || stored === 'night'")
    expect(runtime).toContain("prefers-color-scheme: dark")
    expect(runtime).toContain("prefers-reduced-motion: reduce")
    expect(runtime).toContain("'#0B120E' : '#F1E7CE'")
    expect(layout).toContain("'#0B120E' : '#F1E7CE'")
    expect(accessibility).toContain('outline: 3px solid var(--focus-ring) !important;')
  })
})

describe('museum primary navigation', () => {
  it('uses the confirmed archive order in the desktop directory and mobile drawer', () => {
    const nav = readSite('components/TopNav.astro')

    expect(nav).toContain("{ href: '/preface', label: '序' }")
    expect(nav).toContain("{ href: '/roster', label: '花名录' }")
    expect(nav).toMatch(/'序'[\s\S]*'花名录'[\s\S]*'班级空间'[\s\S]*'年度册'[\s\S]*'更多'/)
    expect(nav).not.toContain("{ href: '/album', label:")
    expect(nav).toContain("href={href('/mailbox')}")
    expect(nav).toContain('data-theme-toggle')
    expect(nav).toContain('data-volume-toggle')
  })
})

describe('museum preface', () => {
  it('uses a centered register, exactly two actions, and a curator note', () => {
    const preface = readSite('pages/preface.astro')
    const wall = readSite('components/PrefaceWall.vue')

    expect(preface).toContain('preface-register')
    expect(preface).toContain('翻开花名录')
    expect(preface).toContain('前往班级空间')
    expect(preface.match(/class="btn-primary"/g)).toHaveLength(1)
    expect(preface).not.toContain('翻阅同学档案')
    expect(wall).toContain('馆长题记')
    expect(wall).toContain('preface-wall--curator-note')
  })
})

describe('museum roster index', () => {
  it('uses a fixed three-column archive index while retaining twelve-item pagination', () => {
    const wall = readSite('components/RosterWall.vue')
    const card = readSite('components/ArchiveRosterCard.vue')

    expect(wall).toMatch(/\.roster-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
    expect(wall).toContain('@media (max-width: 960px)')
    expect(wall).toContain('@media (max-width: 560px)')
    expect(wall).toContain('const PAGE_SIZE = 12')
    expect(wall).toContain('function archiveIdFor')
    expect(wall).not.toContain('getStaticRotation')
    expect(wall).not.toContain('getStaticY')
    expect(card).toContain('roster-card__archive-id')
    expect(card).toContain('roster-card__status')
    expect(card).toContain('data-audio-hover')
  })
})
