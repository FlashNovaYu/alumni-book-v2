import type { GroupChatMessage } from '@alumni/shared'
import { requestClassmateApi } from './classmateRequest'

export interface GroupChatMute {
  reason: string
  mutedUntil: string | null
}

export interface GroupChatListResult {
  items: GroupChatMessage[]
  nextCursor: string | null
}

export interface GroupChatSyncResult {
  cursor: string
  items: GroupChatMessage[]
  mute: GroupChatMute | null
}

export interface GroupChatSendInput {
  content: string
  clientNonce: string
  replyToId?: string
  cardStyle?: 'paper' | 'chalkboard' | 'photoback' | 'letter'
}

export interface GroupChatRequestOptions {
  signal?: AbortSignal
}

function queryPath(path: string, query: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }
  const search = params.toString()
  return search ? `${path}?${search}` : path
}

export function fetchGroupChatMessages(
  apiBase: string,
  options: { before?: string; limit?: number } & GroupChatRequestOptions = {},
): Promise<GroupChatListResult> {
  const { before, limit, signal } = options
  return requestClassmateApi(
    apiBase,
    queryPath('/api/group-chat/messages', { before, limit }),
    { signal },
    '群聊消息加载失败',
  )
}

export function syncGroupChat(
  apiBase: string,
  cursor?: string,
  options: { limit?: number } & GroupChatRequestOptions = {},
): Promise<GroupChatSyncResult> {
  return requestClassmateApi(
    apiBase,
    queryPath('/api/group-chat/sync', { cursor, limit: options.limit }),
    { signal: options.signal },
    '群聊同步失败',
  )
}

export function fetchMyGroupChatMessages(
  apiBase: string,
  options: { before?: string; limit?: number } & GroupChatRequestOptions = {},
): Promise<GroupChatListResult> {
  const { before, limit, signal } = options
  return requestClassmateApi(
    apiBase,
    queryPath('/api/group-chat/mine', { before, limit }),
    { signal },
    '个人群聊记录加载失败',
  )
}

export function sendGroupChatMessage(
  apiBase: string,
  input: GroupChatSendInput,
  options: GroupChatRequestOptions = {},
): Promise<GroupChatMessage> {
  return requestClassmateApi(
    apiBase,
    '/api/group-chat/messages',
    {
      method: 'POST',
      signal: options.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    '消息发送失败',
  )
}

export function recallGroupChatMessage(
  apiBase: string,
  messageId: string,
  options: GroupChatRequestOptions = {},
): Promise<GroupChatMessage> {
  return requestClassmateApi(
    apiBase,
    `/api/group-chat/messages/${encodeURIComponent(messageId)}`,
    { method: 'DELETE', signal: options.signal },
    '消息撤回失败',
  )
}

export function reactToGroupChatMessage(
  apiBase: string,
  messageId: string,
  reaction: string,
  options: GroupChatRequestOptions = {},
): Promise<Pick<GroupChatMessage, 'reactionCounts' | 'myReaction'>> {
  return requestClassmateApi(
    apiBase,
    `/api/group-chat/messages/${encodeURIComponent(messageId)}/reaction`,
    {
      method: 'PUT',
      signal: options.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction }),
    },
    '回应失败',
  )
}
