import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { getActiveMute, listGroupMessages } from '../src/lib/groupChat'
import { initTestDb } from './db-helper'

const PRIMARY_SLUG = 'group-chat-primary'
const OTHER_SLUG = 'group-chat-other'
const PRIMARY_TOKEN = 'group-chat-primary-token'
const OTHER_TOKEN = 'group-chat-other-token'

async function request(path: string, options: RequestInit = {}) {
  const ctx = createExecutionContext()
  const res = await worker.fetch(new Request(`http://localhost${path}`, options), env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

function classmateHeaders(token: string) {
  return { 'Content-Type': 'application/json', 'X-Classmate-Token': token }
}

beforeAll(async () => {
  await initTestDb(env.DB)
})

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM group_chat_reactions WHERE reactor_slug IN (?, ?)').bind(PRIMARY_SLUG, OTHER_SLUG),
    env.DB.prepare('DELETE FROM public_messages WHERE author_slug IN (?, ?)').bind(PRIMARY_SLUG, OTHER_SLUG),
    env.DB.prepare('DELETE FROM group_chat_mutes WHERE student_slug IN (?, ?)').bind(PRIMARY_SLUG, OTHER_SLUG),
    env.DB.prepare('DELETE FROM classmate_sessions WHERE student_slug IN (?, ?)').bind(PRIMARY_SLUG, OTHER_SLUG),
    env.DB.prepare("INSERT OR REPLACE INTO students (id, name, slug, account_status, account_initial_password_changed) VALUES ('group-chat-primary-id', '群聊甲', ?, 'active', 1)").bind(PRIMARY_SLUG),
    env.DB.prepare("INSERT OR REPLACE INTO students (id, name, slug, account_status, account_initial_password_changed) VALUES ('group-chat-other-id', '群聊乙', ?, 'active', 1)").bind(OTHER_SLUG),
    env.DB.prepare("INSERT OR REPLACE INTO classmate_sessions (token, student_slug, expires_at) VALUES (?, ?, datetime('now', '+1 day'))").bind(PRIMARY_TOKEN, PRIMARY_SLUG),
    env.DB.prepare("INSERT OR REPLACE INTO classmate_sessions (token, student_slug, expires_at) VALUES (?, ?, datetime('now', '+1 day'))").bind(OTHER_TOKEN, OTHER_SLUG),
  ])
})

async function seedHistory(count: number) {
  await env.DB.batch(Array.from({ length: count }, (_, index) => env.DB.prepare(
    'INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    `group-chat-history-${String(index).padStart(2, '0')}`,
    PRIMARY_SLUG,
    '群聊甲',
    `历史消息 ${index}`,
    'visible',
    `2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
    `2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
  )))
}

