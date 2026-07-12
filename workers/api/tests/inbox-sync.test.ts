import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { createAdminNotice } from '../src/lib/notificationService'
import { initTestDb } from './db-helper'

const STUDENT_A = { slug: 'inbox-sync-a', name: '同步同学甲' }
const STUDENT_B = { slug: 'inbox-sync-b', name: '同步同学乙' }
const STUDENT_C = { slug: 'inbox-sync-c', name: '同步同学丙' }
const CONVERSATION_ID = 'conv_inbox-sync-a_inbox-sync-b'

async function request(path: string, options: RequestInit = {}, db: D1Database = env.DB) {
  const ctx = createExecutionContext()
  const bindings = db === env.DB
    ? env
    : new Proxy(env, { get: (target, property) => property === 'DB' ? db : Reflect.get(target, property) })
  const response = await worker.fetch(new Request(`http://localhost${path}`, options), bindings, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

function insertAfterSyncBoundary(db: D1Database, insert: () => Promise<void>) {
  let inserted: Promise<void> | null = null
  const isSyncDataQuery = (query: string) => query.includes('WITH new_conversations')
    || query.includes('SELECT m.rowid AS sync_rowid')
    || query.includes('SELECT n.rowid AS sync_rowid')

  const wrapStatement = (query: string, statement: any): any => ({
    bind: (...values: unknown[]) => wrapStatement(query, statement.bind(...values)),
    first: (...args: unknown[]) => statement.first(...args),
    run: (...args: unknown[]) => statement.run(...args),
    raw: (...args: unknown[]) => statement.raw(...args),
    all: async (...args: unknown[]) => {
      if (isSyncDataQuery(query)) {
        inserted ||= insert()
        await inserted
      }
      return statement.all(...args)
    },
  })

  return {
    prepare: (query: string) => wrapStatement(query, db.prepare(query)),
    batch: db.batch.bind(db),
    exec: db.exec.bind(db),
    dump: db.dump.bind(db),
  } as unknown as D1Database
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

function decodeSyncCursorPayload(rawCursor: string) {
  const payload = rawCursor.split('.')[0]
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))) as any
}

function encodeUnsignedSyncCursor(cursor: any) {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
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

    const tamperedCursor = decodeSyncCursorPayload(firstBody.data.cursor)
    tamperedCursor.position.messages = 0
    const tampered = await request(`/api/inbox/sync?cursor=${encodeURIComponent(encodeUnsignedSyncCursor(tamperedCursor))}`, {
      headers: classmateHeaders(token),
    })
    expect(tampered.status).toBe(400)

    const later = '2000-01-01T00:00:00.000Z'
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at) VALUES ('inbox-sync-later', ?, ?, ?, '后续消息', 'inbox-sync-later-nonce', ?)"
      ).bind(CONVERSATION_ID, STUDENT_B.slug, STUDENT_A.slug, later),
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

  it('defers rows committed after the sync boundary to the next window without losing them', async () => {
    const token = await classmateToken(STUDENT_A)
    const first = await request('/api/inbox/sync', { headers: classmateHeaders(token) })
    const firstBody = await first.json() as any
    const delayedDb = insertAfterSyncBoundary(env.DB, async () => {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at) VALUES ('inbox-sync-racing', ?, ?, ?, '边界后的消息', 'inbox-sync-racing-nonce', '1999-01-01T00:00:00.000Z')"
        ).bind(CONVERSATION_ID, STUDENT_B.slug, STUDENT_A.slug),
        env.DB.prepare(
          "INSERT INTO notifications (id, recipient_slug, type, title, body, created_at) VALUES ('inbox-sync-racing-notification', ?, 'system', '边界后的通知', '下一窗口返回', '1999-01-01T00:00:00.000Z')"
        ).bind(STUDENT_A.slug),
      ])
    })

    const racing = await request(`/api/inbox/sync?cursor=${encodeURIComponent(firstBody.data.cursor)}`, {
      headers: classmateHeaders(token),
    }, delayedDb)
    expect(racing.status).toBe(200)
    const racingBody = await racing.json() as any
    expect(racingBody.data.messages).toEqual([])
    expect(racingBody.data.notifications).toEqual([])

    const next = await request(`/api/inbox/sync?cursor=${encodeURIComponent(racingBody.data.cursor)}`, {
      headers: classmateHeaders(token),
    })
    expect(next.status).toBe(200)
    const nextBody = await next.json() as any
    expect(nextBody.data.messages).toEqual([expect.objectContaining({ id: 'inbox-sync-racing' })])
    expect(nextBody.data.notifications).toEqual([expect.objectContaining({ id: 'inbox-sync-racing-notification' })])
    expect(nextBody.data.conversations).toEqual([expect.objectContaining({ id: CONVERSATION_ID })])
  })

  it('syncs notification read changes made by another device', async () => {
    const token = await classmateToken(STUDENT_A)
    const first = await request('/api/inbox/sync', { headers: classmateHeaders(token) })
    const firstBody = await first.json() as any
    expect(firstBody.data.notifications).toEqual([
      expect.objectContaining({ id: 'inbox-sync-notification-a', readAt: null }),
    ])

    const read = await request('/api/notifications/inbox-sync-notification-a/read', {
      method: 'PUT',
      headers: classmateHeaders(token),
    })
    expect(read.status).toBe(200)

    const next = await request(`/api/inbox/sync?cursor=${encodeURIComponent(firstBody.data.cursor)}`, {
      headers: classmateHeaders(token),
    })
    expect(next.status).toBe(200)
    const nextBody = await next.json() as any
    expect(nextBody.data.notifications).toEqual([
      expect.objectContaining({ id: 'inbox-sync-notification-a', readAt: expect.any(String) }),
    ])
  })
})

