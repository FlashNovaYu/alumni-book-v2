import { describe, expect, it } from 'vitest'
import { chromium } from '@playwright/test'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const src = resolve(__dirname, '../src')
const read = (relativePath: string) => readFileSync(resolve(src, relativePath), 'utf-8')
const extractStyles = (source: string) => source.match(/<style(?:\s[^>]*)?>([\s\S]*)<\/style>/)?.[1] || ''

describe('同学会话失效约束', () => {
  it('为班级空间携带同学令牌并通过统一处理器处理 401', () => {
    const classSpace = read('api/classSpace.ts')
    const classmateRequest = read('api/classmateRequest.ts')

    expect(classSpace).toContain('requestClassmateApi')
    expect(classmateRequest).toContain('getClassmateToken')
    expect(classmateRequest).toContain("'X-Classmate-Token'")
    expect(classmateRequest).toContain('handleClassmateUnauthorized')
  })

  it('清理失效会话并在信箱中显示中文错误', () => {
    expect(existsSync(resolve(src, 'api/classmateSession.ts'))).toBe(true)

    const session = read('api/classmateSession.ts')
    const mailbox = read('components/MailboxApp.vue')

    expect(session).toContain("export const SESSION_EXPIRED_MESSAGE = '登录已失效，请重新登录'")
    expect(session).toContain('clearClassmateSession()')
    expect(session).toContain('window.location.assign')
    expect(mailbox).toContain('v-if="error"')
    expect(mailbox).toContain('{{ error }}')
    expect(mailbox).toContain('role="alert"')
  })

  it('将可靠性回归纳入默认站点测试，并让公开目录保持公开解析', () => {
    const packageJson = readFileSync(resolve(__dirname, '../package.json'), 'utf-8')
    const classmateRequest = read('api/classmateRequest.ts')

    expect(packageJson).toContain('tests/ui-reliability-static.test.ts')
    expect(classmateRequest).toContain('requestClassmateApi')
    expect(classmateRequest).toContain('handleClassmateUnauthorized')
  })
})

describe('组合验证前置条件', () => {
  it('在站点构建测试前完成后台构建', () => {
    const rootPackage = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf-8')) as {
      scripts: Record<string, string>
    }
    const verifySite = rootPackage.scripts['verify:site']

    expect(verifySite).toContain('pnpm build:admin')
    expect(verifySite.indexOf('pnpm build:admin')).toBeLessThan(verifySite.indexOf('test:with-build'))
  })

  it('顶层组合验证复用站点链路的后台构建', () => {
    const rootPackage = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf-8')) as {
      scripts: Record<string, string>
    }
    const verifyAll = rootPackage.scripts['verify:all']
    const verifyAdmin = rootPackage.scripts['verify:admin']

    expect(verifyAll).toContain('pnpm verify:site')
    expect(verifyAll).toContain('pnpm verify:admin')
    expect(verifyAll).not.toContain('pnpm build:admin')
    expect(rootPackage.scripts).toHaveProperty('verify:admin')
    expect(verifyAdmin).toContain('pnpm --filter admin typecheck')
    expect(verifyAdmin).toContain('pnpm --filter admin build')
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

    expect(yearbook).toContain('width="72"')
    expect(yearbook).toContain('loading="lazy"')
    expect(yearbook).toContain('<span class="mate-avatar-char">{mate.name.charAt(0)}</span>')
  })
})

describe('长内容与年度册入口可靠性', () => {
  it('将时间轴说明稳定限制为六行', () => {
    const timeline = read('pages/timeline.astro')

    expect(timeline).toMatch(/\.tl-desc\s*\{[^}]*display:\s*-webkit-box;[^}]*-webkit-box-orient:\s*vertical;[^}]*-webkit-line-clamp:\s*6;[^}]*line-clamp:\s*6;[^}]*max-height:\s*9\.6em;[^}]*overflow:\s*hidden;/)
  })

  it('仅将年度册留言正文稳定限制为八行', () => {
    const yearbook = read('pages/yearbook.astro')

    const messageTemplate = yearbook.match(/<div class="msg-card-meta">[\s\S]*?msg-card-author[\s\S]*?msg-card-time[\s\S]*?<\/div>\s*<p class="msg-card-text mt-2">\{msg\.content\}<\/p>/)?.[0] || ''
    expect(messageTemplate).toContain('msg-card-author')
    expect(messageTemplate).toContain('msg-card-time')
    expect(messageTemplate).toContain('<p class="msg-card-text mt-2">{msg.content}</p>')
    expect(yearbook).toMatch(/\.msg-card-text\s*\{[^}]*display:\s*-webkit-box;[^}]*-webkit-box-orient:\s*vertical;[^}]*-webkit-line-clamp:\s*8;[^}]*line-clamp:\s*8;[^}]*max-height:\s*12em;[^}]*overflow:\s*hidden;/)
    expect(yearbook.match(/-webkit-line-clamp:\s*8;/g)).toHaveLength(1)

    const readRule = (selector: string) => {
      const rule = yearbook.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] || ''
      expect(rule, `${selector} 应定义 CSS 规则`).not.toBe('')
      return rule
    }
    const protectedMetaRules = [
      readRule('msg-card-meta'),
      readRule('msg-card-author'),
      readRule('msg-card-time'),
    ]
    for (const rule of protectedMetaRules) {
      expect(rule).not.toContain('-webkit-line-clamp')
      expect(rule).not.toContain('overflow: hidden')
      expect(rule).not.toContain('text-overflow')
    }
  })

  it('为固定导航下的年度册打印入口预留额外间距', () => {
    const yearbook = read('pages/yearbook.astro')

    expect(yearbook).toMatch(/\.yearbook-page\s*\{[^}]*padding-top:\s*calc\(var\(--nav-height\) \+ var\(--spacing-xl\)\);/)
  })

  it('权限工作台只请求职责摘要而不读取主管理员统计', () => {
    const dashboard = read('../../admin/src/views/DashboardView.vue')

    expect(dashboard).toContain('/api/admin/workbench')
    expect(dashboard).not.toContain('/api/admin/stats')
    expect(dashboard).not.toContain('auditAlerts')
  })

  it('将控制台设置快捷入口指向已注册的设置路由', () => {
    const dashboard = read('../../admin/src/views/DashboardView.vue')

    expect(dashboard).toContain("if (can('site.settings.manage')) actions.push({ label: '站点设置', to: '/settings' })")
    expect(dashboard).not.toContain('<router-link to="/config"')
  })
})

