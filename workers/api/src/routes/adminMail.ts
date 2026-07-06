import { Hono } from 'hono'
import { jwt } from 'hono/jwt'

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
        "SELECT token FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')"
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

// 辅助函数：构建单封管理员信件发信所需的 SQL Statements 和生成的 threadId
function buildAdminMailStatements(db: D1Database, recipientSlug: string, subject: string, body: string, allowReply: boolean) {
  const threadId = id('mail')
  const threadStmt = db.prepare(
    `INSERT INTO mail_threads
      (id, subject, thread_type, created_by_type, allow_reply)
     VALUES (?, ?, 'admin', 'admin', ?)`
  ).bind(threadId, subject, allowReply ? 1 : 0)

  const messageStmt = db.prepare(
    `INSERT INTO mail_messages
      (id, thread_id, sender_type, body)
     VALUES (?, ?, 'admin', ?)`
  ).bind(id('mailmsg'), threadId, body)

  const recipientStmt = db.prepare(
    `INSERT INTO mail_recipients
      (id, thread_id, recipient_slug)
     VALUES (?, ?, ?)`
  ).bind(id('mailrcp'), threadId, recipientSlug)

  return {
    threadId,
    statements: [threadStmt, messageStmt, recipientStmt]
  }
}

adminMailRoutes.post('/admin/mail/send', async (c) => {
  const { recipientSlug, subject, body, allowReply } = await c.req.json()
  const cleanSubject = normalizeBody(subject, 80)
  const cleanBody = normalizeBody(body, 2000)
  const cleanRecipient = String(recipientSlug || '').trim()

  if (!cleanRecipient || !cleanSubject || !cleanBody) {
    return c.json({ success: false, message: '收件人、标题和正文必填' }, 400)
  }

  const recipient = await c.env.DB.prepare('SELECT slug FROM students WHERE slug = ?').bind(cleanRecipient).first()
  if (!recipient) return c.json({ success: false, message: '收件人不存在' }, 404)

  const { threadId, statements } = buildAdminMailStatements(c.env.DB, cleanRecipient, cleanSubject, cleanBody, !!allowReply)
  await c.env.DB.batch(statements)

  return c.json({ success: true, message: '信件已发送', data: { id: threadId } })
})

adminMailRoutes.post('/admin/mail/broadcast', async (c) => {
  const { subject, body, allowReply } = await c.req.json()
  const cleanSubject = normalizeBody(subject, 80)
  const cleanBody = normalizeBody(body, 2000)

  if (!cleanSubject || !cleanBody) {
    return c.json({ success: false, message: '标题和正文必填' }, 400)
  }

  const { results } = await c.env.DB.prepare(
    "SELECT slug FROM students WHERE COALESCE(account_status, 'active') != 'locked'"
  ).all()

  const allStatements: D1PreparedStatement[] = []
  const sent: string[] = []

  for (const row of results || []) {
    const slug = (row as any).slug
    const { threadId, statements } = buildAdminMailStatements(c.env.DB, slug, cleanSubject, cleanBody, !!allowReply)
    allStatements.push(...statements)
    sent.push(threadId)
  }

  if (allStatements.length > 0) {
    await c.env.DB.batch(allStatements)
  }

  return c.json({ success: true, message: '群发完成', data: { sentCount: sent.length } })
})

adminMailRoutes.get('/admin/mail/threads', async (c) => {
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
