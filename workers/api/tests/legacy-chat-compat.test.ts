import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

const A = { id: 'legacy-compat-a-id', slug: 'legacy-compat-a', name: '兼容同学甲' }
const B = { id: 'legacy-compat-b-id', slug: 'legacy-compat-b', name: '兼容同学乙' }
const C = { id: 'legacy-compat-c-id', slug: 'legacy-compat-c', name: '兼容同学丙' }

async function request(path: string, options: RequestInit = {}) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(new Request(`http://localhost${path}`, options), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

function classmateHeaders(token: string) {
  return { 'Content-Type': 'application/json', 'X-Classmate-Token': token }
}

function adminHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function testHashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = new Uint8Array(16)
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256)
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)))
  const saltStr = btoa(String.fromCharCode(...salt))
  return `pbkdf2:${saltStr}:${hash}`
}

async function loginClassmate(slug: string): Promise<string> {
  const res = await request('/api/classmate-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, password: 'test123456' }),
  })
  const body = await res.json() as any
  return body.data.token as string
}

async function loginAdmin(): Promise<string> {
  const res = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin888' }),
  })
  const body = await res.json() as any
  return body.data.token as string
}

async function insertStudents() {
  const hash = await testHashPassword('test123456')
  for (const s of [A, B, C]) {
    await env.DB.prepare(
      `INSERT INTO students (id, name, slug, account_status, account_initial_password_changed, account_password_hash)
       VALUES (?, ?, ?, 'active', 1, ?)`
    ).bind(s.id, s.name, s.slug, hash).run()
  }
}

beforeAll(async () => {
  await initTestDb(env.DB)
})

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM group_chat_reactions WHERE message_id LIKE 'legacy-compat-%'").run()
  await env.DB.prepare("DELETE FROM content_reviews WHERE content_id LIKE 'legacy-compat-%'").run()
  await env.DB.prepare("DELETE FROM notifications WHERE recipient_slug IN ('legacy-compat-a','legacy-compat-b','legacy-compat-c')").run()
  await env.DB.prepare("DELETE FROM public_messages WHERE id LIKE 'legacy-compat-%'").run()
  await env.DB.prepare("DELETE FROM mail_recipients WHERE thread_id LIKE 'legacy-compat-%'").run()
  await env.DB.prepare("DELETE FROM mail_messages WHERE thread_id LIKE 'legacy-compat-%'").run()
  await env.DB.prepare("DELETE FROM mail_threads WHERE id LIKE 'legacy-compat-%'").run()
  await env.DB.prepare("DELETE FROM group_chat_mutes WHERE student_slug IN ('legacy-compat-a','legacy-compat-b','legacy-compat-c')").run()
  await env.DB.prepare("DELETE FROM classmate_sessions WHERE student_slug IN ('legacy-compat-a','legacy-compat-b','legacy-compat-c')").run()
  await env.DB.prepare("DELETE FROM students WHERE slug IN ('legacy-compat-a','legacy-compat-b','legacy-compat-c')").run()
  await insertStudents()
})

