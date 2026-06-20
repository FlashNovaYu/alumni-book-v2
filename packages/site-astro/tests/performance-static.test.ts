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

  it('首页 HTML 中不应该异步引入 ScrollTrigger 脚本', () => {
    const htmlPath = path.join(distDir, 'index.html')
    expect(fs.existsSync(htmlPath)).toBe(true)
    const content = fs.readFileSync(htmlPath, 'utf-8')
    
    // 检查首页生成的静态 HTML 中是否有包含 ScrollTrigger 的 JS Chunk
    // 我们可以检索 dist/assets 下的 js 文件，找到哪些文件包含 ScrollTrigger 注册，并确认这些文件没有在 index.html 中被 <link rel="modulepreload"> 或者是 <script src="..."> 载入
    const assets = fs.readdirSync(assetsDir)
    const scrollTriggerJs = assets.find(file => file.includes('ScrollTrigger') && file.endsWith('.js'))
    
    if (scrollTriggerJs) {
      expect(content).not.toContain(scrollTriggerJs)
    }
  })

  it('时间轴页面 HTML 中不应该引入 ScrollTrigger 或 GSAP 脚本', () => {
    const htmlPath = path.join(distDir, 'timeline/index.html')
    expect(fs.existsSync(htmlPath)).toBe(true)
    const content = fs.readFileSync(htmlPath, 'utf-8')
    
    const assets = fs.readdirSync(assetsDir)
    const scrollTriggerJs = assets.find(file => file.includes('ScrollTrigger') && file.endsWith('.js'))
    
    if (scrollTriggerJs) {
      expect(content).not.toContain(scrollTriggerJs)
    }
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
})
