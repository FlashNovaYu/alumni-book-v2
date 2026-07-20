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

  it('uses a semantic login form and a single submit path for keyboard and button activation', () => {
    const loginPath = path.resolve(__dirname, '../src/components/ClassmateLoginBook.vue')
    const source = fs.readFileSync(loginPath, 'utf-8')

    expect(source).toContain('<form class="login-form" @submit.prevent="handleLogin">')
    expect(source).toContain('<button type="submit" class="btn-primary login-btn"')
    expect(source).not.toContain('@keydown.enter="handleLogin"')
    expect(source).toContain('v-if="error" class="error-msg" role="alert"')
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

  it('为同学自助图片上传提交压缩后的响应式变体', () => {
    const selfEditPath = path.resolve(__dirname, '../src/components/SelfEditPanel.vue')
    const selfEdit = fs.readFileSync(selfEditPath, 'utf-8')

    expect(selfEdit).toContain('generateImageVariants')
    expect(selfEdit).toContain('appendImageVariants')
    expect(selfEdit).toMatch(/appendImageVariants\(fd, variants, type === 'avatar' \? 'avatars' : 'backgrounds', props\.studentSlug\)/)
  })
})