describe('Legacy public-messages compatibility', () => {
  it('requires a classmate session and maps visible public messages to approved', async () => {
    // Insert one visible, one pending, one rejected message
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, card_style, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
    ).bind('legacy-compat-visible', A.slug, A.name, '可见消息', 'paper', 'visible').run()
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, card_style, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
    ).bind('legacy-compat-pending', A.slug, A.name, '待审消息', 'paper', 'pending').run()
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, card_style, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
    ).bind('legacy-compat-rejected', A.slug, A.name, '被拒消息', 'paper', 'rejected').run()

    // Anonymous GET should return 401
    const anonRes = await request('/api/public-messages')
    expect(anonRes.status).toBe(401)

    // Authenticated GET with A's token
    const tokenA = await loginClassmate(A.slug)
    const res = await request('/api/public-messages', {
      headers: { 'X-Classmate-Token': tokenA },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const items = body.data.items as any[]

    // Only visible item should be returned
    expect(items.some((i: any) => i.id === 'legacy-compat-visible')).toBe(true)
    expect(items.some((i: any) => i.id === 'legacy-compat-pending')).toBe(false)
    expect(items.some((i: any) => i.id === 'legacy-compat-rejected')).toBe(false)

    // Visible item should have status mapped to 'approved'
    const visibleItem = items.find((i: any) => i.id === 'legacy-compat-visible')
    expect(visibleItem.status).toBe('approved')

    // Response should have no-store cache header
    const cacheControl = res.headers.get('Cache-Control') || ''
    expect(cacheControl).toContain('no-store')
  })

  it('creates visible group-chat data through the legacy public message endpoint', async () => {
    const tokenA = await loginClassmate(A.slug)

    // POST through legacy endpoint
    const res = await request('/api/public-messages', {
      method: 'POST',
      headers: classmateHeaders(tokenA),
      body: JSON.stringify({ content: '旧入口发出的新群聊消息', cardStyle: 'letter' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.data.status).toBe('approved')

    // Database row should have status 'visible' and client_nonce starting with 'legacy:'
    const row = await env.DB.prepare(
      "SELECT status, client_nonce FROM public_messages WHERE author_slug = ? AND content = ?"
    ).bind(A.slug, '旧入口发出的新群聊消息').first() as any
    expect(row).toBeTruthy()
    expect(row.status).toBe('visible')
    expect(row.client_nonce).toMatch(/^legacy:/)

    // Permanent mute should block the legacy POST
    await env.DB.prepare(
      "INSERT INTO group_chat_mutes (student_slug, muted_until, reason, created_by, created_at, updated_at) VALUES (?, NULL, '永久禁言', 'admin', datetime('now'), datetime('now'))"
    ).bind(A.slug).run()
    const mutedRes = await request('/api/public-messages', {
      method: 'POST',
      headers: classmateHeaders(tokenA),
      body: JSON.stringify({ content: '被禁言后发送', cardStyle: 'paper' }),
    })
    expect(mutedRes.status).toBe(403)
  })

  it('keeps the new group-chat endpoint behavior unchanged after service extraction', async () => {
    const tokenB = await loginClassmate(B.slug)
    const nonce = 'legacy-compat-dedup-nonce'

    // First POST
    const res1 = await request('/api/group-chat/messages', {
      method: 'POST',
      headers: classmateHeaders(tokenB),
      body: JSON.stringify({ content: '去重测试消息', clientNonce: nonce }),
    })
    expect(res1.status).toBe(201)
    const body1 = await res1.json() as any

    // Second POST with same nonce should be idempotent
    const res2 = await request('/api/group-chat/messages', {
      method: 'POST',
      headers: classmateHeaders(tokenB),
      body: JSON.stringify({ content: '去重测试消息', clientNonce: nonce }),
    })
    expect(res2.status).toBe(200)
    const body2 = await res2.json() as any

    // Both responses should have the same ID
    expect(body1.data.id).toBe(body2.data.id)
  })

  it('legacy reactions apply to visible status messages', async () => {
    // Insert a visible message
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, card_style, status, reactions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '{}', datetime('now'), datetime('now'))"
    ).bind('legacy-compat-visible', A.slug, A.name, '互动消息', 'paper', 'visible').run()

    const tokenA = await loginClassmate(A.slug)
    const res = await request('/api/public-messages/legacy-compat-visible/react', {
      method: 'PUT',
      headers: classmateHeaders(tokenA),
      body: JSON.stringify({ reaction: '❤️' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.data.reactions['❤️']).toBe(1)
  })
})

describe('Historical review compatibility', () => {
  it('reviews historical pending messages without restoring the approved database status', async () => {
    // Insert a pending message
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, card_style, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
    ).bind('legacy-compat-pending', A.slug, A.name, '待审核消息', 'paper', 'pending').run()

    const adminToken = await loginAdmin()

    // Approve the pending message
    const approveRes = await request(`/api/admin/public-messages/legacy-compat-pending/approve`, {
      method: 'PUT',
      headers: adminHeaders(adminToken),
    })
    expect(approveRes.status).toBe(200)

    // Database status should become 'visible'
    const row = await env.DB.prepare(
      "SELECT status FROM public_messages WHERE id = 'legacy-compat-pending'"
    ).first() as any
    expect(row.status).toBe('visible')

    // Admin GET with status=approved should find this record
    const adminGetRes = await request('/api/admin/public-messages?status=approved', {
      headers: adminHeaders(adminToken),
    })
    expect(adminGetRes.status).toBe(200)
    const adminBody = await adminGetRes.json() as any
    expect(adminBody.data.some((m: any) => m.id === 'legacy-compat-pending')).toBe(true)

    // A notification and at least one notification_sync_event should exist
    const notifCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE recipient_slug = ? AND related_id = ?"
    ).bind(A.slug, 'legacy-compat-pending').first() as any
    expect(notifCount.count).toBeGreaterThanOrEqual(1)

    const syncCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM notification_sync_events WHERE recipient_slug = ?"
    ).bind(A.slug).first() as any
    expect(syncCount.count).toBeGreaterThanOrEqual(1)

    // Re-approving a non-pending content should return 409
    const reApproveRes = await request(`/api/admin/public-messages/legacy-compat-pending/approve`, {
      method: 'PUT',
      headers: adminHeaders(adminToken),
    })
    expect(reApproveRes.status).toBe(409)
  })
})

