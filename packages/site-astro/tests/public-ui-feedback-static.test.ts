import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf-8')

describe('公开站点界面反馈回归', () => {
  it('keeps the class-space timeline compact and resolves API file URLs exactly once', () => {
    const timeline = read('components/ClassSpaceTimelineRail.vue')

    expect(timeline).toContain("value.startsWith('/api/files/')")
    expect(timeline).toContain('timeline-rail__track')
  })

  it('gives each class-space chapter a numbered directory entry with a description', () => {
    const hub = read('components/ClassSpaceHub.vue')
    const directory = read('components/ClassSpaceSectionNav.vue')

    expect(hub).toContain("index: '01'")
    expect(hub).toContain("description: '此刻的对话'")
    expect(directory).toContain('section-index')
    expect(directory).toContain('section-description')
  })

  it('keeps the roster at nine cards per page with accessible page buttons', () => {
    const roster = read('components/RosterWall.vue')
    const pagination = read('components/ui/UiPagination.vue')

    expect(roster).toContain('const PAGE_SIZE = 9')
    expect(roster).toContain('@update:model-value="goToPage"')
    expect(pagination).toContain(':aria-label="`第 ${page} 页`"')
    expect(pagination).toContain("aria-current=\"page === modelValue ? 'page' : undefined\"")
    expect(pagination.match(/type="button"/g)).toHaveLength(3)
    expect(pagination).toContain('v-for="(page, index) in visiblePages"')
    expect(pagination).toContain(':key="page === \'ellipsis\' ? `ellipsis-${index}` : page"')
  })

  it('runs pagination unit coverage in the default site test suite', () => {
    const packageJson = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))

    expect(packageJson.scripts.test).toContain('tests/pagination.test.ts')
  })

  it('falls back from an avatar that finished failing before Vue hydration', () => {
    const card = read('components/ArchiveRosterCard.vue')

    expect(card).toContain('avatarImage.value?.complete && avatarImage.value.naturalWidth === 0')
  })

  it('keeps media pages under more and records the active-marker direction', () => {
    const nav = read('components/TopNav.astro')
    const runtime = read('scripts/navRuntime.ts')

    expect(nav).toContain("{ href: '/more', label: '更多' }")
    expect(nav).not.toContain("{ href: '/album', label: '影像馆' }")
    expect(nav).not.toContain("{ href: '/timeline', label: '时光轴' }")
    expect(runtime).toContain('directory.dataset.navDirection')
    expect(runtime).toContain('previousActiveLeft')
    expect(nav).toContain('nav-active-ink-fill')
    expect(runtime).toContain('directory.dataset.navRevealing')
  })

  it('keeps the more page as a deliberate coming-soon placeholder', () => {
    const more = read('pages/more.astro')

    expect(more).toContain('新的章节正在整理')
    expect(more).toContain('敬请期待。')
    expect(more).not.toContain("href('/album')")
    expect(more).not.toContain("href('/timeline')")
  })

  it('does not render hard-coded decorative emoji in public UI controls', () => {
    const files = [
      'pages/yearbook.astro',
      'components/AccountCenter.vue',
      'components/RankingsPanel.vue',
      'components/StudentMusicPlayer.vue',
      'components/StudentShareCard.vue',
    ]

    for (const file of files) {
      expect(read(file)).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u)
    }
  })

  it('uses a book mark, centers the home scroll prompt, and keeps cached management access stable', () => {
    const brand = read('components/icons/IconBrand.astro')
    const hero = read('components/MuseumHero.astro')
    const nav = read('components/TopNav.astro')
    const runtime = read('scripts/navRuntime.ts')

    expect(brand).toContain('<path d="M4 5.5')
    expect(brand).not.toContain('<line x1="12" y1="2"')
    expect(hero).toContain('home-cover__scroll-slot')
    expect(hero).toContain('transform: translateX(-50%)')
    expect(hero).toMatch(/\.home-cover__scroll:hover\s*\{[^}]*transform:\s*translateY\(-2px\);/)
    expect(nav).not.toContain('data-nav-admin-entry hidden')
    expect(runtime).toContain("'alumni_nav_admin_entry'")
    expect(runtime).toContain("document.documentElement.classList.toggle('has-admin-entry', available)")
  })

  it('keeps the archive corridor aligned, uses a pure book icon, and overlays class-space album titles', () => {
    const roster = read('components/RosterWall.vue')
    const nav = read('components/TopNav.astro')
    const albums = read('components/ClassSpaceAlbumRail.vue')
    const timeline = read('components/ClassSpaceTimelineRail.vue')

    expect(roster).toMatch(/\.roster-grid\s*\{[^}]*grid-auto-rows:\s*1fr;[^}]*align-items:\s*stretch;/)
    expect(nav).toContain('<IconBrand size={22} />')
    expect(nav).toMatch(/\.brand-mark\s*\{[^}]*width:\s*auto;[^}]*height:\s*auto;[^}]*border:\s*0;/)
    expect(albums).toContain('class="album-cover-overlay"')
    expect(albums).toMatch(/\.album-rail-card\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2;/)
    expect(timeline).toContain('new Date(b.date).getTime() - new Date(a.date).getTime()')
  })
})
