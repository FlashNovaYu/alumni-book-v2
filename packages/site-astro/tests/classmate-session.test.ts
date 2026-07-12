import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@alumni/shared', async () => {
  const utils = await import('../../shared/src/utils')
  return {
    clearClassmateSession: utils.clearClassmateSession,
    getClassmateToken: utils.getClassmateToken,
  }
})

import { requestClassmateApi } from '../src/api/classmateRequest'
import { changeClassmatePassword, fetchClassmateAdminEntry, fetchClassmateMe, logoutClassmate } from '../src/api/classmateAuth'
import { handleClassmateUnauthorized, SESSION_EXPIRED_MESSAGE } from '../src/api/classmateSession'
import { fetchJsonIfChanged } from '../src/utils/deferredFetch'
import fs from 'fs'
import path from 'path'

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
const redirect = vi.fn()
const fetchMock = vi.fn()
const sessionStorageMock = new Map<string, string>()

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorageMock.clear()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { assign: redirect } },
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => sessionStorageMock.get(key) ?? null,
      setItem: (key: string, value: string) => sessionStorageMock.set(key, value),
      removeItem: (key: string) => sessionStorageMock.delete(key),
      clear: () => sessionStorageMock.clear(),
    },
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow)
  } else {
    delete (globalThis as { window?: unknown }).window
  }
  if (originalSessionStorage) {
    Object.defineProperty(globalThis, 'sessionStorage', originalSessionStorage)
  } else {
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage
  }
})

