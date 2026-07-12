import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'
import { loginTestAdmin } from './admin-test-auth'

const AUTHOR_SLUG = 'admin-community-author'
const OTHER_SLUG = 'admin-community-other'

async function request(path: string, options: RequestInit = {}) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(new Request(`http://localhost${path}`, options), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

async function login() {
  return loginTestAdmin(request)
}

function adminHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function seedMessage(id: string, slug = AUTHOR_SLUG, clientNonce = `group:${id}`) {
  await env.DB.prepare(
    "INSERT INTO public_messages (id, author_slug, author_name, content, status, client_nonce, created_at, updated_at) VALUES (?, ?, ?, '待治理正文', 'visible', ?, datetime('now'), datetime('now'))"
  ).bind(id, slug, slug === AUTHOR_SLUG ? '治理作者' : '治理同学', clientNonce).run()
}

async function notificationCount(type: string, relatedId: string) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM notifications WHERE type = ? AND related_id = ?').bind(type, relatedId).first() as any
  return Number(row?.count || 0)
}

beforeAll(async () => initTestDb(env.DB))

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM content_reviews WHERE content_id LIKE \'admin-community-%\''),
    env.DB.prepare("DELETE FROM notifications WHERE recipient_slug IN (?, ?)").bind(AUTHOR_SLUG, OTHER_SLUG),
    env.DB.prepare('DELETE FROM public_messages WHERE author_slug IN (?, ?)').bind(AUTHOR_SLUG, OTHER_SLUG),
    env.DB.prepare('DELETE FROM group_chat_mutes WHERE student_slug IN (?, ?)').bind(AUTHOR_SLUG, OTHER_SLUG),
    env.DB.prepare("INSERT OR REPLACE INTO students (id, name, slug, account_status, account_initial_password_changed) VALUES ('admin-community-author-id', '治理作者', ?, 'active', 1)").bind(AUTHOR_SLUG),
    env.DB.prepare("INSERT OR REPLACE INTO students (id, name, slug, account_status, account_initial_password_changed) VALUES ('admin-community-other-id', '治理同学', ?, 'active', 1)").bind(OTHER_SLUG),
  ])
})

