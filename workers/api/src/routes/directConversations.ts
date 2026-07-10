import { Hono } from 'hono'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'
import { decodeCursor, encodeCursor } from '../lib/cursor'

type Bindings = {
  DB: D1Database
}

export const directConversationsRoutes = new Hono<{ Bindings: Bindings }>()

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

async function requireParticipant(db: D1Database, conversationId: string, slug: string) {
  const row = await db.prepare(
    'SELECT * FROM direct_conversations WHERE id = ? AND (participant_a_slug = ? OR participant_b_slug = ?)'
  ).bind(conversationId, slug, slug).first()
  return row || null
}

async function formatConversation(db: D1Database, row: any, viewerSlug: string) {
  const peerSlug = row.participant_a_slug === viewerSlug ? row.participant_b_slug : row.participant_a_slug
  const peerRow = await db.prepare(
    'SELECT name, slug, avatar_url FROM students WHERE slug = ?'
  ).bind(peerSlug).first() as any

  const lastMsgRow = await db.prepare(
    'SELECT id, sender_slug, body, created_at FROM direct_messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1'
  ).bind(row.id).first() as any

  const unreadRow = await db.prepare(
    'SELECT COUNT(*) as count FROM direct_messages WHERE conversation_id = ? AND recipient_slug = ? AND read_at IS NULL'
  ).bind(row.id, viewerSlug).first() as any

  return {
    id: row.id,
    peer: {
      name: peerRow ? peerRow.name : '未知同学',
      slug: peerSlug,
      avatarUrl: peerRow ? peerRow.avatar_url : null
    },
    lastMessage: lastMsgRow ? {
      id: lastMsgRow.id,
      senderSlug: lastMsgRow.sender_slug,
      body: lastMsgRow.body,
      createdAt: lastMsgRow.created_at
    } : null,
    unreadCount: unreadRow ? unreadRow.count : 0,
    updatedAt: row.updated_at
  }
}

// 1. 获取会话列表
directConversationsRoutes.get('/direct-conversations', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const viewerSlug = identity.slug

  const rows = await c.env.DB.prepare(
    'SELECT * FROM direct_conversations WHERE participant_a_slug = ? OR participant_b_slug = ? ORDER BY updated_at DESC'
  ).bind(viewerSlug, viewerSlug).all()

  const items = []
  for (const row of rows.results || []) {
    items.push(await formatConversation(c.env.DB, row, viewerSlug))
  }

  return c.json({ success: true, data: { items } })
})

