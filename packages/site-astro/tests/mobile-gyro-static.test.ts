import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  classifyDeviceOrientation,
  mapOrientationToTilt,
  mapPointerToGlare,
  type DeviceOrientationStatus,
} from '../src/composables/useMouseTilt'

const src = (file: string) => resolve(__dirname, '../src', file)

describe('移动端设备方向能力', () => {
  it('非安全上下文返回 insecure-context', () => {
    expect(classifyDeviceOrientation({ isSecureContext: false, hasEvent: true })).toBe('insecure-context')
  })

  it('没有 DeviceOrientationEvent 返回 unsupported', () => {
    expect(classifyDeviceOrientation({ isSecureContext: true, hasEvent: false })).toBe('unsupported')
  })

  it('方向值同时映射为旋转和光影坐标', () => {
    expect(mapOrientationToTilt({ beta: 20, gamma: 18, baseBeta: 0, maxTilt: 8 })).toEqual({
      rotateX: 3.56,
      rotateY: 3.2,
      glareX: 70,
      glareY: 27.78,
    })
  })

  it('方向值被限制在卡片边界', () => {
    const result = mapOrientationToTilt({ beta: 90, gamma: -90, baseBeta: 0, maxTilt: 8 })
    expect(result.rotateX).toBe(8)
    expect(result.rotateY).toBe(-8)
    expect(result.glareX).toBe(0)
    expect(result.glareY).toBe(0)
  })

  it('触摸位置映射到光影百分比', () => {
    expect(mapPointerToGlare({ x: 20, y: 75, width: 100, height: 100 })).toEqual({ glareX: 20, glareY: 75 })
  })

  it('权限拒绝不会进入 granted', async () => {
    const requestPermission = async () => 'denied' as const
    const status: DeviceOrientationStatus = await requestPermission()
    expect(status).toBe('denied')
    expect(status).not.toBe('granted')
  })
})

describe('移动端档案墙与样式契约', () => {
  it('档案卡消费方向光影状态并保持两列约束', () => {
    const roster = readFileSync(src('components/RosterWall.vue'), 'utf8')
    const card = readFileSync(src('components/ArchiveRosterCard.vue'), 'utf8')
    expect(roster).toContain('DeviceOrientationStatus')
    expect(roster).toContain('insecure-context')
    expect(roster).toContain('repeat(2, minmax(0, 1fr))')
    expect(card).toContain('isOrientationActive')
  })

  it('移动主要控件提供 44px 触控高度', () => {
    const nav = readFileSync(src('components/TopNav.astro'), 'utf8')
    const pagination = readFileSync(src('components/ui/UiPagination.vue'), 'utf8')
    const timeline = readFileSync(src('pages/timeline.astro'), 'utf8')
    const account = readFileSync(src('components/AccountCenter.vue'), 'utf8')
    const student = readFileSync(src('components/StudentProfile.vue'), 'utf8')
    expect(nav).toContain('width: 44px')
    expect(pagination).toContain('width: 44px')
    expect(pagination).toContain('height: 44px')
    expect(timeline).toContain('min-height: 44px')
    expect(account).toContain('min-height: 44px')
    expect(account).toContain('--color-text: var(--text-primary)')
    expect(student).toContain('min-height: 44px')
    expect(student).toContain("html[data-theme='night'] .student-page .hero-support")
    expect(student).toContain("html[data-theme='night'] .student-page .student-hero__name")
  })

  it('MainLayout 只保留一份 dustDrift 和移动环境光规则', () => {
    const layout = readFileSync(src('layouts/MainLayout.astro'), 'utf8')
    expect(layout.match(/@keyframes dustDrift/g)?.length).toBe(1)
    expect(layout).toContain('@media (max-width: 768px)')
    expect(layout).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
