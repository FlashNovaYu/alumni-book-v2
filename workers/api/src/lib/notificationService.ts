export type CreateNotificationInput = {
  recipientSlug: string
  type: string
  title: string
  body: string
  relatedType?: string
  relatedId?: string
}

export async function createNotification(db: D1Database, input: CreateNotificationInput) {
  const id = `ntf_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  await db.prepare(
    `INSERT INTO notifications
      (id, recipient_slug, type, title, body, related_type, related_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    input.recipientSlug,
    input.type,
    input.title,
    input.body,
    input.relatedType || null,
    input.relatedId || null,
  ).run()
  return id
}

export async function getUnreadNotificationCount(db: D1Database, slug: string) {
  const row = await db.prepare(
    'SELECT COUNT(*) AS count FROM notifications WHERE recipient_slug = ? AND read_at IS NULL'
  ).bind(slug).first() as any
  return Number(row?.count || 0)
}
