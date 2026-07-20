import { randomUUID } from 'node:crypto'

const DEFAULT_POLL_TIMEOUT_MS = 5_000
const DEFAULT_POLL_INTERVAL_MS = 500
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000
const SHA_PATTERN = /^[0-9a-f]{40}$/i

class ChatSmokeError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ChatSmokeError'
  }
}

function configuredPrefixes(raw) {
  const extra = String(raw || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  for (const prefix of extra) {
    if (prefix.length < 6 || !/^[a-z0-9-]+-$/.test(prefix)) {
      throw new ChatSmokeError('CHAT_TEST_SLUG_PREFIXES 必须是至少 6 个字符、以连字符结尾的小写专用前缀')
    }
  }
  return ['smoke-', ...extra]
}

export function assertDedicatedChatSlug(slug, variableName, prefixes = ['smoke-']) {
  if (typeof slug !== 'string' || !prefixes.some(prefix => slug.startsWith(prefix))) {
    throw new ChatSmokeError(`${variableName} 必须使用 smoke- 或已配置的专用测试账号前缀`)
  }
}

function required(value, variableName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ChatSmokeError(`缺少环境变量 ${variableName}`)
  }
  return value.trim()
}

function secureBaseUrl(raw) {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new ChatSmokeError('CHAT smoke 基址必须是有效的 HTTPS URL')
  }
  if (parsed.protocol !== 'https:') throw new ChatSmokeError('CHAT smoke 基址必须使用 HTTPS')
  return parsed.href.replace(/\/$/, '')
}

function safeEvidencePath(path) {
  const pathname = new URL(path, 'https://smoke.invalid').pathname
  return pathname.replace(
    /^\/api\/direct-conversations\/[^/]+\/(messages|read)$/,
    '/api/direct-conversations/:id/$1',
  )
}

function evidenceLine({ path, status, durationMs, releaseSha, messageId }) {
  const parts = [`path=${safeEvidencePath(path)}`, `status=${status}`, `durationMs=${Math.max(0, Math.round(durationMs))}`, `releaseSha=${releaseSha}`]
  if (messageId) parts.push(`messageId=${messageId.slice(0, 8)}`)
  return parts.join(' ')
}

async function requestJson({
  baseUrl,
  path,
  token,
  init = {},
  fetchImpl,
  requestTimeoutMs,
  now,
  log,
  releaseSha,
  expectApiEnvelope = true,
}) {
  const displayPath = safeEvidencePath(path)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  const headers = new Headers(init.headers)
  if (token) headers.set('X-Classmate-Token', token)
  const startedAt = now()
  let response

  try {
    response = await Promise.race([
      fetchImpl(`${baseUrl}${path}`, { ...init, headers, signal: controller.signal }),
      new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new ChatSmokeError(`请求超时 path=${displayPath}`)), { once: true })
      }),
    ])
  } catch (error) {
    if (error instanceof ChatSmokeError) throw error
    throw new ChatSmokeError(`请求失败 path=${displayPath} status=network-error`)
  }

  const durationMs = now() - startedAt
  let payload
  try {
    payload = await Promise.race([
      response.json(),
      new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new ChatSmokeError(`请求超时 path=${displayPath}`)), { once: true })
      }),
    ])
  } catch (error) {
    if (error instanceof ChatSmokeError) throw error
    throw new ChatSmokeError(`响应格式异常 path=${displayPath} status=${response.status}`)
  } finally {
    clearTimeout(timeout)
  }

  if (releaseSha) log(evidenceLine({ path, status: response.status, durationMs, releaseSha }))
  if (!response.ok || (expectApiEnvelope && !payload?.success)) {
    throw new ChatSmokeError(`请求失败 path=${displayPath} status=${response.status}`)
  }

  return { data: expectApiEnvelope ? payload.data : payload, durationMs, status: response.status }
}

function findConversation(items, conversationId) {
  return Array.isArray(items) ? items.find(item => item?.id === conversationId) : undefined
}

