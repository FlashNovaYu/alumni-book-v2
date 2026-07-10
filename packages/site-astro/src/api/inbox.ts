import type { 
  DirectConversation, 
  DirectMessage, 
  InboxSummary, 
  NotificationItem 
} from '@alumni/shared'
import { apiFetch } from './error'

export async function listDirectConversations(apiBase: string): Promise<DirectConversation[]> {
  const data = await apiFetch<{ items: DirectConversation[] }>(apiBase, '/api/direct-conversations')
  return data.items
}

export async function startDirectConversation(
  apiBase: string,
  payload: { recipientSlug: string; body: string; clientNonce: string }
): Promise<{ conversation: DirectConversation; message: DirectMessage }> {
  return apiFetch<{ conversation: DirectConversation; message: DirectMessage }>(
    apiBase,
    '/api/direct-conversations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  )
}

export async function listDirectMessages(
  apiBase: string,
  id: string,
  options: { limit?: number; before?: string } = {}
): Promise<{ items: DirectMessage[]; nextCursor: string | null }> {
  const params = new URLSearchParams()
  if (options.limit !== undefined) params.append('limit', String(options.limit))
  if (options.before !== undefined) params.append('before', options.before)
  const query = params.toString()
  const path = `/api/direct-conversations/${id}/messages${query ? '?' + query : ''}`
  return apiFetch<{ items: DirectMessage[]; nextCursor: string | null }>(apiBase, path)
}

export async function sendDirectMessage(
  apiBase: string,
  id: string,
  payload: { body: string; clientNonce: string }
): Promise<DirectMessage> {
  return apiFetch<DirectMessage>(apiBase, `/api/direct-conversations/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export async function markDirectConversationRead(
  apiBase: string,
  id: string,
  throughMessageId: string
): Promise<{ success: boolean }> {
  await apiFetch<void>(apiBase, `/api/direct-conversations/${id}/read`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ throughMessageId })
  })
  return { success: true }
}

export async function getInboxSummary(apiBase: string): Promise<InboxSummary> {
  return apiFetch<InboxSummary>(apiBase, '/api/inbox/summary')
}

export async function syncInbox(apiBase: string, cursor?: string): Promise<{ items: any[]; cursor: string | null }> {
  const params = new URLSearchParams()
  if (cursor !== undefined) params.append('cursor', cursor)
  const query = params.toString()
  const path = `/api/inbox/sync${query ? '?' + query : ''}`
  return apiFetch<{ items: any[]; cursor: string | null }>(apiBase, path)
}

export async function listNotifications(apiBase: string): Promise<NotificationItem[]> {
  const data = await apiFetch<{ items: NotificationItem[] }>(apiBase, '/api/notifications')
  return data.items
}

export async function markNotificationRead(apiBase: string, id: string): Promise<{ success: boolean }> {
  await apiFetch<void>(apiBase, `/api/notifications/${id}/read`, {
    method: 'PUT'
  })
  return { success: true }
}
