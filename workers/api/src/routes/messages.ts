import { Hono } from 'hono'
import { getAdminPrincipal } from '../lib/adminAuth'
import { runAuditedBatch } from '../lib/adminAudit'
import { verifyClassmateSession } from '../lib/classmateSession'
import { claimPublicRequestSlot, publicClientIp } from '../lib/publicRequestLimit'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const messagesRoutes = new Hono<{ Bindings: Bindings }>()

const MESSAGE_SUBMISSION_WINDOW_SECONDS = 60
const MESSAGE_REACTION_WINDOW_SECONDS = 15

async function authClassmate(c: any): Promise<string | null> {
  const token = c.req.header('X-Classmate-Token')
  return verifyClassmateSession(c.env.DB, token)
}

function publicRateLimitResponse(c: any, retryAfterSeconds: number) {
  c.header('Retry-After', String(retryAfterSeconds))
  return c.json({ success: false, message: '操作过于频繁，请稍后再试' }, 429)
}

// 公开获取所有已通过审核的留言列表
messagesRoutes.get('/messages/approved', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare(
    'SELECT id, author_name, content, created_at, card_style FROM messages WHERE is_approved = 1 AND is_hidden = 0 ORDER BY pinned DESC, created_at DESC LIMIT 200'
  ).all()

  return c.json({
    success: true,
    data: (results || []).map((r: any) => ({
      id: r.id,
      authorName: r.author_name,
      content: r.content,
      createdAt: r.created_at,
      cardStyle: r.card_style || 'paper',
    })),
  })
})

// 公开获取留言（仅审核通过的）
messagesRoutes.get('/messages/:slug', async (c) => {
  const slug = c.req.param('slug')
  const db = c.env.DB
  const { results } = await db.prepare(
    'SELECT id, author_name, content, reactions, reply, reply_at, card_style, pinned, created_at FROM messages WHERE student_slug = ? AND is_approved = 1 AND is_hidden = 0 ORDER BY pinned DESC, created_at DESC'
  ).bind(slug).all()

  return c.json({
    success: true,
    data: (results || []).map((r: any) => ({
      id: r.id,
      authorName: r.author_name,
      content: r.content,
      reactions: JSON.parse(r.reactions || '{}'),
      reply: r.reply || null,
      replyAt: r.reply_at || null,
      cardStyle: r.card_style || 'paper',
      pinned: !!r.pinned,
      createdAt: r.created_at,
    })),
  })
})

// 公开提交留言
messagesRoutes.post('/messages/:slug', async (c) => {
  const slug = c.req.param('slug')
  const db = c.env.DB
  const body = await c.req.json()

  const { authorName, content, cardStyle } = body
  if (!authorName || !authorName.trim()) {
    return c.json({ success: false, message: '请提供留言者姓名' }, 400)
  }
  if (!content || !content.trim() || content.trim().length > 500) {
    return c.json({ success: false, message: '留言内容必须在 1-500 字之间' }, 400)
  }

  const ALLOWED_STYLES = ['paper', 'chalkboard', 'photoback', 'letter']
  const style = ALLOWED_STYLES.includes(cardStyle) ? cardStyle : 'paper'

  const student = await db.prepare('SELECT id FROM students WHERE slug = ?').bind(slug).first()
  if (!student) {
    return c.json({ success: false, message: '学生不存在' }, 404)
  }

  const limit = await claimPublicRequestSlot(
    db,
    `message:${publicClientIp(c.req.raw)}:${slug}`,
    MESSAGE_SUBMISSION_WINDOW_SECONDS,
  )
  if (limit.limited) return publicRateLimitResponse(c, limit.retryAfterSeconds)

  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await db.prepare(
    'INSERT INTO messages (id, student_slug, author_name, content, card_style, is_approved) VALUES (?, ?, ?, ?, ?, 0)'
  ).bind(id, slug, authorName.trim(), content.trim(), style).run()

  return c.json({ success: true, message: '留言已提交，等待审核' })
})

