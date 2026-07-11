import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@alumni/shared', () => ({
  clearClassmateSession: vi.fn(),
  getClassmateToken: vi.fn(),
}))

import { clearClassmateSession } from '@alumni/shared'
import { fetchRecipientDirectory } from '../src/api/postOffice'
import { handleClassmateUnauthorized, SESSION_EXPIRED_MESSAGE } from '../src/api/classmateSession'

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const redirect = vi.fn()
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { assign: redirect } },
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
})

describe('同学会话失效处理', () => {
  it('清理会话、跳回站点入口并抛出固定中文错误', () => {
    expect(() => handleClassmateUnauthorized()).toThrow(SESSION_EXPIRED_MESSAGE)
    expect(clearClassmateSession).toHaveBeenCalledOnce()
    expect(redirect).toHaveBeenCalledWith(import.meta.env.BASE_URL || '/')
  })

  it('不会把公开同学目录的 401 误判为会话失效', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: '同学目录暂不可用' }), { status: 401 }))

    await expect(fetchRecipientDirectory('https://api.example.test')).rejects.toThrow('同学目录暂不可用')
    expect(clearClassmateSession).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })
})