describe('Admin group chat moderation API', () => {
  it('requires a bearer JWT and a live admin session', async () => {
    expect((await request('/api/admin/group-chat/messages')).status).toBe(401)
    const token = await login()
    await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run()
    expect((await request('/api/admin/group-chat/messages', { headers: adminHeaders(token) })).status).toBe(401)
  })

  it('rejects a same-day expired ISO admin session for moderation and auth verification', async () => {
    const token = await login()
    await env.DB.prepare('UPDATE admin_sessions SET expires_at = ? WHERE token = ?').bind(new Date(Date.now() - 60_000).toISOString(), token).run()
    expect((await request('/api/admin/group-chat/messages', { headers: adminHeaders(token) })).status).toBe(401)
    expect((await request('/api/auth/verify', { headers: adminHeaders(token) })).status).toBe(401)
  })

  it('validates governance reasons and lists messages by status', async () => {
    const token = await login()
    await seedMessage('admin-community-visible')
    await seedMessage('admin-community-hidden')
    await env.DB.prepare("UPDATE public_messages SET status = 'hidden' WHERE id = 'admin-community-hidden'").run()
    const invalid = await request('/api/admin/group-chat/messages/admin-community-visible/hide', {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ hidden: true, reason: '  ' }),
    })
    expect(invalid.status).toBe(400)
    const invalidHidden = await request('/api/admin/group-chat/messages/admin-community-visible/hide', {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ hidden: 'false', reason: '类型错误' }),
    })
    expect(invalidHidden.status).toBe(400)
    const listed = await request('/api/admin/group-chat/messages?status=hidden', { headers: adminHeaders(token) })
    const payload = await listed.json() as any
    expect(payload.data).toEqual([expect.objectContaining({ id: 'admin-community-hidden', status: 'hidden', author: expect.objectContaining({ slug: AUTHOR_SLUG }) })])
  })

  it('separates realtime group chat from historical public submissions', async () => {
    const token = await login()
    await seedMessage('admin-community-realtime')
    await env.DB.prepare(
      "INSERT INTO public_messages (id, author_slug, author_name, content, status, client_nonce, created_at, updated_at) VALUES (?, ?, ?, '历史投稿', 'visible', NULL, datetime('now'), datetime('now'))"
    ).bind('admin-community-history', AUTHOR_SLUG, '治理作者').run()

    const group = await request('/api/admin/group-chat/messages', { headers: adminHeaders(token) })
    const history = await request('/api/admin/public-messages', { headers: adminHeaders(token) })
    const groupItems = ((await group.json()) as any).data
    const historyItems = ((await history.json()) as any).data

    expect(groupItems.map((item: any) => item.id)).toContain('admin-community-realtime')
    expect(groupItems.map((item: any) => item.id)).not.toContain('admin-community-history')
    expect(historyItems.map((item: any) => item.id)).toContain('admin-community-history')
    expect(historyItems.map((item: any) => item.id)).not.toContain('admin-community-realtime')
  })

  it('hides and restores a message idempotently with one notification per state transition', async () => {
    const token = await login()
    await seedMessage('admin-community-hide')
    const hide = () => request('/api/admin/group-chat/messages/admin-community-hide/hide', {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ hidden: true, reason: '违规内容' }),
    })
    expect((await hide()).status).toBe(200)
    expect((await hide()).status).toBe(200)
    expect(await notificationCount('group_chat_hidden', 'admin-community-hide')).toBe(1)
    const restore = () => request('/api/admin/group-chat/messages/admin-community-hide/hide', {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ hidden: false, reason: '复核恢复' }),
    })
    expect((await restore()).status).toBe(200)
    expect((await restore()).status).toBe(200)
    expect(await notificationCount('group_chat_restored', 'admin-community-hide')).toBe(1)
    await expect(env.DB.prepare("SELECT status, moderation_reason FROM public_messages WHERE id = 'admin-community-hide'").first()).resolves.toMatchObject({ status: 'visible', moderation_reason: '复核恢复' })
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM content_reviews WHERE content_id = 'admin-community-hide'").first()).resolves.toMatchObject({ count: 2 })
  })

  it('rejects hide and restore requests for recalled messages', async () => {
    const token = await login()
    await seedMessage('admin-community-recalled-admin')
    await seedMessage('admin-community-recalled-author')
    await env.DB.batch([
      env.DB.prepare("UPDATE public_messages SET status = 'recalled_by_admin' WHERE id = 'admin-community-recalled-admin'"),
      env.DB.prepare("UPDATE public_messages SET status = 'recalled_by_author' WHERE id = 'admin-community-recalled-author'"),
    ])
    const adminRecall = await request('/api/admin/group-chat/messages/admin-community-recalled-admin/hide', {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ hidden: true, reason: '不得恢复' }),
    })
    const authorRecall = await request('/api/admin/group-chat/messages/admin-community-recalled-author/hide', {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ hidden: false, reason: '不得恢复' }),
    })
    expect(adminRecall.status).toBe(409)
    expect(authorRecall.status).toBe(409)
  })

  it('rejects non-string reasons without audit or notifications', async () => {
    const token = await login()
    await seedMessage('admin-community-invalid-hide')
    await seedMessage('admin-community-invalid-recall')
    const hide = await request('/api/admin/group-chat/messages/admin-community-invalid-hide/hide', {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ hidden: true, reason: { text: '对象' } }),
    })
    const recall = await request('/api/admin/group-chat/messages/admin-community-invalid-recall/recall', {
      method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ reason: { text: '对象' } }),
    })
    const mute = await request(`/api/admin/group-chat/mutes/${AUTHOR_SLUG}`, {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ reason: { text: '对象' }, mutedUntil: null }),
    })
    expect([hide.status, recall.status, mute.status]).toEqual([400, 400, 400])
    const invalidTypes = await Promise.all([
      request('/api/admin/group-chat/messages/admin-community-invalid-hide/hide', { method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ hidden: true, reason: ['数组'] }) }),
      request('/api/admin/group-chat/messages/admin-community-invalid-recall/recall', { method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ reason: 1 }) }),
      request(`/api/admin/group-chat/mutes/${AUTHOR_SLUG}`, { method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ reason: false, mutedUntil: null }) }),
    ])
    expect(invalidTypes.map((response) => response.status)).toEqual([400, 400, 400])
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM content_reviews WHERE content_id IN ('admin-community-invalid-hide', 'admin-community-invalid-recall', ?)").bind(AUTHOR_SLUG).first()).resolves.toMatchObject({ count: 0 })
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM notifications WHERE related_id IN ('admin-community-invalid-hide', 'admin-community-invalid-recall', ?)").bind(AUTHOR_SLUG).first()).resolves.toMatchObject({ count: 0 })
  })

  it('makes concurrent hide and recall conditional so recalled messages are never restored to hidden', async () => {
    const token = await login()
    await seedMessage('admin-community-race')
    const hide = () => request('/api/admin/group-chat/messages/admin-community-race/hide', {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ hidden: true, reason: '并发隐藏' }),
    })
    await Promise.all([hide(), hide()])
    expect(await notificationCount('group_chat_hidden', 'admin-community-race')).toBe(1)
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM content_reviews WHERE content_id = 'admin-community-race' AND action = 'hide'").first()).resolves.toMatchObject({ count: 1 })

    await env.DB.prepare("UPDATE public_messages SET status = 'visible', moderation_reason = NULL WHERE id = 'admin-community-race'").run()
    const recall = () => request('/api/admin/group-chat/messages/admin-community-race/recall', {
      method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ reason: '并发撤回' }),
    })
    await Promise.all([hide(), recall()])
    await expect(env.DB.prepare("SELECT status FROM public_messages WHERE id = 'admin-community-race'").first()).resolves.toMatchObject({ status: 'recalled_by_admin' })
    const repeatRecall = await recall()
    expect(repeatRecall.status).toBe(200)
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM content_reviews WHERE content_id = 'admin-community-race' AND action = 'recall'").first()).resolves.toMatchObject({ count: 1 })
  })

  it('recalls a message once and uses the stable notification id', async () => {
    const token = await login()
    await seedMessage('admin-community-recall')
    const recall = () => request('/api/admin/group-chat/messages/admin-community-recall/recall', {
      method: 'POST', headers: adminHeaders(token), body: JSON.stringify({ reason: '严重违规' }),
    })
    expect((await recall()).status).toBe(200)
    expect((await recall()).status).toBe(200)
    await expect(env.DB.prepare("SELECT status, recalled_by_type, moderation_reason FROM public_messages WHERE id = 'admin-community-recall'").first()).resolves.toMatchObject({ status: 'recalled_by_admin', recalled_by_type: 'admin', moderation_reason: '严重违规' })
    await expect(env.DB.prepare("SELECT id FROM notifications WHERE related_id = 'admin-community-recall'").first()).resolves.toMatchObject({ id: 'ntf_group_recall_admin-community-recall' })
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM content_reviews WHERE content_id = 'admin-community-recall'").first()).resolves.toMatchObject({ count: 1 })
  })

  it('mutes temporarily or permanently and unmutes idempotently', async () => {
    const token = await login()
    const mute = (mutedUntil: string | null, reason = '请冷静') => request(`/api/admin/group-chat/mutes/${AUTHOR_SLUG}`, {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ reason, mutedUntil }),
    })
    expect((await mute('not-a-date')).status).toBe(400)
    expect((await mute('2030-01-01 12:00:00')).status).toBe(400)
    expect((await mute('2030-02-31T12:00:00Z')).status).toBe(400)
    expect((await mute('2030-02-29T12:00:00Z')).status).toBe(400)
    expect((await mute('2030-01-01T24:00:00Z')).status).toBe(400)
    const future = new Date(Date.now() + 60_000).toISOString()
    expect((await mute(future)).status).toBe(200)
    expect((await mute(future)).status).toBe(200)
    expect(await notificationCount('group_chat_muted', AUTHOR_SLUG)).toBe(1)
    expect((await mute(null, '永久禁言')).status).toBe(200)
    await expect(env.DB.prepare('SELECT muted_until, reason FROM group_chat_mutes WHERE student_slug = ?').bind(AUTHOR_SLUG).first()).resolves.toMatchObject({ muted_until: null, reason: '永久禁言' })
    const unmute = () => request(`/api/admin/group-chat/mutes/${AUTHOR_SLUG}`, { method: 'DELETE', headers: adminHeaders(token) })
    expect((await unmute()).status).toBe(200)
    expect((await unmute()).status).toBe(200)
    expect(await notificationCount('group_chat_unmuted', AUTHOR_SLUG)).toBe(1)
  })

  it('accepts a future offset ISO time only when its calendar fields are valid', async () => {
    const token = await login()
    const response = await request(`/api/admin/group-chat/mutes/${OTHER_SLUG}`, {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ reason: '时区禁言', mutedUntil: '2030-01-01T12:00:00+08:00' }),
    })
    expect(response.status).toBe(200)
    await expect(env.DB.prepare('SELECT muted_until FROM group_chat_mutes WHERE student_slug = ?').bind(OTHER_SLUG).first()).resolves.toMatchObject({ muted_until: '2030-01-01T12:00:00+08:00' })
  })

  it('makes concurrent mute and unmute write one audit and notification with mute content type', async () => {
    const token = await login()
    const future = new Date(Date.now() + 60_000).toISOString()
    const mute = () => request(`/api/admin/group-chat/mutes/${OTHER_SLUG}`, {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ reason: '并发禁言', mutedUntil: future }),
    })
    await Promise.all([mute(), mute()])
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM content_reviews WHERE content_type = 'group_chat_mute' AND content_id = ? AND action = 'mute'").bind(OTHER_SLUG).first()).resolves.toMatchObject({ count: 1 })
    expect(await notificationCount('group_chat_muted', OTHER_SLUG)).toBe(1)
    const unmute = () => request(`/api/admin/group-chat/mutes/${OTHER_SLUG}`, { method: 'DELETE', headers: adminHeaders(token) })
    await Promise.all([unmute(), unmute()])
    await expect(env.DB.prepare("SELECT COUNT(*) AS count FROM content_reviews WHERE content_type = 'group_chat_mute' AND content_id = ? AND action = 'unmute'").bind(OTHER_SLUG).first()).resolves.toMatchObject({ count: 1 })
    expect(await notificationCount('group_chat_unmuted', OTHER_SLUG)).toBe(1)
  })
})
