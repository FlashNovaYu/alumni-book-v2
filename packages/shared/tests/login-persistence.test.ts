import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearClassmateSession,
  clearSession,
  getClassmateStudent,
  getClassmateToken,
  getSessionName,
  setClassmateSession,
  setSessionName,
} from '../src/utils'

const sessionStorageStore = new Map<string, string>()
const localStorageStore = new Map<string, string>()

beforeEach(() => {
  sessionStorageStore.clear()
  localStorageStore.clear()

  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => sessionStorageStore.get(k) ?? null,
    setItem: (k: string, v: string) => sessionStorageStore.set(k, String(v)),
    removeItem: (k: string) => sessionStorageStore.delete(k),
    clear: () => sessionStorageStore.clear(),
  })

  vi.stubGlobal('localStorage', {
    getItem: (k: string) => localStorageStore.get(k) ?? null,
    setItem: (k: string, v: string) => localStorageStore.set(k, String(v)),
    removeItem: (k: string) => localStorageStore.delete(k),
    clear: () => localStorageStore.clear(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('同设备登录状态保留与回填恢复 (@alumni/shared)', () => {
  it('登录时同时写入 sessionStorage 和 localStorage', () => {
    setClassmateSession('token_abc_123', { name: '张三', slug: 'zhangsan' })

    expect(sessionStorageStore.get('classmate_account_token')).toBe('token_abc_123')
    expect(localStorageStore.get('classmate_account_token')).toBe('token_abc_123')

    expect(sessionStorageStore.get('classmate_name')).toBe('张三')
    expect(localStorageStore.get('classmate_name')).toBe('张三')

    const studentInSession = JSON.parse(sessionStorageStore.get('classmate_account_student')!)
    const studentInLocal = JSON.parse(localStorageStore.get('classmate_account_student')!)
    expect(studentInSession).toEqual({ name: '张三', slug: 'zhangsan' })
    expect(studentInLocal).toEqual({ name: '张三', slug: 'zhangsan' })
  })

  it('重新打开浏览器 (sessionStorage 为空) 时，自动从 localStorage 恢复凭据与身份并回填至 sessionStorage', () => {
    // 模拟仅 localStorage 存有上一次登录的数据
    localStorageStore.set('classmate_account_token', 'persisted_token_999')
    localStorageStore.set('classmate_account_student', JSON.stringify({ name: '李四', slug: 'lisi' }))
    localStorageStore.set('classmate_name', '李四')

    // sessionStorage 为空
    expect(sessionStorageStore.size).toBe(0)

    // 读取 token，应当从 localStorage 恢复并回填到 sessionStorage
    const token = getClassmateToken()
    expect(token).toBe('persisted_token_999')
    expect(sessionStorageStore.get('classmate_account_token')).toBe('persisted_token_999')

    // 读取 student，应当从 localStorage 恢复并回填到 sessionStorage
    const student = getClassmateStudent<{ name: string; slug: string }>()
    expect(student).toEqual({ name: '李四', slug: 'lisi' })
    expect(sessionStorageStore.get('classmate_account_student')).toBe(JSON.stringify({ name: '李四', slug: 'lisi' }))

    // 读取 name，应当恢复
    const name = getSessionName()
    expect(name).toBe('李四')
  })

  it('主动登出或清理会话时，彻底同时清除 sessionStorage 和 localStorage 中的所有凭据', () => {
    setClassmateSession('token_xyz', { name: '王五' })
    setSessionName('王五')

    expect(sessionStorageStore.size).toBeGreaterThan(0)
    expect(localStorageStore.size).toBeGreaterThan(0)

    clearClassmateSession()

    expect(getClassmateToken()).toBeNull()
    expect(getClassmateStudent()).toBeNull()
    expect(getSessionName()).toBeNull()

    expect(sessionStorageStore.get('classmate_account_token')).toBeUndefined()
    expect(localStorageStore.get('classmate_account_token')).toBeUndefined()
    expect(sessionStorageStore.get('classmate_account_student')).toBeUndefined()
    expect(localStorageStore.get('classmate_account_student')).toBeUndefined()
    expect(sessionStorageStore.get('classmate_name')).toBeUndefined()
    expect(localStorageStore.get('classmate_name')).toBeUndefined()
  })

  it('localStorage 中的数据坏掉或解析失败时静默清理并安全返回 null', () => {
    localStorageStore.set('classmate_account_student', 'invalid_json_{{')

    const student = getClassmateStudent()
    expect(student).toBeNull()
    expect(localStorageStore.get('classmate_account_student')).toBeUndefined()
  })
})
