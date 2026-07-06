import { Hono } from 'hono'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'

type Bindings = {
  DB: D1Database
}

export const mailboxRoutes = new Hono<{ Bindings: Bindings }>()

const id = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
const trimText = (val: unknown, max: number) => String(val || '').trim().slice(0, max)

mailboxRoutes.get('/mailbox/summary', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM mail_recipients
     WHERE recipient_slug = ? AND read_at IS NULL AND deleted_at IS NULL`
  ).bind(identity.slug).first() as any

  return c.json({ success: true, data: { unreadCount: Number(row?.count || 0) } })
})

mailboxRoutes.get('/mailbox/threads', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const { results } = await c.env.DB.prepare(
    `SELECT
      t.id, t.subject, t.thread_type, t.allow_reply, t.updated_at,
      r.read_at,
      m.body AS preview,
      m.sender_type,
      COALESCE(s.name, CASE WHEN m.sender_type = 'admin' THEN '管理员' ELSE '系统邮局' END) AS sender_name
     FROM mail_recipients r
     JOIN mail_threads t ON t.id = r.thread_id
     LEFT JOIN mail_messages m ON m.id = (
       SELECT id FROM mail_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1
     )
     LEFT JOIN students s ON s.slug = m.sender_slug
     WHERE r.recipient_slug = ? AND r.deleted_at IS NULL
     ORDER BY t.updated_at DESC
     LIMIT 50`
  ).bind(identity.slug).all()

  return c.json({
    success: true,
    data: {
      items: (results || []).map((row: any) => ({
        id: row.id,
        subject: row.subject,
        threadType: row.thread_type,
        senderName: row.sender_name,
        preview: trimText(row.preview, 80),
        unread: !row.read_at,
        allowReply: !!row.allow_reply,
        updatedAt: row.updated_at,
      })),
    },
  })
})

mailboxRoutes.get('/mailbox/threads/:id', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const threadId = c.req.param('id')
  const recipient = await c.env.DB.prepare(
    'SELECT thread_id FROM mail_recipients WHERE thread_id = ? AND recipient_slug = ? AND deleted_at IS NULL'
  ).bind(threadId, identity.slug).first()
  const creator = await c.env.DB.prepare(
    "SELECT id FROM mail_threads WHERE id = ? AND created_by_type = 'student' AND created_by_slug = ?"
  ).bind(threadId, identity.slug).first()

  if (!recipient && !creator) return c.json({ success: false, message: '无权查看这封信' }, 403)

  await c.env.DB.prepare(
    "UPDATE mail_recipients SET read_at = COALESCE(read_at, datetime('now')) WHERE thread_id = ? AND recipient_slug = ?"
  ).bind(threadId, identity.slug).run()

  const thread = await c.env.DB.prepare('SELECT * FROM mail_threads WHERE id = ?').bind(threadId).first() as any
  const { results } = await c.env.DB.prepare(
    `SELECT m.*, COALESCE(s.name, CASE WHEN m.sender_type = 'admin' THEN '管理员' ELSE '系统邮局' END) AS sender_name
     FROM mail_messages m
     LEFT JOIN students s ON s.slug = m.sender_slug
     WHERE m.thread_id = ?
     ORDER BY m.created_at`
  ).bind(threadId).all()

  return c.json({
    success: true,
    data: {
      thread: {
        id: thread.id,
        subject: thread.subject,
        threadType: thread.thread_type,
        allowReply: !!thread.allow_reply,
        updatedAt: thread.updated_at,
      },
      messages: (results || []).map((row: any) => ({
        id: row.id,
        threadId: row.thread_id,
        senderType: row.sender_type,
        senderSlug: row.sender_slug || null,
        senderName: row.sender_name,
        body: row.body,
        createdAt: row.created_at,
      })),
    },
  })
})

mailboxRoutes.post('/mailbox/threads', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  if (identity.mustChangePassword) {
    return c.json({ success: false, message: '首次登录请先修改密码后再写信' }, 403)
  }

  const body = await c.req.json()
  const recipientSlug = String(body.recipientSlug || '').trim()
  const subject = trimText(body.subject, 80)
  const messageBody = trimText(body.body, 2000)

  if (!recipientSlug || !subject || !messageBody) {
    return c.json({ success: false, message: '收件人、标题和正文必填' }, 400)
  }
  if (recipientSlug === identity.slug) {
    return c.json({ success: false, message: '不能给自己写信' }, 400)
  }

  const recipient = await c.env.DB.prepare(
    "SELECT slug FROM students WHERE slug = ? AND account_status != 'locked'"
  ).bind(recipientSlug).first()
  if (!recipient) return c.json({ success: false, message: '收件人不存在或账号不可用' }, 404)

  const threadId = id('mail')
  const messageId = id('mailmsg')
  const recipientId = id('mailrcp')

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO mail_threads
        (id, subject, thread_type, created_by_type, created_by_slug, allow_reply)
       VALUES (?, ?, 'private', 'student', ?, 1)`
    ).bind(threadId, subject, identity.slug),
    c.env.DB.prepare(
      `INSERT INTO mail_messages
        (id, thread_id, sender_type, sender_slug, body)
       VALUES (?, ?, 'student', ?, ?)`
    ).bind(messageId, threadId, identity.slug, messageBody),
    c.env.DB.prepare(
      `INSERT INTO mail_recipients
        (id, thread_id, recipient_slug)
       VALUES (?, ?, ?)`
    ).bind(recipientId, threadId, recipientSlug)
  ])

  return c.json({ success: true, message: '信件已投递', data: { id: threadId } })
})

mailboxRoutes.post('/mailbox/threads/:id/messages', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const threadId = c.req.param('id')
  const body = await c.req.json()
  const messageBody = trimText(body.body, 2000)
  if (!messageBody) return c.json({ success: false, message: '正文不能为空' }, 400)

  const thread = await c.env.DB.prepare('SELECT * FROM mail_threads WHERE id = ? AND allow_reply = 1').bind(threadId).first() as any
  if (!thread) return c.json({ success: false, message: '信件不存在或不允许回复' }, 404)

  const isCreator = thread.created_by_type === 'student' && thread.created_by_slug === identity.slug
  const isRecipient = await c.env.DB.prepare(
    'SELECT thread_id FROM mail_recipients WHERE thread_id = ? AND recipient_slug = ? AND deleted_at IS NULL'
  ).bind(threadId, identity.slug).first()
  if (!isCreator && !isRecipient) return c.json({ success: false, message: '无权回复这封信' }, 403)

  const messageId = id('mailmsg')

  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body) VALUES (?, ?, 'student', ?, ?)"
    ).bind(messageId, threadId, identity.slug, messageBody),
    c.env.DB.prepare("UPDATE mail_threads SET updated_at = datetime('now') WHERE id = ?").bind(threadId),
    c.env.DB.prepare(
      "UPDATE mail_recipients SET read_at = NULL WHERE thread_id = ? AND recipient_slug != ?"
    ).bind(threadId, identity.slug)
  ])

  return c.json({ success: true, message: '回复已寄出', data: { id: messageId } })
})
