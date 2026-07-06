import { Hono } from 'hono'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'
import { getUnreadNotificationCount } from '../lib/notificationService'

type Bindings = {
  DB: D1Database
}

export const notificationsRoutes = new Hono<{ Bindings: Bindings }>()

function formatNotification(row: any) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    relatedType: row.related_type || null,
    relatedId: row.related_id || null,
    readAt: row.read_at || null,
    createdAt: row.created_at,
  }
}

notificationsRoutes.get('/notifications/summary', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const unreadCount = await getUnreadNotificationCount(c.env.DB, identity.slug)
  return c.json({ success: true, data: { unreadCount } })
})

notificationsRoutes.get('/notifications', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notifications WHERE recipient_slug = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(identity.slug).all()

  return c.json({ success: true, data: { items: (results || []).map(formatNotification) } })
})

notificationsRoutes.put('/notifications/:id/read', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  await c.env.DB.prepare(
    "UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ? AND recipient_slug = ?"
  ).bind(c.req.param('id'), identity.slug).run()

  return c.json({ success: true, message: '已读' })
})

notificationsRoutes.put('/notifications/read-all', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  await c.env.DB.prepare(
    "UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')) WHERE recipient_slug = ?"
  ).bind(identity.slug).run()

  return c.json({ success: true, message: '已全部标记已读' })
})