// 2. 创建或首发消息
directConversationsRoutes.post('/direct-conversations', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const viewerSlug = identity.slug

  const { recipientSlug, body, clientNonce } = await c.req.json()

  if (!recipientSlug || recipientSlug === viewerSlug) {
    return c.json({ success: false, message: '无效的收件人' }, 400)
  }

  const recipient = await c.env.DB.prepare(
    "SELECT name, slug, account_status FROM students WHERE slug = ? AND COALESCE(account_status, 'active') != 'locked'"
  ).bind(recipientSlug).first()
  if (!recipient) {
    return c.json({ success: false, message: '收件人已被锁定或不存在' }, 400)
  }

  const cleanBody = (body || '').trim()
  if (cleanBody.length < 1 || cleanBody.length > 2000) {
    return c.json({ success: false, message: '消息内容长度限制在 1-2000 字之间' }, 400)
  }

  if (!clientNonce) {
    return c.json({ success: false, message: '缺失 clientNonce' }, 400)
  }

  // 幂等处理：如果已有消息存在
  const existingMessage = await c.env.DB.prepare(
    'SELECT * FROM direct_messages WHERE sender_slug = ? AND client_nonce = ?'
  ).bind(viewerSlug, clientNonce).first() as any

  if (existingMessage) {
    const convRow = await c.env.DB.prepare(
      'SELECT * FROM direct_conversations WHERE id = ?'
    ).bind(existingMessage.conversation_id).first()
    const conversation = await formatConversation(c.env.DB, convRow, viewerSlug)
    return c.json({
      success: true,
      data: {
        conversation,
        message: {
          id: existingMessage.id,
          conversationId: existingMessage.conversation_id,
          senderSlug: existingMessage.sender_slug,
          recipientSlug: existingMessage.recipient_slug,
          body: existingMessage.body,
          createdAt: existingMessage.created_at
        }
      }
    }, 200)
  }

  // 开始插入会话与首条消息
  const [partA, partB] = orderedPair(viewerSlug, recipientSlug)
  let convRow = await c.env.DB.prepare(
    'SELECT * FROM direct_conversations WHERE participant_a_slug = ? AND participant_b_slug = ?'
  ).bind(partA, partB).first() as any

  const msgId = crypto.randomUUID()
  const now = new Date().toISOString()

  if (!convRow) {
    const convId = crypto.randomUUID()
    const stmt1 = c.env.DB.prepare(
      'INSERT INTO direct_conversations (id, participant_a_slug, participant_b_slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(convId, partA, partB, now, now)
    const stmt2 = c.env.DB.prepare(
      'INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)'
    ).bind(msgId, convId, viewerSlug, recipientSlug, cleanBody, clientNonce, now)
    await c.env.DB.batch([stmt1, stmt2])

    convRow = { id: convId, participant_a_slug: partA, participant_b_slug: partB, created_at: now, updated_at: now }
  } else {
    const stmt1 = c.env.DB.prepare(
      'INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)'
    ).bind(msgId, convRow.id, viewerSlug, recipientSlug, cleanBody, clientNonce, now)
    const stmt2 = c.env.DB.prepare(
      'UPDATE direct_conversations SET updated_at = ? WHERE id = ?'
    ).bind(now, convRow.id)
    await c.env.DB.batch([stmt1, stmt2])
  }

  const conversation = await formatConversation(c.env.DB, convRow, viewerSlug)
  return c.json({
    success: true,
    data: {
      conversation,
      message: {
        id: msgId,
        conversationId: convRow.id,
        senderSlug: viewerSlug,
        recipientSlug,
        body: cleanBody,
        createdAt: now
      }
    }
  }, 201)
})

// 3. 获取消息历史
directConversationsRoutes.get('/direct-conversations/:id/messages', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const viewerSlug = identity.slug

  const { id } = c.req.param()
  const conv = await requireParticipant(c.env.DB, id, viewerSlug)
  if (!conv) {
    return c.json({ success: false, message: '会话不存在或无权访问' }, 404)
  }

  const beforeRaw = c.req.query('before')
  const limitVal = Math.min(parseInt(c.req.query('limit') || '30', 10), 30)

  let beforeCursor = null
  if (beforeRaw) {
    beforeCursor = decodeCursor(beforeRaw)
    if (!beforeCursor) {
      return c.json({ success: false, message: '无效的 before 游标' }, 400)
    }
  }

  let queryStr = 'SELECT * FROM direct_messages WHERE conversation_id = ?'
  const params: any[] = [id]

  if (beforeCursor) {
    queryStr += ' AND (created_at < ? OR (created_at = ? AND id < ?))'
    params.push(beforeCursor.timestamp, beforeCursor.timestamp, beforeCursor.id)
  }

  queryStr += ' ORDER BY created_at DESC, id DESC LIMIT ?'
  params.push(limitVal)

  const msgRows = await c.env.DB.prepare(queryStr).bind(...params).all()

  const items = (msgRows.results || []).map((msg: any) => ({
    id: msg.id,
    conversationId: msg.conversation_id,
    senderSlug: msg.sender_slug,
    recipientSlug: msg.recipient_slug,
    body: msg.body,
    createdAt: msg.created_at
  })).reverse()

  let nextCursor = null
  if (msgRows.results && msgRows.results.length > 0) {
    const oldestMsg = msgRows.results[msgRows.results.length - 1] as any
    nextCursor = encodeCursor({ timestamp: oldestMsg.created_at, id: oldestMsg.id })
  }

  return c.json({
    success: true,
    data: {
      items,
      nextCursor
    }
  })
})

