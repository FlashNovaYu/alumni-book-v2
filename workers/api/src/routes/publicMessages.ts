import { Hono } from 'hono'
import { parseLimitedJson } from '../lib/jsonBodyLimit'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'
import { createNotification } from '../lib/notificationService'
import { createGroupChatMessage } from '../lib/groupChatCreate'
import { getAdminPrincipal } from '../lib/adminAuth'
import { runAuditedBatch } from '../lib/adminAudit'
import type { GroupChatCreatorIdentity } from '../lib/groupChatCreate'

type Bindings = {
  DB: D1Database
}

export const publicMessagesRoutes = new Hono<{ Bindings: Bindings }>()

function safeParseJson(str: string, fallback: any = {}) {
  try {
    return JSON.parse(str || '{}')
  } catch {
    return fallback
  }
}

function legacyPublicStatus(status: string) {
  if (status === 'visible') return 'approved'
  if (status === 'recalled_by_author' || status === 'recalled_by_admin') return 'hidden'
  return status
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function legacyClientNonce(identity: GroupChatCreatorIdentity, body: any) {
  const supplied = typeof body?.clientNonce === 'string' ? body.clientNonce.trim() : ''
  if (supplied) return supplied

  // Older clients have no nonce. A short time window makes a lost-response retry idempotent.
  const window = Math.floor(Date.now() / 30_000)
  const fingerprint = [identity.slug, window, body?.content || '', body?.cardStyle || ''].join('\u0000')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint))
  return `legacy:${window}:${bytesToHex(new Uint8Array(digest).slice(0, 12))}`
}

function formatPublicMessage(row: any, includeReviewer = false) {
  const message = {
    id: row.id,
    authorSlug: row.author_slug,
    authorName: row.author_name,
    content: row.content,
    cardStyle: row.card_style || 'paper',
    status: legacyPublicStatus(row.status || 'pending'),
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
  status: 'visible' | 'rejected'
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
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM public_messages
     WHERE status = 'visible'
     ORDER BY pinned DESC, featured DESC, created_at DESC
     LIMIT 20`
  ).all()

  return c.json({ success: true, data: { items: (results || []).map(row => formatPublicMessage(row)) } })
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

  return c.json({ success: true, data: { items: (results || []).map(row => formatPublicMessage(row)) } })
})

publicMessagesRoutes.post('/public-messages', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const body = await parseLimitedJson<any>(c, { fallback: {} })
  const creator = identity as GroupChatCreatorIdentity

  const result = await createGroupChatMessage(c.env.DB, creator, {
    content: body?.content,
    cardStyle: body?.cardStyle,
    clientNonce: await legacyClientNonce(creator, body),
  })

  if (!result.ok) {
    const res = c.json({ success: false, message: result.message }, result.status)
    if (result.retryAfter) {
      res.headers.set('Retry-After', String(result.retryAfter))
    }
    return res
  }

  return c.json({
    success: true,
    message: '留言已发布',
    data: {
      id: result.message.id,
      status: 'approved',
      content: result.message.content,
      cardStyle: result.cardStyle,
    },
  })
})

publicMessagesRoutes.put('/public-messages/:id/react', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const id = c.req.param('id')
  const { reaction } = await parseLimitedJson<any>(c, { fallback: {} })
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
    ) WHERE id = ? AND status = 'visible'`
  ).bind(path, path, id).run()

  const row = await c.env.DB.prepare('SELECT reactions FROM public_messages WHERE id = ? AND status = \'visible\'').bind(id).first() as any
  if (!row) return c.json({ success: false, message: '留言不存在' }, 404)
  return c.json({ success: true, data: { reactions: safeParseJson(row.reactions) } })
})

publicMessagesRoutes.get('/admin/public-messages', async (c) => {
  const status = c.req.query('status')
  const binds: string[] = []
  let sql = "SELECT * FROM public_messages WHERE (client_nonce IS NULL OR client_nonce LIKE 'legacy:%')"
  if (status) {
    const databaseStatus = status === 'approved' ? 'visible' : status
    sql += ' AND status = ?'
    binds.push(databaseStatus)
  }
  sql += ' ORDER BY pinned DESC, featured DESC, created_at DESC LIMIT 100'

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ success: true, data: (results || []).map((row) => formatPublicMessage(row, true)) })
})

