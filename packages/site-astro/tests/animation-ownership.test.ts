import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const siteRoot = path.resolve(__dirname, '../src')

function read(relative: string) {
  return fs.readFileSync(path.join(siteRoot, relative), 'utf-8')
}

describe('animation ownership', () => {
  it('does not keep the old global GSAP animation owner wired into the layout', () => {
    const layout = read('layouts/MainLayout.astro')

    expect(layout).not.toContain('../scripts/animations')
    expect(layout).not.toContain('initAnimations')
    expect(layout).toContain('../scripts/globalReveal')
  })

  it('does not keep the old global animations source file with top-level GSAP imports', () => {
    const animationPath = path.join(siteRoot, 'scripts/animations.ts')
    if (!fs.existsSync(animationPath)) {
      expect(fs.existsSync(animationPath)).toBe(false)
      return
    }

    const source = fs.readFileSync(animationPath, 'utf-8')
    expect(source).not.toContain("import gsap from 'gsap'")
    expect(source).not.toContain("from 'gsap/ScrollTrigger'")
  })
})
