import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

const distDir = resolve(__dirname, '../dist')

function getAllHtmlFiles(dir: string, filesList: string[] = []): string[] {
  if (!existsSync(dir)) return filesList
  for (const file of readdirSync(dir)) {
    const full = join(dir, file)
    if (statSync(full).isDirectory()) getAllHtmlFiles(full, filesList)
    else if (full.endsWith('.html')) filesList.push(full)
  }
  return filesList
}

describe('Static privacy smoke test', () => {
  it('does not publish seat or dorm values in the generated classmate directory', () => {
    const classmates = JSON.parse(readFileSync(resolve(__dirname, '../public/data/classmates.json'), 'utf-8'))

    expect(classmates.length).toBeGreaterThan(0)
    for (const classmate of classmates) {
      expect(classmate).not.toHaveProperty('seatNo')
      expect(classmate).not.toHaveProperty('dormNo')
    }
  })

  it('sets security headers without relaxing the owner page iframe sandbox', () => {
    const headers = readFileSync(resolve(__dirname, '../public/_headers'), 'utf-8')
    const profile = readFileSync(resolve(__dirname, '../src/components/StudentProfile.vue'), 'utf-8')

    expect(headers).toContain('X-Content-Type-Options: nosniff')
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin')
    expect(headers).toContain('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()')
    expect(headers).toContain("Content-Security-Policy: base-uri 'self'; object-src 'none'; frame-ancestors 'self'")
    expect(profile).toContain('sandbox="allow-scripts"')
    expect(profile).not.toContain('allow-same-origin')
  })

  it('does not render obvious private contact labels with values in generated student pages', () => {
    const htmlFiles = getAllHtmlFiles(join(distDir, 'student'))
    expect(htmlFiles.length).toBeGreaterThan(0)

    const suspiciousPatterns = [
      /手机<\/span>\s*<span[^>]*>\s*1[3-9]\d{9}/,
      /微信<\/span>\s*<span[^>]*>\s*[^<]{3,}/,
      /常住地<\/span>\s*<span[^>]*>\s*[^<]{2,}/,
    ]

    const violations: string[] = []
    for (const file of htmlFiles) {
      const content = readFileSync(file, 'utf-8')
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(content)) {
          violations.push(`${file} matched ${pattern}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
