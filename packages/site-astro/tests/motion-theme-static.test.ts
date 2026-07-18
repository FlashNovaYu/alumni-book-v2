import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const src = (file: string) => resolve(__dirname, '../src', file)
const read = (file: string) => readFileSync(src(file), 'utf-8')
const packageJson = () => JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8')) as { scripts: Record<string, string> }

describe('夜读主题基础层', () => {
  it('提供独立主题运行时并在首帧、桌面和移动导航接入', () => {
    const runtimePath = src('scripts/themeRuntime.ts')
    expect(existsSync(runtimePath)).toBe(true)

    const runtime = read('scripts/themeRuntime.ts')
    const layout = read('layouts/MainLayout.astro')
    const nav = read('components/TopNav.astro')

    expect(runtime).toContain("export type AlumniTheme = 'paper' | 'night'")
    expect(runtime).toContain("const themeStorageKey = 'alumni_theme'")
    expect(runtime).toContain('export function initThemeRuntime')
    expect(runtime).toContain('document.startViewTransition')
    expect(runtime).toContain("'[data-theme-toggle]'")
    expect(runtime).toContain("prefers-reduced-motion: reduce")
    expect(layout).toContain('is:inline')
    expect(layout).toContain("const storageKey = 'alumni_theme'")
    expect(layout).toContain("document.documentElement.dataset.theme = theme")
    expect(layout).toContain("import { initThemeRuntime } from '../scripts/themeRuntime'")
    expect(nav.match(/data-theme-toggle/g)?.length).toBe(2)
    expect(nav).toContain('aria-label="切换为夜读模式"')
  })

  it('通过夜读令牌和独立根转场实现水波，而不影响信箱水波', () => {
    const runtime = read('scripts/themeRuntime.ts')
    const sharedTokens = read('../../shared/src/tokens.css')
    const siteTokens = read('styles/tokens.css')
    const viewTransitions = read('styles/view-transitions.css')

    expect(runtime).toContain("classList.add('theme-transition')")
    expect(runtime).toContain("classList.remove('theme-transition')")
    expect(sharedTokens).toContain("html[data-theme='night']")
    expect(sharedTokens).toContain('--color-paper-bg: var(--bg)')
    expect(sharedTokens).toContain('--color-paper-card: var(--bg-surface)')
    expect(siteTokens).toContain('--texture-paper-fiber:')
    expect(viewTransitions).toContain('html.theme-transition::view-transition-new(root)')
    expect(viewTransitions).toContain('html.theme-transition .page-shell')
    expect(viewTransitions).toContain('html.theme-transition [data-page-heading]')
    expect(viewTransitions).toContain('view-transition-name: none !important')
    expect(viewTransitions).toContain('html.vt-mailbox::view-transition-new(root)')
  })

  it('只为普通栏目页提供唯一的共享标题锚点', () => {
    const headerPath = src('components/PageHeader.astro')
    expect(existsSync(headerPath)).toBe(true)

    const header = read('components/PageHeader.astro')
    expect(header).toContain('view-transition-name: page-heading')
    expect(header).toContain('page-header__title-sweep')

    for (const page of ['preface.astro', 'roster.astro', 'class-space.astro', 'album.astro', 'timeline.astro', 'more.astro']) {
      expect(read(`pages/${page}`)).toContain("import PageHeader from '../components/PageHeader.astro'")
      expect(read(`pages/${page}`)).toContain('<PageHeader')
    }

    expect(read('pages/yearbook.astro')).not.toContain('page-heading')
    expect(read('pages/mailbox.astro')).not.toContain('page-heading')
  })

  it('为共享标题提供独立的前进与后退转场', () => {
    const viewTransitions = read('styles/view-transitions.css')
    const layout = read('layouts/MainLayout.astro')

    expect(viewTransitions).toContain('::view-transition-old(page-heading)')
    expect(viewTransitions).toContain('::view-transition-new(page-heading)')
    expect(viewTransitions).toContain('@keyframes page-heading-enter-right')
    expect(viewTransitions).toContain('@keyframes page-heading-exit-left')
    expect(read('styles/animations.css')).toContain('@keyframes pageHeadingSweep')
    expect(layout).toContain("'/class-space/'")
    expect(layout).toContain("'/yearbook/'")
    expect(layout).toContain("'/more/'")
  })

  it('将主题与共享标题浏览器回归纳入预览测试命令', () => {
    const scripts = packageJson().scripts

    expect(scripts['test:perf-network']).toContain('tests/motion-theme-flow.spec.ts')
    expect(scripts.test).toContain('tests/motion-theme-static.test.ts')
    expect(scripts.test).toContain('tests/active-card-motion-static.test.ts')
  })
})
