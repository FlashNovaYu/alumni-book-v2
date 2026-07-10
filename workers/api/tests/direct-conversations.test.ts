import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

const STUDENT_A = 'direct-student-a'
const STUDENT_B = 'direct-student-b'
const STUDENT_C = 'direct-student-c'
const TOKEN_A = 'direct-token-a'
const TOKEN_B = 'direct-token-b'
const TOKEN_C = 'direct-token-c'

async function request(path: string, options: RequestInit = {}) {
  const ctx = createExecutionContext()
  const res = await worker.fetch(new Request(`http://localhost${path}`, options), env, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

function headers(token: string) {
  return { 'Content-Type': 'application/json', 'X-Classmate-Token': token }
}

beforeAll(async () => {
  await initTestDb(env.DB)
})

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM direct_messages WHERE sender_slug IN (?, ?, ?) OR recipient_slug IN (?, ?, ?)').bind(STUDENT_A, STUDENT_B, STUDENT_C, STUDENT_A, STUDENT_B, STUDENT_C),
    env.DB.prepare('DELETE FROM direct_conversations WHERE participant_a_slug IN (?, ?, ?) OR participant_b_slug IN (?, ?, ?)').bind(STUDENT_A, STUDENT_B, STUDENT_C, STUDENT_A, STUDENT_B, STUDENT_C),
    env.DB.prepare('DELETE FROM classmate_sessions WHERE student_slug IN (?, ?, ?)').bind(STUDENT_A, STUDENT_B, STUDENT_C),
    env.DB.prepare("INSERT OR REPLACE INTO students (id, name, slug, account_status, account_initial_password_changed) VALUES ('direct-id-a', '同学甲', ?, 'active', 1)").bind(STUDENT_A),
    env.DB.prepare("INSERT OR REPLACE INTO students (id, name, slug, account_status, account_initial_password_changed) VALUES ('direct-id-b', '同学乙', ?, 'active', 1)").bind(STUDENT_B),
    env.DB.prepare("INSERT OR REPLACE INTO students (id, name, slug, account_status, account_initial_password_changed) VALUES ('direct-id-c', '同学丙', ?, 'active', 1)").bind(STUDENT_C),
    env.DB.prepare("INSERT OR REPLACE INTO classmate_sessions (token, student_slug, expires_at) VALUES (?, ?, datetime('now', '+1 day'))").bind(TOKEN_A, STUDENT_A),
    env.DB.prepare("INSERT OR REPLACE INTO classmate_sessions (token, student_slug, expires_at) VALUES (?, ?, datetime('now', '+1 day'))").bind(TOKEN_B, STUDENT_B),
    env.DB.prepare("INSERT OR REPLACE INTO classmate_sessions (token, student_slug, expires_at) VALUES (?, ?, datetime('now', '+1 day'))").bind(TOKEN_C, STUDENT_C),
  ])
})

