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

  it('fetch 阶段外部取消时保留调用方 signal.reason', async () => {
    const controller = new AbortController()
    const reason = new DOMException('用户取消发送', 'AbortError')
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const request = requestClassmateApi('https://api.example.test', '/api/inbox/sync', { signal: controller.signal })
    controller.abort(reason)

    await expect(request).rejects.toBe(reason)
    expect(fetchMock.mock.calls[0][1]?.signal?.reason).toBe(reason)
  })

  it('响应体阶段外部取消时立即结束并保留调用方 signal.reason', async () => {
    const controller = new AbortController()
    const reason = new DOMException('离开信箱', 'AbortError')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => new Promise<unknown>(() => {}),
    } as Response)))

    const request = requestClassmateApi('https://api.example.test', '/api/inbox/sync', { signal: controller.signal })
    await Promise.resolve()
    controller.abort(reason)

    await expect(request).rejects.toBe(reason)
  })

  it('未显式配置时使用 15 秒默认超时', async () => {
    vi.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      requestSignal = init?.signal ?? undefined
      requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const request = requestClassmateApi('https://api.example.test', '/api/inbox/sync')
    const result = expect(request).rejects.toMatchObject({ name: 'ApiRequestError', status: 408 })
    await vi.advanceTimersByTimeAsync(14_999)
    expect(requestSignal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await result
    expect(requestSignal?.aborted).toBe(true)
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

  it('sync 先于 POST 成功返回时按 clientNonce 和服务端 ID 归并为一条', async () => {
    let resolvePost!: (message: typeof startedMessage) => void
    apiMocks.fetchDirectConversationHistory.mockResolvedValue({ items: [], nextCursor: null })
    apiMocks.sendDirectMessage.mockImplementation(() => new Promise(resolve => { resolvePost = resolve }))
    const inbox = useInbox('https://api.example.test')
    await inbox.selectConversation(conversation)

    const sending = inbox.send('竞态消息')
    const clientNonce = apiMocks.sendDirectMessage.mock.calls[0][2].clientNonce
    const synced = { ...startedMessage, body: '竞态消息', clientNonce }
    apiMocks.syncInbox.mockResolvedValue({
      cursor: 'sync-race-success',
      conversations: [],
      messages: [synced],
      notifications: [],
      unread: { directUnread: 0, notificationUnread: 0, totalUnread: 0 },
    })
    await inbox.syncNow()
    expect(inbox.messages.value).toEqual([{ ...synced, deliveryState: 'sent' }])

    resolvePost(synced)
    await sending
    expect(inbox.messages.value).toEqual([{ ...synced, deliveryState: 'sent' }])
  })

  it('sync 先于 POST 超时返回时保留唯一已发送消息而不降级为失败', async () => {
    let rejectPost!: (error: Error) => void
    apiMocks.fetchDirectConversationHistory.mockResolvedValue({ items: [], nextCursor: null })
    apiMocks.sendDirectMessage.mockImplementation(() => new Promise((_resolve, reject) => { rejectPost = reject }))
    const inbox = useInbox('https://api.example.test')
    await inbox.selectConversation(conversation)

    const sending = inbox.send('已由同步确认')
    const clientNonce = apiMocks.sendDirectMessage.mock.calls[0][2].clientNonce
    const synced = { ...startedMessage, body: '已由同步确认', clientNonce }
    apiMocks.syncInbox.mockResolvedValue({
      cursor: 'sync-race-timeout',
      conversations: [],
      messages: [synced],
      notifications: [],
      unread: { directUnread: 0, notificationUnread: 0, totalUnread: 0 },
    })
    await inbox.syncNow()

    rejectPost(new ApiRequestError('请求超时，请稍后重试', 408))
    await sending
    expect(inbox.messages.value).toEqual([{ ...synced, deliveryState: 'sent' }])
    expect(inbox.error.value).toBeNull()
  })
})

describe('信箱同步退避', () => {
  it('同步永不返回时主动取消、释放请求并按退避时间再次调度', async () => {
    expect(useVisibilityPolling).toBeDefined()
    const source = await vi.importActual<typeof import('../src/composables/useVisibilityPolling')>('../src/composables/useVisibilityPolling')
    const signals: AbortSignal[] = []
    vi.useFakeTimers()
    const scope = effectScope()
    const polling = scope.run(() => source.useVisibilityPolling({
      initialDelay: 0,
      baseDelay: 1_000,
      maxDelay: 100,
      timeoutMs: 50,
      run: async (signal) => {
        signals.push(signal)
        return new Promise<void>(() => {})
      },
      }))!

    await vi.advanceTimersByTimeAsync(0)
    expect(signals).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(50)
    expect(signals[0].aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    expect(signals).toHaveLength(2)
    polling.stop()
    scope.stop()
  })

  it('信箱轮询显式使用 15 秒超时', async () => {
    const source = await (await import('node:fs/promises')).readFile(new URL('../src/composables/useInbox.ts', import.meta.url), 'utf8')
    expect(source).toContain('timeoutMs: 15_000')
  })
})

describe('私聊记录滚动契约', () => {
  it('接近底部或自己发送时滚动，远离底部收件时显示跳转按钮', async () => {
    const source = await (await import('node:fs/promises')).readFile(new URL('../src/components/DirectConversationView.vue', import.meta.url), 'utf8')
    expect(source).toContain('watch(() => props.messages')
    expect(source).toContain('scrollHeight')
    expect(source).toContain('scrollTo')
    expect(source).toContain('scrollTop')
    expect(source).toContain("senderSlug === props.currentSlug")
    expect(source).toContain('hasNewMessages')
    expect(source).toContain('跳到最新消息')
  })
})
