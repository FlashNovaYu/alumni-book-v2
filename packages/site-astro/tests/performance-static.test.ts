import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'

const distDir = path.resolve(__dirname, '../dist')
const assetsDir = path.join(distDir, 'assets')

describe('Performance Static Constraints Test', () => {
  beforeAll(() => {
    if (!fs.existsSync(distDir)) {
      throw new Error('❌ dist 目录不存在，请在测试前执行 pnpm build 进行打包。')
    }
  })

  const getReferencedScripts = (htmlPath: string): string[] => {
    if (!fs.existsSync(htmlPath)) return []
    const content = fs.readFileSync(htmlPath, 'utf-8')
    const scripts: string[] = []
    
    // 匹配 <script type="module" src="..."> 或者普通 script
    const srcMatches = content.matchAll(/src="([^"]+\.js)"/g)
    for (const match of srcMatches) {
      scripts.push(match[1])
    }
    
    // 匹配 component-url="..."
    const componentMatches = content.matchAll(/component-url="([^"]+\.js)"/g)
    for (const match of componentMatches) {
      scripts.push(match[1])
    }
    
    // 匹配 preload-helper (link rel="modulepreload")
    const preloadMatches = content.matchAll(/href="([^"]+\.js)"/g)
    for (const match of preloadMatches) {
      scripts.push(match[1])
    }
    
    return Array.from(new Set(
      scripts
        .map(src => {
          const cleanSrc = src
            .replace(/^\/alumni-book-v2/, '')
            .replace(/^\/+/, '')
          return path.join(distDir, cleanSrc)
        })
        .filter(p => p.startsWith(distDir) && fs.existsSync(p))
    ))
  }

  const expectScriptsNotToReference = (scripts: string[], forbidden: string[]) => {
    for (const file of scripts) {
      const content = fs.readFileSync(file, 'utf-8')
      for (const token of forbidden) {
        expect(content, `${path.basename(file)} should not contain references to '${token}'`).not.toContain(token)
      }
    }
  }

  it('首页 HTML 及其关联的所有 JS 依赖链中不应该包含 ScrollTrigger 或是 gsap', () => {
    const htmlPath = path.join(distDir, 'index.html')
    expect(fs.existsSync(htmlPath)).toBe(true)
    
    const scripts = getReferencedScripts(htmlPath)
    expect(scripts.length).toBeGreaterThan(0)
    expectScriptsNotToReference(scripts, ['ScrollTrigger', 'gsap'])
  })

  it('时间轴页面 HTML 及其关联的所有 JS 依赖链中不应该包含 ScrollTrigger 或是 gsap', () => {
    const htmlPath = path.join(distDir, 'timeline/index.html')
    expect(fs.existsSync(htmlPath)).toBe(true)
    
    const scripts = getReferencedScripts(htmlPath)
    expect(scripts.length).toBeGreaterThan(0)
    expectScriptsNotToReference(scripts, ['ScrollTrigger', 'gsap'])
  })

  it('静态页面生成的 HTML 中的关键图片应包含宽度与高度或 aspect-ratio 样式，防止 CLS 抖动', () => {
    // 检查前言页和同学录页的静态头像、图表是否带有一些防抖占位
    const rosterHtmlPath = path.join(distDir, 'roster/index.html')
    if (fs.existsSync(rosterHtmlPath)) {
      const content = fs.readFileSync(rosterHtmlPath, 'utf-8')
      const imgTags = content.match(/<img[^>]+>/g) || []
      
      for (const tag of imgTags) {
        // 如果是头像或卡片图，需要确保有 width/height 或者是 style 中有 aspect-ratio / width / height
        const hasWidth = tag.includes('width=') || tag.includes('width:')
        const hasHeight = tag.includes('height=') || tag.includes('height:')
        const hasAspectRatio = tag.includes('aspect-ratio')
        
        expect(hasWidth || hasHeight || hasAspectRatio).toBe(true)
      }
    }
  })

  it('静态打包的所有 JS 体积不应严重超限', () => {
    const assets = fs.readdirSync(assetsDir)
    const jsFiles = assets.filter(file => file.endsWith('.js'))
    
    for (const file of jsFiles) {
      const size = fs.statSync(path.join(assetsDir, file)).size
      // 单个 JS 物理文件体积不应大于 200KB（除非是包含了大依赖的大 chunk，当前最大是 106KB 左右）
      expect(size).toBeLessThan(200 * 1024)
    }
  })

  it('museum redesign does not put graph or panorama modules on the homepage critical path', () => {
    const htmlPath = path.join(distDir, 'index.html')
    expect(fs.existsSync(htmlPath)).toBe(true)

    const scripts = getReferencedScripts(htmlPath)
    expectScriptsNotToReference(scripts, [
      'ClassGraph',
      'SeatMap',
      'Panorama',
      'ScrollTrigger',
      'gsap',
    ])
  })
})
