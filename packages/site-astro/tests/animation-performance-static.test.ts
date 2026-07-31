import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf8')

describe('动画性能静态契约', () => {
  it('星空缓存主题数据并遵守自适应帧预算', () => {
    const starfield = read('components/StarfieldCanvas.astro')
    expect(starfield).toContain('getCurrentMotionBudget()')
    expect(starfield).toContain('getMotionFrameInterval(')
    expect(starfield).toContain('lastDrawAt')
    expect(starfield).toContain('MutationObserver')
    expect(starfield).toContain('alumni:ambient-tilt')
    expect(starfield).toContain("document.removeEventListener('visibilitychange', onVisibilityChange)")
    expect(starfield).toContain("document.removeEventListener('astro:before-swap', cleanup)")
    expect(starfield).toContain("document.removeEventListener('alumni:ambient-tilt', onAmbientTilt)")
    expect(starfield).toContain('themeObserver.disconnect()')
  })

  it('方向动画只在事件驱动的合帧循环中更新', () => {
    const tilt = read('composables/useMouseTilt.ts')
    const card = read('components/ArchiveRosterCard.vue')
    expect(tilt).toContain('pendingPointers')
    expect(tilt).toContain('pointerFrameId')
    expect(tilt).toContain('orientationFrameId')
    expect(tilt).toContain('lastOrientationFrame')
    expect(tilt).toContain('getMotionFrameInterval(')
    expect(tilt).toContain('cancelAnimationFrame(pointerFrameId)')
    expect(tilt).toContain('cancelAnimationFrame(orientationFrameId)')
    expect(tilt).toContain("document.dispatchEvent(new CustomEvent('alumni:ambient-tilt'")
    expect(card).not.toContain('will-change: transform')
  })
})
