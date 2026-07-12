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

export type CreateAdminBroadcastInput = Pick<CreateAdminNoticeInput, 'title' | 'body'>

const ADMIN_NOTICE_BATCH_SIZE = 50

export function buildNotificationStatement(db: D1Database, input: CreateNotificationInput) {
  const id = input.id || `ntf_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const statement = db.prepare(
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
  )
  return { id, statement }
}

export async function createNotification(db: D1Database, input: CreateNotificationInput) {
  const { id, statement } = buildNotificationStatement(db, input)
  await statement.run()
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

  for (let offset = 0; offset < statements.length; offset += ADMIN_NOTICE_BATCH_SIZE) {
    await db.batch(statements.slice(offset, offset + ADMIN_NOTICE_BATCH_SIZE))
  }

  return { relatedId, sentCount: recipientSlugs.length }
}

export async function createAdminBroadcast(db: D1Database, input: CreateAdminBroadcastInput) {
  const relatedId = `admin_notice_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
  const result = await db.prepare(`
    INSERT INTO notifications
      (id, recipient_slug, type, title, body, related_type, related_id)
    SELECT
      'ntf_' || ? || '_' || lower(hex(randomblob(8))),
      slug,
      'admin_notice',
      ?,
      ?,
      'admin_notice',
      ?
    FROM students
    WHERE COALESCE(account_status, 'active') != 'locked'
    RETURNING recipient_slug
  `).bind(relatedId, input.title, input.body, relatedId).all()
  return { relatedId, sentCount: result.results.length }
}

export async function getUnreadNotificationCount(db: D1Database, slug: string) {
  const row = await db.prepare(
    'SELECT COUNT(*) AS count FROM notifications WHERE recipient_slug = ? AND read_at IS NULL'
  ).bind(slug).first() as any
  return Number(row?.count || 0)
}
