import { Hono } from 'hono'
import { decodeCursor, decodeSyncCursor, encodeCursor, encodeSyncCursor, type CursorValue } from '../lib/cursor'
import { GROUP_REACTIONS, formatGroupMessage, getActiveMute, listGroupMessages } from '../lib/groupChat'
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

function retryAfterSeconds(earliestJulianDay: unknown, windowSeconds: number) {
  const earliest = Number(earliestJulianDay)
  const now = Date.now() / 86_400_000 + 2_440_587.5
  return Math.max(1, Math.ceil(windowSeconds - (now - earliest) * 86_400))
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

groupChatRoutes.get('/group-chat/sync', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const rawCursor = c.req.query('cursor')
  const cursor = decodeSyncCursor(rawCursor)
  if (rawCursor && !cursor) return c.json({ success: false, message: '游标无效' }, 400)

  const boundary = cursor?.boundary || { timestamp: new Date().toISOString(), id: '\uffff' }
  const limit = parseLimit(c.req.query('limit'))
  const results = await listGroupMessages(c.env.DB, identity.slug, {
    updatedAfter: cursor?.position || { timestamp: '1970-01-01T00:00:00.000Z', id: '' },
    updatedBefore: boundary,
    includeStatusChanges: true,
    limit: limit + 1,
  })
  const hasMore = results.length > limit
  const items = results.slice(0, limit)
  const last = items.at(-1)
  const mute = await getActiveMute(c.env.DB, identity.slug)
  const nextCursor = hasMore && last
    ? encodeSyncCursor({ position: { timestamp: last.updatedAt, id: last.id }, boundary })
    : encodeCursor(boundary)
  return c.json({ success: true, data: { cursor: nextCursor, items, mute } })
})

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

  const mute = await getActiveMute(c.env.DB, identity.slug)
  if (mute) return c.json({ success: false, message: mute.reason }, 403)

  if (replyToId) {
    const reply = await c.env.DB.prepare('SELECT id FROM public_messages WHERE id = ?').bind(replyToId).first()
    if (!reply) return c.json({ success: false, message: '引用消息不存在' }, 400)
  }

  const now = new Date().toISOString()
  const [recent, hourly] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS count, MIN(julianday(created_at)) AS earliest FROM public_messages WHERE author_slug = ? AND status IN ('visible', 'recalled_by_author', 'recalled_by_admin') AND julianday(created_at) >= julianday('now', '-30 seconds')").bind(identity.slug).first(),
    c.env.DB.prepare("SELECT COUNT(*) AS count, MIN(julianday(created_at)) AS earliest FROM public_messages WHERE author_slug = ? AND status IN ('visible', 'recalled_by_author', 'recalled_by_admin') AND julianday(created_at) >= julianday('now', '-1 hour')").bind(identity.slug).first(),
  ])
  const recentCount = Number((recent as any)?.count || 0)
  const hourlyCount = Number((hourly as any)?.count || 0)
  if (recentCount >= 6 || hourlyCount >= 60) {
    const retryAfter = recentCount >= 6
      ? retryAfterSeconds((recent as any)?.earliest, 30)
      : retryAfterSeconds((hourly as any)?.earliest, 3600)
    return c.json({ success: false, message: '发送过于频繁' }, 429, { 'Retry-After': String(retryAfter) })
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

groupChatRoutes.put('/group-chat/messages/:id/reaction', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const body = await c.req.json().catch(() => null) as any
  const reaction = body?.reaction
  if (!GROUP_REACTIONS.includes(reaction)) return c.json({ success: false, message: '回应无效' }, 400)

  const message = await c.env.DB.prepare("SELECT * FROM public_messages WHERE id = ? AND status = 'visible'").bind(c.req.param('id')).first() as any
  if (!message) return c.json({ success: false, message: '消息不存在' }, 404)
  const existing = await c.env.DB.prepare('SELECT reaction FROM group_chat_reactions WHERE message_id = ? AND reactor_slug = ?').bind(message.id, identity.slug).first() as any
  const now = new Date().toISOString()
  const mutation = existing?.reaction === reaction
    ? c.env.DB.prepare('DELETE FROM group_chat_reactions WHERE message_id = ? AND reactor_slug = ?').bind(message.id, identity.slug)
    : c.env.DB.prepare(
      'INSERT INTO group_chat_reactions (message_id, reactor_slug, reaction, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(message_id, reactor_slug) DO UPDATE SET reaction = excluded.reaction, created_at = excluded.created_at'
    ).bind(message.id, identity.slug, reaction, now)
  await c.env.DB.batch([
    mutation,
    c.env.DB.prepare('UPDATE public_messages SET updated_at = ? WHERE id = ?').bind(now, message.id),
  ])
  const updated = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ?').bind(message.id).first() as any
  const formatted = await formatGroupMessage(c.env.DB, updated, identity.slug)
  return c.json({ success: true, data: { reactionCounts: formatted.reactionCounts, myReaction: formatted.myReaction } })
})

groupChatRoutes.delete('/group-chat/messages/:id', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const id = c.req.param('id')
  const message = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ? AND author_slug = ?').bind(id, identity.slug).first() as any
  if (!message) return c.json({ success: false, message: '消息不存在' }, 404)
  const now = new Date().toISOString()
  const result = await c.env.DB.prepare(
    "UPDATE public_messages SET status = 'recalled_by_author', recalled_by_type = 'student', recalled_at = ?, updated_at = ? WHERE id = ? AND author_slug = ? AND status = 'visible' AND julianday(created_at) >= julianday('now', '-2 minutes')"
  ).bind(now, now, id, identity.slug).run()
  if (result.meta.changes !== 1) {
    if (message.status === 'visible' && Number(await c.env.DB.prepare("SELECT julianday(created_at) < julianday('now', '-2 minutes') AS expired FROM public_messages WHERE id = ?").bind(id).first<any>().then((row) => row?.expired || 0))) {
      return c.json({ success: false, message: '撤回时间已过' }, 403)
    }
    return c.json({ success: false, message: '消息不存在' }, 404)
  }
  const recalled = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ?').bind(id).first() as any
  return c.json({ success: true, data: await formatGroupMessage(c.env.DB, recalled, identity.slug) })
})
