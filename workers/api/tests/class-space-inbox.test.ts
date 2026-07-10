import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'
import { decodeCursor } from '../src/lib/cursor'

const CLASSMATE_NAME = '信箱测试同学'
const CLASSMATE_SLUG = 'test-classmate-inbox'

async function getClassmateToken() {
  const tokenReq = new Request('http://localhost/api/classmate/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: CLASSMATE_NAME, slug: CLASSMATE_SLUG }),
  })
  const tokenCtx = createExecutionContext()
  const tokenRes = await worker.fetch(tokenReq, env, tokenCtx)
  await waitOnExecutionContext(tokenCtx)
  expect(tokenRes.status).toBe(200)
  return (await tokenRes.json() as any).data.token as string
}

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.batch([
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

  await env.DB.batch([
    ...Array.from({ length: 31 }, (_, index) => {
      const timestamp = index === 1
        ? '2026-06-20 00:32:00'
        : index === 2
          ? '2026-06-20T00:31:00.000Z'
          : `2026-06-20T00:${String(index).padStart(2, '0')}:00.000Z`
      return env.DB.prepare(
        'INSERT OR REPLACE INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        `overview-visible-${String(index + 1).padStart(2, '0')}`,
        CLASSMATE_SLUG,
        CLASSMATE_NAME,
        `可见消息 ${index + 1}`,
        'visible',
        timestamp,
        timestamp,
      )
    }),
    env.DB.prepare(
      "INSERT OR REPLACE INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('overview-recalled', ?, ?, '已撤回的原文', 'recalled_by_author', '2026-06-20T01:00:00.000Z', '2026-06-20T01:00:00.000Z')"
    ).bind(CLASSMATE_SLUG, CLASSMATE_NAME),
    env.DB.prepare(
      "INSERT OR REPLACE INTO public_messages (id, author_slug, author_name, content, status, created_at, updated_at) VALUES ('overview-hidden', ?, ?, '不得泄露的隐藏正文', 'hidden', '2026-06-20T02:00:00.000Z', '2026-06-20T02:00:00.000Z')"
    ).bind(CLASSMATE_SLUG, CLASSMATE_NAME),
    env.DB.prepare(
      "INSERT OR REPLACE INTO group_chat_mutes (student_slug, muted_until, reason, created_by, created_at, updated_at) VALUES (?, NULL, '测试禁言', 'admin', datetime('now'), datetime('now'))"
    ).bind(CLASSMATE_SLUG),
    ...Array.from({ length: 5 }, (_, index) => env.DB.prepare(
      'INSERT OR REPLACE INTO albums (id, title, description, frame_style, sort_order, featured) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(`album-overview-${index + 1}`, `相册 ${index + 1}`, '毕业那天', 'polaroid', index, index === 0 ? 1 : 0)),
    env.DB.prepare(
      "INSERT OR REPLACE INTO photos (id, album_id, filename, caption, r2_key, sort_order) VALUES ('photo-overview', 'album-overview-1', 'cover.jpg', '合照', 'photos/cover.jpg', 0)"
    ),
    ...Array.from({ length: 9 }, (_, index) => env.DB.prepare(
      'INSERT OR REPLACE INTO timeline_events (id, title, description, event_date, event_type) VALUES (?, ?, ?, ?, ?)'
    ).bind(`event-overview-${index + 1}`, `事件 ${index + 1}`, '班级活动', `2026-06-${String(index + 1).padStart(2, '0')}`, 'graduation')),
  ])
})

describe('Class space overview API', () => {
  it('requires a classmate token', async () => {
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/class-space/overview'), env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(401)
  })

  it('returns the latest visible chat window in real-time order', async () => {
    const classmateToken = await getClassmateToken()
    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/class-space/overview', {
      headers: { 'X-Classmate-Token': classmateToken },
    }), env, ctx)
    await waitOnExecutionContext(ctx)
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.chat.items).toHaveLength(30)
    expect(body.data.chat.items.map((item: any) => item.id)).toEqual([
      ...Array.from({ length: 27 }, (_, index) => `overview-visible-${String(index + 5).padStart(2, '0')}`),
      'overview-visible-03',
      'overview-visible-02',
      'overview-recalled',
    ])
    expect(body.data.chat.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'overview-visible-01' }),
      expect.objectContaining({ id: 'overview-visible-04' }),
    ]))
    expect(body.data.chat.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'overview-recalled', content: null, status: 'recalled_by_author' }),
    ]))
    expect(body.data.chat.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'overview-hidden' }),
    ]))
    expect(JSON.stringify(body.data.chat.items)).not.toContain('不得泄露的隐藏正文')
    expect(decodeCursor(body.data.chat.cursor)).toEqual({
      timestamp: '2026-06-20T00:04:00.000Z',
      id: 'overview-visible-05',
    })
    expect(body.data.chat.cursor).not.toContain('.')
    expect(body.data.chat.mute).toEqual({ reason: '测试禁言', mutedUntil: null })
    expect(body.data.albums.length).toBeLessThanOrEqual(4)
    expect(body.data.timeline.length).toBeLessThanOrEqual(8)
    expect(body.data.albums[0]).not.toHaveProperty('photos')
    expect(body.data.albums[0].coverR2Key).toBe('photos/cover.jpg')
    expect(body.data.counts).toEqual({ groupMessages: 32, albums: 5, timelineItems: 8 })
    expect(body.data).not.toHaveProperty('messages')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
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
    const classmateToken = await getClassmateToken()
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
    expect(body.data.directUnread).toBe(3)
    expect(body.data.mailUnread).toBe(3)
    expect(body.data.totalUnread).toBe(5)
  })
})