describe('Legacy mailbox compatibility', () => {
  it('returns 410 for every legacy mailbox write without parsing or writing the payload', async () => {
    const tokenA = await loginClassmate(A.slug)

    // Count rows before
    const beforeThreads = await env.DB.prepare("SELECT COUNT(*) AS count FROM mail_threads").first() as any
    const beforeMessages = await env.DB.prepare("SELECT COUNT(*) AS count FROM mail_messages").first() as any
    const beforeRecipients = await env.DB.prepare("SELECT COUNT(*) AS count FROM mail_recipients").first() as any

    // POST /api/mailbox/threads with intentionally invalid body
    const res1 = await request('/api/mailbox/threads', {
      method: 'POST',
      headers: classmateHeaders(tokenA),
      body: '<<invalid json>>',
    })
    expect(res1.status).toBe(410)
    const body1 = await res1.json() as any
    expect(body1.message).toContain('已停用')

    // POST /api/mailbox/threads/:id/messages with intentionally invalid body
    const res2 = await request('/api/mailbox/threads/fake-thread-id/messages', {
      method: 'POST',
      headers: classmateHeaders(tokenA),
      body: '<<invalid json>>',
    })
    expect(res2.status).toBe(410)
    const body2 = await res2.json() as any
    expect(body2.message).toContain('已停用')

    // Row counts should not change
    const afterThreads = await env.DB.prepare("SELECT COUNT(*) AS count FROM mail_threads").first() as any
    const afterMessages = await env.DB.prepare("SELECT COUNT(*) AS count FROM mail_messages").first() as any
    const afterRecipients = await env.DB.prepare("SELECT COUNT(*) AS count FROM mail_recipients").first() as any

    expect(afterThreads.count).toBe(beforeThreads.count)
    expect(afterMessages.count).toBe(beforeMessages.count)
    expect(afterRecipients.count).toBe(beforeRecipients.count)
  })

  it('legacy mailbox GET authorization: recipient can read, creator can read, third party gets 403', async () => {
    // Insert a legacy thread via SQL
    await env.DB.prepare(
      "INSERT INTO mail_threads (id, subject, thread_type, created_by_type, created_by_slug, allow_reply, created_at, updated_at) VALUES (?, ?, 'private', 'student', ?, 1, datetime('now'), datetime('now'))"
    ).bind('legacy-compat-thread-1', '测试信件', A.slug).run()
    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES (?, ?, 'student', ?, ?, datetime('now'))"
    ).bind('legacy-compat-msg-1', 'legacy-compat-thread-1', A.slug, '你好，这是一封测试信').run()
    await env.DB.prepare(
      "INSERT INTO mail_recipients (id, thread_id, recipient_slug) VALUES (?, ?, ?)"
    ).bind('legacy-compat-rcp-1', 'legacy-compat-thread-1', B.slug).run()

    // Anonymous GET should be 401 for all three endpoints
    const anonList = await request('/api/mailbox/threads')
    expect(anonList.status).toBe(401)
    const anonDetail = await request('/api/mailbox/threads/legacy-compat-thread-1')
    expect(anonDetail.status).toBe(401)

    // Recipient (B) can access list and detail
    const tokenB = await loginClassmate(B.slug)
    const listRes = await request('/api/mailbox/threads', {
      headers: { 'X-Classmate-Token': tokenB },
    })
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json() as any
    expect(listBody.data.items.some((t: any) => t.id === 'legacy-compat-thread-1')).toBe(true)

    const detailRes = await request('/api/mailbox/threads/legacy-compat-thread-1', {
      headers: { 'X-Classmate-Token': tokenB },
    })
    expect(detailRes.status).toBe(200)

    // Creator (A) can access detail
    const tokenA = await loginClassmate(A.slug)
    const creatorRes = await request('/api/mailbox/threads/legacy-compat-thread-1', {
      headers: { 'X-Classmate-Token': tokenA },
    })
    expect(creatorRes.status).toBe(200)

    // Third party (C) gets 403
    const tokenC = await loginClassmate(C.slug)
    const thirdRes = await request('/api/mailbox/threads/legacy-compat-thread-1', {
      headers: { 'X-Classmate-Token': tokenC },
    })
    expect(thirdRes.status).toBe(403)
  })
})
