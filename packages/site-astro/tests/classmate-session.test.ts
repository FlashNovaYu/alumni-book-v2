import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@alumni/shared', async () => {
  const utils = await import('../../shared/src/utils')
  return {
    clearClassmateSession: utils.clearClassmateSession,
    getClassmateToken: utils.getClassmateToken,
  }
})

import { fetchRecipientDirectory } from '../src/api/postOffice'
import { handleClassmateUnauthorized, SESSION_EXPIRED_MESSAGE } from '../src/api/classmateSession'

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

  it('不会把公开同学目录的 401 误判为会话失效', async () => {
    sessionStorage.setItem('classmate_account_token', 'active-token')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: '同学目录暂不可用' }), { status: 401 }))

    await expect(fetchRecipientDirectory('https://api.example.test')).rejects.toThrow('同学目录暂不可用')
    expect(sessionStorage.getItem('classmate_account_token')).toBe('active-token')
    expect(redirect).not.toHaveBeenCalled()
  })
})
