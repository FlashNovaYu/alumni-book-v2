// packages/site-astro/tests/classmate-auth-static.test.ts
// CCSwitch: 静态检查前台登录逻辑，确保不越过 setClassmateSession 直接设置 Session。

import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('classmate account login frontend', () => {
  it('uses account token storage instead of name-only session as primary auth', () => {
    const loginPath = path.resolve(__dirname, '../src/components/ClassmateLoginBook.vue')
    // 如果文件不存在，直接抛错以便测试失败
    if (!fs.existsSync(loginPath)) {
      throw new Error(`Login component not found at ${loginPath}`)
    }
    const source = fs.readFileSync(loginPath, 'utf-8')
    expect(source).toContain('setClassmateSession')
    expect(source).not.toContain("sessionStorage.setItem('classmate_name'")
  })

  it('Layout and navigation files should use getClassmateStudent / clearClassmateSession instead of bare sessionStorage', () => {
    const layoutPath = path.resolve(__dirname, '../src/layouts/MainLayout.astro')
    const navPath = path.resolve(__dirname, '../src/components/TopNav.vue')

    if (fs.existsSync(layoutPath)) {
      const source = fs.readFileSync(layoutPath, 'utf-8')
      expect(source).toContain('classmate_account_token')
      expect(source).not.toContain('classmate_student')
      expect(source).not.toContain('classmate_name')
      expect(source).not.toContain("sessionStorage.getItem('classmate_name'")
    }
    if (fs.existsSync(navPath)) {
      const source = fs.readFileSync(navPath, 'utf-8')
      expect(source).not.toContain("sessionStorage.removeItem('classmate_name'")
    }
  })
})
