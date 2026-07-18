import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (relativePath: string) => readFileSync(resolve(__dirname, relativePath), 'utf-8')
const packageJson = () => JSON.parse(read('../package.json')) as { scripts: Record<string, string> }

describe('公开站点设计令牌入口', () => {
  it('在基础样式之前按顺序加载共享令牌和站点覆盖', () => {
    const globalCss = read('../src/styles/global.css')

    expect(globalCss).toContain("@import '../../../shared/src/tokens.css';")
    expect(globalCss).toContain("@import './tokens.css';")
    expect(globalCss.indexOf("../../../shared/src/tokens.css")).toBeLessThan(globalCss.indexOf("./tokens.css"))
    expect(globalCss.indexOf("./tokens.css")).toBeLessThan(globalCss.indexOf("./base.css"))
  })

  it('将夜读基础令牌和站点纹理分别保留在各自所有者中', () => {
    const sharedTokens = read('../../shared/src/tokens.css')
    const siteTokens = read('../src/styles/tokens.css')

    expect(sharedTokens).toContain("html[data-theme='night']")
    expect(sharedTokens).toContain('--color-paper-bg: var(--bg)')
    expect(siteTokens).toContain('--texture-paper-fiber:')
    expect(siteTokens).toContain("html[data-theme='night']")
  })

  it('保留模块化前的通用表单、徽章与标签状态', () => {
    const components = read('../src/styles/components.css')

    expect(components).toMatch(/\.text-input--error\s*\{[\s\S]*?border-color:\s*var\(--error\)/)
    expect(components).toMatch(/\.text-input--error:focus\s*\{[\s\S]*?box-shadow:\s*0 0 0 3px rgba\(198, 69, 69, 0\.12\)/)
    expect(components).toMatch(/\.badge\s*\{[\s\S]*?min-height:\s*20px/)
    expect(components).toMatch(/\.badge--success\s*\{[\s\S]*?color:\s*var\(--success\)/)
    expect(components).toMatch(/\.badge--warning\s*\{[\s\S]*?color:\s*var\(--warning\)/)
    expect(components).toMatch(/\.badge--error\s*\{[\s\S]*?color:\s*var\(--error\)/)
    expect(components).toMatch(/\.tag\s*\{[\s\S]*?padding:\s*2px 10px[\s\S]*?font-weight:\s*var\(--weight-medium\)[\s\S]*?transition:/)
    expect(components).toMatch(/\.tag:hover\s*\{[\s\S]*?background:\s*var\(--accent-soft\)[\s\S]*?color:\s*var\(--accent\)/)
  })

  it('为页标题和学生身份共享元素保留拆分前的转场规则', () => {
    const transitions = read('../src/styles/view-transitions.css')

    expect(transitions).toMatch(/\.page-header__title-wrap\s*\{[\s\S]*?position:\s*relative[\s\S]*?display:\s*inline-block/)
    expect(transitions).toMatch(/\.page-header__title-sweep\s*\{[\s\S]*?position:\s*absolute[\s\S]*?bottom:\s*-7px[\s\S]*?height:\s*2px/)
    expect(transitions).toContain('::view-transition-group(.student-avatar)')
    expect(transitions).toContain('::view-transition-group(.student-name)')
    expect(transitions).toContain('animation: detail-content-enter 0.52s')
    expect(transitions).toContain('@keyframes detail-content-enter')
  })

  it('将入口契约纳入站点静态测试命令', () => {
    expect(packageJson().scripts.test).toContain('tests/design-system-static.test.ts')
  })
})
