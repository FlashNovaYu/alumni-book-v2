import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

const STUDENT_A = { slug: 'inbox-sync-a', name: '同步同学甲' }
const STUDENT_B = { slug: 'inbox-sync-b', name: '同步同学乙' }
const STUDENT_C = { slug: 'inbox-sync-c', name: '同步同学丙' }
const CONVERSATION_ID = 'conv_inbox-sync-a_inbox-sync-b'

async function request(path: string, options: RequestInit = {}) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(new Request(`http://localhost${path}`, options), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

async function classmateToken(student: typeof STUDENT_A) {
  const response = await request('/api/classmate/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(student),
  })
  expect(response.status).toBe(200)
  return ((await response.json()) as any).data.token as string
}

async function adminToken() {
  const response = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin888' }),
  })
  expect(response.status).toBe(200)
  return ((await response.json()) as any).data.token as string
}

function classmateHeaders(token: string) {
  return { 'Content-Type': 'application/json', 'X-Classmate-Token': token }
}

function adminHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function timestampAfterSyncCursor(rawCursor: string) {
  const normalized = rawCursor.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
  const cursor = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))) as any
  const boundaryTime = Date.parse(cursor.position.messages.timestamp)
  while (Date.now() <= boundaryTime) {
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  return new Date().toISOString()
}

beforeAll(async () => initTestDb(env.DB))

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM direct_messages WHERE id LIKE 'inbox-sync-%'"),
    env.DB.prepare('DELETE FROM direct_conversations WHERE id = ?').bind(CONVERSATION_ID),
    env.DB.prepare('DELETE FROM notifications WHERE recipient_slug IN (?, ?, ?)').bind(STUDENT_A.slug, STUDENT_B.slug, STUDENT_C.slug),
    env.DB.prepare('DELETE FROM classmate_sessions WHERE student_slug IN (?, ?, ?)').bind(STUDENT_A.slug, STUDENT_B.slug, STUDENT_C.slug),
    env.DB.prepare('DELETE FROM students WHERE slug IN (?, ?, ?)').bind(STUDENT_A.slug, STUDENT_B.slug, STUDENT_C.slug),
    env.DB.prepare("INSERT INTO students (id, name, slug, account_status, account_initial_password_changed) VALUES ('inbox-sync-a-id', ?, ?, 'active', 1)").bind(STUDENT_A.name, STUDENT_A.slug),
    env.DB.prepare("INSERT INTO students (id, name, slug, account_status, account_initial_password_changed) VALUES ('inbox-sync-b-id', ?, ?, 'active', 1)").bind(STUDENT_B.name, STUDENT_B.slug),
    env.DB.prepare("INSERT INTO students (id, name, slug, account_status, account_initial_password_changed) VALUES ('inbox-sync-c-id', ?, ?, 'locked', 1)").bind(STUDENT_C.name, STUDENT_C.slug),
    env.DB.prepare(
      "INSERT INTO direct_conversations (id, participant_a_slug, participant_b_slug, created_at, updated_at) VALUES (?, ?, ?, '2026-07-10T00:00:00.000Z', '2026-07-10T00:02:00.000Z')"
    ).bind(CONVERSATION_ID, STUDENT_A.slug, STUDENT_B.slug),
    env.DB.prepare(
      "INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at) VALUES ('inbox-sync-incoming', ?, ?, ?, '发给甲的私聊', 'inbox-sync-incoming-nonce', '2026-07-10T00:01:00.000Z')"
    ).bind(CONVERSATION_ID, STUDENT_B.slug, STUDENT_A.slug),
    env.DB.prepare(
      "INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, read_at, created_at) VALUES ('inbox-sync-outgoing', ?, ?, ?, '甲已经读过的消息', 'inbox-sync-outgoing-nonce', '2026-07-10T00:02:00.000Z', '2026-07-10T00:03:00.000Z')"
    ).bind(CONVERSATION_ID, STUDENT_A.slug, STUDENT_B.slug),
    env.DB.prepare(
      "INSERT INTO notifications (id, recipient_slug, type, title, body, created_at) VALUES ('inbox-sync-notification-a', ?, 'system', '甲的通知', '通知正文', '2026-07-10T00:04:00.000Z')"
    ).bind(STUDENT_A.slug),
    env.DB.prepare(
      "INSERT INTO notifications (id, recipient_slug, type, title, body, created_at) VALUES ('inbox-sync-notification-b', ?, 'system', '乙的通知', '不可见', '2026-07-10T00:04:00.000Z')"
    ).bind(STUDENT_B.slug),
  ])
})

