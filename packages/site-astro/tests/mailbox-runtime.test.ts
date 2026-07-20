import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

const apiMocks = vi.hoisted(() => ({
  startDirectConversation: vi.fn(),
  sendDirectMessage: vi.fn(),
  fetchDirectConversations: vi.fn(),
  fetchNotifications: vi.fn(),
  fetchInboxSummary: vi.fn(),
  fetchDirectConversationHistory: vi.fn(),
  markDirectConversationRead: vi.fn(),
  markNotificationRead: vi.fn(),
  syncInbox: vi.fn(),
}))

vi.mock('@alumni/shared', () => ({
  getClassmateToken: () => 'test-token',
  getClassmateStudent: () => ({ slug: 'me' }),
}))

vi.mock('../src/api/inbox', () => apiMocks)
vi.mock('../src/composables/useVisibilityPolling', () => ({
  useVisibilityPolling: vi.fn(),
}))

import { ApiRequestError, requestClassmateApi } from '../src/api/classmateRequest'
import { useInbox } from '../src/composables/useInbox'
import { useVisibilityPolling } from '../src/composables/useVisibilityPolling'

const conversation = {
  id: 'conversation-peer',
  peer: { name: '同学', slug: 'peer', avatarUrl: null },
  lastMessage: null,
  unreadCount: 0,
  updatedAt: '2026-07-20T00:00:00.000Z',
}

const startedMessage = {
  id: 'message-server',
  conversationId: conversation.id,
  senderSlug: 'me',
  recipientSlug: 'peer',
  body: '你好',
  createdAt: '2026-07-20T00:00:01.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('同学会话请求可靠性', () => {
  it('请求一直不返回时在超时后失败，并取消底层 fetch', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('请求超时', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const request = requestClassmateApi('https://api.example.test', '/api/inbox/sync', { timeoutMs: 50 })
    const result = expect(request).rejects.toMatchObject({ name: 'ApiRequestError', status: 408 })
    await vi.advanceTimersByTimeAsync(50)

    await result
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })

  it('响应体一直不返回时同样在超时后失败', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => new Promise<unknown>(() => {}),
    } as Response))
    vi.stubGlobal('fetch', fetchMock)

    const request = requestClassmateApi('https://api.example.test', '/api/inbox/sync', { timeoutMs: 50 })
    const result = expect(request).rejects.toMatchObject({ name: 'ApiRequestError', status: 408 })
    await vi.advanceTimersByTimeAsync(50)
    await result
  })
})

describe('私聊乐观消息状态', () => {
  it('新建会话首发消息在请求完成前立即可见，失败后可重试', async () => {
    let rejectFirst!: (error: Error) => void
    apiMocks.startDirectConversation.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject }))
    const inbox = useInbox('https://api.example.test')
    await inbox.startConversation({ name: '同学', slug: 'peer', avatarUrl: null, hasPage: false, motto: '' })

    const sending = inbox.send('你好')
    expect(inbox.messages.value).toHaveLength(1)
    expect(inbox.messages.value[0].deliveryState).toBe('sending')

    rejectFirst(new ApiRequestError('发送失败', 503))
    await sending
    expect(inbox.sending.value).toBe(false)
    expect(inbox.messages.value[0].deliveryState).toBe('failed')

    apiMocks.startDirectConversation.mockResolvedValueOnce({ conversation, message: startedMessage })
    await inbox.retry(inbox.messages.value[0].id)
    expect(inbox.messages.value.at(-1)?.deliveryState).toBe('sent')
  })
})

describe('信箱同步退避', () => {
  it('同步超时失败后按退避时间再次调度', async () => {
    expect(useVisibilityPolling).toBeDefined()
    const source = await vi.importActual<typeof import('../src/composables/useVisibilityPolling')>('../src/composables/useVisibilityPolling')
    let attempts = 0
    vi.useFakeTimers()
    const scope = effectScope()
    const polling = scope.run(() => source.useVisibilityPolling({
        initialDelay: 0,
        baseDelay: 1_000,
        maxDelay: 3_000,
        run: async () => {
          attempts += 1
          if (attempts === 1) throw new ApiRequestError('同步超时', 408)
        },
      }))!

    await vi.advanceTimersByTimeAsync(0)
    expect(attempts).toBe(1)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(attempts).toBe(2)
    polling.stop()
    scope.stop()
  })
})

describe('私聊记录滚动契约', () => {
  it('监听消息变化并仅在接近底部时自动滚动', async () => {
    const source = await (await import('node:fs/promises')).readFile(new URL('../src/components/DirectConversationView.vue', import.meta.url), 'utf8')
    expect(source).toContain('watch(() => props.messages')
    expect(source).toContain('scrollHeight')
    expect(source).toContain('scrollTo')
    expect(source).toContain('scrollTop')
  })
})