publicMessagesRoutes.put('/admin/public-messages/:id/approve', async (c) => {
  const id = c.req.param('id')
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const row = await c.env.DB.prepare('SELECT author_slug, status FROM public_messages WHERE id = ?').bind(id).first() as any
  if (!row) return c.json({ success: false, message: '留言不存在' }, 404)
  if (row.status !== 'pending') return c.json({ success: false, message: '该留言已完成审核' }, 409)
  const results = await c.env.DB.batch(buildPendingReviewBatch(c.env.DB, {
    id,
    authorSlug: row.author_slug,
    adminId: admin.id,
    adminName: admin.displayName,
    action: 'approve',
    status: 'visible',
    reason: null,
    notificationType: 'public_message_approved',
    notificationTitle: '公共留言已通过审核',
    notificationBody: '你提交的公共留言已经展示在班级留言墙。',
  }))
  if (Number(results[results.length - 1]?.meta.changes || 0) < 1) return c.json({ success: false, message: '该留言已完成审核' }, 409)

  return c.json({ success: true, message: '已审核通过' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/reject', async (c) => {
  const id = c.req.param('id')
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { reason } = await parseLimitedJson<any>(c, { fallback: {} })
  const reviewReason = String(reason || '').trim()
  if (!reviewReason) return c.json({ success: false, message: '请填写退回原因' }, 400)

  const row = await c.env.DB.prepare('SELECT author_slug, status FROM public_messages WHERE id = ?').bind(id).first() as any
  if (!row) return c.json({ success: false, message: '留言不存在' }, 404)
  if (row.status !== 'pending') return c.json({ success: false, message: '该留言已完成审核' }, 409)
  const results = await c.env.DB.batch(buildPendingReviewBatch(c.env.DB, {
    id,
    authorSlug: row.author_slug,
    adminId: admin.id,
    adminName: admin.displayName,
    action: 'reject',
    status: 'rejected',
    reason: reviewReason,
    notificationType: 'public_message_rejected',
    notificationTitle: '公共留言未通过审核',
    notificationBody: reviewReason,
  }))
  if (Number(results[results.length - 1]?.meta.changes || 0) < 1) return c.json({ success: false, message: '该留言已完成审核' }, 409)

  return c.json({ success: true, message: '已退回留言' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/hide', async (c) => {
  const id = c.req.param('id')
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { hidden, reason } = await parseLimitedJson<any>(c, { fallback: {} })
  const cleanReason = String(reason || '').trim()
  if (hidden && !cleanReason) return c.json({ success: false, message: '隐藏留言时请填写原因' }, 400)
  const before = await c.env.DB.prepare('SELECT status FROM public_messages WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '留言不存在' }, 404)
  await runAuditedBatch(c.env.DB, admin.id, [c.env.DB.prepare(
    "UPDATE public_messages SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(hidden ? 'hidden' : 'visible', id)], {
    action: hidden ? 'public_message.hide' : 'public_message.unhide',
    resourceType: 'public_message',
    resourceId: id,
    reason: cleanReason || null,
    before,
    after: { status: hidden ? 'hidden' : 'visible' },
  })
  return c.json({ success: true, message: hidden ? '已隐藏' : '已取消隐藏' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/pin', async (c) => {
  const id = c.req.param('id')
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { pinned } = await parseLimitedJson<any>(c, { fallback: {} })
  const before = await c.env.DB.prepare('SELECT pinned FROM public_messages WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '留言不存在' }, 404)
  await runAuditedBatch(c.env.DB, admin.id, [c.env.DB.prepare('UPDATE public_messages SET pinned = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(pinned ? 1 : 0, id)], {
    action: pinned ? 'public_message.pin' : 'public_message.unpin', resourceType: 'public_message', resourceId: id, before, after: { pinned: !!pinned },
  })
  return c.json({ success: true, message: pinned ? '已置顶' : '已取消置顶' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/feature', async (c) => {
  const id = c.req.param('id')
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { featured } = await parseLimitedJson<any>(c, { fallback: {} })
  const before = await c.env.DB.prepare('SELECT featured FROM public_messages WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '留言不存在' }, 404)
  await runAuditedBatch(c.env.DB, admin.id, [c.env.DB.prepare('UPDATE public_messages SET featured = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(featured ? 1 : 0, id)], {
    action: featured ? 'public_message.feature' : 'public_message.unfeature', resourceType: 'public_message', resourceId: id, before, after: { featured: !!featured },
  })
  return c.json({ success: true, message: featured ? '已精选' : '已取消精选' })
})

publicMessagesRoutes.delete('/admin/public-messages/:id', async (c) => {
  const id = c.req.param('id')
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { reason } = await parseLimitedJson<any>(c, { fallback: {} })
  const cleanReason = String(reason || '').trim()
  if (!cleanReason) return c.json({ success: false, message: '删除留言时请填写原因' }, 400)
  const before = await c.env.DB.prepare('SELECT author_slug, status FROM public_messages WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '留言不存在' }, 404)
  await runAuditedBatch(c.env.DB, admin.id, [c.env.DB.prepare('DELETE FROM public_messages WHERE id = ?').bind(id)], {
    action: 'public_message.delete', resourceType: 'public_message', resourceId: id, reason: cleanReason, before,
  })
  return c.json({ success: true, message: '已删除' })
})
