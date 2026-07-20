import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertDedicatedChatSlug,
  smokeSelfHostedChat,
} from './smoke-selfhosted-chat.mjs'

const RELEASE_SHA = '1234567890abcdef1234567890abcdef12345678'
const MESSAGE_ID = 'abcdef12-3456-7890-abcd-ef1234567890'
const CONVERSATION_ID = 'conv_smoke-recipient_smoke-sender'

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function success(data, status = 200) {
  return jsonResponse(status, { success: true, data })
}

function conversation(unreadCount) {
  return {
    id: CONVERSATION_ID,
    peer: { slug: 'smoke-peer', name: 'Smoke Peer' },
    lastMessage: {
      id: MESSAGE_ID,
      senderSlug: 'smoke-sender',
      body: '不应出现在日志中的测试正文',
      createdAt: '2026-07-20T00:00:00.000Z',
    },
    unreadCount,
    updatedAt: '2026-07-20T00:00:00.000Z',
  }
}

function message() {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderSlug: 'smoke-sender',
    recipientSlug: 'smoke-recipient',
    body: '不应出现在日志中的测试正文',
    createdAt: '2026-07-20T00:00:00.000Z',
  }
}

function createHappyFetch() {
  const calls = []
  let senderConversationReads = 0
  let recipientConversationReads = 0
  let syncReads = 0

  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url)
    const path = `${parsed.pathname}${parsed.search}`
    const token = new Headers(init.headers).get('X-Classmate-Token')
    calls.push({ path, method: init.method || 'GET', token, body: init.body })

    if (path === '/release.json') return jsonResponse(200, { source: RELEASE_SHA })
    if (path === '/api/direct-conversations' && (init.method || 'GET') === 'GET') {
      if (token === 'sender-secret-token') {
        senderConversationReads += 1
        return success({ items: senderConversationReads === 1 ? [] : [conversation(0)] })
      }
      recipientConversationReads += 1
      return success({ items: [conversation(recipientConversationReads === 1 ? 1 : 0)] })
    }
    if (path === '/api/direct-conversations' && init.method === 'POST') {
      const duplicate = calls.filter(call => call.path === path && call.method === 'POST').length > 1
      return success({ conversation: conversation(0), message: message() }, duplicate ? 200 : 201)
    }
    if (path === `/api/direct-conversations/${CONVERSATION_ID}/messages?limit=30`) {
      return success({ items: [message()], nextCursor: null })
    }
    if (path.startsWith('/api/inbox/sync')) {
      syncReads += 1
      return success({
        cursor: `cursor-${syncReads}`,
        conversations: syncReads === 1 ? [] : [conversation(1)],
        messages: syncReads === 1 ? [] : [message()],
        notifications: [],
        unread: { directUnread: syncReads === 1 ? 0 : 1, notificationUnread: 0, totalUnread: syncReads === 1 ? 0 : 1 },
      })
    }
    if (path === `/api/direct-conversations/${CONVERSATION_ID}/read` && init.method === 'PUT') {
      return jsonResponse(200, { success: true })
    }
    throw new Error(`未处理的 mock 请求：${init.method || 'GET'} ${path}`)
  }

  return { fetchImpl, calls }
}

const baseOptions = {
  baseUrl: 'https://example.test',
  senderSlug: 'smoke-sender',
  recipientSlug: 'smoke-recipient',
  senderToken: 'sender-secret-token',
  recipientToken: 'recipient-secret-token',
  pollIntervalMs: 0,
  log: () => {},
}

test('拒绝非专用测试前缀的账号且不会发起请求', async () => {
  assert.throws(() => assertDedicatedChatSlug('real-classmate', 'CHAT_SENDER_SLUG'), /专用测试账号/)

  let requested = false
  await assert.rejects(
    smokeSelfHostedChat({
      ...baseOptions,
      senderSlug: 'real-classmate',
      fetchImpl: async () => {
        requested = true
        throw new Error('不应请求')
      },
    }),
    /专用测试账号/,
  )
  assert.equal(requested, false)
})

