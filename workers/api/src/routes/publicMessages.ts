import { Hono } from 'hono'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'
import { getAdminPrincipal } from '../lib/adminAuth'
import { runAuditedBatch } from '../lib/adminAudit'

type Bindings = {
  DB: D1Database
}

const ALLOWED_STYLES = ['paper', 'chalkboard', 'photoback', 'letter']

export const publicMessagesRoutes = new Hono<{ Bindings: Bindings }>()

function safeParseJson(str: string, fallback: any = {}) {
  try {
    return JSON.parse(str || '{}')
  } catch {
    return fallback
  }
}

function formatPublicMessage(row: any, includeReviewer = false) {
  const message = {
    id: row.id,
    authorSlug: row.author_slug,
    authorName: row.author_name,
    content: row.content,
    cardStyle: row.card_style || 'paper',
    status: row.status || 'pending',
    reviewReason: row.review_reason || null,
    featured: !!row.featured,
    pinned: !!row.pinned,
    reactions: safeParseJson(row.reactions),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || null,
  }
  return includeReviewer ? { ...message, reviewedBy: row.reviewed_by || null } : message
}

type PendingReviewInput = {
  id: string
  authorSlug: string
  adminId: string
  adminName: string
  action: 'approve' | 'reject'
  status: 'approved' | 'rejected'
  reason: string | null
  notificationType: string
  notificationTitle: string
  notificationBody: string
}

function buildPendingReviewBatch(db: D1Database, input: PendingReviewInput): D1PreparedStatement[] {
  const guard = "EXISTS (SELECT 1 FROM public_messages WHERE id = ? AND status = 'pending')"
  return [
    db.prepare(
      `INSERT INTO content_reviews (id, content_type, content_id, action, reason, admin_id)
       SELECT ?, 'public_message', ?, ?, ?, ? WHERE ${guard}`
    ).bind(`cr_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, input.id, input.action, input.reason, input.adminId, input.id),
    db.prepare(
      `INSERT INTO notifications (id, recipient_slug, type, title, body, related_type, related_id)
       SELECT ?, ?, ?, ?, ?, 'public_message', ? WHERE ${guard}`
    ).bind(`ntf_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, input.authorSlug, input.notificationType, input.notificationTitle, input.notificationBody, input.id, input.id),
    db.prepare(
      `INSERT INTO admin_audit_logs
        (id, admin_account_id, action, resource_type, resource_id, reason, before_summary, after_summary, metadata)
       SELECT ?, ?, ?, 'public_message', ?, ?, ?, ?, '{}' WHERE ${guard}`
    ).bind(
      `audit_${crypto.randomUUID()}`, input.adminId, `public_message.${input.action}`, input.id, input.reason,
      JSON.stringify({ status: 'pending' }), JSON.stringify({ status: input.status }), input.id,
    ),
    db.prepare(
      `UPDATE public_messages
       SET status = ?, review_reason = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND status = 'pending'`
    ).bind(input.status, input.reason, input.adminName, input.id),
  ]
}

publicMessagesRoutes.get('/public-messages', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM public_messages
     WHERE status = 'approved'
     ORDER BY pinned DESC, featured DESC, created_at DESC
     LIMIT 20`
  ).all()

  return c.json({ success: true, data: { items: (results || []).map(formatPublicMessage) } })
})

publicMessagesRoutes.get('/public-messages/mine', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM public_messages
     WHERE author_slug = ?
     ORDER BY created_at DESC
     LIMIT 50`
  ).bind(identity.slug).all()

  return c.json({ success: true, data: { items: (results || []).map(formatPublicMessage) } })
})

