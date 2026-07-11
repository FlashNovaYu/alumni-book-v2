import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const src = resolve(__dirname, '../src')
const read = (relativePath: string) => readFileSync(resolve(src, relativePath), 'utf-8')

describe('同学会话失效约束', () => {
  it('为班级空间携带同学令牌并通过统一处理器处理 401', () => {
    const classSpace = read('api/classSpace.ts')
    const postOffice = read('api/postOffice.ts')

    expect(classSpace).toContain('getClassmateToken')
    expect(classSpace).toContain("'X-Classmate-Token'")
    expect(classSpace).toContain('handleClassmateUnauthorized')
    expect(postOffice).toContain('handleClassmateUnauthorized')
  })

  it('清理失效会话并在信箱中显示中文错误', () => {
    expect(existsSync(resolve(src, 'api/classmateSession.ts'))).toBe(true)

    const session = read('api/classmateSession.ts')
    const mailbox = read('components/MailboxApp.vue')

    expect(session).toContain("export const SESSION_EXPIRED_MESSAGE = '登录已失效，请重新登录'")
    expect(session).toContain('clearClassmateSession()')
    expect(session).toContain('window.location.assign')
    expect(mailbox).toContain('loadError')
    expect(mailbox).toContain('{{ loadError }}')
    expect(mailbox).toContain('v-if="!loadError"')
  })

  it('将可靠性回归纳入默认站点测试，并让公开目录保持公开解析', () => {
    const packageJson = readFileSync(resolve(__dirname, '../package.json'), 'utf-8')
    const postOffice = read('api/postOffice.ts')

    expect(packageJson).toContain('tests/ui-reliability-static.test.ts')
    expect(postOffice).toContain('parsePublicResponse')
    expect(postOffice).toContain('return parsePublicResponse<ClassmateEntry[]>(res, \'同学目录加载失败\')')
  })
})

describe('头像与学生页 hydration 可靠性', () => {
  it('仅在客户端挂载后解析当前同学身份，避免 SSR hydration 状态不一致', () => {
    const profile = read('components/StudentProfile.vue')

    expect(profile).toContain('const isCurrentOwner = ref(false)')
    expect(profile).toMatch(/onMounted\(\(\) => \{[\s\S]*?const current = getClassmateStudent<\{ slug: string \}>\(\)[\s\S]*?isCurrentOwner\.value = current\?\.slug === props\.studentSlug/)
    expect(profile).not.toContain('const isCurrentOwner = computed')
  })

  it('在账户页和后台列表为损坏头像显示对应学生的首字', () => {
    const accountCenter = read('components/AccountCenter.vue')
    const studentsView = read('../../admin/src/views/StudentsView.vue')

    expect(accountCenter).toContain('const avatarError = ref(false)')
    expect(accountCenter).toContain('v-if="student.avatarUrl && !avatarError"')
    expect(accountCenter).toContain('@error="avatarError = true"')
    expect(studentsView).toContain('const failedAvatarIds = ref(new Set<string>())')
    expect(studentsView).toContain('!failedAvatarIds.has(student.id)')
    expect(studentsView).toContain('@error="failedAvatarIds.add(student.id)"')
  })

  it('为年度册头像提供固定比例和无 JavaScript 的首字降级', () => {
    const yearbook = read('pages/yearbook.astro')

    expect(yearbook).toContain('style="aspect-ratio: 1"')
    expect(yearbook).toContain('<object')
    expect(yearbook).toContain('<span class="mate-avatar-char">{mate.name.charAt(0)}</span>')
  })
})

describe('长内容与年度册入口可靠性', () => {
  it('将时间轴说明稳定限制为六行', () => {
    const timeline = read('pages/timeline.astro')

    expect(timeline).toMatch(/\.tl-desc\s*\{[^}]*display:\s*-webkit-box;[^}]*-webkit-box-orient:\s*vertical;[^}]*-webkit-line-clamp:\s*6;[^}]*overflow:\s*hidden;/)
  })

  it('仅将年度册留言正文稳定限制为八行', () => {
    const yearbook = read('pages/yearbook.astro')

    expect(yearbook).toMatch(/<div class="msg-card-meta">[\s\S]*?msg-card-author[\s\S]*?msg-card-time[\s\S]*?<\/div>\s*<p class="msg-card-text mt-2">\{msg\.content\}<\/p>/)
    expect(yearbook).toMatch(/\.msg-card-text\s*\{[^}]*display:\s*-webkit-box;[^}]*-webkit-box-orient:\s*vertical;[^}]*-webkit-line-clamp:\s*8;[^}]*overflow:\s*hidden;/)

    const metaRule = yearbook.match(/\.msg-card-meta\s*\{([^}]*)\}/)?.[1] || ''
    expect(metaRule).not.toContain('-webkit-line-clamp')
    expect(metaRule).not.toContain('overflow: hidden')
  })

  it('为固定导航下的年度册打印入口预留额外间距', () => {
    const yearbook = read('pages/yearbook.astro')

    expect(yearbook).toMatch(/\.yearbook-page\s*\{[^}]*padding-top:\s*calc\(var\(--nav-height\) \+ var\(--spacing-xl\)\);/)
  })

  it('限制内容巡检逐项告警并保留聚合告警与剩余提示', () => {
    const dashboard = read('../../admin/src/views/DashboardView.vue')

    expect(dashboard).toContain("stats.auditAlerts?.some(a => a.type === 'missingSeatNo')")
    expect(dashboard).toContain("stats.auditAlerts?.some(a => a.type === 'missingGroupName')")
    expect(dashboard).toContain('v-for="(alert, idx) in stats.auditAlerts.slice(0, 12)"')
    expect(dashboard).toContain('v-if="stats.auditAlerts.length > 12"')
    expect(dashboard).toContain('{{ stats.auditAlerts.length - 12 }}')
  })

  it('将控制台设置快捷入口指向已注册的设置路由', () => {
    const dashboard = read('../../admin/src/views/DashboardView.vue')

    expect(dashboard).toContain('<router-link to="/settings" class="btn-action">前言寄语与致谢设置</router-link>')
    expect(dashboard).not.toContain('<router-link to="/config"')
  })
})