describe('长内容浏览器布局可靠性', () => {
  it('使用生产样式限制超长正文，并让打印按钮位于固定导航之下', async () => {
    const timelineStyles = extractStyles(read('pages/timeline.astro'))
    const yearbookStyles = extractStyles(read('pages/yearbook.astro'))
    const tokens = readFileSync(resolve(src, '../../shared/src/tokens.css'), 'utf-8')
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
      const longText = '超长内容 '.repeat(500)
      await page.setContent(`
        <style>
          ${tokens}
          ${timelineStyles}
          ${yearbookStyles}
          html, body { margin: 0; }
          .fixture { width: 320px; }
          .fixture .tl-desc, .fixture .msg-card-text { margin: 0; }
          .fixture .yearbook-msg-card { padding: 0; }
          .fixture-nav { position: fixed; inset: 0 0 auto; height: var(--nav-height); }
        </style>
        <nav class="fixture-nav"></nav>
        <div class="yearbook-page">
          <button class="print-btn">打印</button>
        </div>
        <div class="fixture">
          <div class="tl-card"><p class="tl-desc">${longText}</p></div>
          <div class="yearbook-msg-card">
            <div class="msg-card-meta"><span class="msg-card-author">作者</span><span class="msg-card-time">日期</span></div>
            <p class="msg-card-text">${longText}</p>
          </div>
        </div>
      `)

      const metrics = await page.evaluate(() => {
        const measureText = (selector: string, lines: number) => {
          const element = document.querySelector<HTMLElement>(selector)!
          const style = getComputedStyle(element)
          const lineHeight = Number.parseFloat(style.lineHeight)
          const maxHeight = Number.parseFloat(style.maxHeight)
          return { height: element.getBoundingClientRect().height, lineHeight, maxHeight, expected: lineHeight * lines }
        }
        const timelineCard = document.querySelector<HTMLElement>('.tl-card')!
        const timelineCardStyle = getComputedStyle(timelineCard)
        const timelineExtraHeight =
          Number.parseFloat(timelineCardStyle.paddingTop) +
          Number.parseFloat(timelineCardStyle.paddingBottom) +
          Number.parseFloat(timelineCardStyle.borderTopWidth) +
          Number.parseFloat(timelineCardStyle.borderBottomWidth)
        const meta = document.querySelector<HTMLElement>('.msg-card-meta')!
        const messageCard = document.querySelector<HTMLElement>('.yearbook-msg-card')!
        const nav = document.querySelector<HTMLElement>('.fixture-nav')!
        const printButton = document.querySelector<HTMLElement>('.print-btn')!

        return {
          timeline: measureText('.tl-desc', 6),
          yearbook: measureText('.msg-card-text', 8),
          timelineCardHeight: timelineCard.getBoundingClientRect().height,
          timelineCardLimit: timelineExtraHeight,
          yearbookCardHeight: messageCard.getBoundingClientRect().height,
          yearbookMetaHeight: meta.getBoundingClientRect().height,
          navBottom: nav.getBoundingClientRect().bottom,
          printButtonTop: printButton.getBoundingClientRect().top,
        }
      })

      expect(metrics.timeline.maxHeight).toBeCloseTo(metrics.timeline.expected, 1)
      expect(metrics.timeline.height).toBeLessThanOrEqual(metrics.timeline.maxHeight + 1)
      expect(metrics.timelineCardHeight).toBeLessThanOrEqual(metrics.timeline.maxHeight + metrics.timelineCardLimit + 1)
      expect(metrics.yearbook.maxHeight).toBeCloseTo(metrics.yearbook.expected, 1)
      expect(metrics.yearbook.height).toBeLessThanOrEqual(metrics.yearbook.maxHeight + 1)
      expect(metrics.yearbookCardHeight).toBeLessThanOrEqual(metrics.yearbookMetaHeight + metrics.yearbook.maxHeight + 1)
      expect(metrics.printButtonTop).toBeGreaterThanOrEqual(metrics.navBottom)
    } finally {
      await browser.close()
    }
  })
})