publicMessagesRoutes.post('/public-messages', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  if (identity.mustChangePassword) {
    return c.json({ success: false, message: '首次登录请先修改密码后再提交留言' }, 403)
  }

  const body = await c.req.json().catch(() => ({}))
  const content = String(body.content || '').trim()
  if (!content || content.length > 500) {
    return c.json({ success: false, message: '留言内容必须在 1-500 字之间' }, 400)
  }

  const cardStyle = ALLOWED_STYLES.includes(body.cardStyle) ? body.cardStyle : 'paper'
  const id = `pm_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`

  await c.env.DB.prepare(
    `INSERT INTO public_messages
      (id, author_slug, author_name, content, card_style, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).bind(id, identity.slug, identity.name, content, cardStyle).run()

  return c.json({
    success: true,
    message: '留言已提交，等待审核',
    data: { id, status: 'pending', content, cardStyle },
  })
})

publicMessagesRoutes.put('/public-messages/:id/react', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const id = c.req.param('id')
  const { reaction } = await c.req.json().catch(() => ({}))
  const allowed = ['❤️', '👍', '😂', '🎉']
  if (!allowed.includes(reaction)) {
    return c.json({ success: false, message: '不支持的表情' }, 400)
  }

  const path = `$.${reaction}`
  await c.env.DB.prepare(
    `UPDATE public_messages SET reactions = json_set(
      COALESCE(reactions, '{}'),
      ?,
      COALESCE(CAST(json_extract(COALESCE(reactions, '{}'), ?) AS INTEGER), 0) + 1
    ) WHERE id = ? AND status = 'approved'`
  ).bind(path, path, id).run()

  const row = await c.env.DB.prepare('SELECT reactions FROM public_messages WHERE id = ? AND status = \'approved\'').bind(id).first() as any
  if (!row) return c.json({ success: false, message: '留言不存在' }, 404)
  return c.json({ success: true, data: { reactions: safeParseJson(row.reactions) } })
})

publicMessagesRoutes.get('/admin/public-messages', async (c) => {
  const status = c.req.query('status')
  const binds: string[] = []
  let sql = 'SELECT * FROM public_messages WHERE 1=1'
  if (status) {
    sql += ' AND status = ?'
    binds.push(status)
  }
  sql += ' ORDER BY pinned DESC, featured DESC, created_at DESC LIMIT 100'

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ success: true, data: (results || []).map(row => formatPublicMessage(row, true)) })
})

publicMessagesRoutes.put('/admin/public-messages/:id/approve', async (c) => {
  const id = c.req.param('id')
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const row = await c.env.DB.prepare('SELECT author_slug, status FROM public_messages WHERE id = ?').bind(id).first() as any
  if (!row) return c.json({ success: false, message: '留言不存在' }, 404)
  if (row.status !== 'pending') return c.json({ success: false, message: '该留言已完成审核' }, 409)
  const results = await c.env.DB.batch(buildPendingReviewBatch(c.env.DB, {
    id, authorSlug: row.author_slug, adminId: admin.id, adminName: admin.displayName,
    action: 'approve', status: 'approved', reason: null,
    notificationType: 'public_message_approved', notificationTitle: '公共留言已通过审核',
    notificationBody: '你提交的公共留言已经展示在班级留言墙。',
  }))
  if (Number(results[results.length - 1]?.meta.changes || 0) !== 1) return c.json({ success: false, message: '该留言已完成审核' }, 409)

  return c.json({ success: true, message: '已审核通过' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/reject', async (c) => {
  const id = c.req.param('id')
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { reason } = await c.req.json().catch(() => ({}))
  const reviewReason = String(reason || '').trim()
  if (!reviewReason) return c.json({ success: false, message: '请填写退回原因' }, 400)

  const row = await c.env.DB.prepare('SELECT author_slug, status FROM public_messages WHERE id = ?').bind(id).first() as any
  if (!row) return c.json({ success: false, message: '留言不存在' }, 404)
  if (row.status !== 'pending') return c.json({ success: false, message: '该留言已完成审核' }, 409)
  const results = await c.env.DB.batch(buildPendingReviewBatch(c.env.DB, {
    id, authorSlug: row.author_slug, adminId: admin.id, adminName: admin.displayName,
    action: 'reject', status: 'rejected', reason: reviewReason,
    notificationType: 'public_message_rejected', notificationTitle: '公共留言未通过审核', notificationBody: reviewReason,
  }))
  if (Number(results[results.length - 1]?.meta.changes || 0) !== 1) return c.json({ success: false, message: '该留言已完成审核' }, 409)

  return c.json({ success: true, message: '已退回留言' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/hide', async (c) => {
  const id = c.req.param('id')
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { hidden, reason } = await c.req.json().catch(() => ({}))
  const cleanReason = String(reason || '').trim()
  if (hidden && !cleanReason) return c.json({ success: false, message: '隐藏留言时请填写原因' }, 400)
  const before = await c.env.DB.prepare('SELECT status FROM public_messages WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '留言不存在' }, 404)
  await runAuditedBatch(c.env.DB, admin.id, [c.env.DB.prepare(
    "UPDATE public_messages SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(hidden ? 'hidden' : 'approved', id)], { action: hidden ? 'public_message.hide' : 'public_message.unhide', resourceType: 'public_message', resourceId: id, reason: cleanReason || null, before, after: { status: hidden ? 'hidden' : 'approved' } })
  return c.json({ success: true, message: hidden ? '已隐藏' : '已取消隐藏' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/pin', async (c) => {
  const id = c.req.param('id')
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { pinned } = await c.req.json().catch(() => ({}))
  const before = await c.env.DB.prepare('SELECT pinned FROM public_messages WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '留言不存在' }, 404)
  await runAuditedBatch(c.env.DB, admin.id, [c.env.DB.prepare('UPDATE public_messages SET pinned = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(pinned ? 1 : 0, id)], { action: pinned ? 'public_message.pin' : 'public_message.unpin', resourceType: 'public_message', resourceId: id, before, after: { pinned: !!pinned } })
  return c.json({ success: true, message: pinned ? '已置顶' : '已取消置顶' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/feature', async (c) => {
  const id = c.req.param('id')
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { featured } = await c.req.json().catch(() => ({}))
  const before = await c.env.DB.prepare('SELECT featured FROM public_messages WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '留言不存在' }, 404)
  await runAuditedBatch(c.env.DB, admin.id, [c.env.DB.prepare('UPDATE public_messages SET featured = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(featured ? 1 : 0, id)], { action: featured ? 'public_message.feature' : 'public_message.unfeature', resourceType: 'public_message', resourceId: id, before, after: { featured: !!featured } })
  return c.json({ success: true, message: featured ? '已精选' : '已取消精选' })
})

publicMessagesRoutes.delete('/admin/public-messages/:id', async (c) => {
  const id = c.req.param('id')
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { reason } = await c.req.json().catch(() => ({}))
  const cleanReason = String(reason || '').trim()
  if (!cleanReason) return c.json({ success: false, message: '删除留言时请填写原因' }, 400)
  const before = await c.env.DB.prepare('SELECT author_slug, status FROM public_messages WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '留言不存在' }, 404)
  await runAuditedBatch(c.env.DB, admin.id, [c.env.DB.prepare('DELETE FROM public_messages WHERE id = ?').bind(id)], { action: 'public_message.delete', resourceType: 'public_message', resourceId: id, reason: cleanReason, before })
  return c.json({ success: true, message: '已删除' })
})
