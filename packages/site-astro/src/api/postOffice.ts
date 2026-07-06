import { getClassmateToken } from '@alumni/shared'
import { joinApiUrl } from '../utils/apiBase'

function classmateHeaders(): Record<string, string> {
  const token = getClassmateToken()
  return token ? { 'X-Classmate-Token': token } : {}
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
