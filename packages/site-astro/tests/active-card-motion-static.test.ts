import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf-8')

function cssBlock(source: string, header: string) {
  const headerIndex = source.indexOf(header)
  const openingBrace = source.indexOf('{', headerIndex)
  if (headerIndex < 0 || openingBrace < 0) return ''
  let depth = 0
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(openingBrace + 1, index)
  }
  return ''
}

describe('档案卡共享元素转场', () => {
  it('仅在被点击卡片和标准详情 Hero 间共享同一学生的头像与姓名', () => {
    const card = read('components/ArchiveRosterCard.vue')
    const profile = read('components/StudentProfile.vue')

    expect(card).toContain(':style="avatarTransitionStyle"')
    expect(card).toContain(':style="nameTransitionStyle"')
    expect(card).toContain("'student-avatar-' + props.card.slug")
    expect(card).toContain("'student-name-' + props.card.slug")
    expect(card).not.toContain('active-card')
    expect(card).not.toContain('vt-fade-out')

    expect(profile).toContain(':style="avatarTransitionStyle"')
    expect(profile).toContain(':style="nameTransitionStyle"')
    expect(profile).toContain("'student-avatar-' + student.value.slug")
    expect(profile).toContain("'student-name-' + student.value.slug")
    expect(profile).not.toContain('view-transition-name: active-card')
  })

  it('在返回人物长廊的文档交换前恢复原分页或检索页中的共享目标', () => {
    const card = read('components/ArchiveRosterCard.vue')
    const roster = read('components/RosterWall.vue')
    const layout = read('layouts/MainLayout.astro')

    expect(card).toContain('data-student-identity-card')
    expect(card).toContain("emit('identity-transition', props.card.slug)")
    expect(roster).toContain('@identity-transition="rememberIdentityTransition"')
    expect(roster).toContain('v-for="(mate, index) in paginatedClassmates"')
    expect(roster).not.toContain('v-show="isCardVisible(mate)"')
    expect(roster).toContain("'vt-student-identity-state'")
    expect(layout).toContain("sessionStorage.getItem('vt-student-identity-state')")
    expect(layout).toContain('restoreStudentIdentityTarget')
    expect(layout).toContain("window.addEventListener('pageshow'")
    expect(layout).toContain('[data-student-identity-card]')
    expect(roster).toContain('const isRestoringIdentityState = ref(false)')
    expect(roster).toContain('if (!isRestoringIdentityState.value) currentPage.value = 1')
    expect(roster).toContain('await nextTick()')
  })

  it('只让拥有标准 Hero 目标的同学卡片参与身份共享转场', () => {
    const card = read('components/ArchiveRosterCard.vue')
    const roster = read('components/RosterWall.vue')
    const viewModels = read('utils/museumViewModels.ts')

    expect(card).toContain('card.hasStandardProfile')
    expect(roster).toContain('hasStandardProfile?: boolean')
    expect(viewModels).toContain('hasStandardProfile: mate.hasStandardProfile !== false')
  })

  it('将详情辅助内容与共享身份元素分离，并保留减少动态回退', () => {
    const profile = read('components/StudentProfile.vue')
    const viewTransitions = read('styles/view-transitions.css')

    expect(profile).toContain('class="hero-support detail-content-enter"')
    expect(profile).toContain('class="student-body container detail-content-enter"')
    expect(viewTransitions).toContain('::view-transition-group(.student-avatar)')
    expect(viewTransitions).toContain('::view-transition-group(.student-name)')
    expect(viewTransitions).toContain('.student-page .detail-content-enter')
    expect(viewTransitions).toContain('view-transition-name: none !important')
    expect(viewTransitions).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.student-page \.detail-content-enter\s*\{[\s\S]*?animation:\s*none\s*!important;/)
    expect(viewTransitions).not.toContain('::view-transition-group(active-card)')
  })

  it('为手机端提供更舒缓且对称的进入/返回节奏', () => {
    const viewTransitions = read('styles/view-transitions.css')
    const mobileMotion = cssBlock(viewTransitions, '@media (max-width: 768px)')

    expect(mobileMotion).toMatch(/html\[data-student-transition='edge'\]::view-transition-old\(root\)\s*\{[^}]*animation-duration:\s*1\.05s/)
    expect(mobileMotion).toMatch(/html\[data-student-transition='edge'\]::view-transition-new\(root\)\s*\{[^}]*animation-name:\s*student-edge-expand-mobile;[^}]*animation-duration:\s*1\.05s/)
    expect(mobileMotion).toMatch(/html\[data-student-transition='return-edge'\]::view-transition-old\(root\)\s*\{[^}]*animation-name:\s*student-edge-contract-mobile;[^}]*animation-duration:\s*1\.05s/)
    expect(mobileMotion).toMatch(/::view-transition-group\(\.student-identity\)\s*\{[^}]*animation-delay:\s*0\.14s;[^}]*animation-duration:\s*0\.9s/)
    expect(mobileMotion).toMatch(/::view-transition-group\(\.student-card-details\)\s*\{[^}]*animation-duration:\s*0\.62s/)
    expect(mobileMotion).not.toContain('prefers-reduced-motion')
  })
})
