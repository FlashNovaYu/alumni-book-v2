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
  beforeAll(() => {
    console.log('Building site-astro with SITE_BASE=/alumni-book-v2/ for integration testing...')
    const packageDir = resolve(__dirname, '..')
    const astroCache = join(packageDir, '.astro')
    const distPath = join(packageDir, 'dist')

    if (existsSync(astroCache)) rmSync(astroCache, { recursive: true, force: true })
    if (existsSync(distPath)) rmSync(distPath, { recursive: true, force: true })

    execSync('npx tsx scripts/fetch-data.ts && npx astro build', {
      cwd: packageDir,
      env: {
        ...process.env,
        SITE_BASE: '/alumni-book-v2/',
        VITE_WORKER_URL: 'https://alumni-book-api.chenyuhao2263.workers.dev',
        VITE_API_BASE_URL: 'https://alumni-book-api.chenyuhao2263.workers.dev'
      },
      stdio: 'inherit'
    })
  }, 60000)

  it('ensures all station links respect the base path SITE_BASE', () => {
    const htmlFiles = getAllHtmlFiles(distDir)
    expect(htmlFiles.length).toBeGreaterThan(0)

    // 匹配如 href="/preface"、href="/roster" 等，但忽略包含 base 前缀的链接
    const hardcodedLinkRegex = /href="\/(preface|roster|album|timeline|student)(?:\/|\?|#|")/g

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
      expect(rosterContent).toContain('href="/alumni-book-v2/preface')
      expect(rosterContent).toContain('href="/alumni-book-v2/timeline')
    }
  })

  it('admin build uses the nested SITE_BASE admin asset prefix', () => {
    const adminIndex = resolve(__dirname, '../../admin/dist/index.html')
    expect(existsSync(adminIndex)).toBe(true)
    const content = readFileSync(adminIndex, 'utf-8')
    expect(content).toContain('/alumni-book-v2/admin/assets/')
    expect(content).not.toContain('src="/admin/assets/')
  })

  it('404 page routes admin links through the GitHub Pages base path', () => {
    const notFoundPath = join(distDir, '404.html')
    expect(existsSync(notFoundPath)).toBe(true)
    const content = readFileSync(notFoundPath, 'utf-8')
    expect(content).toContain('href="/alumni-book-v2/admin/"')
    expect(content).toContain("siteBase + 'admin/#/'")
    expect(content).not.toContain("window.location.replace('/admin/#/'")
  })

  it('admin production build does not emit source maps', () => {
    const adminAssets = resolve(__dirname, '../../admin/dist/assets')
    expect(existsSync(adminAssets)).toBe(true)
    const maps = readdirSync(adminAssets).filter((name) => name.endsWith('.map'))
    expect(maps).toEqual([])
  })
})