describe('Direct Conversations API', () => {
  it('requires a classmate session on every endpoint', async () => {
    const endpoints = [
      { path: '/api/direct-conversations', method: 'GET' },
      { path: '/api/direct-conversations', method: 'POST', body: {} },
      { path: '/api/direct-conversations/conv-id/messages', method: 'GET' },
      { path: '/api/direct-conversations/conv-id/messages', method: 'POST', body: {} },
      { path: '/api/direct-conversations/conv-id/read', method: 'PUT', body: {} },
    ]

    for (const ep of endpoints) {
      const res = await request(ep.path, {
        method: ep.method,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      })
      expect(res.status).toBe(401)
    }
  })

  it('rejects self-conversations and locked/non-existent recipients', async () => {
    // 锁定同学C
    await env.DB.prepare("UPDATE students SET account_status = 'locked' WHERE slug = ?").bind(STUDENT_C).run()

    // 1. 发送给自己
    const selfRes = await request('/api/direct-conversations', {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify({ recipientSlug: STUDENT_A, body: 'hello', clientNonce: 'n1' }),
    })
    expect(selfRes.status).toBe(400)

    // 2. 发送给锁定的同学
    const lockedRes = await request('/api/direct-conversations', {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify({ recipientSlug: STUDENT_C, body: 'hello', clientNonce: 'n2' }),
    })
    expect(lockedRes.status).toBe(400)

    // 3. 发送给不存在的同学
    const nonExistentRes = await request('/api/direct-conversations', {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify({ recipientSlug: 'non-existent', body: 'hello', clientNonce: 'n3' }),
    })
    expect(nonExistentRes.status).toBe(400)
  })

  it('creates the first conversation and message in a batch, and reuses it', async () => {
    const payload = { recipientSlug: STUDENT_B, body: '首条消息', clientNonce: 'nonce-1' }
    
    // 1. 创建首条消息和会话
    const res1 = await request('/api/direct-conversations', {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify(payload),
    })
    expect(res1.status).toBe(201)
    const data1 = (await res1.json() as any).data
    expect(data1.conversation.id).toBeDefined()
    expect(data1.message.body).toBe('首条消息')
    expect(data1.message.senderSlug).toBe(STUDENT_A)
    expect(data1.message.recipientSlug).toBe(STUDENT_B)
    expect(data1.message.readAt).toBeUndefined() // 没有 read_at 暴露给发送者
    
    const convId = data1.conversation.id

    // 2. 重复 nonce 应该幂等返回已有的新创建消息 (状态码 200)
    const res2 = await request('/api/direct-conversations', {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify(payload),
    })
    expect(res2.status).toBe(200)
    const data2 = (await res2.json() as any).data
    expect(data2.message.id).toBe(data1.message.id)

    // 3. 验证双方的列表都能看到这个会话
    const listA = await request('/api/direct-conversations', { headers: headers(TOKEN_A) })
    const listB = await request('/api/direct-conversations', { headers: headers(TOKEN_B) })
    expect(listA.status).toBe(200)
    expect(listB.status).toBe(200)

    const itemsA = (await listA.json() as any).data.items
    const itemsB = (await listB.json() as any).data.items
    expect(itemsA).toHaveLength(1)
    expect(itemsB).toHaveLength(1)
    expect(itemsA[0].id).toBe(convId)
    expect(itemsA[0].peer.slug).toBe(STUDENT_B)
    expect(itemsB[0].peer.slug).toBe(STUDENT_A)
    
    // A 刚才发的消息，所以 B 应该有 1 条未读消息，A 有 0 条
    expect(itemsA[0].unreadCount).toBe(0)
    expect(itemsB[0].unreadCount).toBe(1)
  })

  it('returns 404 for a third student accessing detail endpoints', async () => {
    // 1. A 给 B 创建会话
    const createRes = await request('/api/direct-conversations', {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify({ recipientSlug: STUDENT_B, body: 'hello', clientNonce: 'n1' }),
    })
    const data = (await createRes.json() as any).data
    const convId = data.conversation.id

    // 2. C (第三人) 尝试读取消息历史
    const getHistory = await request(`/api/direct-conversations/${convId}/messages`, { headers: headers(TOKEN_C) })
    expect(getHistory.status).toBe(404)

    // 3. C 尝试发送消息
    const postMessage = await request(`/api/direct-conversations/${convId}/messages`, {
      method: 'POST',
      headers: headers(TOKEN_C),
      body: JSON.stringify({ body: 'hack', clientNonce: 'n2' }),
    })
    expect(postMessage.status).toBe(404)

    // 4. C 尝试标记已读
    const putRead = await request(`/api/direct-conversations/${convId}/read`, {
      method: 'PUT',
      headers: headers(TOKEN_C),
      body: JSON.stringify({ throughMessageId: data.message.id }),
    })
    expect(putRead.status).toBe(404)
  })

  it('sends messages inside an existing conversation and supports unread counts', async () => {
    // 1. 创建会话
    const createRes = await request('/api/direct-conversations', {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify({ recipientSlug: STUDENT_B, body: '1', clientNonce: 'n1' }),
    })
    const convId = (await createRes.json() as any).data.conversation.id

    // 2. A 再次向该会话发送消息
    const resA2 = await request(`/api/direct-conversations/${convId}/messages`, {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify({ body: '2', clientNonce: 'n2' }),
    })
    expect(resA2.status).toBe(201)

    // 3. 重复发送 n2 幂等返回
    const resA2Dup = await request(`/api/direct-conversations/${convId}/messages`, {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify({ body: '2', clientNonce: 'n2' }),
    })
    expect(resA2Dup.status).toBe(200)

    // 4. 检查 B 的未读数是否为 2
    const listB = await request('/api/direct-conversations', { headers: headers(TOKEN_B) })
    expect((await listB.json() as any).data.items[0].unreadCount).toBe(2)

    // 5. B 向 A 发送一条消息
    const resB1 = await request(`/api/direct-conversations/${convId}/messages`, {
      method: 'POST',
      headers: headers(TOKEN_B),
      body: JSON.stringify({ body: '3', clientNonce: 'n3' }),
    })
    expect(resB1.status).toBe(201)
    const msgB1Id = (await resB1.json() as any).data.id

    // 此时 A 未读数为 1 (收到 B 的 '3')，B 未读数为 2 (收到 A 的 '1' 和 '2')
    const listA2 = await request('/api/direct-conversations', { headers: headers(TOKEN_A) })
    const listB2 = await request('/api/direct-conversations', { headers: headers(TOKEN_B) })
    expect((await listA2.json() as any).data.items[0].unreadCount).toBe(1)
    expect((await listB2.json() as any).data.items[0].unreadCount).toBe(2)
  })

  it('marks messages as read through a specific message without read receipts for sender', async () => {
    // 1. A 向 B 发送三条消息
    const createRes = await request('/api/direct-conversations', {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify({ recipientSlug: STUDENT_B, body: 'msg-1', clientNonce: 'n1' }),
    })
    const data1 = (await createRes.json() as any).data
    const convId = data1.conversation.id
    const m1Id = data1.message.id

    const m2Res = await request(`/api/direct-conversations/${convId}/messages`, {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify({ body: 'msg-2', clientNonce: 'n2' }),
    })
    const m2Id = (await m2Res.json() as any).data.id

    const m3Res = await request(`/api/direct-conversations/${convId}/messages`, {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify({ body: 'msg-3', clientNonce: 'n3' }),
    })
    const m3Id = (await m3Res.json() as any).data.id

    // B 此时未读数为 3
    const listBBefore = await request('/api/direct-conversations', { headers: headers(TOKEN_B) })
    expect((await listBBefore.json() as any).data.items[0].unreadCount).toBe(3)

    // 2. B 标记已读到第 2 条消息 (msg-2)
    const readRes = await request(`/api/direct-conversations/${convId}/read`, {
      method: 'PUT',
      headers: headers(TOKEN_B),
      body: JSON.stringify({ throughMessageId: m2Id }),
    })
    expect(readRes.status).toBe(200)

    // 3. B 此时的未读数应该变成 1 (只有 msg-3 未读)
    const listBAfter = await request('/api/direct-conversations', { headers: headers(TOKEN_B) })
    expect((await listBAfter.json() as any).data.items[0].unreadCount).toBe(1)

    // 4. 无论是 GET 还是 POST 得到的任何 DirectMessage，都不应 haveProperty readAt (没有 read_at 暴露给发送者)
    const getHistory = await request(`/api/direct-conversations/${convId}/messages`, { headers: headers(TOKEN_A) })
    const historyItems = (await getHistory.json() as any).data.items
    expect(historyItems[0]).not.toHaveProperty('readAt')
    expect(historyItems[0]).not.toHaveProperty('read_at')
  })

  it('supports pagination with opacity cursor and limits at most 30 messages in chronological order', async () => {
    // 1. 创建会话
    const createRes = await request('/api/direct-conversations', {
      method: 'POST',
      headers: headers(TOKEN_A),
      body: JSON.stringify({ recipientSlug: STUDENT_B, body: 'init', clientNonce: 'init-nonce' }),
    })
    const convId = (await createRes.json() as any).data.conversation.id
    // 将首条消息时间强行改为 2025-01-01，以确保它成为最早的消息，符合测试时序设计
    await env.DB.prepare("UPDATE direct_messages SET created_at = '2025-01-01 00:00:00' WHERE conversation_id = ?").bind(convId).run()

    // 2. 写入 35 条消息，每条消息时间递增
    for (let i = 1; i <= 35; i++) {
      const time = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()
      await env.DB.prepare(
        'INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(`msg-pag-${i}`, convId, STUDENT_A, STUDENT_B, `body-${i}`, `nonce-pag-${i}`, time).run()
      // 同时更新会话的 updated_at
      await env.DB.prepare('UPDATE direct_conversations SET updated_at = ? WHERE id = ?').bind(time, convId).run()
    }

    // 3. 查第一页，应该只返回 30 条最新的消息，并且按时间升序排列 (所以应该返回 body-6 到 body-35)
    const resPage1 = await request(`/api/direct-conversations/${convId}/messages?limit=30`, { headers: headers(TOKEN_A) })
    expect(resPage1.status).toBe(200)
    const dataPage1 = (await resPage1.json() as any).data
    expect(dataPage1.items).toHaveLength(30)
    expect(dataPage1.items[0].body).toBe('body-6')
    expect(dataPage1.items[29].body).toBe('body-35')
    expect(dataPage1.nextCursor).toBeDefined()

    // 4. 使用 nextCursor 查第二页，应该返回 body-1 到 body-5，外加最开始的 'init' 消息 (共 6 条)
    const resPage2 = await request(`/api/direct-conversations/${convId}/messages?limit=30&before=${encodeURIComponent(dataPage1.nextCursor)}`, { headers: headers(TOKEN_A) })
    expect(resPage2.status).toBe(200)
    const dataPage2 = (await resPage2.json() as any).data
    expect(dataPage2.items.length).toBeGreaterThanOrEqual(5)
    expect(dataPage2.items[0].body).toBe('init')
    expect(dataPage2.items[dataPage2.items.length - 1].body).toBe('body-5')
  })
})
