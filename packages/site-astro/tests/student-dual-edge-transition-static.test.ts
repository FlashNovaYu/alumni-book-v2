import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const layout = readFileSync(resolve(root, 'src/layouts/MainLayout.astro'), 'utf8')
const transitions = readFileSync(resolve(root, 'src/styles/view-transitions.css'), 'utf8')
const card = readFileSync(resolve(root, 'src/components/ArchiveRosterCard.vue'), 'utf8')
const profile = readFileSync(resolve(root, 'src/components/StudentProfile.vue'), 'utf8')

describe('同学档案卡双向边缘转场契约', () => {
  it('恢复受控页面交换但不叠加整页左右位移', () => {
    expect(layout).toContain("import { ClientRouter } from 'astro:transitions'")
    expect(layout).toContain('<ClientRouter />')
    expect(transitions).toContain('@view-transition')
    expect(transitions).toContain('navigation: auto')
    expect(transitions).toContain('::view-transition-group(.student-surface)')
    expect(transitions).toContain('student-page-content-reveal')
    expect(transitions).toContain('student-page-content-exit-return')
    expect(transitions).not.toContain('navigation: none')
    expect(transitions).not.toContain('translateX(')
  })

  it('在 ClientRouter 交换前把扩散起点复制到新文档', () => {
    expect(layout).toContain("document.addEventListener('astro:before-swap'")
    expect(layout).toContain('nextDocument.documentElement.dataset.studentTransition = mode || \'edge\'')
    expect(layout).toContain("sessionStorage.getItem('vt-student-edge-state')")
    expect(layout).toContain('nextDocument.documentElement.style.setProperty(property')
    expect(layout).toContain('transitionEvent.viewTransition.finished.then(')
  })

  it('保留身份共享元素并为非身份内容提供坍缩层', () => {
    expect(card).toContain('student-identity')
    expect(card).toContain('student-surface')
    expect(card).toContain('student-card-details')
    expect(profile).toContain('student-avatar-')
    expect(profile).toContain('student-name-')
    expect(profile).toContain('student-surface-')
    expect(transitions).toContain('student-card-details')
    expect(transitions).toContain('z-index: 4')
    expect(transitions).toContain('animation-delay: 0.12s')
    expect(transitions).toContain('animation-duration: 0.7s')
    expect(transitions).toContain('::view-transition {')
    expect(transitions).toContain('::view-transition-old(.student-identity)')
    expect(transitions).toContain('::view-transition-new(.student-identity)')
    expect(layout).toContain("sessionStorage.setItem('vt-student-return-edge-state'")
    expect(layout).toContain("dataset.studentTransition = 'return-edge'")
  })

  it('包含减少动态效果和普通导航退化', () => {
    expect(layout).toContain('prefers-reduced-motion')
    expect(transitions).toContain('@media (prefers-reduced-motion: reduce)')
    expect(layout).toContain('startViewTransition')
    expect(layout).toContain('clearStudentTransitionNames')
    expect(layout).toContain('.student-page__transition-surface')
  })

  it('旧会话缺少卡片中心坐标时清理状态并降级普通返回', () => {
    expect(layout).toContain('if (!state.centerX || !state.centerY)')
    expect(layout).toMatch(/if \(!state\.centerX \|\| !state\.centerY\) \{[\s\S]*?clearStudentTransition\(\)[\s\S]*?return false/)
  })
})
