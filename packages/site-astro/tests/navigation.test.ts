import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { execSync } from 'child_process'

const distDir = resolve(__dirname, '../dist')

function getAllHtmlFiles(dir: string, filesList: string[] = []): string[] {
  if (!existsSync(dir)) return filesList
  const files = readdirSync(dir)
  for (const file of files) {
    const name = join(dir, file)
    if (statSync(name).isDirectory()) {
      getAllHtmlFiles(name, filesList)
    } else if (name.endsWith('.html')) {
      filesList.push(name)
    }
  }
  return filesList
}

describe('Astro Site Base Path Link & Navigation Smoke Test', () => {
  let basePath = '/'

  beforeAll(() => {
    if (!existsSync(distDir)) {
      throw new Error(`[Test Initialization Error] dist 目录不存在。请先运行 "pnpm build" 产生构建产物后，再执行测试。`)
    }
    
    // 动态探测构建产物中的 base path
    const rosterHtmlPath = join(distDir, 'roster/index.html')
    if (existsSync(rosterHtmlPath)) {
      const content = readFileSync(rosterHtmlPath, 'utf-8')
      if (content.includes('href="/alumni-book-v2/')) {
        basePath = '/alumni-book-v2/'
      }
    }
    console.log(`[Test info] Detected build base path: "${basePath}"`)
  })

  it('ensures all station links respect the base path SITE_BASE', () => {
    const htmlFiles = getAllHtmlFiles(distDir)
    expect(htmlFiles.length).toBeGreaterThan(0)

    // 如果 base path 是根目录，以斜杠开头的所有相对路径都是合法的，跳过硬编码路径检查
    if (basePath === '/') {
      return
    }

    // 匹配如 href="/preface"、href="/roster" 等，但忽略包含 base 前缀的链接
    const hardcodedLinkRegex = /href="\/(preface|roster|album|timeline|more|student)(?:\/|\?|#|")/g

    const violations: string[] = []

    for (const file of htmlFiles) {
      const content = readFileSync(file, 'utf-8')
      let match
      while ((match = hardcodedLinkRegex.exec(content)) !== null) {
        violations.push(`${file} contains invalid hardcoded link: "${match[0]}"`)
      }
    }

    if (violations.length > 0) {
      console.error('Violations found:\n', violations.join('\n'))
    }

    expect(violations.length).toBe(0)
  })

  it('ensures the base prefix is present in important navigation links', () => {
    const rosterHtmlPath = join(distDir, 'roster/index.html')
    if (existsSync(rosterHtmlPath)) {
      const rosterContent = readFileSync(rosterHtmlPath, 'utf-8')
      const expectedPrefix = basePath.replace(/\/$/, '')
      expect(rosterContent).toContain(`href="${expectedPrefix}/preface`)
      expect(rosterContent).toContain(`href="${expectedPrefix}/more`)
    }
  })

  it('admin build uses the nested SITE_BASE admin asset prefix', () => {
    const adminIndex = resolve(__dirname, '../../admin/dist/index.html')
    expect(existsSync(adminIndex)).toBe(true)
    const content = readFileSync(adminIndex, 'utf-8')
    expect(content).toContain('/admin/assets/')
    expect(content).not.toContain('/alumni-book-v2/admin/assets/')
  })

  it('404 page routes admin links through the GitHub Pages base path', () => {
    const notFoundPath = join(distDir, '404.html')
    expect(existsSync(notFoundPath)).toBe(true)
    const content = readFileSync(notFoundPath, 'utf-8')
    expect(content).toContain('href="/admin/"')
    expect(content).toContain("siteBase + 'admin/#/'")
    expect(content).not.toContain('/alumni-book-v2/admin/')
  })

  it('admin production build does not emit source maps', () => {
    const adminAssets = resolve(__dirname, '../../admin/dist/assets')
    expect(existsSync(adminAssets)).toBe(true)
    const maps = readdirSync(adminAssets).filter((name: string) => name.endsWith('.map'))
    expect(maps).toEqual([])
  })

  it('verifies paper navigation HTML markers and contract structures in generated html', () => {
    const prefaceHtmlPath = join(distDir, 'preface/index.html')
    if (existsSync(prefaceHtmlPath)) {
      const content = readFileSync(prefaceHtmlPath, 'utf-8')
      
      // 必须包含活动项和墨线标记
      expect(content).toContain('nav-active-paper')
      expect(content).toContain('nav-active-ink')

      // 图标按钮必须具有 aria-label 属性
      expect(content).toContain('aria-label')

      // 移动端中栏标题
      expect(content).toContain('mobile-page-title')

      // 退出登录按钮
      expect(content).toContain('nav-logout-btn')
    }
  })
})
