import type { ClassmateEntry, DirectConversation, DirectMessage, InboxSummary, NotificationItem } from '@alumni/shared'
import { requestClassmateApi } from './classmateRequest'

export interface InboxRequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export interface DirectConversationHistory {
  items: DirectMessage[]
  nextCursor: string | null
}

export interface StartedDirectConversation {
  conversation: DirectConversation
  message: DirectMessage
}

export interface InboxSyncResult {
  cursor: string
  conversations: DirectConversation[]
  messages: DirectMessage[]
  notifications: NotificationItem[]
  unread: InboxSummary
}

function queryPath(path: string, query: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }
  const search = params.toString()
  return search ? `${path}?${search}` : path
}

export function fetchDirectConversations(apiBase: string, options: InboxRequestOptions = {}): Promise<{ items: DirectConversation[] }> {
  return requestClassmateApi(apiBase, '/api/direct-conversations', { signal: options.signal, timeoutMs: options.timeoutMs }, '会话列表加载失败')
}

export function fetchInboxClassmates(apiBase: string, options: InboxRequestOptions = {}): Promise<ClassmateEntry[]> {
  return requestClassmateApi(apiBase, '/api/classmates', { signal: options.signal, timeoutMs: options.timeoutMs }, '同学目录加载失败')
}

export function startDirectConversation(
  apiBase: string,
  input: { recipientSlug: string; body: string; clientNonce: string },
  options: InboxRequestOptions = {},
): Promise<StartedDirectConversation> {
  return requestClassmateApi(
    apiBase,
    '/api/direct-conversations',
    {
      method: 'POST',
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    '私信发送失败',
  )
}

export function fetchDirectConversationHistory(
  apiBase: string,
  conversationId: string,
  options: { before?: string; limit?: number } & InboxRequestOptions = {},
): Promise<DirectConversationHistory> {
  const { before, limit, signal, timeoutMs } = options
  return requestClassmateApi(
    apiBase,
    queryPath(`/api/direct-conversations/${encodeURIComponent(conversationId)}/messages`, { before, limit }),
    { signal, timeoutMs },
    '会话记录加载失败',
  )
}

export function sendDirectMessage(
  apiBase: string,
  conversationId: string,
  input: { body: string; clientNonce: string },
  options: InboxRequestOptions = {},
): Promise<DirectMessage> {
  return requestClassmateApi(
    apiBase,
    `/api/direct-conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    '私信发送失败',
  )
}

export async function markDirectConversationRead(
  apiBase: string,
  conversationId: string,
  throughMessageId: string,
  options: InboxRequestOptions = {},
): Promise<void> {
  await requestClassmateApi<void>(
    apiBase,
    `/api/direct-conversations/${encodeURIComponent(conversationId)}/read`,
    {
      method: 'PUT',
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ throughMessageId }),
      expectData: false,
    },
    '已读状态更新失败',
  )
}

export function fetchInboxSummary(apiBase: string, options: InboxRequestOptions = {}): Promise<InboxSummary> {
  return requestClassmateApi(apiBase, '/api/inbox/summary', { signal: options.signal, timeoutMs: options.timeoutMs }, '未读消息加载失败')
}

export function syncInbox(apiBase: string, cursor?: string, options: InboxRequestOptions = {}): Promise<InboxSyncResult> {
  return requestClassmateApi(
    apiBase,
    queryPath('/api/inbox/sync', { cursor }),
    { signal: options.signal, timeoutMs: options.timeoutMs },
    '信箱同步失败',
  )
}

export function fetchNotifications(apiBase: string, options: InboxRequestOptions = {}): Promise<{ items: NotificationItem[] }> {
  return requestClassmateApi(apiBase, '/api/notifications', { signal: options.signal, timeoutMs: options.timeoutMs }, '通知加载失败')
}

export async function markNotificationRead(
  apiBase: string,
  notificationId: string,
  options: InboxRequestOptions = {},
): Promise<void> {
  await requestClassmateApi<void>(
    apiBase,
    `/api/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: 'PUT', signal: options.signal, timeoutMs: options.timeoutMs, expectData: false },
    '通知标记失败',
  )
}
