import { getClassmateToken, type ApiResponse, type ClassmateEntry, type InboxSummary, type MailboxThreadDetail, type NotificationItem } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

function classmateHeaders(): Record<string, string> {
  const token = getClassmateToken()
  return token ? { 'X-Classmate-Token': token } : {}
}

async function parse<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json() as ApiResponse<T>
  if (!res.ok || !data.success || !data.data) throw new Error(data.message || fallback)
  return data.data
}

export async function fetchPublicMessages(apiBase: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/public-messages'))
  return res.json()
}

export async function fetchMyPublicMessages(apiBase: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/public-messages/mine'), {
    headers: classmateHeaders(),
  })
  return res.json()
}

export async function submitPublicMessage(apiBase: string, content: string, cardStyle: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/public-messages'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...classmateHeaders(),
    },
    body: JSON.stringify({ content, cardStyle }),
  })
  return res.json()
}

export async function fetchMailboxThreads(apiBase: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/mailbox/threads'), {
    headers: classmateHeaders(),
  })
  return res.json()
}

export async function sendMailboxThread(apiBase: string, payload: { recipientSlug: string; subject: string; body: string }) {
  const res = await fetch(joinApiUrl(apiBase, '/api/mailbox/threads'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...classmateHeaders(),
    },
    body: JSON.stringify(payload),
  })
  return res.json()
}

export async function reactToPublicMessage(apiBase: string, id: string, reaction: string) {
  const res = await fetch(joinApiUrl(apiBase, `/api/public-messages/${id}/react`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...classmateHeaders() },
    body: JSON.stringify({ reaction }),
  })
  return parse<{ reactions: Record<string, number> }>(res, '表情回应失败')
}

export async function fetchInboxSummary(apiBase: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/inbox/summary'), { headers: classmateHeaders() })
  return parse<InboxSummary>(res, '未读消息加载失败')
}

export async function fetchNotifications(apiBase: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/notifications'), { headers: classmateHeaders() })
  return parse<{ items: NotificationItem[] }>(res, '通知加载失败')
}

export async function markNotificationRead(apiBase: string, id: string) {
  const res = await fetch(joinApiUrl(apiBase, `/api/notifications/${id}/read`), { method: 'PUT', headers: classmateHeaders() })
  if (!res.ok) throw new Error('通知标记失败')
}

export async function fetchMailboxThread(apiBase: string, threadId: string) {
  const res = await fetch(joinApiUrl(apiBase, `/api/mailbox/threads/${threadId}`), { headers: classmateHeaders() })
  return parse<MailboxThreadDetail>(res, '信件详情加载失败')
}

export async function replyMailboxThread(apiBase: string, threadId: string, body: string) {
  const res = await fetch(joinApiUrl(apiBase, `/api/mailbox/threads/${threadId}/messages`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...classmateHeaders() },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new Error(((await res.json()) as ApiResponse).message || '回复失败')
}

export async function fetchRecipientDirectory(apiBase: string) {
  const res = await fetch(joinApiUrl(apiBase, '/api/classmates'))
  return parse<ClassmateEntry[]>(res, '同学目录加载失败')
}