import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = (path: string) => readFileSync(resolve(__dirname, '../src', path), 'utf8')

describe('公开站点 HTML 注入边界', () => {
  it('前言以文本渲染并用 CSS 保留换行', () => {
    const source = src('components/PrefaceWall.vue')

    expect(source).toContain('<p class="preface-content">{{ prefaceContent }}</p>')
    expect(source).toContain('white-space: pre-line')
    expect(source).not.toContain('v-html')
  })

  it('时光轴安全序列化内联 JSON', () => {
    const source = src('pages/timeline.astro')

    expect(source).toContain('function serializeForHtmlScript')
    expect(source).toContain('replace(/[<>&\\u2028\\u2029]/g')
    expect(source).toContain('set:html={serializedItems}')
    expect(source).not.toContain('set:html={JSON.stringify(items)}')
  })

  it('专属模板允许脚本但不拥有同源权限', () => {
    const source = src('components/StudentProfile.vue')

    expect(source).toContain('sandbox="allow-scripts"')
    expect(source).not.toContain('allow-same-origin')
  })
})