// 表情反应
messagesRoutes.put('/messages/:id/react', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const { reaction } = await c.req.json()

  const ALLOWED = ['❤️', '👍', '😂', '🎉']
  if (!ALLOWED.includes(reaction)) {
    return c.json({ success: false, message: '不支持的表情' }, 400)
  }

  const message = await db.prepare('SELECT id FROM messages WHERE id = ?').bind(id).first()
  if (!message) return c.json({ success: false, message: '留言不存在' }, 404)

  const limit = await claimPublicRequestSlot(
    db,
    `reaction:${publicClientIp(c.req.raw)}:${id}`,
    MESSAGE_REACTION_WINDOW_SECONDS,
  )
  if (limit.limited) return publicRateLimitResponse(c, limit.retryAfterSeconds)

  // 原子更新避免并发覆盖（json_set 内 CRUD 为单条 SQL）
  const path = `$.${reaction}`
  await db.prepare(
    `UPDATE messages SET reactions = json_set(
      COALESCE(reactions, '{}'),
      ?,
      COALESCE(CAST(json_extract(COALESCE(reactions, '{}'), ?) AS INTEGER), 0) + 1
    ) WHERE id = ?`
  ).bind(path, path, id).run()

  // 读取更新后结果返回给前端
  const row = await db.prepare('SELECT reactions FROM messages WHERE id = ?').bind(id).first()
  if (!row) return c.json({ success: false, message: '留言不存在' }, 404)

  const reactions = JSON.parse((row as any).reactions || '{}')
  return c.json({ success: true, data: { reactions } })
})

// 主人回复留言
messagesRoutes.put('/messages/:id/reply', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const { reply } = await c.req.json()

  if (!reply || !reply.trim() || reply.trim().length > 500) {
    return c.json({ success: false, message: '回复内容必须在 1-500 字之间' }, 400)
  }

  const authedSlug = await authClassmate(c)
  if (!authedSlug) {
    return c.json({ success: false, message: '未授权，请先验证身份' }, 401)
  }

  const msg = await db.prepare('SELECT student_slug FROM messages WHERE id = ?').bind(id).first()
  if (!msg) return c.json({ success: false, message: '留言不存在' }, 404)

  if (authedSlug !== (msg as any).student_slug) {
    return c.json({ success: false, message: '只有页面主人可以回复' }, 403)
  }

  await db.prepare(
    "UPDATE messages SET reply = ?, reply_at = datetime('now') WHERE id = ?"
  ).bind(reply.trim(), id).run()

  return c.json({ success: true, message: '回复成功' })
})

// 管理员获取所有留言
messagesRoutes.get('/admin/messages', async (c) => {
  const db = c.env.DB
  const slug = c.req.query('slug')
  const approved = c.req.query('approved')

  let sql = 'SELECT * FROM messages WHERE 1=1'
  const binds: any[] = []

  if (slug) { sql += ' AND student_slug = ?'; binds.push(slug) }
  if (approved === '0') { sql += ' AND is_approved = 0' }
  if (approved === '1') { sql += ' AND is_approved = 1' }
  sql += ' ORDER BY pinned DESC, created_at DESC LIMIT 100'

  const { results } = await db.prepare(sql).bind(...binds).all()
  return c.json({
    success: true,
    data: (results || []).map((r: any) => ({
      id: r.id,
      studentSlug: r.student_slug,
      authorName: r.author_name,
      content: r.content,
      reactions: JSON.parse(r.reactions || '{}'),
      reply: r.reply || null,
      replyAt: r.reply_at || null,
      isApproved: !!r.is_approved,
      isHidden: !!r.is_hidden,
      cardStyle: r.card_style || 'paper',
      pinned: !!r.pinned,
      createdAt: r.created_at,
    })),
  })
})