describe('导航与表单无障碍', () => {
  it('为可键盘操作的导航、搜索和表单控件声明可访问名称与关联', () => {
    const nav = read('components/TopNav.astro')
    const navRuntime = read('scripts/navRuntime.ts')
    const rosterSearch = read('components/RosterSearch.vue')
    const groupChatComposer = read('components/GroupChatComposer.vue')
    const studentsView = read('../../admin/src/views/StudentsView.vue')
    const settingsView = read('../../admin/src/views/SettingsView.vue')
    const adminLayout = read('../../admin/src/views/AdminLayout.vue')

    expect(nav).toContain('role="dialog"')
    expect(nav).toContain('aria-modal="true"')
    expect(nav).toContain('aria-labelledby="mobile-drawer-title"')
    expect(nav).toContain('id="mobile-drawer-title"')
    expect(nav).toMatch(/class="mobile-drawer"[^>]*aria-hidden="true"[^>]*inert/)
    expect(navRuntime).toContain('drawer.inert = true')
    expect(navRuntime).toContain('drawer.inert = false')
    expect(navRuntime).toContain("keyboardEvent.key === 'Escape'")
    expect(navRuntime).toContain("keyboardEvent.key !== 'Tab'")
    expect(navRuntime).toContain('if (!focusableElements.length) return')
    expect(rosterSearch).toContain('aria-label="搜索同学"')
    expect(groupChatComposer).toContain('aria-label="群聊消息内容"')
    expect(studentsView).toContain('aria-label="搜索学生"')
    for (const id of [
      'preface-title',
      'preface-subtitle',
      'preface-content',
      'footer-copyright',
      'footer-beian',
      'footer-beian-url',
      'typography-font-family',
      'typography-font-size',
      'museum-enabled',
      'museum-hero-eyebrow',
      'museum-hero-title',
      'museum-hero-subtitle',
      'museum-particle-level',
      'museum-enable-class-graph',
      'museum-enable-seat-map',
    ]) {
      expect(settingsView).toContain(`for="${id}"`)
      expect(settingsView).toContain(`id="${id}"`)
    }
    expect(settingsView).toContain(':aria-label="`第 ${i + 1} 位致谢姓名`"')
    expect(settingsView).toContain(':aria-label="`第 ${i + 1} 位致谢角色`"')
    expect(adminLayout).toContain('<nav class="sidebar__nav">')
    expect(adminLayout).toContain('审核中心')
  })

  it('导航运行时集中管理抽屉焦点与页面过渡清理', () => {
    const nav = read('components/TopNav.astro')
    const runtime = read('scripts/navRuntime.ts')
    expect(nav).toMatch(/class="mobile-drawer"[^>]*aria-hidden="true"[^>]*inert/)
    expect(runtime).toContain("window.addEventListener('pagehide'")
    expect(runtime).toContain('window.__alumniNavRuntime?.destroy()')
    expect(runtime).toContain('cleanup.splice(0).forEach')
  })
})

describe('只读日期选择器', () => {
  it('不保留浏览器无法触发的手动输入处理', () => {
    for (const relativePath of [
      'components/CalendarDatePicker.vue',
      '../../admin/src/components/CalendarDatePicker.vue',
    ]) {
      const source = read(relativePath)
      expect(source).toContain('readonly')
      expect(source).not.toContain('@input="handleInput"')
      expect(source).not.toContain('@blur="handleBlur"')
      expect(source).not.toContain('@keyup.enter="handleEnter"')
      expect(source).not.toContain('function validateAndCommitInput')
      expect(source).toContain('@keydown="handleInputKeydown"')
      expect(source).toContain('aria-label="清空日期"')
      expect(source).toContain('function clearDate()')
    }
  })
})

describe('默认质量门禁', () => {
  it('包含共享类型检查和所有现有站点测试', () => {
    const root = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'))
    const site = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'))
    const admin = JSON.parse(readFileSync(resolve(__dirname, '../../admin/package.json'), 'utf8'))

    expect(root.scripts['verify:all']).toContain('verify:shared')
    expect(admin.scripts.test).toContain('test:static')
    expect(site.scripts.typecheck).toContain('astro check')
    expect(site.devDependencies['@astrojs/check']).toBeDefined()
    for (const file of ['museum-viewmodels.test.ts', 'public-ui-feedback-static.test.ts', 'security-hardening-static.test.ts']) {
      expect(site.scripts.test).toContain(file)
    }
    for (const file of ['navigation-marker-direction.spec.ts', 'roster-pagination.spec.ts']) {
      expect(site.scripts['test:perf-network']).toContain(file)
    }
  })
})
