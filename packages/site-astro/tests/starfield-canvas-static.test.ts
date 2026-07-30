import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const src = (file: string) => resolve(__dirname, '../src', file)
const source = (file: string) => readFileSync(src(file), 'utf-8')

describe('全局分层星空', () => {
  it('以单一 Canvas 承载可降级的动态星尘，而非叠加静态星点背景', () => {
    const layout = source('layouts/MainLayout.astro')
    const componentPath = src('components/StarfieldCanvas.astro')

    expect(existsSync(componentPath)).toBe(true)
    const starfield = readFileSync(componentPath, 'utf-8')

    expect(layout).toContain('<StarfieldCanvas />')
    expect(layout).not.toContain('class="alumni-dust alumni-dust-1"')
    expect(starfield).toContain('data-starfield-canvas')
    expect(starfield).toContain('prefers-reduced-motion: reduce')
    expect(starfield).toContain("'--ambient-tilt-x'")
    expect(starfield).toContain('document.visibilityState')
    expect(starfield).toContain("'astro:before-swap'")
  })
})
