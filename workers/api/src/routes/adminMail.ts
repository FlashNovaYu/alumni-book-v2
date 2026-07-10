import { Hono } from 'hono'
import { adminGuard } from '../lib/adminGuard'
import { readLimitedJson } from '../lib/jsonBodyLimit'
import { createAdminBroadcast, createAdminNotice } from '../lib/notificationService'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const adminMailRoutes = new Hono<{ Bindings: Bindings }>()

const MAX_RECIPIENT_SLUG_LENGTH = 160

adminMailRoutes.use('*', adminGuard)

async function readLegacyNoticePayload(c: any, includeRecipient: boolean) {
  const result = await readLimitedJson(c.req.raw)
  if (result.status === 'too-large') return result
  if (result.status !== 'ok') return null
  const value = result.value as any
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const title = typeof value.subject === 'string' ? value.subject.trim() : ''
  const body = typeof value.body === 'string' ? value.body.trim() : ''
  const recipientSlug = typeof value.recipientSlug === 'string' ? value.recipientSlug.trim() : ''
  if (!title || title.length > 80 || !body || body.length > 2000 || recipientSlug.length > MAX_RECIPIENT_SLUG_LENGTH || (includeRecipient && !recipientSlug)) return null
  return { title, body, recipientSlug }
}

adminMailRoutes.post('/admin/mail/send', async (c) => {
  const payload = await readLegacyNoticePayload(c, true)
  if (payload && 'status' in payload) return c.json({ success: false, message: '请求体过大' }, 413)
  if (!payload) return c.json({ success: false, message: '收件人、标题和正文必填' }, 400)

  const recipient = await c.env.DB.prepare(
    "SELECT slug FROM students WHERE slug = ? AND COALESCE(account_status, 'active') != 'locked'"
  ).bind(payload.recipientSlug).first()
  if (!recipient) return c.json({ success: false, message: '收件人不存在或已锁定' }, 404)

  const result = await createAdminNotice(c.env.DB, {
    recipientSlugs: [payload.recipientSlug],
    title: payload.title,
    body: payload.body,
  })
  return c.json({ success: true, message: '通知已发送', data: { id: result.relatedId, ...result } }, 201)
})

adminMailRoutes.post('/admin/mail/broadcast', async (c) => {
  const payload = await readLegacyNoticePayload(c, false)
  if (payload && 'status' in payload) return c.json({ success: false, message: '请求体过大' }, 413)
  if (!payload) return c.json({ success: false, message: '标题和正文必填' }, 400)

  const result = await createAdminBroadcast(c.env.DB, {
    title: payload.title,
    body: payload.body,
  })
  return c.json({ success: true, message: '群发完成', data: result }, 201)
})

adminMailRoutes.get('/admin/mail/threads', async (c) => {
  c.header('Deprecation', 'true')
  const { results } = await c.env.DB.prepare(
    `SELECT
      t.id, t.subject, t.thread_type, t.allow_reply, t.updated_at,
      COUNT(r.id) AS recipient_count,
      SUM(CASE WHEN r.read_at IS NOT NULL THEN 1 ELSE 0 END) AS read_count
     FROM mail_threads t
     LEFT JOIN mail_recipients r ON r.thread_id = t.id
     WHERE t.created_by_type = 'admin'
     GROUP BY t.id
     ORDER BY t.updated_at DESC
     LIMIT 100`
  ).all()

  return c.json({ success: true, data: results || [] })
})
