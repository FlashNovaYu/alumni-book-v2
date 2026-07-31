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

  it('音效上下文延迟到首次交互且经统一音频总线输出', () => {
    const audio = read('runtime/audioSynth.ts')
    const volume = read('runtime/volumeToggle.ts')
    expect(audio).toContain("new AudioContextClass()")
    expect(audio).toContain('createNoiseBuffer')
    expect(audio).toContain('noiseBuffer')
    expect(audio).toContain('masterGain')
    expect(audio).toContain('masterGain.connect(compressor)')
    expect(audio).toContain('compressor.connect(context.destination)')
    expect(audio).toContain('loadUiAudio')
    expect(audio).not.toContain('onMounted')
    expect(volume).toContain('toggleAudioMuted()')
    expect(volume).toContain('if (hasAudioContext()) playArchiveHover()')
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

  it('首页视差与磁吸更新使用缓存数据、可见性门控和合帧写入', () => {
    const hero = read('components/MuseumHero.astro')
    expect(hero).toContain('const parallaxItems =')
    expect(hero).toContain('IntersectionObserver')
    expect(hero).toContain('pointerFrameId')
    expect(hero).toContain('cancelAnimationFrame(pointerFrameId)')
    expect(hero).not.toContain("JSON.parse(element.getAttribute('data-parallax') || '{}').speed")
  })

  it('首页只保留登录所需的 Vue island，其余公共页保持静态', () => {
    const dist = resolve(__dirname, '../dist')
    const home = readFileSync(resolve(dist, 'index.html'), 'utf8')
    expect(home).not.toContain('astro:transitions')
    expect(home).toMatch(/component-url="[^"]*VisitorPass[^"]*"/)
    expect(home).toContain('client="visible"')
    expect(home).not.toContain('client="load"')

    for (const route of ['timeline/index.html', 'more/index.html', 'yearbook/index.html']) {
      const html = readFileSync(resolve(dist, route), 'utf8')
      expect(html).not.toContain('astro:transitions')
      expect(html).not.toContain('client="load"')
      expect(html).not.toMatch(/component-url="[^"]*vue/i)
    }
  })
})
