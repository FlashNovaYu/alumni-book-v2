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
    new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
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

  it('rejects encoded cursors with an invalid timestamp for history and sync', async () => {
    const invalidTimestampCursor = btoa(JSON.stringify({ timestamp: 'invalid', id: 'message-id' }))
    const [history, sync] = await Promise.all([
      request(`/api/group-chat/messages?before=${encodeURIComponent(invalidTimestampCursor)}`, { headers: classmateHeaders(PRIMARY_TOKEN) }),
      request(`/api/group-chat/sync?cursor=${encodeURIComponent(invalidTimestampCursor)}`, { headers: classmateHeaders(PRIMARY_TOKEN) }),
    ])

    expect(history.status).toBe(400)
    expect(sync.status).toBe(400)
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

  it('adds, removes, and replaces the current reaction', async () => {
    const now = new Date().toISOString()
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, reactions, status, created_at, updated_at) VALUES ('group-chat-reaction', ?, '群聊甲', '正文', '{\"👍\":2}', 'visible', ?, ?)"
    ).bind(PRIMARY_SLUG, now, now).run()

    const react = (reaction: string) => request('/api/group-chat/messages/group-chat-reaction/reaction', {
      method: 'PUT', headers: classmateHeaders(OTHER_TOKEN), body: JSON.stringify({ reaction }),
    })
    const added = await react('❤️')
    const addedPayload = await added.json() as any
    const removed = await react('❤️')
    const removedPayload = await removed.json() as any
    const replaced = await react('😂')
    const replacedPayload = await replaced.json() as any

    expect(added.status).toBe(200)
    expect(addedPayload.data).toMatchObject({ reactionCounts: { '👍': 2, '❤️': 1 }, myReaction: '❤️' })
    expect(removedPayload.data).toMatchObject({ reactionCounts: { '👍': 2 }, myReaction: null })
    expect(replacedPayload.data).toMatchObject({ reactionCounts: { '👍': 2, '😂': 1 }, myReaction: '😂' })
  })

  it('updates a reacted message so sync returns the old message change', async () => {
    const oldTime = '2026-01-01T00:00:00.000Z'
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-sync-reaction', ?, '群聊甲', '正文', 'visible', ?, ?)"
    ).bind(PRIMARY_SLUG, oldTime, oldTime).run()
    const cursor = btoa(JSON.stringify({ timestamp: oldTime, id: 'group-chat-sync-reaction' }))

    const reaction = await request('/api/group-chat/messages/group-chat-sync-reaction/reaction', {
      method: 'PUT', headers: classmateHeaders(OTHER_TOKEN), body: JSON.stringify({ reaction: '🎉' }),
    })
    const sync = await request(`/api/group-chat/sync?cursor=${encodeURIComponent(cursor)}`, { headers: classmateHeaders(OTHER_TOKEN) })
    const payload = await sync.json() as any

    expect(reaction.status).toBe(200)
    expect(payload.data.items).toEqual([expect.objectContaining({ id: 'group-chat-sync-reaction', myReaction: '🎉' })])
  })

  it('lets the author recall a visible message inside two minutes', async () => {
    const now = new Date().toISOString()
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-recall-own', ?, '群聊甲', '待撤回', 'visible', ?, ?)"
    ).bind(PRIMARY_SLUG, now, now).run()

    const res = await request('/api/group-chat/messages/group-chat-recall-own', { method: 'DELETE', headers: classmateHeaders(PRIMARY_TOKEN) })
    const payload = await res.json() as any

    expect(res.status).toBe(200)
    expect(payload.data).toMatchObject({ id: 'group-chat-recall-own', status: 'recalled_by_author', content: null })
    await expect(env.DB.prepare("SELECT status, recalled_by_type, recalled_at FROM public_messages WHERE id = 'group-chat-recall-own'").first()).resolves.toMatchObject({ status: 'recalled_by_author', recalled_by_type: 'student' })
  })

  it('rejects author recall after two minutes and hides non-author existence', async () => {
    const oldTime = new Date(Date.now() - 121_000).toISOString()
    const now = new Date().toISOString()
    await env.DB.batch([
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-recall-late', ?, '群聊甲', '太晚', 'visible', ?, ?)").bind(PRIMARY_SLUG, oldTime, oldTime),
      env.DB.prepare("INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-recall-other', ?, '群聊甲', '他人', 'visible', ?, ?)").bind(PRIMARY_SLUG, now, now),
    ])

    const late = await request('/api/group-chat/messages/group-chat-recall-late', { method: 'DELETE', headers: classmateHeaders(PRIMARY_TOKEN) })
    const other = await request('/api/group-chat/messages/group-chat-recall-other', { method: 'DELETE', headers: classmateHeaders(OTHER_TOKEN) })

    expect(late.status).toBe(403)
    expect(other.status).toBe(404)
  })

  it('blocks a muted sender with the mute reason and deletes expired mute before sending', async () => {
    const now = new Date().toISOString()
    const activeUntil = new Date(Date.now() + 60_000).toISOString()
    await env.DB.prepare('INSERT INTO group_chat_mutes (student_slug, muted_until, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(PRIMARY_SLUG, activeUntil, '请冷静', now, now).run()
    const muted = await request('/api/group-chat/messages', {
      method: 'POST', headers: classmateHeaders(PRIMARY_TOKEN), body: JSON.stringify({ content: '不能发', clientNonce: 'muted-message' }),
    })
    expect(muted.status).toBe(403)
    await expect(muted.json()).resolves.toMatchObject({ message: '请冷静' })

    const expiredAt = new Date(Date.now() - 60_000).toISOString()
    await env.DB.prepare('UPDATE group_chat_mutes SET muted_until = ? WHERE student_slug = ?').bind(expiredAt, PRIMARY_SLUG).run()
    const allowed = await request('/api/group-chat/messages', {
      method: 'POST', headers: classmateHeaders(PRIMARY_TOKEN), body: JSON.stringify({ content: '现在可发', clientNonce: 'expired-mute-message' }),
    })
    expect(allowed.status).toBe(201)
    await expect(env.DB.prepare('SELECT * FROM group_chat_mutes WHERE student_slug = ?').bind(PRIMARY_SLUG).first()).resolves.toBeNull()
  })

  it('rejects the seventh visible or recalled message in thirty seconds with Retry-After', async () => {
    const now = new Date().toISOString()
    await env.DB.batch(Array.from({ length: 6 }, (_, index) => env.DB.prepare(
      'INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(`group-chat-rate-${index}`, PRIMARY_SLUG, '群聊甲', `近期 ${index}`, index === 0 ? 'recalled_by_author' : 'visible', now, now)))

    const res = await request('/api/group-chat/messages', {
      method: 'POST', headers: classmateHeaders(PRIMARY_TOKEN), body: JSON.stringify({ content: '第七条', clientNonce: 'seventh-message' }),
    })
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
    expect(Number(res.headers.get('Retry-After'))).toBeLessThanOrEqual(30)
  })

  it('returns an hourly Retry-After when sixty messages are outside the short window', async () => {
    const createdAt = new Date(Date.now() - 10 * 60_000).toISOString()
    await env.DB.batch(Array.from({ length: 60 }, (_, index) => env.DB.prepare(
      'INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(`group-chat-hourly-${index}`, PRIMARY_SLUG, '群聊甲', `每小时 ${index}`, 'visible', createdAt, createdAt)))

    const res = await request('/api/group-chat/messages', {
      method: 'POST', headers: classmateHeaders(PRIMARY_TOKEN), body: JSON.stringify({ content: '小时第六十一条', clientNonce: 'hourly-limit-message' }),
    })
    const retryAfter = Number(res.headers.get('Retry-After'))

    expect(res.status).toBe(429)
    expect(retryAfter).toBeGreaterThan(30)
    expect(retryAfter).toBeLessThanOrEqual(3600)
  })

  it('sync returns a hidden tombstone and rejects an invalid non-empty cursor', async () => {
    const oldTime = '2026-01-01T00:00:00.000Z'
    const now = new Date().toISOString()
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-hidden-sync', ?, '群聊甲', '已隐藏', 'hidden', ?, ?)"
    ).bind(PRIMARY_SLUG, oldTime, now).run()
    const cursor = btoa(JSON.stringify({ timestamp: oldTime, id: 'group-chat-hidden-before' }))
    const sync = await request(`/api/group-chat/sync?cursor=${encodeURIComponent(cursor)}`, { headers: classmateHeaders(OTHER_TOKEN) })
    const invalid = await request('/api/group-chat/sync?cursor=invalid', { headers: classmateHeaders(OTHER_TOKEN) })
    const payload = await sync.json() as any

    expect(sync.status).toBe(200)
    expect(payload.data.items).toEqual([expect.objectContaining({ id: 'group-chat-hidden-sync', status: 'hidden', content: null })])
    expect(invalid.status).toBe(400)
  })

  it('paginates a sync backlog larger than thirty messages without gaps or duplicates', async () => {
    await seedHistory(61)
    const ids: string[] = []
    let cursor: string | null = null

    do {
      const res = await request(`/api/group-chat/sync${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: classmateHeaders(PRIMARY_TOKEN) })
      const payload = await res.json() as any
      expect(res.status).toBe(200)
      ids.push(...payload.data.items.map((item: any) => item.id))
      cursor = payload.data.cursor
      if (payload.data.items.length === 0) break
    } while (true)

    expect(ids).toHaveLength(61)
    expect(new Set(ids).size).toBe(61)
    expect(ids.sort()).toEqual(Array.from({ length: 61 }, (_, index) => `group-chat-history-${String(index).padStart(2, '0')}`))
  })

  it('keeps updates written after a sync boundary for the next round', async () => {
    const beforeBoundary = '2026-01-01T00:00:00.000Z'
    const boundary = '2026-01-01T00:01:00.000Z'
    const afterBoundary = '2026-01-01T00:02:00.000Z'
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-snapshot-old', ?, '群聊甲', '首轮消息', 'visible', ?, ?)"
    ).bind(PRIMARY_SLUG, beforeBoundary, beforeBoundary).run()

    const firstRound = await listGroupMessages(env.DB, PRIMARY_SLUG, {
      updatedAfter: { timestamp: '1970-01-01T00:00:00.000Z', id: '' },
      updatedBefore: { timestamp: boundary, id: '\uffff' },
      includeStatusChanges: true,
      limit: 31,
    })
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('group-chat-snapshot-new', ?, '群聊甲', '次轮消息', 'visible', ?, ?)"
    ).bind(PRIMARY_SLUG, afterBoundary, afterBoundary).run()
    const sameBoundary = await listGroupMessages(env.DB, PRIMARY_SLUG, {
      updatedAfter: { timestamp: '1970-01-01T00:00:00.000Z', id: '' },
      updatedBefore: { timestamp: boundary, id: '\uffff' },
      includeStatusChanges: true,
      limit: 31,
    })
    const nextRound = await listGroupMessages(env.DB, PRIMARY_SLUG, {
      updatedAfter: { timestamp: boundary, id: '\uffff' },
      updatedBefore: { timestamp: afterBoundary, id: '\uffff' },
      includeStatusChanges: true,
      limit: 31,
    })

    expect(firstRound.map((item) => item.id)).toEqual(['group-chat-snapshot-old'])
    expect(sameBoundary.map((item) => item.id)).toEqual(['group-chat-snapshot-old'])
    expect(nextRound.map((item) => item.id)).toEqual(['group-chat-snapshot-new'])
  })
})