// 4. 发送消息
directConversationsRoutes.post('/direct-conversations/:id/messages', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const viewerSlug = identity.slug

  const { id } = c.req.param()
  const conv = await requireParticipant(c.env.DB, id, viewerSlug)
  if (!conv) {
    return c.json({ success: false, message: '会话不存在或无权访问' }, 404)
  }

  const { body, clientNonce } = await c.req.json()

  const cleanBody = (body || '').trim()
  if (cleanBody.length < 1 || cleanBody.length > 2000) {
    return c.json({ success: false, message: '消息内容长度限制在 1-2000 字之间' }, 400)
  }

  if (!clientNonce) {
    return c.json({ success: false, message: '缺失 clientNonce' }, 400)
  }

  // 幂等处理
  const existingMessage = await c.env.DB.prepare(
    'SELECT * FROM direct_messages WHERE sender_slug = ? AND client_nonce = ?'
  ).bind(viewerSlug, clientNonce).first() as any

  if (existingMessage) {
    return c.json({
      success: true,
      data: {
        id: existingMessage.id,
        conversationId: existingMessage.conversation_id,
        senderSlug: existingMessage.sender_slug,
        recipientSlug: existingMessage.recipient_slug,
        body: existingMessage.body,
        createdAt: existingMessage.created_at
      }
    }, 200)
  }

  const recipientSlug = conv.participant_a_slug === viewerSlug ? conv.participant_b_slug : conv.participant_a_slug
  const msgId = crypto.randomUUID()
  const now = new Date().toISOString()

  const stmt1 = c.env.DB.prepare(
    'INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)'
  ).bind(msgId, id, viewerSlug, recipientSlug, cleanBody, clientNonce, now)
  const stmt2 = c.env.DB.prepare(
    'UPDATE direct_conversations SET updated_at = ? WHERE id = ?'
  ).bind(now, id)

  await c.env.DB.batch([stmt1, stmt2])

  return c.json({
    success: true,
    data: {
      id: msgId,
      conversationId: id,
      senderSlug: viewerSlug,
      recipientSlug,
      body: cleanBody,
      createdAt: now
    }
  }, 201)
})

// 5. 标记已读
directConversationsRoutes.put('/direct-conversations/:id/read', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const viewerSlug = identity.slug

  const { id } = c.req.param()
  const conv = await requireParticipant(c.env.DB, id, viewerSlug)
  if (!conv) {
    return c.json({ success: false, message: '会话不存在或无权访问' }, 404)
  }

  const bodyObj = await c.req.json()
  const keys = Object.keys(bodyObj)
  if (keys.length !== 1 || keys[0] !== 'throughMessageId' || typeof bodyObj.throughMessageId !== 'string') {
    return c.json({ success: false, message: '请求体格式错误' }, 400)
  }

  const { throughMessageId } = bodyObj

  const targetMsg = await c.env.DB.prepare(
    'SELECT * FROM direct_messages WHERE id = ? AND conversation_id = ?'
  ).bind(throughMessageId, id).first() as any

  if (!targetMsg) {
    return c.json({ success: false, message: '目标消息不存在' }, 404)
  }

  const now = new Date().toISOString()
  await c.env.DB.prepare(
    'UPDATE direct_messages SET read_at = ? WHERE conversation_id = ? AND recipient_slug = ? AND read_at IS NULL AND (created_at < ? OR (created_at = ? AND id <= ?))'
  ).bind(now, id, viewerSlug, targetMsg.created_at, targetMsg.created_at, throughMessageId).run()

  return c.json({ success: true })
})