// 审核通过
messagesRoutes.put('/admin/messages/:id/approve', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const before = await db.prepare('SELECT is_approved FROM messages WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '留言不存在' }, 404)
  await runAuditedBatch(db, admin.id, [
    db.prepare('UPDATE messages SET is_approved = 1 WHERE id = ?').bind(id),
  ], { action: 'message.approve', resourceType: 'message', resourceId: id, before, after: { isApproved: true } })
  return c.json({ success: true, message: '已审核通过' })
})

// 隐藏/取消隐藏
messagesRoutes.put('/admin/messages/:id/hide', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { hidden, reason } = await c.req.json()
  const cleanReason = String(reason || '').trim()
  if (hidden && !cleanReason) return c.json({ success: false, message: '隐藏留言时请填写原因' }, 400)
  const before = await db.prepare('SELECT is_hidden FROM messages WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '留言不存在' }, 404)
  await runAuditedBatch(db, admin.id, [
    db.prepare('UPDATE messages SET is_hidden = ? WHERE id = ?').bind(hidden ? 1 : 0, id),
  ], { action: hidden ? 'message.hide' : 'message.unhide', resourceType: 'message', resourceId: id, reason: cleanReason || null, before, after: { isHidden: !!hidden } })
  return c.json({ success: true, message: hidden ? '已隐藏' : '已取消隐藏' })
})

// 置顶/取消置顶
messagesRoutes.put('/admin/messages/:id/pin', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { pinned } = await c.req.json()
  const before = await db.prepare('SELECT pinned FROM messages WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '留言不存在' }, 404)
  await runAuditedBatch(db, admin.id, [
    db.prepare('UPDATE messages SET pinned = ? WHERE id = ?').bind(pinned ? 1 : 0, id),
  ], { action: pinned ? 'message.pin' : 'message.unpin', resourceType: 'message', resourceId: id, before, after: { pinned: !!pinned } })
  return c.json({ success: true, message: pinned ? '已置顶' : '已取消置顶' })
})

// 批量操作留言
messagesRoutes.post('/admin/messages/batch', async (c) => {
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { ids, action, hidden, reason } = await c.req.json()
  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ success: false, message: '无效的 ID 数组' }, 400)
  }
  const cleanReason = String(reason || '').trim()
  if ((action === 'delete' || (action === 'hide' && hidden)) && !cleanReason) {
    return c.json({ success: false, message: '该批量操作需要填写原因' }, 400)
  }

  const placeholders = ids.map(() => '?').join(',')
  let mutation: D1PreparedStatement
  if (action === 'approve') {
    mutation = db.prepare(`UPDATE messages SET is_approved = 1 WHERE id IN (${placeholders})`).bind(...ids)
  } else if (action === 'hide') {
    mutation = db.prepare(`UPDATE messages SET is_hidden = ? WHERE id IN (${placeholders})`).bind(hidden ? 1 : 0, ...ids)
  } else if (action === 'delete') {
    mutation = db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).bind(...ids)
  } else {
    return c.json({ success: false, message: '不支持的批量操作' }, 400)
  }
  await runAuditedBatch(db, admin.id, [mutation], {
    action: `message.batch_${action}`, resourceType: 'message', resourceId: ids.join(','), reason: cleanReason || null,
    after: { count: ids.length, hidden: action === 'hide' ? !!hidden : undefined },
  })

  return c.json({ success: true, message: '批量操作成功' })
})

// 删除留言
messagesRoutes.delete('/admin/messages/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { reason } = await c.req.json().catch(() => ({}))
  const cleanReason = String(reason || '').trim()
  if (!cleanReason) return c.json({ success: false, message: '删除留言时请填写原因' }, 400)
  const before = await db.prepare('SELECT student_slug, author_name FROM messages WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '留言不存在' }, 404)
  await runAuditedBatch(db, admin.id, [db.prepare('DELETE FROM messages WHERE id = ?').bind(id)], {
    action: 'message.delete', resourceType: 'message', resourceId: id, reason: cleanReason, before,
  })
  return c.json({ success: true, message: '已删除' })
})
