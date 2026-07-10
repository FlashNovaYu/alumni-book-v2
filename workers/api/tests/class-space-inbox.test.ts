import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.batch([
    // Task 1 初始化数据
    env.DB.prepare(
      "INSERT OR REPLACE INTO public_messages (id, author_slug, author_name, content, card_style, status, featured, pinned) VALUES ('pm_overview', 'test_init', '测试同学', '班级空间留言', 'paper', 'approved', 1, 1)"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO albums (id, title, description, frame_style, sort_order, featured) VALUES ('album_overview', '毕业相册', '毕业那天', 'polaroid', 0, 1)"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO photos (id, album_id, filename, caption, r2_key, sort_order) VALUES ('photo_overview', 'album_overview', 'cover.jpg', '合照', 'photos/cover.jpg', 0)"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO timeline_events (id, title, description, event_date, event_type) VALUES ('event_overview', '毕业典礼', '最后一次集合', '2026-06-20', 'graduation')"
    ),
    // Task 2 初始化数据
    env.DB.prepare(
      "INSERT OR REPLACE INTO students (id, name, slug) VALUES ('uuid-test-classmate-inbox', '信箱测试同学', 'test-classmate-inbox')"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO notifications (id, recipient_slug, type, title, body) VALUES ('notif-1', 'test-classmate-inbox', 'system', '通知1', '通知内容1')"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO notifications (id, recipient_slug, type, title, body) VALUES ('notif-2', 'test-classmate-inbox', 'system', '通知2', '通知内容2')"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO notifications (id, recipient_slug, type, title, body, read_at) VALUES ('notif-3', 'test-classmate-inbox', 'system', '通知3', '通知内容3', datetime('now'))"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO mail_threads (id, subject, created_by_type) VALUES ('thread-1', '测试邮件主题', 'admin')"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO mail_recipients (id, thread_id, recipient_slug) VALUES ('rcpt-1', 'thread-1', 'test-classmate-inbox')"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO mail_recipients (id, thread_id, recipient_slug) VALUES ('rcpt-2', 'thread-1', 'test-classmate-inbox')"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO mail_recipients (id, thread_id, recipient_slug) VALUES ('rcpt-3', 'thread-1', 'test-classmate-inbox')"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO mail_recipients (id, thread_id, recipient_slug, read_at) VALUES ('rcpt-4', 'thread-1', 'test-classmate-inbox', datetime('now'))"
    ),
    env.DB.prepare(
      "INSERT OR REPLACE INTO mail_recipients (id, thread_id, recipient_slug, deleted_at) VALUES ('rcpt-5', 'thread-1', 'test-classmate-inbox', datetime('now'))"
    ),
  ])
})

describe('Class space overview API', () => {
  it('returns bounded message, album and timeline previews', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/class-space/overview'), env, ctx)
    await waitOnExecutionContext(ctx)
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.messages.length).toBeLessThanOrEqual(8)
    expect(body.data.albums.length).toBeLessThanOrEqual(4)
    expect(body.data.timeline.length).toBeLessThanOrEqual(8)
    expect(body.data.messages[0]).not.toHaveProperty('reviewReason')
    expect(body.data.albums[0]).not.toHaveProperty('photos')
    expect(body.data.albums[0].coverR2Key).toBe('photos/cover.jpg')
    expect(body.data.counts).toEqual(expect.objectContaining({ albums: expect.any(Number) }))
    expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate=300')
  })
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
