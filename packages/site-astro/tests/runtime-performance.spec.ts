import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = resolve(__dirname, '../src')
const read = (file: string) => readFileSync(resolve(src, file), 'utf8')

describe('公开站点原生运行时性能约束', () => {
  it('使用 Astro ClientRouter 承载受控共享元素转场', () => {
    const layout = read('layouts/MainLayout.astro')
    expect(layout).toContain("from 'astro:transitions'")
    expect(layout).toContain('<ClientRouter')
    expect(layout).toContain("import('../runtime/navSession')")
    expect(layout).toContain("import('../runtime/volumeToggle')")
  })

  it('公共运行时只绑定页面生命周期，并在离页时清理资源', () => {
    const nav = read('scripts/navRuntime.ts')
    expect(nav).not.toContain("astro:before-swap")
    expect(nav).not.toContain("astro:page-load")
    expect(nav).not.toContain('getBoundingClientRect')
    expect(nav).not.toContain('offsetLeft')
    expect(nav).not.toContain('offsetWidth')
    expect(nav).toContain("pagehide")
    expect(nav).toContain('cancelAnimationFrame')
  })

  it('音效上下文延迟到首次交互且复用噪声缓冲', () => {
    const audio = read('runtime/audioSynth.ts')
    const volume = read('runtime/volumeToggle.ts')
    expect(audio).toContain("new AudioContextClass()")
    expect(audio).toContain('createNoiseBuffer')
    expect(audio).toContain('noiseBuffer')
    expect(audio).not.toContain('onMounted')
    expect(volume).toContain('toggleAudioMuted()')
    expect(volume).toContain('if (hasAudioContext()) playCrystalTick()')
    expect(audio).toContain("document.addEventListener('visibilitychange'")
  })

  it('纯静态页面不加载 Vue islands', () => {
    const layout = read('layouts/MainLayout.astro')
    expect(layout).not.toContain('client:load')
  })

  it('同页锚点不触发导航进度，并正确处理 BFCache 生命周期', () => {
    const layout = read('layouts/MainLayout.astro')
    expect(layout).toContain('url.pathname === window.location.pathname && url.search === window.location.search')
    expect(layout).toContain('(event as PageTransitionEvent).persisted')
    expect(layout).toContain('restoreStudentIdentityTarget()')
    expect(layout).toContain('initNavRuntime()')
  })

  it('首页运行时仅使用原生页面生命周期并清理滚动 RAF', () => {
    const hero = read('components/MuseumHero.astro')
    expect(hero).not.toContain('astro:before-preparation')
    expect(hero).not.toContain('astro:page-load')
    expect(hero).toContain("window.addEventListener('pageshow'")
    expect(hero).toContain("window.addEventListener('pagehide'")
    expect(hero).toContain("document.addEventListener('DOMContentLoaded'")
    expect(hero).toContain("window.removeEventListener('scroll'")
    expect(hero).toContain('cancelAnimationFrame')
  })

  it('首页、时间轴、更多和年度册构建产物不输出 Vue islands', () => {
    const dist = resolve(__dirname, '../dist')
    for (const route of ['index.html', 'timeline/index.html', 'more/index.html', 'yearbook/index.html']) {
      const html = readFileSync(resolve(dist, route), 'utf8')
      expect(html).not.toContain('astro:transitions')
      expect(html).not.toContain('client="load"')
      expect(html).not.toMatch(/component-url="[^"]*vue/i)
    }
  })
})
