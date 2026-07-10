import type { GroupChatMessage } from '@alumni/shared'
import { apiFetch } from './error'

export async function listGroupMessages(
  apiBase: string,
  options: { limit?: number; before?: string } = {}
): Promise<{ items: GroupChatMessage[]; nextCursor: string | null }> {
  const params = new URLSearchParams()
  if (options.limit !== undefined) params.append('limit', String(options.limit))
  if (options.before !== undefined) params.append('before', options.before)
  const query = params.toString()
  const path = `/api/group-chat/messages${query ? '?' + query : ''}`
  return apiFetch<{ items: GroupChatMessage[]; nextCursor: string | null }>(apiBase, path)
}

export async function listMyGroupMessages(
  apiBase: string,
  options: { limit?: number; before?: string } = {}
): Promise<{ items: GroupChatMessage[]; nextCursor: string | null }> {
  const params = new URLSearchParams()
  if (options.limit !== undefined) params.append('limit', String(options.limit))
  if (options.before !== undefined) params.append('before', options.before)
  const query = params.toString()
  const path = `/api/group-chat/mine${query ? '?' + query : ''}`
  return apiFetch<{ items: GroupChatMessage[]; nextCursor: string | null }>(apiBase, path)
}

export async function syncGroupChat(
  apiBase: string,
  cursor?: string
): Promise<{ cursor: string; items: GroupChatMessage[]; mute: { reason: string; mutedUntil: string | null } | null }> {
  const params = new URLSearchParams()
  if (cursor !== undefined) params.append('cursor', cursor)
  const query = params.toString()
  const path = `/api/group-chat/sync${query ? '?' + query : ''}`
  return apiFetch<{ cursor: string; items: GroupChatMessage[]; mute: { reason: string; mutedUntil: string | null } | null }>(apiBase, path)
}

export async function sendGroupMessage(
  apiBase: string,
  payload: { body?: string; content?: string; clientNonce: string; replyToId?: string | null }
): Promise<GroupChatMessage> {
  return apiFetch<GroupChatMessage>(apiBase, '/api/group-chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: payload.content || payload.body || '',
      clientNonce: payload.clientNonce,
      replyToId: payload.replyToId || null
    })
  })
}

export async function reactToGroupMessage(
  apiBase: string,
  id: string,
  reaction: string | null
): Promise<{ reactionCounts: Record<string, number>; myReaction: string | null }> {
  return apiFetch<{ reactionCounts: Record<string, number>; myReaction: string | null }>(
    apiBase,
    `/api/group-chat/messages/${id}/reaction`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction })
    }
  )
}

export async function recallGroupMessage(
  apiBase: string,
  id: string
): Promise<GroupChatMessage> {
  return apiFetch<GroupChatMessage>(apiBase, `/api/group-chat/messages/${id}`, {
    method: 'DELETE'
  })
}
