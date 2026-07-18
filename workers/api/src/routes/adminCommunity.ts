import { Hono } from 'hono'
import { parsePagination } from '../lib/pagination'
import { adminGuard } from '../lib/adminGuard'
import { parseLimitedJson, readLimitedJson } from '../lib/jsonBodyLimit'
import { getAdminPrincipal } from '../lib/adminAuth'
import { buildAuditStatement } from '../lib/adminAudit'

type Bindings = { DB: D1Database; JWT_SECRET: string }
export const adminCommunityRoutes = new Hono<{ Bindings: Bindings }>()

const id = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
const reasonOf = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const ISO_WITH_TIMEZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/
const MAX_RECIPIENT_SLUG_LENGTH = 160

async function readNoticePayload(c: any) {
  const result = await readLimitedJson(c.req.raw)
  if (result.status === 'too-large') return result
  if (result.status !== 'ok') return null
  const value = result.value as any
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const body = typeof value.body === 'string' ? value.body.trim() : ''
  if (!title || title.length > 80 || !body || body.length > 2000) return null
  const recipientSlug = typeof value.recipientSlug === 'string' ? value.recipientSlug.trim() : ''
  if (recipientSlug.length > MAX_RECIPIENT_SLUG_LENGTH) return null
  return { title, body, recipientSlug }
}

function adminId(c: any) {
  return getAdminPrincipal(c)?.id || 'admin'
}

function conditionalAuditStatement(
  db: D1Database,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  reason: string | null,
  before: unknown,
  after: unknown,
  condition: string,
  conditionBinds: unknown[],
) {
  return db.prepare(
    `INSERT INTO admin_audit_logs
      (id, admin_account_id, action, resource_type, resource_id, reason, before_summary, after_summary, metadata)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, '{}' WHERE ${condition}`
  ).bind(
    `audit_${crypto.randomUUID()}`, actorId, action, resourceType, resourceId, reason,
    JSON.stringify(before), JSON.stringify(after), ...conditionBinds,
  )
}