export async function smokeSelfHostedChat({
  baseUrl = process.env.SELF_HOST_BASE_URL || '',
  senderSlug = process.env.CHAT_SENDER_SLUG || '',
  recipientSlug = process.env.CHAT_RECIPIENT_SLUG || '',
  senderToken = process.env.CHAT_SENDER_TOKEN || '',
  recipientToken = process.env.CHAT_RECIPIENT_TOKEN || '',
  allowedSlugPrefixes = configuredPrefixes(process.env.CHAT_TEST_SLUG_PREFIXES),
  expectedSha = process.env.EXPECTED_RELEASE_SHA || '',
  pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  log = console.log,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const safeBaseUrl = secureBaseUrl(baseUrl)
  assertDedicatedChatSlug(senderSlug, 'CHAT_SENDER_SLUG', allowedSlugPrefixes)
  assertDedicatedChatSlug(recipientSlug, 'CHAT_RECIPIENT_SLUG', allowedSlugPrefixes)
  if (senderSlug === recipientSlug) throw new ChatSmokeError('发送方和收件方必须是两个不同的专用测试账号')
  const safeSenderToken = required(senderToken, 'CHAT_SENDER_TOKEN')
  const safeRecipientToken = required(recipientToken, 'CHAT_RECIPIENT_TOKEN')
  if (typeof expectedSha !== 'string' || !expectedSha.trim()) {
    throw new ChatSmokeError('EXPECTED_RELEASE_SHA 必填')
  }
  const safeExpectedSha = expectedSha.trim()
  if (!SHA_PATTERN.test(safeExpectedSha)) {
    throw new ChatSmokeError('EXPECTED_RELEASE_SHA 必须是完整 40 位 SHA')
  }

  const release = await requestJson({
    baseUrl: safeBaseUrl,
    path: '/release.json',
    fetchImpl,
    requestTimeoutMs,
    now,
    log,
    expectApiEnvelope: false,
  })
  const releaseSha = release.data?.source
  if (!SHA_PATTERN.test(releaseSha || '')) throw new ChatSmokeError('release SHA 缺失或格式异常')
  if (releaseSha !== safeExpectedSha) throw new ChatSmokeError('release SHA 与预期不一致')
  log(evidenceLine({ path: '/release.json', status: release.status, durationMs: release.durationMs, releaseSha }))

  const request = (path, token, init, timeoutMs = requestTimeoutMs) => requestJson({
    baseUrl: safeBaseUrl,
    path,
    token,
    init,
    fetchImpl,
    requestTimeoutMs: timeoutMs,
    now,
    log,
    releaseSha,
  })

  const initial = await request('/api/direct-conversations', safeSenderToken)
  const initialItems = initial.data?.items
  if (!Array.isArray(initialItems)) throw new ChatSmokeError('会话列表响应格式异常')

  const clientNonce = `chat-smoke:${randomUUID()}`
  const body = `专用双账号私聊烟测 ${clientNonce}`
  const sendInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientSlug, body, clientNonce }),
  }
  const firstSend = await request('/api/direct-conversations', safeSenderToken, sendInit)
  if (firstSend.status !== 201) throw new ChatSmokeError('首发消息必须返回 201')
  const message = firstSend.data?.message
  const conversationId = firstSend.data?.conversation?.id || message?.conversationId
  if (!message?.id || !conversationId) throw new ChatSmokeError('首发消息响应格式异常')
  log(evidenceLine({
    path: '/api/direct-conversations',
    status: firstSend.status,
    durationMs: firstSend.durationMs,
    releaseSha,
    messageId: message.id,
  }))

  const duplicateSend = await request('/api/direct-conversations', safeSenderToken, sendInit)
  if (duplicateSend.status !== 200) throw new ChatSmokeError('重复发送必须返回 200')
  if (duplicateSend.data?.message?.id !== message.id) throw new ChatSmokeError('同一 clientNonce 未返回同一消息 ID')
  log(evidenceLine({
    path: '/api/direct-conversations',
    status: duplicateSend.status,
    durationMs: duplicateSend.durationMs,
    releaseSha,
    messageId: message.id,
  }))

  const historyPath = `/api/direct-conversations/${encodeURIComponent(conversationId)}/messages?limit=30`
  const history = await request(historyPath, safeSenderToken)
  const matchingHistory = Array.isArray(history.data?.items)
    ? history.data.items.filter(item => (
      item?.body === body
      && item?.senderSlug === senderSlug
      && item?.recipientSlug === recipientSlug
    ))
    : []
  if (matchingHistory.length !== 1 || matchingHistory[0]?.id !== message.id) {
    throw new ChatSmokeError('相同正文、发送方和收件方的历史消息数量不是 1')
  }

  let cursor
  let receivedMessage
  const pollStartedAt = now()
  const pollDeadline = pollStartedAt + pollTimeoutMs
  while (now() <= pollDeadline) {
    const remainingMs = pollDeadline - now()
    if (remainingMs <= 0) break
    const syncPath = cursor
      ? `/api/inbox/sync?cursor=${encodeURIComponent(cursor)}`
      : '/api/inbox/sync'
    let sync
    try {
      sync = await request(syncPath, safeRecipientToken, undefined, Math.min(requestTimeoutMs, remainingMs))
    } catch (error) {
      if (now() >= pollDeadline && error instanceof ChatSmokeError && error.message.startsWith('请求超时')) break
      throw error
    }
    if (now() > pollDeadline) break
    cursor = sync.data?.cursor
    receivedMessage = Array.isArray(sync.data?.messages)
      ? sync.data.messages.find(item => item?.id === message.id && item?.conversationId === conversationId)
      : undefined
    if (receivedMessage) break
    const remainingAfterSync = pollDeadline - now()
    if (remainingAfterSync <= 0) break
    await sleep(Math.min(pollIntervalMs, remainingAfterSync))
  }

  if (!receivedMessage || now() > pollDeadline) throw new ChatSmokeError('收件方在五秒轮询窗口内未收到目标消息')
  log(evidenceLine({
    path: '/api/inbox/sync',
    status: 200,
    durationMs: now() - pollStartedAt,
    releaseSha,
    messageId: message.id,
  }))

  const recipientBeforeRead = await request('/api/direct-conversations', safeRecipientToken)
  const recipientConversationBeforeRead = findConversation(recipientBeforeRead.data?.items, conversationId)
  if (!recipientConversationBeforeRead || recipientConversationBeforeRead.unreadCount < 1) {
    throw new ChatSmokeError('收件方未读数未在收件后增加')
  }

  const readPath = `/api/direct-conversations/${encodeURIComponent(conversationId)}/read`
  const read = await request(readPath, safeRecipientToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ throughMessageId: message.id }),
  })
  log(evidenceLine({ path: readPath, status: read.status, durationMs: read.durationMs, releaseSha, messageId: message.id }))

  const recipientAfterRead = await request('/api/direct-conversations', safeRecipientToken)
  const recipientConversationAfterRead = findConversation(recipientAfterRead.data?.items, conversationId)
  if (!recipientConversationAfterRead || recipientConversationAfterRead.unreadCount !== 0) {
    throw new ChatSmokeError('收件方标记已读后未读数未归零')
  }

  const initialSenderConversation = findConversation(initialItems, conversationId)
  const finalSender = await request('/api/direct-conversations', safeSenderToken)
  const finalSenderConversation = findConversation(finalSender.data?.items, conversationId)
  if (!finalSenderConversation || finalSenderConversation.lastMessage?.id !== message.id) {
    throw new ChatSmokeError('发送方最终会话未指向目标消息')
  }
  if (finalSenderConversation.unreadCount !== (initialSenderConversation?.unreadCount || 0)) {
    throw new ChatSmokeError('发送方自身未读数被错误改变')
  }

  return { releaseSha, messageId: message.id, conversationId }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (process.argv[1]?.endsWith('smoke-selfhosted-chat.mjs')) {
  smokeSelfHostedChat({
    baseUrl: argument('--base-url'),
    expectedSha: argument('--expected-sha'),
  }).catch((error) => {
    console.error(String(error))
    process.exitCode = 1
  })
}
