import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { toPublicStudent } from '../src/utils/publicStudent'

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

  it('构建侧在写入公开数据和页面属性前移除账号元数据', () => {
    expect(toPublicStudent({ id: '1', accountStatus: 'active', accountLastLoginAt: '2026-07-12' }))
      .toEqual({ id: '1' })

    const helperPath = resolve(__dirname, '../src/utils/publicStudent.ts')
    expect(existsSync(helperPath)).toBe(true)
    const helper = existsSync(helperPath) ? readFileSync(helperPath, 'utf8') : ''
    const fetchData = readFileSync(resolve(__dirname, '../scripts/fetch-data.ts'), 'utf8')
    const studentPage = src('pages/student/[slug].astro')
    expect(helper).toContain('accountStatus: _accountStatus')
    expect(helper).toContain('accountLastLoginAt: _accountLastLoginAt')
    expect(fetchData).toContain('toPublicStudent')
    expect(studentPage).toContain('toPublicStudent')
  })

  it('生产构建产物不包含账号状态或最近登录时间', () => {
    const dist = resolve(__dirname, '../dist')
    if (!existsSync(dist)) return

    const publicFiles = [resolve(dist, 'data/students.json')]
    const studentsDir = resolve(dist, 'student')
    if (existsSync(studentsDir)) {
      for (const entry of readdirSync(studentsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) publicFiles.push(resolve(studentsDir, entry.name, 'index.html'))
      }
    }

    for (const file of publicFiles.filter(existsSync)) {
      const output = readFileSync(file, 'utf8')
      expect(output, file).not.toContain('accountStatus')
      expect(output, file).not.toContain('accountLastLoginAt')
    }
  })
})
