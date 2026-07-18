import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (relativePath: string) => readFileSync(resolve(__dirname, relativePath), 'utf-8')

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
})
