import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const site = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf-8')

describe('花名录方形卡与自定义指针', () => {
  it('将同学档案渲染为居中的方形索引卡，而非照片主视觉卡', () => {
    const card = site('components/ArchiveRosterCard.vue')
    const wall = site('components/RosterWall.vue')

    expect(card).toContain('aspect-ratio: 1 / 1')
    expect(card).toContain('class="roster-card__punch"')
    expect(card).toContain('class="roster-card__seal"')
    expect(card).toContain("'roster-card__avatar'")
    expect(card).toContain('border-radius: 50%')
    expect(card).toContain('class="roster-card__rule"')
    expect(card).toContain('class="roster-card__body"')
    expect(card).toContain('align-items: center')
    expect(card).toContain('text-align: center')
    expect(wall).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))')
  })

  it('只在支持精细悬停指针的设备隐藏系统指针并挂载自定义光标', () => {
    const layout = site('layouts/MainLayout.astro')
    const cursorStyles = site('styles/custom-cursor.css')
    const pageLoadRuntime = layout.slice(
      layout.indexOf("document.addEventListener('astro:page-load'"),
      layout.indexOf("window.addEventListener('pageshow'"),
    )

    expect(layout).toContain("window.matchMedia('(hover: hover) and (pointer: fine)')")
    expect(cursorStyles).toContain('@media (hover: hover) and (pointer: fine)')
    expect(cursorStyles).toContain('0 0 18px color-mix(in srgb, var(--accent) 38%, transparent)')
    expect(pageLoadRuntime).toContain('initCustomCursor()')
    expect(layout).toContain("document.documentElement.setAttribute('data-custom-cursor', 'true')")
    expect(layout).toContain("document.documentElement.removeAttribute('data-custom-cursor')")
  })
})
