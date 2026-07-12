import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf-8')

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
    expect(roster).toContain('v-for="mate in classmates"')
    expect(roster).toContain('v-show="isCardVisible(mate)"')
    expect(roster).toContain("'vt-student-identity-state'")
    expect(layout).toContain("const studentIdentityTransitionKey = 'vt-student-identity-state'")
    expect(layout).toContain('newDocument?: Document')
    expect(layout).toContain('[data-student-identity-card]')
  })

  it('只让拥有标准 Hero 目标的同学卡片参与身份共享转场', () => {
    const card = read('components/ArchiveRosterCard.vue')
    const roster = read('components/RosterWall.vue')
    const viewModels = read('utils/museumViewModels.ts')

    expect(card).toContain('card.hasStandardProfile')
    expect(roster).toContain('hasStandardProfile: boolean')
    expect(viewModels).toContain('hasStandardProfile: mate.hasStandardProfile !== false')
  })

  it('将详情辅助内容与共享身份元素分离，并保留减少动态回退', () => {
    const profile = read('components/StudentProfile.vue')
    const global = read('styles/global.css')

    expect(profile).toContain('class="hero-support detail-content-enter"')
    expect(profile).toContain('class="student-body container detail-content-enter"')
    expect(global).toContain('::view-transition-group(.student-avatar)')
    expect(global).toContain('::view-transition-group(.student-name)')
    expect(global).toContain('.student-page .detail-content-enter')
    expect(global).toContain('view-transition-name: none !important')
    expect(global).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.student-page \.detail-content-enter\s*\{[\s\S]*?animation:\s*none\s*!important;/)
    expect(global).not.toContain('::view-transition-group(active-card)')
  })
})