describe('Inbox summary and sync API', () => {
  it('returns direct unread counts and incrementally syncs only the current classmate data', async () => {
    expect((await request('/api/inbox/summary')).status).toBe(401)
    const token = await classmateToken(STUDENT_A)

    const summary = await request('/api/inbox/summary', { headers: classmateHeaders(token) })
    expect(summary.status).toBe(200)
    expect((await summary.json() as any).data).toEqual({
      directUnread: 1,
      notificationUnread: 1,
      totalUnread: 2,
    })

    const firstSync = await request('/api/inbox/sync', { headers: classmateHeaders(token) })
    expect(firstSync.status).toBe(200)
    const firstBody = await firstSync.json() as any
    expect(firstBody.data).toEqual(expect.objectContaining({
      cursor: expect.any(String),
      conversations: [expect.objectContaining({ id: CONVERSATION_ID })],
      messages: expect.arrayContaining([expect.objectContaining({ id: 'inbox-sync-incoming' })]),
      notifications: [expect.objectContaining({ id: 'inbox-sync-notification-a' })],
      unread: { directUnread: 1, notificationUnread: 1, totalUnread: 2 },
    }))
    expect(JSON.stringify(firstBody.data.messages)).not.toContain('read_at')
    expect(JSON.stringify(firstBody.data.messages)).not.toContain('不可见')

    const later = await timestampAfterSyncCursor(firstBody.data.cursor)
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at) VALUES ('inbox-sync-later', ?, ?, ?, '后续消息', 'inbox-sync-later-nonce', ?)"
      ).bind(CONVERSATION_ID, STUDENT_B.slug, STUDENT_A.slug, later),
      env.DB.prepare('UPDATE direct_conversations SET updated_at = ? WHERE id = ?').bind(later, CONVERSATION_ID),
      env.DB.prepare(
        "INSERT INTO notifications (id, recipient_slug, type, title, body, created_at) VALUES ('inbox-sync-later-notification', ?, 'system', '后续通知', '后续正文', ?)"
      ).bind(STUDENT_A.slug, later),
    ])

    const nextSync = await request(`/api/inbox/sync?cursor=${encodeURIComponent(firstBody.data.cursor)}`, { headers: classmateHeaders(token) })
    expect(nextSync.status).toBe(200)
    const nextBody = await nextSync.json() as any
    expect(nextBody.data.messages).toEqual([expect.objectContaining({ id: 'inbox-sync-later' })])
    expect(nextBody.data.notifications).toEqual([expect.objectContaining({ id: 'inbox-sync-later-notification' })])
    expect(nextBody.data.conversations).toEqual([expect.objectContaining({ id: CONVERSATION_ID })])
  })
})

describe('Admin notification APIs', () => {
  it('sends direct and broadcast notices without creating legacy mail threads', async () => {
    const token = await adminToken()
    expect((await request('/api/admin/notifications/send')).status).toBe(401)
    const beforeThreads = await env.DB.prepare('SELECT COUNT(*) AS count FROM mail_threads').first() as any

    const single = await request('/api/admin/notifications/send', {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ recipientSlug: STUDENT_A.slug, title: '单人提醒', body: '请查看班级公告' }),
    })
    expect(single.status).toBe(201)
    const singleBody = await single.json() as any
    expect(singleBody.data.relatedId).toEqual(expect.any(String))

    const activeStudents = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM students WHERE COALESCE(account_status, 'active') != 'locked'"
    ).first() as any
    const broadcast = await request('/api/admin/notifications/broadcast', {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ title: '全班提醒', body: '周五拍毕业照' }),
    })
    expect(broadcast.status).toBe(201)
    const broadcastBody = await broadcast.json() as any
    expect(broadcastBody.data.sentCount).toBe(Number(activeStudents.count))
    await expect(env.DB.prepare(
      'SELECT COUNT(*) AS count FROM notifications WHERE related_id = ? AND recipient_slug IN (?, ?)'
    ).bind(broadcastBody.data.relatedId, STUDENT_A.slug, STUDENT_B.slug).first()).resolves.toMatchObject({ count: 2 })
    await expect(env.DB.prepare(
      'SELECT COUNT(*) AS count FROM notifications WHERE related_id = ? AND recipient_slug = ?'
    ).bind(broadcastBody.data.relatedId, STUDENT_C.slug).first()).resolves.toMatchObject({ count: 0 })

    const history = await request('/api/admin/notifications/history', { headers: adminHeaders(token) })
    expect(history.status).toBe(200)
    expect((await history.json() as any).data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: '单人提醒', recipientCount: 1, readCount: 0 }),
      expect.objectContaining({ title: '全班提醒', recipientCount: Number(activeStudents.count), readCount: 0 }),
    ]))

    const legacySend = await request('/api/admin/mail/send', {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ recipientSlug: STUDENT_A.slug, subject: '兼容通知', body: '仍应进入通知流' }),
    })
    expect(legacySend.status).toBe(201)
    await expect(env.DB.prepare('SELECT COUNT(*) AS count FROM mail_threads').first()).resolves.toMatchObject({ count: beforeThreads.count })
    expect((await request('/api/admin/mail/threads', { headers: adminHeaders(token) })).headers.get('Deprecation')).toBe('true')
  })
})
