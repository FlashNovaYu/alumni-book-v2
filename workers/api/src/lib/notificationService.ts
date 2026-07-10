export type CreateNotificationInput = {
  id?: string
  recipientSlug: string
  type: string
  title: string
  body: string
  relatedType?: string
  relatedId?: string
}

export interface CreateAdminNoticeInput {
  recipientSlugs: string[]
  title: string
  body: string
}

export async function createNotification(db: D1Database, input: CreateNotificationInput) {
  const id = input.id || `ntf_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  await db.prepare(
    `INSERT ${input.id ? 'OR IGNORE ' : ''}INTO notifications
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

export async function createAdminNotice(db: D1Database, input: CreateAdminNoticeInput) {
  const recipientSlugs = [...new Set(input.recipientSlugs)]
  const relatedId = `admin_notice_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const statements = recipientSlugs.map((recipientSlug) => db.prepare(
    `INSERT INTO notifications
      (id, recipient_slug, type, title, body, related_type, related_id)
     VALUES (?, ?, 'admin_notice', ?, ?, 'admin_notice', ?)`
  ).bind(
    `ntf_${relatedId}_${crypto.randomUUID().slice(0, 8)}`,
    recipientSlug,
    input.title,
    input.body,
    relatedId,
  ))

  if (statements.length > 0) {
    await db.batch(statements)
  }

  return { relatedId, sentCount: recipientSlugs.length }
}

export async function getUnreadNotificationCount(db: D1Database, slug: string) {
  const row = await db.prepare(
    'SELECT COUNT(*) AS count FROM notifications WHERE recipient_slug = ? AND read_at IS NULL'
  ).bind(slug).first() as any
  return Number(row?.count || 0)
}
