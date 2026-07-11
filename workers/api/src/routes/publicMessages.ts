import { Hono } from 'hono'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'
import { createNotification } from '../lib/notificationService'
import { createGroupChatMessage } from '../lib/groupChatCreate'
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

function formatPublicMessage(row: any) {
  return {
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

  const body = await c.req.json().catch(() => ({}))
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
    ) WHERE id = ? AND status = 'visible'`
  ).bind(path, path, id).run()

  const row = await c.env.DB.prepare('SELECT reactions FROM public_messages WHERE id = ? AND status = \'visible\'').bind(id).first() as any
  if (!row) return c.json({ success: false, message: '留言不存在' }, 404)
  return c.json({ success: true, data: { reactions: safeParseJson(row.reactions) } })
})

publicMessagesRoutes.get('/admin/public-messages', async (c) => {
  const status = c.req.query('status')
  const binds: string[] = []
  let sql = 'SELECT * FROM public_messages WHERE 1=1'
  if (status) {
    const databaseStatus = status === 'approved' ? 'visible' : status
    sql += ' AND status = ?'
    binds.push(databaseStatus)
  }
  sql += ' ORDER BY pinned DESC, featured DESC, created_at DESC LIMIT 100'

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ success: true, data: (results || []).map(formatPublicMessage) })
})

publicMessagesRoutes.put('/admin/public-messages/:id/approve', async (c) => {
  const id = c.req.param('id')

  const result = await c.env.DB.prepare(
    "UPDATE public_messages SET status = 'visible', reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'pending'"
  ).bind(id).run()

  if (result.meta.changes !== 1) {
    const row = await c.env.DB.prepare('SELECT id, status FROM public_messages WHERE id = ?').bind(id).first() as any
    if (!row) return c.json({ success: false, message: '留言不存在' }, 404)
    return c.json({ success: false, message: '该留言状态不允许此操作' }, 409)
  }

  const row = await c.env.DB.prepare('SELECT author_slug FROM public_messages WHERE id = ?').bind(id).first() as any
  await c.env.DB.prepare(
    "INSERT INTO content_reviews (id, content_type, content_id, action) VALUES (?, 'public_message', ?, 'approve')"
  ).bind(`cr_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, id).run()
  await createNotification(c.env.DB, {
    recipientSlug: row.author_slug,
    type: 'public_message_approved',
    title: '公共留言已通过审核',
    body: '你提交的公共留言已经展示在班级留言墙。',
    relatedType: 'public_message',
    relatedId: id,
  })

  return c.json({ success: true, message: '已审核通过' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/reject', async (c) => {
  const id = c.req.param('id')
  const { reason } = await c.req.json().catch(() => ({}))
  const reviewReason = String(reason || '').trim()
  if (!reviewReason) return c.json({ success: false, message: '请填写退回原因' }, 400)

  const row = await c.env.DB.prepare('SELECT author_slug FROM public_messages WHERE id = ?').bind(id).first() as any
  if (!row) return c.json({ success: false, message: '留言不存在' }, 404)

  await c.env.DB.prepare(
    "UPDATE public_messages SET status = 'rejected', review_reason = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).bind(reviewReason, id).run()
  await c.env.DB.prepare(
    "INSERT INTO content_reviews (id, content_type, content_id, action, reason) VALUES (?, 'public_message', ?, 'reject', ?)"
  ).bind(`cr_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, id, reviewReason).run()
  await createNotification(c.env.DB, {
    recipientSlug: row.author_slug,
    type: 'public_message_rejected',
    title: '公共留言未通过审核',
    body: reviewReason,
    relatedType: 'public_message',
    relatedId: id,
  })

  return c.json({ success: true, message: '已退回留言' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/hide', async (c) => {
  const id = c.req.param('id')
  const { hidden } = await c.req.json().catch(() => ({}))
  await c.env.DB.prepare(
    "UPDATE public_messages SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(hidden ? 'hidden' : 'visible', id).run()
  return c.json({ success: true, message: hidden ? '已隐藏' : '已取消隐藏' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/pin', async (c) => {
  const id = c.req.param('id')
  const { pinned } = await c.req.json().catch(() => ({}))
  await c.env.DB.prepare('UPDATE public_messages SET pinned = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(pinned ? 1 : 0, id).run()
  return c.json({ success: true, message: pinned ? '已置顶' : '已取消置顶' })
})

publicMessagesRoutes.put('/admin/public-messages/:id/feature', async (c) => {
  const id = c.req.param('id')
  const { featured } = await c.req.json().catch(() => ({}))
  await c.env.DB.prepare('UPDATE public_messages SET featured = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(featured ? 1 : 0, id).run()
  return c.json({ success: true, message: featured ? '已精选' : '已取消精选' })
})

publicMessagesRoutes.delete('/admin/public-messages/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM public_messages WHERE id = ?').bind(id).run()
  return c.json({ success: true, message: '已删除' })
})
