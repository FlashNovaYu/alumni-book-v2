import type { ApiResponse, Student } from '@alumni/shared'
import { adminFetch } from './client'
import { DEFAULT_PAGE_SIZE, normalizePageResult, pageSearchParams, type PageResult } from './pagination'

export type AdminGroupChatStatus = 'visible' | 'hidden' | 'recalled_by_author' | 'recalled_by_admin'

export interface AdminGroupChatMessage {
  id: string
  author: { slug: string; name: string }
  content: string | null
  status: AdminGroupChatStatus
  moderationReason: string | null
  recalledAt: string | null
  recalledByType: 'student' | 'admin' | null
  createdAt: string
  updatedAt: string
}

export interface NotificationHistoryItem {
  relatedId: string
  title: string
  createdAt: string
  recipientCount: number
  readCount: number
}

export type NotificationRecipient = Pick<Student, 'name' | 'slug' | 'accountStatus'>

async function data<T>(path: string, options?: RequestInit): Promise<T> {
  const result = await adminFetch<ApiResponse<T>>(path, options)
  if (!result.success || result.data === undefined) throw new Error(result.message || '请求失败')
  return result.data
}

export async function fetchGroupChatMessages(
  status?: AdminGroupChatStatus,
  cursor?: string | null,
  signal?: AbortSignal,
): Promise<PageResult<AdminGroupChatMessage>> {
  const query = pageSearchParams(DEFAULT_PAGE_SIZE, cursor)
  if (status) query.set('status', status)
  const result = await data<PageResult<AdminGroupChatMessage> | AdminGroupChatMessage[]>(`/api/admin/group-chat/messages?${query}`, { signal })
  const legacyFiltered = Array.isArray(result) && status ? result.filter((message) => message.status === status) : result
  return normalizePageResult(legacyFiltered, DEFAULT_PAGE_SIZE, cursor)
}

export function setGroupChatHidden(id: string, hidden: boolean, reason: string): Promise<AdminGroupChatMessage> {
  return data(`/api/admin/group-chat/messages/${encodeURIComponent(id)}/hide`, {
    method: 'PUT',
    body: JSON.stringify({ hidden, reason }),
  })
}

export function recallGroupChatMessage(id: string, reason: string): Promise<AdminGroupChatMessage> {
  return data(`/api/admin/group-chat/messages/${encodeURIComponent(id)}/recall`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function muteClassmate(slug: string, reason: string, mutedUntil: string | null): Promise<void> {
  return data(`/api/admin/group-chat/mutes/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    body: JSON.stringify({ reason, mutedUntil }),
  })
}

export function unmuteClassmate(slug: string): Promise<void> {
  return data(`/api/admin/group-chat/mutes/${encodeURIComponent(slug)}`, { method: 'DELETE' })
}

export function sendAdminNotification(payload: { recipientSlug: string; title: string; body: string }): Promise<{ relatedId: string; sentCount: number }> {
  return data('/api/admin/notifications/send', { method: 'POST', body: JSON.stringify(payload) })
}

export function broadcastAdminNotification(payload: { title: string; body: string }): Promise<{ relatedId: string; sentCount: number }> {
  return data('/api/admin/notifications/broadcast', { method: 'POST', body: JSON.stringify(payload) })
}

export function fetchAdminNotificationHistory(): Promise<{ items: NotificationHistoryItem[] }> {
  return data('/api/admin/notifications/history')
}

export async function fetchNotificationRecipients(): Promise<NotificationRecipient[]> {
  const students = await data<NotificationRecipient[]>('/api/students')
  return students.filter((student) => student.accountStatus !== 'locked')
}
