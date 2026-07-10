import { Hono } from 'hono'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'

type Bindings = {
  DB: D1Database
}

export const inboxRoutes = new Hono<{ Bindings: Bindings }>()

inboxRoutes.get('/inbox/summary', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const classmateSlug = identity.slug

  // 1. 查询未读通知总数
  const notifResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE recipient_slug = ? AND read_at IS NULL'
  ).bind(classmateSlug).first() as any
  const notificationUnread = notifResult ? notifResult.count : 0

  // 2. 查询未读邮件总数
  const mailResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM mail_recipients WHERE recipient_slug = ? AND read_at IS NULL AND deleted_at IS NULL'
  ).bind(classmateSlug).first() as any
  const mailUnread = mailResult ? mailResult.count : 0

  const totalUnread = notificationUnread + mailUnread

  return c.json({
    success: true,
    data: {
      notificationUnread,
      mailUnread,
      totalUnread
    }
  })
})