describe('同学会话失效处理', () => {
  it('清理会话、跳回站点入口并抛出固定中文错误', () => {
    sessionStorage.setItem('classmate_account_token', 'expired-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学' }))
    sessionStorage.setItem('classmate_name', '测试同学')

    expect(() => handleClassmateUnauthorized()).toThrow(SESSION_EXPIRED_MESSAGE)
    expect(sessionStorage.getItem('classmate_account_token')).toBeNull()
    expect(sessionStorage.getItem('classmate_account_student')).toBeNull()
    expect(sessionStorage.getItem('classmate_name')).toBeNull()
    expect(redirect).toHaveBeenCalledWith(import.meta.env.BASE_URL || '/')
  })

  it('统一请求客户端收到真实 401 时清理会话', async () => {
    sessionStorage.setItem('classmate_account_token', 'active-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学' }))
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, message: '令牌已过期' }), { status: 401 }))

    await expect(requestClassmateApi('https://api.example.test', '/api/inbox/summary')).rejects.toThrow(SESSION_EXPIRED_MESSAGE)
    expect(sessionStorage.getItem('classmate_account_token')).toBeNull()
    expect(redirect).toHaveBeenCalledWith(import.meta.env.BASE_URL || '/')
  })

  it.each([
    ['修改密码', () => changeClassmatePassword('https://api.example.test', '旧密码', '新密码')],
    ['退出登录', () => logoutClassmate('https://api.example.test')],
    ['读取账号信息', () => fetchClassmateMe('https://api.example.test')],
    ['读取管理入口', () => fetchClassmateAdminEntry('https://api.example.test')],
  ])('%s 接口收到真实 401 时统一清理会话并跳转', async (_name, request) => {
    sessionStorage.setItem('classmate_account_token', 'expired-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学' }))
    sessionStorage.setItem('classmate_name', '测试同学')
    sessionStorage.setItem('alumni_nav_admin_entry', JSON.stringify({ studentSlug: 'test', available: true }))
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, message: '令牌已过期' }), { status: 401 }))

    await expect(request()).rejects.toThrow(SESSION_EXPIRED_MESSAGE)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('classmate_account_token')).toBeNull()
    expect(sessionStorage.getItem('alumni_nav_admin_entry')).toBeNull()
    expect(sessionStorage.getItem('classmate_account_student')).toBeNull()
    expect(sessionStorage.getItem('classmate_name')).toBeNull()
    expect(redirect).toHaveBeenCalledWith(import.meta.env.BASE_URL || '/')
  })

  it('非 401 的账号接口失败不会清理会话或跳转', async () => {
    sessionStorage.setItem('classmate_account_token', 'active-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学' }))
    sessionStorage.setItem('classmate_name', '测试同学')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, message: '原密码不正确' }), { status: 400 }))

    await expect(changeClassmatePassword('https://api.example.test', '错误旧密码', '新密码')).rejects.toThrow('原密码不正确')
    expect(sessionStorage.getItem('classmate_account_token')).toBe('active-token')
    expect(sessionStorage.getItem('classmate_account_student')).toBe(JSON.stringify({ name: '测试同学' }))
    expect(sessionStorage.getItem('classmate_name')).toBe('测试同学')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('个人页延迟刷新携带同学令牌收到 401 时统一清理会话并跳转', async () => {
    sessionStorage.setItem('classmate_account_token', 'expired-token')
    sessionStorage.setItem('classmate_account_student', JSON.stringify({ name: '测试同学' }))
    sessionStorage.setItem('classmate_name', '测试同学')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, message: '令牌已过期' }), { status: 401 }))

    await expect(fetchJsonIfChanged('/api/students/test', 'student_test', { 'X-Classmate-Token': 'expired-token' })).rejects.toThrow(SESSION_EXPIRED_MESSAGE)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('classmate_account_token')).toBeNull()
    expect(sessionStorage.getItem('classmate_account_student')).toBeNull()
    expect(sessionStorage.getItem('classmate_name')).toBeNull()
    expect(redirect).toHaveBeenCalledWith(import.meta.env.BASE_URL || '/')
  })

  it('携带同学令牌的组件以统一处理器标记 401，编辑保存不递归重试或清旧缓存', () => {
    const componentPath = (name: string) => path.resolve(__dirname, '../src/components', name)
    const selfEdit = fs.readFileSync(componentPath('SelfEditPanel.vue'), 'utf-8')
    const messageWall = fs.readFileSync(componentPath('MessageWall.vue'), 'utf-8')
    const topNav = fs.readFileSync(componentPath('TopNav.astro'), 'utf-8')
    const classmateRequest = fs.readFileSync(path.resolve(__dirname, '../src/api/classmateRequest.ts'), 'utf-8')
    const navRuntime = fs.readFileSync(path.resolve(__dirname, '../src/scripts/navRuntime.ts'), 'utf-8')
    const accountCenter = fs.readFileSync(componentPath('AccountCenter.vue'), 'utf-8')
    const topNavSession = fs.readFileSync(componentPath('TopNavSession.vue'), 'utf-8')
    const unauthorizedBranch = /if\s*\(\s*res\.status\s*===\s*401\s*\)\s*\{?\s*(?:alert\(\s*SESSION_EXPIRED_MESSAGE\s*\);?\s*)?handleClassmateUnauthorized\(\)/

    for (const source of [selfEdit, messageWall, classmateRequest]) {
      expect(source).toMatch(/import\s*\{(?=[^}]*\bhandleClassmateUnauthorized\b)[^}]*\}\s*from\s*['"][^'"]*classmateSession['"]/)
      expect(source).toMatch(unauthorizedBranch)
    }
    expect(selfEdit.match(new RegExp(unauthorizedBranch.source, 'g'))).toHaveLength(2)
    expect(selfEdit).not.toMatch(/return\s+save\s*\(/)
    expect(selfEdit).not.toMatch(/classmate_token_\$\{props\.studentSlug\}/)
    expect(messageWall).not.toMatch(/classmate_token_\$\{props\.studentSlug\}/)
    expect(navRuntime).toContain('fetchInboxSummary')
    expect(navRuntime).toContain('fetchClassmateAdminEntry')
    expect(topNav).toContain('data-nav-admin-entry')
    expect(accountCenter).toContain('props.siteBase')
    expect(topNavSession).toMatch(/import\.meta\.env\.BASE_URL\s*\|\|\s*'\/'/)
    for (const source of [accountCenter, topNavSession]) expect(source).not.toMatch(/window\.location\.href\s*=\s*'\/'/)
  })
})
