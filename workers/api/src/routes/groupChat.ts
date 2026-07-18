import { Hono } from 'hono'
import { parseLimitedJson } from '../lib/jsonBodyLimit'
import { compareCursorValues, decodeCursor, decodeSyncCursor, encodeCursor, encodeSyncCursor, type CursorValue } from '../lib/cursor'
import { GROUP_REACTIONS, formatGroupMessage, getActiveMute, listGroupMessages } from '../lib/groupChat'
import { createGroupChatMessage } from '../lib/groupChatCreate'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'

type Bindings = { DB: D1Database; JWT_SECRET: string }
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
  const limit = parseLimit(c.req.query('limit'))
  const results = await listGroupMessages(c.env.DB, identity.slug, { before, limit: limit + 1, mine })
  const hasMore = results.length > limit
  const items = hasMore ? results.slice(1) : results
  const oldest = items[0]
  return c.json({ success: true, data: { items, nextCursor: hasMore && oldest ? encodeCursor({ timestamp: oldest.createdAt, id: oldest.id }) : null } })
}

groupChatRoutes.get('/group-chat/messages', (c) => list(c, false))
groupChatRoutes.get('/group-chat/mine', (c) => list(c, true))

groupChatRoutes.get('/group-chat/sync', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const rawCursor = c.req.query('cursor')
  const cursor = rawCursor ? await decodeSyncCursor(rawCursor, c.env.JWT_SECRET, identity.slug) : null
  if (rawCursor && !cursor) return c.json({ success: false, message: '游标无效' }, 400)
  const nowCursor = { timestamp: new Date().toISOString(), id: '\uffff' }
  if (cursor && (compareCursorValues(cursor.position, nowCursor) > 0 || (cursor.boundary && compareCursorValues(cursor.boundary, nowCursor) > 0))) {
    return c.json({ success: false, message: '游标无效' }, 400)
  }

  const boundary = cursor?.boundary || nowCursor
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
  const nextCursor = await encodeSyncCursor(
    hasMore && last ? { position: { timestamp: last.updatedAt, id: last.id }, boundary } : boundary,
    c.env.JWT_SECRET,
    identity.slug,
  )
  return c.json({ success: true, data: { cursor: nextCursor, items, mute } })
})

groupChatRoutes.post('/group-chat/messages', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const input = await parseLimitedJson<any>(c, { fallback: null }) as any
  const result = await createGroupChatMessage(c.env.DB, identity, input || {})
  if (!result.ok) {
    const headers = result.retryAfter ? { 'Retry-After': String(result.retryAfter) } : undefined
    return c.json({ success: false, message: result.message }, result.status, headers)
  }
  return c.json(
    { success: true, data: result.message },
    result.created ? 201 : 200,
  )
})

groupChatRoutes.put('/group-chat/messages/:id/reaction', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const body = await parseLimitedJson<any>(c, { fallback: null }) as any
  const reaction = body?.reaction
  if (!GROUP_REACTIONS.includes(reaction)) return c.json({ success: false, message: '回应无效' }, 400)

  const now = new Date().toISOString()
  const id = c.req.param('id')
  const sentinel = '__group_chat_toggle_delete__'
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO group_chat_reactions (message_id, reactor_slug, reaction, created_at)
       SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM public_messages WHERE id = ? AND status = 'visible')
       ON CONFLICT(message_id, reactor_slug) DO UPDATE SET
         reaction = CASE WHEN group_chat_reactions.reaction = excluded.reaction THEN ? ELSE excluded.reaction END,
         created_at = excluded.created_at
       WHERE EXISTS (SELECT 1 FROM public_messages WHERE id = ? AND status = 'visible')`
    ).bind(id, identity.slug, reaction, now, id, sentinel, id),
    c.env.DB.prepare('DELETE FROM group_chat_reactions WHERE message_id = ? AND reactor_slug = ? AND reaction = ?').bind(id, identity.slug, sentinel),
    c.env.DB.prepare("UPDATE public_messages SET updated_at = ? WHERE id = ? AND status = 'visible'").bind(now, id),
  ])
  if (results[0].meta.changes !== 1) return c.json({ success: false, message: '消息不存在' }, 404)
  const updated = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ?').bind(id).first() as any
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
  const [result] = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE public_messages SET status = 'recalled_by_author', recalled_by_type = 'student', recalled_at = ?, updated_at = ? WHERE id = ? AND author_slug = ? AND status = 'visible' AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 minutes')"
    ).bind(now, now, id, identity.slug),
    c.env.DB.prepare("DELETE FROM group_chat_reactions WHERE message_id = ? AND EXISTS (SELECT 1 FROM public_messages WHERE id = ? AND status = 'recalled_by_author')").bind(id, id),
  ])
  if (result.meta.changes !== 1) {
    if (message.status === 'visible' && Number(await c.env.DB.prepare("SELECT created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 minutes') AS expired FROM public_messages WHERE id = ?").bind(id).first<any>().then((row) => row?.expired || 0))) {
      return c.json({ success: false, message: '撤回时间已过' }, 403)
    }
    return c.json({ success: false, message: '消息不存在' }, 404)
  }
  const recalled = await c.env.DB.prepare('SELECT * FROM public_messages WHERE id = ?').bind(id).first() as any
  return c.json({ success: true, data: await formatGroupMessage(c.env.DB, recalled, identity.slug) })
})
