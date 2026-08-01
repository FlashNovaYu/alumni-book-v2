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

  it('自定义光标位置立即更新、状态切换单一合帧并限制合成层提示', () => {
    const layout = read('layouts/MainLayout.astro')
    const cursor = read('styles/custom-cursor.css')
    expect(layout).toContain('updateCursorPosition')
    expect(layout).toContain('e.getCoalescedEvents?.()')
    expect(layout).toContain('lastCursorTarget')
    expect(layout).toContain('cursorFrameId')
    expect(layout).toContain('cancelAnimationFrame(cursorFrameId)')
    expect(layout).toContain('queueCursorMode')
    expect(layout).not.toContain('const flushCursor =')
    expect(layout).not.toContain('queueCursor();')
    expect(cursor).toContain('will-change: transform, opacity')
    expect(cursor).not.toContain('will-change: transform, width, height, opacity')
  })

  it('交互样式不再使用会扩大重绘范围的 transition: all', () => {
    const files = [
      'components/AccountCenter.vue',
      'components/AlbumGrid.vue',
      'components/CalendarDatePicker.vue',
      'components/MessageWall.vue',
      'components/RankingsPanel.vue',
      'components/RosterWall.vue',
      'components/StudentProfile.vue',
      'components/TopNavSession.vue',
      'pages/timeline.astro',
    ]
    for (const file of files) expect(read(file)).not.toMatch(/transition:\s*all/)
    expect(read('components/AlbumGrid.vue')).toContain('transition: transform')
  })
})