function messageData(row: any) {
  return {
    id: row.id, author: { slug: row.author_slug, name: row.author_name }, content: row.content,
    status: row.status, moderationReason: row.moderation_reason, recalledAt: row.recalled_at,
    recalledByType: row.recalled_by_type, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function messageReview(db: D1Database, messageId: string, status: string, action: string, reason: string, reviewer: string) {
  return db.prepare(
    "INSERT INTO content_reviews (id, content_type, content_id, action, reason, admin_id) SELECT ?, 'group_chat_message', id, ?, ?, ? FROM public_messages WHERE id = ? AND status = ?"
  ).bind(id('cr'), action, reason, reviewer, messageId, status)
}

function messageNotification(db: D1Database, messageId: string, status: string, type: string, title: string, reason: string, notificationId = id('ntf')) {
  return db.prepare(
    "INSERT OR IGNORE INTO notifications (id, recipient_slug, type, title, body, related_type, related_id) SELECT ?, author_slug, ?, ?, ?, 'group_chat_message', id FROM public_messages WHERE id = ? AND status = ?"
  ).bind(notificationId, type, title, `治理原因：${reason}`, messageId, status)
}

adminCommunityRoutes.use('*', adminGuard)

adminCommunityRoutes.post('/admin/notifications/send', async (c) => {
  const payload = await readNoticePayload(c)
  if (payload && 'status' in payload) return c.json({ success: false, message: '请求体过大' }, 413)
  if (!payload || !payload.recipientSlug) {
    return c.json({ success: false, message: '收件人、标题和正文必填，标题最多 80 字，正文最多 2000 字' }, 400)
  }
  const recipient = await c.env.DB.prepare(
    "SELECT slug FROM students WHERE slug = ? AND COALESCE(account_status, 'active') != 'locked'"
  ).bind(payload.recipientSlug).first()
  if (!recipient) return c.json({ success: false, message: '收件人不存在或已锁定' }, 404)

  const relatedId = id('admin_notice')
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO notifications (id, recipient_slug, type, title, body, related_type, related_id)
       VALUES (?, ?, 'admin_notice', ?, ?, 'admin_notice', ?)`
    ).bind(id('ntf'), payload.recipientSlug, payload.title, payload.body, relatedId),
    buildAuditStatement(c.env.DB, adminId(c), {
      action: 'notification.send', resourceType: 'admin_notice', resourceId: relatedId,
      after: { recipientSlug: payload.recipientSlug, title: payload.title },
    }),
  ])
  return c.json({ success: true, data: { relatedId, sentCount: 1 } }, 201)
})

adminCommunityRoutes.post('/admin/notifications/broadcast', async (c) => {
  const payload = await readNoticePayload(c)
  if (payload && 'status' in payload) return c.json({ success: false, message: '请求体过大' }, 413)
  if (!payload) {
    return c.json({ success: false, message: '标题和正文必填，标题最多 80 字，正文最多 2000 字' }, 400)
  }
  const relatedId = id('admin_notice')
  const results = await c.env.DB.batch([
    c.env.DB.prepare(`
      INSERT INTO notifications (id, recipient_slug, type, title, body, related_type, related_id)
      SELECT 'ntf_' || ? || '_' || lower(hex(randomblob(8))), slug, 'admin_notice', ?, ?, 'admin_notice', ?
      FROM students WHERE COALESCE(account_status, 'active') != 'locked'
      RETURNING recipient_slug
    `).bind(relatedId, payload.title, payload.body, relatedId),
    buildAuditStatement(c.env.DB, adminId(c), {
      action: 'notification.broadcast', resourceType: 'admin_notice', resourceId: relatedId,
      after: { title: payload.title },
    }),
  ])
  return c.json({ success: true, data: { relatedId, sentCount: results[0]?.results?.length || 0 } }, 201)
})

adminCommunityRoutes.get('/admin/notifications/history', async (c) => {
  const { limit, offset } = parsePagination(c.req.query(), 100, 100)
  const rows = await c.env.DB.prepare(`
    SELECT
      related_id,
      MAX(title) AS title,
      MAX(created_at) AS created_at,
      COUNT(*) AS recipient_count,
      SUM(CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END) AS read_count
    FROM notifications
    WHERE related_type = 'admin_notice' AND related_id IS NOT NULL
    GROUP BY related_id
    ORDER BY MAX(created_at) DESC, related_id DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all()
  return c.json({
    success: true,
    data: {
      items: (rows.results || []).map((row: any) => ({
        relatedId: row.related_id,
        title: row.title,
        createdAt: row.created_at,
        recipientCount: Number(row.recipient_count || 0),
        readCount: Number(row.read_count || 0),
      })),
    },
  })
})

adminCommunityRoutes.get('/admin/group-chat/messages', async (c) => {
  const status = c.req.query('status')
  const valid = new Set(['visible', 'hidden', 'recalled_by_author', 'recalled_by_admin'])
  if (status && !valid.has(status)) return c.json({ success: false, message: '状态无效' }, 400)
  const groupChatOnly = "client_nonce IS NOT NULL AND client_nonce NOT LIKE 'legacy:%'"
  const { limit, offset } = parsePagination(c.req.query(), 100, 100)
  const fields = `id, author_slug, author_name, content, status, moderation_reason,
                  recalled_at, recalled_by_type, created_at, updated_at`
  const query = status
    ? c.env.DB.prepare(`SELECT ${fields} FROM public_messages WHERE ${groupChatOnly} AND status = ? ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`).bind(status, limit, offset)
    : c.env.DB.prepare(`SELECT ${fields} FROM public_messages WHERE ${groupChatOnly} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`).bind(limit, offset)
  const { results } = await query.all()
  return c.json({ success: true, data: (results || []).map(messageData) })
})

adminCommunityRoutes.put('/admin/group-chat/messages/:id/hide', async (c) => {
  const body = await parseLimitedJson<any>(c, { fallback: {} }) as any
  const reason = reasonOf(body.reason)
  if (!reason) return c.json({ success: false, message: '请填写治理原因' }, 400)
  if (typeof body.hidden !== 'boolean') return c.json({ success: false, message: 'hidden 必须为布尔值' }, 400)
  const messageId = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ?').bind(messageId).first() as any
  if (!existing) return c.json({ success: false, message: '消息不存在' }, 404)
  const previous = body.hidden ? 'visible' : 'hidden'
  const next = body.hidden ? 'hidden' : 'visible'
  const results = await c.env.DB.batch([
    messageReview(c.env.DB, messageId, previous, body.hidden ? 'hide' : 'restore', reason, adminId(c)),
    messageNotification(c.env.DB, messageId, previous, body.hidden ? 'group_chat_hidden' : 'group_chat_restored', body.hidden ? '群聊消息已隐藏' : '群聊消息已恢复', reason),
    conditionalAuditStatement(
      c.env.DB, adminId(c), body.hidden ? 'group_chat.hide' : 'group_chat.restore', 'group_chat_message', messageId, reason,
      { status: previous }, { status: next },
      'EXISTS (SELECT 1 FROM public_messages WHERE id = ? AND status = ?)', [messageId, previous],
    ),
    c.env.DB.prepare("UPDATE public_messages SET status = ?, moderation_reason = ?, updated_at = datetime('now') WHERE id = ? AND status = ?").bind(next, reason, messageId, previous),
  ])
  const updated = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ?').bind(messageId).first() as any
  if (!Number((results[3] as any)?.meta?.changes || 0)) {
    if (!updated) return c.json({ success: false, message: '消息不存在' }, 404)
    if (updated.status === 'recalled_by_admin' || updated.status === 'recalled_by_author') {
      return c.json({ success: false, message: '已撤回消息不可恢复' }, 409)
    }
    if (updated.status !== next) return c.json({ success: false, message: '消息状态冲突' }, 409)
  }
  return c.json({ success: true, data: messageData(updated) })
})

adminCommunityRoutes.post('/admin/group-chat/messages/:id/recall', async (c) => {
  const reason = reasonOf((await parseLimitedJson<any>(c, { fallback: {} }) as any).reason)
  if (!reason) return c.json({ success: false, message: '请填写治理原因' }, 400)
  const messageId = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ?').bind(messageId).first() as any
  if (!existing) return c.json({ success: false, message: '消息不存在' }, 404)
  const allowed = "status IN ('visible', 'hidden')"
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO content_reviews (id, content_type, content_id, action, reason, admin_id) SELECT ?, 'group_chat_message', id, 'recall', ?, ? FROM public_messages WHERE id = ? AND ${allowed}`
    ).bind(id('cr'), reason, adminId(c), messageId),
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO notifications (id, recipient_slug, type, title, body, related_type, related_id) SELECT ?, author_slug, 'group_chat_recalled', '群聊消息已被管理员撤回', ?, 'group_chat_message', id FROM public_messages WHERE id = ? AND ${allowed}`
    ).bind(`ntf_group_recall_${messageId}`, `治理原因：${reason}`, messageId),
    conditionalAuditStatement(
      c.env.DB, adminId(c), 'group_chat.recall', 'group_chat_message', messageId, reason,
      { status: existing.status }, { status: 'recalled_by_admin' },
      `EXISTS (SELECT 1 FROM public_messages WHERE id = ? AND ${allowed})`, [messageId],
    ),
    c.env.DB.prepare(
      `UPDATE public_messages SET status = 'recalled_by_admin', recalled_by_type = 'admin', recalled_at = datetime('now'), moderation_reason = ?, updated_at = datetime('now') WHERE id = ? AND ${allowed}`
    ).bind(reason, messageId),
  ])
  const updated = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ?').bind(messageId).first() as any
  return c.json({ success: true, data: messageData(updated) })
})