describe('Admin notification APIs', () => {
  it('sends direct and broadcast notices without creating legacy mail threads', async () => {
    const token = await adminToken()
    expect((await request('/api/admin/notifications/send')).status).toBe(401)
    const beforeThreads = await env.DB.prepare('SELECT COUNT(*) AS count FROM mail_threads').first() as any

    const oversized = await request('/api/admin/notifications/send', {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ recipientSlug: STUDENT_A.slug, title: '超大请求', body: 'x'.repeat(17_000) }),
    })
    expect(oversized.status).toBe(413)

    let pulls = 0
    let cancelled = false
    const oversizedStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (pulls > 20) {
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(8192).fill(120))
      },
      cancel() {
        cancelled = true
      },
    })
    const streamed = await request('/api/admin/notifications/send', {
      method: 'POST',
      headers: adminHeaders(token),
      body: oversizedStream,
      duplex: 'half',
    } as RequestInit)
    expect(streamed.status).toBe(413)
    expect(pulls).toBeLessThanOrEqual(4)
    expect(cancelled).toBe(true)

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

  it('keeps notification batches under the D1 statement limit', async () => {
    const batchSizes: number[] = []
    const fakeDb = {
      prepare: () => ({ bind: () => ({}) }),
      batch: async (statements: unknown[]) => {
        batchSizes.push(statements.length)
        if (statements.length > 50) throw new Error('D1 batch statement limit exceeded')
        return []
      },
    } as unknown as D1Database

    await createAdminNotice(fakeDb, {
      recipientSlugs: Array.from({ length: 121 }, (_, index) => `student-${index}`),
      title: '分块通知',
      body: '测试批量边界',
    })
    expect(batchSizes).toEqual([50, 50, 21])
  })

  it('provides one-statement broadcast delivery for all active classmates', async () => {
    const service = await import('../src/lib/notificationService') as any
    expect(service.createAdminBroadcast).toBeTypeOf('function')
    const active = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM students WHERE COALESCE(account_status, 'active') != 'locked'"
    ).first() as any
    const result = await service.createAdminBroadcast(env.DB, { title: '原子广播', body: '一次 SQL 完成' })
    expect(result.sentCount).toBe(Number(active.count))
    await expect(env.DB.prepare(
      'SELECT COUNT(*) AS count FROM notifications WHERE related_id = ?'
    ).bind(result.relatedId).first()).resolves.toMatchObject({ count: active.count })
  })
})
