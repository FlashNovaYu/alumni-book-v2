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

  it('allows only a verified administrator session to preview protected pages and consumes site identity', () => {
    const layout = fs.readFileSync(path.resolve(__dirname, '../src/layouts/MainLayout.astro'), 'utf-8')
    const footer = fs.readFileSync(path.resolve(__dirname, '../src/components/AppFooter.astro'), 'utf-8')

    expect(layout).toContain("sessionStorage.getItem('admin_token')")
    expect(layout).toContain('/api/auth/verify')
    expect(layout).toContain("Authorization: 'Bearer ' + adminToken")
    expect(layout).toContain('VITE_WORKER_URL')
    expect(layout).toContain('identity.shareDescription')
    expect(layout).toContain('[data-site-footer]')
    expect(layout).not.toContain('previewToken')
    expect(footer).toContain('data-site-footer')
  })

  it('gives student creation and profile inputs Chinese accessible names', () => {
    const studentsPath = path.resolve(__dirname, '../../admin/src/views/StudentsView.vue')
    const selfEditPath = path.resolve(__dirname, '../src/components/SelfEditPanel.vue')
    const messageWallPath = path.resolve(__dirname, '../src/components/MessageWall.vue')

    const students = fs.readFileSync(studentsPath, 'utf-8')
    const selfEdit = fs.readFileSync(selfEditPath, 'utf-8')
    const messageWall = fs.readFileSync(messageWallPath, 'utf-8')

    expect(students).toContain('aria-label="新建学生姓名"')
    expect(students).toContain('aria-label="新建学生链接标识"')
    expect(selfEdit).toContain('aria-label="昵称"')
    expect(selfEdit).toContain('aria-label="毕业年份"')
    expect(selfEdit).toContain('aria-label="MBTI 类型"')
    expect(selfEdit).toContain(':aria-label="f.label"')
    expect(selfEdit).toContain('第 ${idx + 1} 个小传标题')
    expect(messageWall).toContain('aria-label="留言内容"')
  })
})
