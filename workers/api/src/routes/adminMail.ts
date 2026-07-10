import { Hono } from 'hono'
import { adminGuard } from '../lib/adminGuard'
import { createAdminNotice } from '../lib/notificationService'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const adminMailRoutes = new Hono<{ Bindings: Bindings }>()

adminMailRoutes.use('*', adminGuard)

async function readLegacyNoticePayload(c: any, includeRecipient: boolean) {
  const value = await c.req.json().catch(() => null) as any
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const title = typeof value.subject === 'string' ? value.subject.trim() : ''
  const body = typeof value.body === 'string' ? value.body.trim() : ''
  const recipientSlug = typeof value.recipientSlug === 'string' ? value.recipientSlug.trim() : ''
  if (!title || title.length > 80 || !body || body.length > 2000 || (includeRecipient && !recipientSlug)) return null
  return { title, body, recipientSlug }
}

adminMailRoutes.post('/admin/mail/send', async (c) => {
  const payload = await readLegacyNoticePayload(c, true)
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
  if (!payload) return c.json({ success: false, message: '标题和正文必填' }, 400)

  const recipients = await c.env.DB.prepare(
    "SELECT slug FROM students WHERE COALESCE(account_status, 'active') != 'locked' ORDER BY slug"
  ).all()
  const result = await createAdminNotice(c.env.DB, {
    recipientSlugs: (recipients.results || []).map((row: any) => row.slug),
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
