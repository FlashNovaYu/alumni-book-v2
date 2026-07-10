import { Hono } from 'hono'
import { adminGuard } from '../lib/adminGuard'
import { createNotification } from '../lib/notificationService'

type Bindings = { DB: D1Database; JWT_SECRET: string }
export const adminCommunityRoutes = new Hono<{ Bindings: Bindings }>()

const id = (prefix: string) => `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
const reasonOf = (value: unknown) => String(value || '').trim()

async function writeReview(db: D1Database, contentId: string, action: string, reason: string) {
  await db.prepare(
    "INSERT INTO content_reviews (id, content_type, content_id, action, reason, admin_id) VALUES (?, 'group_chat_message', ?, ?, ?, 'admin')"
  ).bind(id('cr'), contentId, action, reason).run()
}

function messageData(row: any) {
  return {
    id: row.id, author: { slug: row.author_slug, name: row.author_name }, content: row.content,
    status: row.status, moderationReason: row.moderation_reason, recalledAt: row.recalled_at,
    recalledByType: row.recalled_by_type, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

adminCommunityRoutes.use('*', adminGuard)

adminCommunityRoutes.get('/admin/group-chat/messages', async (c) => {
  const status = c.req.query('status')
  const valid = new Set(['visible', 'hidden', 'recalled_by_author', 'recalled_by_admin'])
  if (status && !valid.has(status)) return c.json({ success: false, message: '状态无效' }, 400)
  const query = status
    ? c.env.DB.prepare('SELECT * FROM public_messages WHERE status = ? ORDER BY updated_at DESC, id DESC LIMIT 100').bind(status)
    : c.env.DB.prepare('SELECT * FROM public_messages ORDER BY updated_at DESC, id DESC LIMIT 100')
  const { results } = await query.all()
  return c.json({ success: true, data: (results || []).map(messageData) })
})

adminCommunityRoutes.put('/admin/group-chat/messages/:id/hide', async (c) => {
  const body = await c.req.json().catch(() => ({})) as any
  const reason = reasonOf(body.reason)
  if (!reason) return c.json({ success: false, message: '请填写治理原因' }, 400)
  const row = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ?').bind(c.req.param('id')).first() as any
  if (!row) return c.json({ success: false, message: '消息不存在' }, 404)
  if (row.status === 'recalled_by_admin' || row.status === 'recalled_by_author') return c.json({ success: false, message: '已撤回消息不可恢复' }, 409)
  const hidden = Boolean(body.hidden)
  const nextStatus = hidden ? 'hidden' : 'visible'
  if (row.status === nextStatus) return c.json({ success: true, data: messageData(row) })
  await c.env.DB.prepare("UPDATE public_messages SET status = ?, moderation_reason = ?, updated_at = datetime('now') WHERE id = ?").bind(nextStatus, reason, row.id).run()
  await writeReview(c.env.DB, row.id, hidden ? 'hide' : 'restore', reason)
  await createNotification(c.env.DB, {
    recipientSlug: row.author_slug, type: hidden ? 'group_chat_hidden' : 'group_chat_restored',
    title: hidden ? '群聊消息已隐藏' : '群聊消息已恢复', body: `治理原因：${reason}`,
    relatedType: 'group_chat_message', relatedId: row.id,
  })
  const updated = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ?').bind(row.id).first() as any
  return c.json({ success: true, data: messageData(updated) })
})

adminCommunityRoutes.post('/admin/group-chat/messages/:id/recall', async (c) => {
  const reason = reasonOf((await c.req.json().catch(() => ({})) as any).reason)
  if (!reason) return c.json({ success: false, message: '请填写治理原因' }, 400)
  const row = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ?').bind(c.req.param('id')).first() as any
  if (!row) return c.json({ success: false, message: '消息不存在' }, 404)
  if (row.status === 'recalled_by_admin') return c.json({ success: true, data: messageData(row) })
  await c.env.DB.prepare("UPDATE public_messages SET status = 'recalled_by_admin', recalled_by_type = 'admin', recalled_at = datetime('now'), moderation_reason = ?, updated_at = datetime('now') WHERE id = ?").bind(reason, row.id).run()
  await writeReview(c.env.DB, row.id, 'recall', reason)
  await createNotification(c.env.DB, {
    id: `ntf_group_recall_${row.id}`, recipientSlug: row.author_slug, type: 'group_chat_recalled',
    title: '群聊消息已被管理员撤回', body: `治理原因：${reason}`, relatedType: 'group_chat_message', relatedId: row.id,
  })
  const updated = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ?').bind(row.id).first() as any
  return c.json({ success: true, data: messageData(updated) })
})

adminCommunityRoutes.put('/admin/group-chat/mutes/:slug', async (c) => {
  const body = await c.req.json().catch(() => ({})) as any
  const reason = reasonOf(body.reason)
  if (!reason) return c.json({ success: false, message: '请填写治理原因' }, 400)
  const mutedUntil = body.mutedUntil === null ? null : String(body.mutedUntil || '')
  if (mutedUntil && (!Number.isFinite(Date.parse(mutedUntil)) || Date.parse(mutedUntil) <= Date.now())) return c.json({ success: false, message: '解除时间必须是未来时间' }, 400)
  if (body.mutedUntil !== null && !mutedUntil) return c.json({ success: false, message: '解除时间无效' }, 400)
  const slug = c.req.param('slug')
  const student = await c.env.DB.prepare('SELECT slug FROM students WHERE slug = ?').bind(slug).first()
  if (!student) return c.json({ success: false, message: '同学不存在' }, 404)
  const existing = await c.env.DB.prepare('SELECT * FROM group_chat_mutes WHERE student_slug = ?').bind(slug).first() as any
  if (existing && existing.reason === reason && existing.muted_until === mutedUntil) return c.json({ success: true, data: existing })
  await c.env.DB.prepare(
    "INSERT INTO group_chat_mutes (student_slug, muted_until, reason, created_by, created_at, updated_at) VALUES (?, ?, ?, 'admin', datetime('now'), datetime('now')) ON CONFLICT(student_slug) DO UPDATE SET muted_until = excluded.muted_until, reason = excluded.reason, created_by = excluded.created_by, updated_at = datetime('now')"
  ).bind(slug, mutedUntil, reason).run()
  await writeReview(c.env.DB, slug, 'mute', reason)
  await createNotification(c.env.DB, {
    recipientSlug: slug, type: 'group_chat_muted', title: '你已被禁言',
    body: `治理原因：${reason}；解除时间：${mutedUntil || '永久禁言'}`, relatedType: 'group_chat_mute', relatedId: slug,
  })
  return c.json({ success: true, data: await c.env.DB.prepare('SELECT * FROM group_chat_mutes WHERE student_slug = ?').bind(slug).first() })
})

adminCommunityRoutes.delete('/admin/group-chat/mutes/:slug', async (c) => {
  const slug = c.req.param('slug')
  const existing = await c.env.DB.prepare('SELECT * FROM group_chat_mutes WHERE student_slug = ?').bind(slug).first()
  if (!existing) return c.json({ success: true, data: null })
  await c.env.DB.prepare('DELETE FROM group_chat_mutes WHERE student_slug = ?').bind(slug).run()
  await writeReview(c.env.DB, slug, 'unmute', (existing as any).reason)
  await createNotification(c.env.DB, {
    recipientSlug: slug, type: 'group_chat_unmuted', title: '群聊禁言已解除',
    body: `原治理原因：${(existing as any).reason}`, relatedType: 'group_chat_mute', relatedId: slug,
  })
  return c.json({ success: true, data: null })
})