test('同一 nonce 只写入一次并完成收件、已读和发送方最终确认', async () => {
  const { fetchImpl, calls } = createHappyFetch()
  const evidence = []

  const result = await smokeSelfHostedChat({
    ...baseOptions,
    fetchImpl,
    log: line => evidence.push(line),
  })

  assert.equal(result.releaseSha, RELEASE_SHA)
  assert.equal(result.messageId, MESSAGE_ID)

  const sends = calls.filter(call => call.path === '/api/direct-conversations' && call.method === 'POST')
  assert.equal(sends.length, 2)
  assert.deepEqual(JSON.parse(sends[0].body), JSON.parse(sends[1].body))
  assert.match(JSON.parse(sends[0].body).clientNonce, /^chat-smoke:/)

  const read = calls.find(call => call.path === `/api/direct-conversations/${CONVERSATION_ID}/read`)
  assert.deepEqual(JSON.parse(read.body), { throughMessageId: MESSAGE_ID })
  assert.ok(calls.some(call => call.path.startsWith('/api/inbox/sync?cursor=')))

  const output = evidence.join('\n')
  assert.match(output, /path=\/api\/direct-conversations/)
  assert.match(output, /status=201/)
  assert.match(output, /messageId=abcdef12/)
  assert.match(output, new RegExp(`releaseSha=${RELEASE_SHA}`))
  assert.equal(output.includes(CONVERSATION_ID), false)
  assert.equal(output.includes('cursor-1'), false)
})

test('请求超时会终止 smoke 而不会永久等待', async () => {
  const fetchImpl = async (url) => {
    if (new URL(url).pathname === '/release.json') return jsonResponse(200, { source: RELEASE_SHA })
    return new Promise(() => {})
  }

  await assert.rejects(
    smokeSelfHostedChat({ ...baseOptions, fetchImpl, requestTimeoutMs: 10 }),
    /请求超时/,
  )
})

test('证据和失败信息不泄露 token、正文、slug、基址或服务端错误体', async () => {
  const evidence = []
  const secrets = [
    baseOptions.senderToken,
    baseOptions.recipientToken,
    baseOptions.senderSlug,
    baseOptions.recipientSlug,
    baseOptions.baseUrl,
    '不应出现在日志中的测试正文',
    '/var/lib/alumni-book/data/alumni.sqlite',
  ]
  const fetchImpl = async (url) => {
    if (new URL(url).pathname === '/release.json') return jsonResponse(200, { source: RELEASE_SHA })
    return jsonResponse(500, {
      success: false,
      message: `${secrets.join(' ')} server-secret-detail`,
    })
  }

  let failure
  try {
    await smokeSelfHostedChat({ ...baseOptions, fetchImpl, log: line => evidence.push(line) })
  } catch (error) {
    failure = String(error)
  }

  assert.match(failure, /path=\/api\/direct-conversations status=500/)
  const observable = `${evidence.join('\n')}\n${failure}`
  for (const secret of secrets) assert.equal(observable.includes(secret), false)
  assert.equal(observable.includes('server-secret-detail'), false)
})

test('收件轮询超过五秒窗口仍未出现目标消息时失败', async () => {
  const { fetchImpl: happyFetch } = createHappyFetch()
  let now = 0
  const fetchImpl = async (url, init) => {
    const parsed = new URL(url)
    if (parsed.pathname === '/api/inbox/sync') {
      return success({
        cursor: `cursor-${now}`,
        conversations: [],
        messages: [],
        notifications: [],
        unread: { directUnread: 0, notificationUnread: 0, totalUnread: 0 },
      })
    }
    return happyFetch(url, init)
  }

  await assert.rejects(
    smokeSelfHostedChat({
      ...baseOptions,
      fetchImpl,
      now: () => now,
      sleep: async (ms) => { now += Math.max(ms, 1000) },
      pollIntervalMs: 1000,
      pollTimeoutMs: 5000,
    }),
    /五秒轮询窗口内未收到目标消息/,
  )
})
