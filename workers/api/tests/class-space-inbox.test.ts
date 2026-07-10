import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it, beforeAll } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

beforeAll(async () => {
  await initTestDb(env.DB)

  // 1. 插入一个测试同学
  await env.DB.prepare(`
    INSERT INTO students (id, name, slug)
    VALUES (?, ?, ?)
  `).bind('uuid-test-classmate-inbox', '信箱测试同学', 'test-classmate-inbox').run()

  // 2. 插入未读通知
  await env.DB.prepare(`
    INSERT INTO notifications (id, recipient_slug, type, title, body)
    VALUES 
      (?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?)
  `).bind(
    'notif-1', 'test-classmate-inbox', 'system', '通知1', '通知内容1',
    'notif-2', 'test-classmate-inbox', 'system', '通知2', '通知内容2'
  ).run()

  // 3. 插入一封已读通知，验证其不被计入
  await env.DB.prepare(`
    INSERT INTO notifications (id, recipient_slug, type, title, body, read_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).bind('notif-3', 'test-classmate-inbox', 'system', '通知3', '通知内容3').run()

  // 4. 插入邮件 thread
  await env.DB.prepare(`
    INSERT INTO mail_threads (id, subject, created_by_type)
    VALUES (?, ?, ?)
  `).bind('thread-1', '测试邮件主题', 'admin').run()

  // 5. 插入未读邮件接收记录
  await env.DB.prepare(`
    INSERT INTO mail_recipients (id, thread_id, recipient_slug)
    VALUES 
      (?, ?, ?),
      (?, ?, ?),
      (?, ?, ?)
  `).bind(
    'rcpt-1', 'thread-1', 'test-classmate-inbox',
    'rcpt-2', 'thread-1', 'test-classmate-inbox',
    'rcpt-3', 'thread-1', 'test-classmate-inbox'
  ).run()

  // 6. 插入已读邮件、已删除邮件各一封，验证其不被计入
  await env.DB.prepare(`
    INSERT INTO mail_recipients (id, thread_id, recipient_slug, read_at)
    VALUES (?, ?, ?, datetime('now'))
  `).bind('rcpt-4', 'thread-1', 'test-classmate-inbox').run()

  await env.DB.prepare(`
    INSERT INTO mail_recipients (id, thread_id, recipient_slug, deleted_at)
    VALUES (?, ?, ?, datetime('now'))
  `).bind('rcpt-5', 'thread-1', 'test-classmate-inbox').run()
})

describe('Combined Inbox Summary APIs', () => {
  it('GET /api/inbox/summary — 未携带 X-Classmate-Token 返回 401', async () => {
    const req = new Request('http://localhost/api/inbox/summary')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(401)
  })

  it('GET /api/inbox/summary — 携带有效 Token 返回 unread 消息的合计', async () => {
    // 1. 获取 token
    const tokenReq = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '信箱测试同学', slug: 'test-classmate-inbox' }),
    })
    const tokenCtx = createExecutionContext()
    const tokenRes = await worker.fetch(tokenReq, env, tokenCtx)
    await waitOnExecutionContext(tokenCtx)
    expect(tokenRes.status).toBe(200)
    const tokenBody = await tokenRes.json() as any
    expect(tokenBody.success).toBe(true)
    const classmateToken = tokenBody.data.token
    expect(classmateToken).toBeTruthy()

    // 2. 请求未读统计
    const req = new Request('http://localhost/api/inbox/summary', {
      headers: {
        'X-Classmate-Token': classmateToken,
      },
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    
    // 验证返回的数据结构与计数值
    // 未读通知：notif-1, notif-2 (共2个)
    // 未读邮件：rcpt-1, rcpt-2, rcpt-3 (共3个)
    expect(body.data.notificationUnread).toBe(2)
    expect(body.data.mailUnread).toBe(3)
    expect(body.data.totalUnread).toBe(5)
  })
})
