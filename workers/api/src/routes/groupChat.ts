import { Hono } from 'hono'
import { decodeCursor, encodeCursor, type CursorValue } from '../lib/cursor'
import { formatGroupMessage, listGroupMessages } from '../lib/groupChat'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'

type Bindings = { DB: D1Database }
export const groupChatRoutes = new Hono<{ Bindings: Bindings }>()

function parseLimit(raw: string | undefined) {
  const value = Number.parseInt(raw || '30', 10)
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), 30) : 30
}

function parseBefore(c: any): CursorValue | undefined {
  const raw = c.req.query('before')
  const cursor = decodeCursor(raw)
  return cursor || undefined
}

async function list(c: any, mine: boolean) {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const before = parseBefore(c)
  if (c.req.query('before') && !before) return c.json({ success: false, message: '游标无效' }, 400)
  const items = await listGroupMessages(c.env.DB, identity.slug, { before, limit: parseLimit(c.req.query('limit')), mine })
  const oldest = items[0]
  return c.json({ success: true, data: { items, nextCursor: oldest ? encodeCursor({ timestamp: oldest.createdAt, id: oldest.id }) : null } })
}

groupChatRoutes.get('/group-chat/messages', (c) => list(c, false))
groupChatRoutes.get('/group-chat/mine', (c) => list(c, true))

groupChatRoutes.post('/group-chat/messages', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  if (identity.mustChangePassword) return c.json({ success: false, message: '请先修改初始密码' }, 403)

  const body = await c.req.json().catch(() => null) as any
  const content = typeof body?.content === 'string' ? body.content.trim() : ''
  const clientNonce = typeof body?.clientNonce === 'string' ? body.clientNonce.trim() : ''
  const replyToId = typeof body?.replyToId === 'string' ? body.replyToId : null
  if (!content || content.length > 500 || !clientNonce || clientNonce.length > 128) {
    return c.json({ success: false, message: '消息内容或请求标识无效' }, 400)
  }

  const duplicate = await c.env.DB.prepare('SELECT * FROM public_messages WHERE author_slug = ? AND client_nonce = ?').bind(identity.slug, clientNonce).first() as any
  if (duplicate) return c.json({ success: true, data: await formatGroupMessage(c.env.DB, duplicate, identity.slug) })

  if (replyToId) {
    const reply = await c.env.DB.prepare('SELECT id FROM public_messages WHERE id = ?').bind(replyToId).first()
    if (!reply) return c.json({ success: false, message: '引用消息不存在' }, 400)
  }

  const now = new Date().toISOString()
  const [recent, hourly] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM public_messages WHERE author_slug = ? AND datetime(created_at) >= datetime('now', '-30 seconds')").bind(identity.slug).first(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM public_messages WHERE author_slug = ? AND datetime(created_at) >= datetime('now', '-1 hour')").bind(identity.slug).first(),
  ])
  if (Number((recent as any)?.count || 0) >= 6 || Number((hourly as any)?.count || 0) >= 60) {
    return c.json({ success: false, message: '发送过于频繁' }, 429, { 'Retry-After': '30' })
  }

  const id = crypto.randomUUID()
  const insertion = await c.env.DB.prepare(
    `INSERT INTO public_messages (id, author_slug, author_name, content, status, reply_to_id, client_nonce, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(author_slug, client_nonce) WHERE client_nonce IS NOT NULL DO NOTHING`
  ).bind(id, identity.slug, identity.name, content, 'visible', replyToId, clientNonce, now, now).run()
  const row = await c.env.DB.prepare(
    'SELECT * FROM public_messages WHERE author_slug = ? AND client_nonce = ?'
  ).bind(identity.slug, clientNonce).first() as any
  if (!row) throw new Error('群聊消息创建后未找到记录')
  const status = insertion.meta.changes === 1 ? 201 : 200
  return c.json({ success: true, data: await formatGroupMessage(c.env.DB, row, identity.slug) }, status)
})
