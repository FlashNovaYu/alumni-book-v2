import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

const AUTHOR_SLUG = 'admin-community-author'
const OTHER_SLUG = 'admin-community-other'

async function request(path: string, options: RequestInit = {}) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(new Request(`http://localhost${path}`, options), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

async function login() {
  const response = await request('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'admin888' }),
  })
  return ((await response.json()) as any).data.token as string
}

function adminHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function seedMessage(id: string, slug = AUTHOR_SLUG) {
  await env.DB.prepare(
    "INSERT INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES (?, ?, ?, '待治理正文', 'visible', datetime('now'), datetime('now'))"
  ).bind(id, slug, slug === AUTHOR_SLUG ? '治理作者' : '治理同学').run()
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

  it('validates governance reasons and lists messages by status', async () => {
    const token = await login()
    await seedMessage('admin-community-visible')
    await seedMessage('admin-community-hidden')
    await env.DB.prepare("UPDATE public_messages SET status = 'hidden' WHERE id = 'admin-community-hidden'").run()
    const invalid = await request('/api/admin/group-chat/messages/admin-community-visible/hide', {
      method: 'PUT', headers: adminHeaders(token), body: JSON.stringify({ hidden: true, reason: '  ' }),
    })
    expect(invalid.status).toBe(400)
    const listed = await request('/api/admin/group-chat/messages?status=hidden', { headers: adminHeaders(token) })
    const payload = await listed.json() as any
    expect(payload.data).toEqual([expect.objectContaining({ id: 'admin-community-hidden', status: 'hidden', author: expect.objectContaining({ slug: AUTHOR_SLUG }) })])
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
})