describe('Group chat API', () => {
  it('without X-Classmate-Token returns 401', async () => {
    const res = await request('/api/group-chat/messages')
    expect(res.status).toBe(401)
  })

  it('rejects a non-empty invalid before cursor', async () => {
    const res = await request('/api/group-chat/messages?before=not-a-cursor', { headers: classmateHeaders(PRIMARY_TOKEN) })
    expect(res.status).toBe(400)
  })

  it('creates a visible message and retries the same client nonce idempotently', async () => {
    const body = { content: '  第一条群聊消息  ', clientNonce: 'group-chat-create-1' }
    const first = await request('/api/group-chat/messages', {
      method: 'POST', headers: classmateHeaders(PRIMARY_TOKEN), body: JSON.stringify(body),
    })
    const firstPayload = await first.json() as any

    expect(first.status).toBe(201)
    expect(firstPayload.data.content).toBe('第一条群聊消息')
    expect(firstPayload.data.status).toBe('visible')

    const repeated = await request('/api/group-chat/messages', {
      method: 'POST', headers: classmateHeaders(PRIMARY_TOKEN), body: JSON.stringify(body),
    })
    const repeatedPayload = await repeated.json() as any

    expect(repeated.status).toBe(200)
    expect(repeatedPayload.data.id).toBe(firstPayload.data.id)
  })

  it('handles concurrent requests with the same client nonce idempotently', async () => {
    const body = JSON.stringify({ content: '并发幂等消息', clientNonce: 'group-chat-concurrent-nonce' })
    const [first, second] = await Promise.all([
      request('/api/group-chat/messages', { method: 'POST', headers: classmateHeaders(PRIMARY_TOKEN), body }),
      request('/api/group-chat/messages', { method: 'POST', headers: classmateHeaders(PRIMARY_TOKEN), body }),
    ])
    const [firstPayload, secondPayload] = await Promise.all([first.json(), second.json()]) as any[]
    const stored = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM public_messages WHERE author_slug = ? AND client_nonce = ?'
    ).bind(PRIMARY_SLUG, 'group-chat-concurrent-nonce').first() as any

    expect([first.status, second.status].sort()).toEqual([200, 201])
    expect(firstPayload.data.id).toBe(secondPayload.data.id)
    expect(stored.count).toBe(1)
  })

  it('returns at most 30 latest messages in ascending response order', async () => {
    await seedHistory(31)

    const res = await request('/api/group-chat/messages?limit=100', { headers: classmateHeaders(PRIMARY_TOKEN) })
    const payload = await res.json() as any
    const items = payload.data.items

    expect(res.status).toBe(200)
    expect(items).toHaveLength(30)
    expect(items.map((item: any) => item.id)).toEqual([...items].sort((a: any, b: any) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map((item: any) => item.id))
    expect(items.some((item: any) => item.id === 'group-chat-history-00')).toBe(false)
  })

  it('uses the before cursor to load older messages without duplicates', async () => {
    await seedHistory(20)
    const latest = await request('/api/group-chat/messages?limit=10', { headers: classmateHeaders(PRIMARY_TOKEN) })
    const latestPayload = await latest.json() as any
    const older = await request(`/api/group-chat/messages?limit=10&before=${encodeURIComponent(latestPayload.data.nextCursor)}`, { headers: classmateHeaders(PRIMARY_TOKEN) })
    const olderPayload = await older.json() as any

    expect(older.status).toBe(200)
    expect(olderPayload.data.items).toHaveLength(10)
    expect(olderPayload.data.items.some((item: any) => latestPayload.data.items.some((latestItem: any) => latestItem.id === item.id))).toBe(false)
  })

  it('orders and paginates mixed legacy and ISO timestamps chronologically', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-mixed-1', ?, '群聊甲', '旧格式最早', 'visible', '2026-05-10 09:00:00', '2026-05-10 09:00:00')").bind(PRIMARY_SLUG),
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-mixed-2', ?, '群聊甲', 'ISO 第二条', 'visible', '2026-05-10T10:00:00.000Z', '2026-05-10T10:00:00.000Z')").bind(PRIMARY_SLUG),
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-mixed-3', ?, '群聊甲', '旧格式第三条', 'visible', '2026-05-10 11:00:00', '2026-05-10 11:00:00')").bind(PRIMARY_SLUG),
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-mixed-4', ?, '群聊甲', 'ISO 最新', 'visible', '2026-05-10T12:00:00.000Z', '2026-05-10T12:00:00.000Z')").bind(PRIMARY_SLUG),
    ])

    const latest = await request('/api/group-chat/messages?limit=2', { headers: classmateHeaders(PRIMARY_TOKEN) })
    const latestPayload = await latest.json() as any
    const older = await request(`/api/group-chat/messages?limit=2&before=${encodeURIComponent(latestPayload.data.nextCursor)}`, { headers: classmateHeaders(PRIMARY_TOKEN) })
    const olderPayload = await older.json() as any

    expect(latest.status).toBe(200)
    expect(older.status).toBe(200)
    expect(latestPayload.data.items.map((item: any) => item.id)).toEqual(['group-chat-mixed-3', 'group-chat-mixed-4'])
    expect(olderPayload.data.items.map((item: any) => item.id)).toEqual(['group-chat-mixed-1', 'group-chat-mixed-2'])
    expect([...latestPayload.data.items, ...olderPayload.data.items].map((item: any) => item.id).sort()).toEqual([
      'group-chat-mixed-1', 'group-chat-mixed-2', 'group-chat-mixed-3', 'group-chat-mixed-4',
    ])
  })

  it('returns mixed-format updates after the composite cursor in update order', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-updated-a', ?, '群聊甲', '游标之前', 'visible', '2026-06-01T04:00:00.000Z', '2026-06-01 08:00:00')").bind(PRIMARY_SLUG),
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-updated-b', ?, '群聊甲', '游标边界', 'visible', '2026-06-01T05:00:00.000Z', '2026-06-01 09:00:00')").bind(PRIMARY_SLUG),
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-updated-c', ?, '群聊甲', '同刻后续', 'visible', '2026-06-01T12:00:00.000Z', '2026-06-01T09:00:00.000Z')").bind(PRIMARY_SLUG),
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-updated-d', ?, '群聊甲', '旧格式后续', 'visible', '2026-06-01T10:00:00.000Z', '2026-06-01 10:00:00')").bind(PRIMARY_SLUG),
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-updated-e', ?, '群聊甲', 'ISO 最新更新', 'visible', '2026-06-01T11:00:00.000Z', '2026-06-01T11:00:00.000Z')").bind(PRIMARY_SLUG),
    ])
    const updatedAfter = { timestamp: '2026-06-01 09:00:00', id: 'group-chat-updated-b' }

    const items = await listGroupMessages(env.DB, PRIMARY_SLUG, { updatedAfter, limit: 10 })

    expect(items.map((item) => item.id)).toEqual([
      'group-chat-updated-c', 'group-chat-updated-d', 'group-chat-updated-e',
    ])
    await expect(listGroupMessages(env.DB, PRIMARY_SLUG, {
      before: updatedAfter,
      updatedAfter,
      limit: 10,
    })).rejects.toThrow('before 和 updatedAfter 不能同时使用')
  })

  it('mine includes only the current account non-public messages', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO public_messages (id, author_slug, author_name, content, status, moderation_reason, recalled_at, created_at, updated_at) VALUES ('group-chat-mine-pending', ?, '群聊甲', '待审核正文', 'pending', '待审核原因', NULL, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z')").bind(PRIMARY_SLUG),
      env.DB.prepare("INSERT OR REPLACE INTO public_messages (id, author_slug, author_name, content, status, moderation_reason, recalled_at, created_at, updated_at) VALUES ('group-chat-mine-hidden', ?, '群聊甲', '隐藏正文', 'hidden', '隐藏原因', NULL, '2026-02-01T00:00:01.000Z', '2026-02-01T00:00:01.000Z')").bind(PRIMARY_SLUG),
      env.DB.prepare("INSERT OR REPLACE INTO public_messages (id, author_slug, author_name, content, status, moderation_reason, recalled_at, created_at, updated_at) VALUES ('group-chat-mine-recalled', ?, '群聊甲', '撤回正文', 'recalled_by_author', NULL, '2026-02-01T00:00:02.000Z', '2026-02-01T00:00:02.000Z', '2026-02-01T00:00:02.000Z')").bind(PRIMARY_SLUG),
      env.DB.prepare("INSERT OR REPLACE INTO public_messages (id, author_slug, author_name, content, status, moderation_reason, created_at, updated_at) VALUES ('group-chat-other-private', ?, '群聊乙', '他人待审核正文', 'rejected', '他人原因', '2026-02-01T00:00:03.000Z', '2026-02-01T00:00:03.000Z')").bind(OTHER_SLUG),
    ])

    const res = await request('/api/group-chat/mine?limit=30', { headers: classmateHeaders(PRIMARY_TOKEN) })
    const payload = await res.json() as any
    const byId = new Map(payload.data.items.map((item: any) => [item.id, item]))

    expect(res.status).toBe(200)
    expect(byId.get('group-chat-mine-pending')).toMatchObject({ content: '待审核正文', moderationReason: '待审核原因' })
    expect(byId.get('group-chat-mine-hidden')).toMatchObject({ content: '隐藏正文', moderationReason: '隐藏原因' })
    expect(byId.get('group-chat-mine-recalled').content).toBeNull()
    expect(byId.has('group-chat-other-private')).toBe(false)
  })

  it('does not count messages outside the 30-second rate limit window', async () => {
    const outsideWindow = new Date(Date.now() - 31_000).toISOString()
    await env.DB.batch(Array.from({ length: 6 }, (_, index) => env.DB.prepare(
      'INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(`group-chat-outside-${index}`, PRIMARY_SLUG, '群聊甲', `窗口外 ${index}`, 'visible', outsideWindow, outsideWindow)))

    const res = await request('/api/group-chat/messages', {
      method: 'POST', headers: classmateHeaders(PRIMARY_TOKEN), body: JSON.stringify({ content: '窗口外后可发送', clientNonce: 'outside-window-send' }),
    })

    expect(res.status).toBe(201)
  })

  it('returns null for an expired mute', async () => {
    const expiredAt = new Date(Date.now() - 60_000).toISOString()
    await env.DB.prepare(
      'INSERT INTO group_chat_mutes (student_slug, muted_until, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(PRIMARY_SLUG, expiredAt, '已过期禁言', expiredAt, expiredAt).run()

    expect(await getActiveMute(env.DB, PRIMARY_SLUG)).toBeNull()
    await env.DB.prepare('DELETE FROM group_chat_mutes WHERE student_slug = ?').bind(PRIMARY_SLUG).run()
  })

  it('returns active mute information', async () => {
    const activeUntil = new Date(Date.now() + 60_000).toISOString()
    const now = new Date().toISOString()
    await env.DB.prepare(
      'INSERT INTO group_chat_mutes (student_slug, muted_until, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(PRIMARY_SLUG, activeUntil, '有效禁言', now, now).run()

    await expect(getActiveMute(env.DB, PRIMARY_SLUG)).resolves.toEqual({ reason: '有效禁言', mutedUntil: activeUntil })
  })
})