function isValidFutureIso(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = ISO_WITH_TIMEZONE.exec(value)
  if (!match) return false
  const [, year, month, day, hour, minute, second, fraction, offset] = match
  const milliseconds = Number((fraction || '').padEnd(3, '0') || 0)
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), milliseconds))
  const offsetValid = offset === 'Z' || (Number(offset.slice(1, 3)) <= 23 && Number(offset.slice(4, 6)) <= 59)
  if (!offsetValid || calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() !== Number(month) - 1 || calendar.getUTCDate() !== Number(day) || calendar.getUTCHours() !== Number(hour) || calendar.getUTCMinutes() !== Number(minute) || calendar.getUTCSeconds() !== Number(second) || calendar.getUTCMilliseconds() !== milliseconds) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > Date.now()
}

function muteChangeCondition() {
  return 'NOT EXISTS (SELECT 1 FROM group_chat_mutes WHERE student_slug = ? AND reason = ? AND (muted_until IS ? OR muted_until = ?))'
}

adminCommunityRoutes.put('/admin/group-chat/mutes/:slug', async (c) => {
  const body = await parseLimitedJson<any>(c, { fallback: {} }) as any
  const reason = reasonOf(body.reason)
  if (!reason) return c.json({ success: false, message: '请填写治理原因' }, 400)
  if (body.mutedUntil !== null && !isValidFutureIso(body.mutedUntil)) return c.json({ success: false, message: '解除时间必须是带时区的未来 ISO 时间' }, 400)
  const mutedUntil = body.mutedUntil as string | null
  const slug = c.req.param('slug')
  const student = await c.env.DB.prepare('SELECT slug FROM students WHERE slug = ?').bind(slug).first()
  if (!student) return c.json({ success: false, message: '同学不存在' }, 404)
  const condition = muteChangeCondition()
  const conditionBinds = [slug, reason, mutedUntil, mutedUntil]
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO content_reviews (id, content_type, content_id, action, reason, admin_id) SELECT ?, 'group_chat_mute', ?, 'mute', ?, ? WHERE ${condition}`
    ).bind(id('cr'), slug, reason, adminId(c), ...conditionBinds),
    c.env.DB.prepare(
      `INSERT INTO notifications (id, recipient_slug, type, title, body, related_type, related_id) SELECT ?, ?, 'group_chat_muted', '你已被禁言', ?, 'group_chat_mute', ? WHERE ${condition}`
    ).bind(id('ntf'), slug, `治理原因：${reason}；解除时间：${mutedUntil || '永久禁言'}`, slug, ...conditionBinds),
    conditionalAuditStatement(
      c.env.DB, adminId(c), 'group_chat.mute', 'group_chat_mute', slug, reason,
      null, { mutedUntil }, condition, conditionBinds,
    ),
    c.env.DB.prepare(
      `INSERT INTO group_chat_mutes (student_slug, muted_until, reason, created_by, created_at, updated_at) SELECT ?, ?, ?, ?, datetime('now'), datetime('now') WHERE ${condition} ON CONFLICT(student_slug) DO UPDATE SET muted_until = excluded.muted_until, reason = excluded.reason, created_by = excluded.created_by, updated_at = datetime('now')`
    ).bind(slug, mutedUntil, reason, adminId(c), ...conditionBinds),
  ])
  return c.json({ success: true, data: await c.env.DB.prepare('SELECT * FROM group_chat_mutes WHERE student_slug = ?').bind(slug).first() })
})

adminCommunityRoutes.delete('/admin/group-chat/mutes/:slug', async (c) => {
  const slug = c.req.param('slug')
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO content_reviews (id, content_type, content_id, action, reason, admin_id) SELECT ?, 'group_chat_mute', student_slug, 'unmute', reason, ? FROM group_chat_mutes WHERE student_slug = ?"
    ).bind(id('cr'), adminId(c), slug),
    c.env.DB.prepare(
      "INSERT INTO notifications (id, recipient_slug, type, title, body, related_type, related_id) SELECT ?, student_slug, 'group_chat_unmuted', '群聊禁言已解除', '原治理原因：' || reason, 'group_chat_mute', student_slug FROM group_chat_mutes WHERE student_slug = ?"
    ).bind(id('ntf'), slug),
    conditionalAuditStatement(
      c.env.DB, adminId(c), 'group_chat.unmute', 'group_chat_mute', slug, null,
      { muted: true }, { muted: false }, 'EXISTS (SELECT 1 FROM group_chat_mutes WHERE student_slug = ?)', [slug],
    ),
    c.env.DB.prepare('DELETE FROM group_chat_mutes WHERE student_slug = ?').bind(slug),
  ])
  return c.json({ success: true, data: null })
})
