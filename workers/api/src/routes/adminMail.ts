import { Hono } from 'hono'
import { parseLimitedJson } from '../lib/jsonBodyLimit'
import { jwt } from 'hono/jwt'
import { getAdminPrincipal } from '../lib/adminAuth'
import { buildAuditStatement, runAuditedBatch } from '../lib/adminAudit'
import { parsePagination } from '../lib/pagination'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const adminMailRoutes = new Hono<{ Bindings: Bindings }>()

// 内部安全防线：adminGuard 局部中间件，结合 JWT 校验与数据库 admin_sessions 校验
async function adminGuard(c: any, next: any) {
  const secret = c.env.JWT_SECRET
  const mw = jwt({ secret, alg: 'HS256' })
  try {
    let isVerified = false
    let response: any = null

    await mw(c, async () => {
      const authHeader = c.req.header('Authorization')
      const token = authHeader?.replace('Bearer ', '')
      if (!token) {
        response = c.json({ success: false, message: '未授权' }, 401)
        return
      }

      const session = await c.env.DB.prepare(
        "SELECT token FROM admin_sessions WHERE token = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
      ).bind(token).first()

      if (!session) {
        response = c.json({ success: false, message: '登录已失效' }, 401)
        return
      }

      isVerified = true
    })

    if (isVerified) {
      return next()
    }
    if (response) {
      return response
    }
    return c.json({ success: false, message: '未授权' }, 401)
  } catch (e) {
    return c.json({ success: false, message: '未授权' }, 401)
  }
}

// 针对所有管理员发信接口启用身份校验
adminMailRoutes.use('*', adminGuard)

const id = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
const normalizeBody = (val: unknown, max: number) => String(val || '').trim().slice(0, max)

adminMailRoutes.post('/admin/mail/send', async (c) => {
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { recipientSlug, subject, body, allowReply } = await parseLimitedJson(c)
  const cleanSubject = normalizeBody(subject, 80)
  const cleanBody = normalizeBody(body, 2000)
  const cleanRecipient = String(recipientSlug || '').trim()

  if (!cleanRecipient || !cleanSubject || !cleanBody) {
    return c.json({ success: false, message: '收件人、标题和正文必填' }, 400)
  }

  const recipient = await c.env.DB.prepare('SELECT slug FROM students WHERE slug = ?').bind(cleanRecipient).first()
  if (!recipient) return c.json({ success: false, message: '收件人不存在' }, 404)

  const relatedId = id('admin_notice')
  await runAuditedBatch(c.env.DB, admin.id, [c.env.DB.prepare(
    `INSERT INTO notifications (id, recipient_slug, type, title, body, related_type, related_id)
     VALUES (?, ?, 'admin_notice', ?, ?, 'admin_notice', ?)`
  ).bind(id('ntf'), cleanRecipient, cleanSubject, cleanBody, relatedId)], {
    action: 'notification.send', resourceType: 'admin_notice', resourceId: relatedId,
    after: { recipientSlug: cleanRecipient, subject: cleanSubject, allowReply: !!allowReply },
  })

  c.header('Deprecation', 'true')
  return c.json({ success: true, message: '通知已发送', data: { id: relatedId, relatedId, sentCount: 1 } }, 201)
})

adminMailRoutes.post('/admin/mail/broadcast', async (c) => {
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { subject, body, allowReply } = await parseLimitedJson(c)
  const cleanSubject = normalizeBody(subject, 80)
  const cleanBody = normalizeBody(body, 2000)

  if (!cleanSubject || !cleanBody) {
    return c.json({ success: false, message: '标题和正文必填' }, 400)
  }

  const relatedId = id('admin_notice')
  const results = await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO notifications (id, recipient_slug, type, title, body, related_type, related_id)
      SELECT 'ntf_' || ? || '_' || lower(hex(randomblob(8))), slug, 'admin_notice', ?, ?, 'admin_notice', ?
      FROM students WHERE COALESCE(account_status, 'active') != 'locked'
      RETURNING recipient_slug
    `).bind(relatedId, cleanSubject, cleanBody, relatedId),
    buildAuditStatement(c.env.DB, admin.id, {
      action: 'notification.broadcast', resourceType: 'admin_notice', resourceId: relatedId,
      after: { subject: cleanSubject, allowReply: !!allowReply },
    }),
  ])

  c.header('Deprecation', 'true')
  return c.json({
    success: true,
    message: '群发完成',
    data: { id: relatedId, relatedId, sentCount: results[0]?.results?.length || 0 },
  }, 201)
})

adminMailRoutes.get('/admin/mail/threads', async (c) => {
  const { limit, offset } = parsePagination(c.req.query(), 100, 100)
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
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all()

  c.header('Deprecation', 'true')
  return c.json({ success: true, data: results || [] })
})
