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
    'SELECT id, sender_slug, body, created_at FROM direct_messages WHERE conversation_id = ? ORDER BY julianday(created_at) DESC, id DESC LIMIT 1'
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

/**
 * Keep the conversation list bounded to three reads irrespective of the number
 * of conversations: rows, peers, then latest-message/unread aggregates.
 */
export async function listConversations(db: D1Database, viewerSlug: string) {
  const conversationRows = await db.prepare(
    'SELECT * FROM direct_conversations WHERE participant_a_slug = ? OR participant_b_slug = ? ORDER BY updated_at DESC'
  ).bind(viewerSlug, viewerSlug).all()
  const conversations = (conversationRows.results || []) as any[]
  if (conversations.length === 0) return []

  const peerSlugs = conversations.map((row) => (
    row.participant_a_slug === viewerSlug ? row.participant_b_slug : row.participant_a_slug
  ))
  const conversationIds = conversations.map((row) => row.id)
  const peerPlaceholders = peerSlugs.map(() => '?').join(', ')
  const conversationPlaceholders = conversationIds.map(() => '?').join(', ')

  const [peerResult, messageResult] = await Promise.all([
    db.prepare(`SELECT name, slug, avatar_url FROM students WHERE slug IN (${peerPlaceholders})`)
      .bind(...peerSlugs).all(),
    db.prepare(
      `WITH ranked_messages AS (
         SELECT id, conversation_id, sender_slug, body, created_at,
           ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at DESC, id DESC) AS row_number
         FROM direct_messages WHERE conversation_id IN (${conversationPlaceholders})
       ), unread_counts AS (
         SELECT conversation_id, COUNT(*) AS unread_count
         FROM direct_messages
         WHERE conversation_id IN (${conversationPlaceholders}) AND recipient_slug = ? AND read_at IS NULL
         GROUP BY conversation_id
       )
       SELECT ranked_messages.id, ranked_messages.conversation_id, ranked_messages.sender_slug,
         ranked_messages.body, ranked_messages.created_at, COALESCE(unread_counts.unread_count, 0) AS unread_count
       FROM ranked_messages
       LEFT JOIN unread_counts ON unread_counts.conversation_id = ranked_messages.conversation_id
       WHERE ranked_messages.row_number = 1`
    ).bind(...conversationIds, ...conversationIds, viewerSlug).all(),
  ])

  const peers = new Map((peerResult.results || []).map((row: any) => [row.slug, row]))
  const latestMessages = new Map((messageResult.results || []).map((row: any) => [row.conversation_id, row]))
  return conversations.map((row) => {
    const peerSlug = row.participant_a_slug === viewerSlug ? row.participant_b_slug : row.participant_a_slug
    const peer = peers.get(peerSlug) as any
    const lastMessage = latestMessages.get(row.id) as any
    return {
      id: row.id,
      peer: {
        name: peer ? peer.name : '未知同学',
        slug: peerSlug,
        avatarUrl: peer ? peer.avatar_url : null,
      },
      lastMessage: lastMessage ? {
        id: lastMessage.id,
        senderSlug: lastMessage.sender_slug,
        body: lastMessage.body,
        createdAt: lastMessage.created_at,
      } : null,
      unreadCount: Number(lastMessage?.unread_count || 0),
      updatedAt: row.updated_at,
    }
  })
}

function handleIdempotentResponse(c: any, existingMessage: any, viewerSlug: string, conversation: any) {
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

// 1. 获取会话列表
directConversationsRoutes.get('/direct-conversations', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  const viewerSlug = identity.slug

  const items = await listConversations(c.env.DB, viewerSlug)

  return c.json({ success: true, data: { items } })
})

// 2. 创建或首发消息
directConversationsRoutes.post('/direct-conversations', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  if (identity.mustChangePassword) {
    return c.json({ success: false, message: '首次登录请先修改密码后再发私信' }, 403)
  }
  const viewerSlug = identity.slug

  let bodyObj: any
  try {
    bodyObj = await c.req.json()
  } catch {
    return c.json({ success: false, message: '无效的 JSON 请求体' }, 400)
  }

  if (!bodyObj || typeof bodyObj !== 'object') {
    return c.json({ success: false, message: '请求体 must be object' }, 400)
  }

  if (typeof bodyObj.recipientSlug !== 'string') {
    return c.json({ success: false, message: 'recipientSlug must be string' }, 400)
  }
  const recipientSlug = bodyObj.recipientSlug.trim()
  if (!recipientSlug) {
    return c.json({ success: false, message: 'recipientSlug cannot be empty' }, 400)
  }

  if (recipientSlug === viewerSlug) {
    return c.json({ success: false, message: '无效的收件人' }, 400)
  }

  if (typeof bodyObj.body !== 'string') {
    return c.json({ success: false, message: 'body must be string' }, 400)
  }
  const cleanBody = bodyObj.body
  if (cleanBody.length < 1 || cleanBody.length > 2000) {
    return c.json({ success: false, message: '消息内容长度限制在 1-2000 字之间' }, 400)
  }

  if (typeof bodyObj.clientNonce !== 'string') {
    return c.json({ success: false, message: 'clientNonce must be string' }, 400)
  }
  const clientNonce = bodyObj.clientNonce.trim()
  if (!clientNonce) {
    return c.json({ success: false, message: 'clientNonce cannot be empty' }, 400)
  }
  if (clientNonce.length > 128) {
    return c.json({ success: false, message: 'clientNonce 长度不能超过 128 字符' }, 400)
  }

  const recipient = await c.env.DB.prepare(
    "SELECT name, slug, account_status FROM students WHERE slug = ? AND COALESCE(account_status, 'active') != 'locked'"
  ).bind(recipientSlug).first()
  if (!recipient) {
    return c.json({ success: false, message: '收件人已被锁定或不存在' }, 400)
  }

  // 幂等处理：如果已有消息存在
  const existingMessage = await c.env.DB.prepare(
    'SELECT * FROM direct_messages WHERE sender_slug = ? AND client_nonce = ?'
  ).bind(viewerSlug, clientNonce).first() as any

  const [partA, partB] = orderedPair(viewerSlug, recipientSlug)
  const convId = `conv_${partA}_${partB}`

  if (existingMessage) {
    const convRow = await c.env.DB.prepare(
      'SELECT * FROM direct_conversations WHERE id = ?'
    ).bind(existingMessage.conversation_id).first()
    const conversation = await formatConversation(c.env.DB, convRow, viewerSlug)
    return handleIdempotentResponse(c, existingMessage, viewerSlug, conversation)
  }

  // 确定性会话 ID
  let convRow = await c.env.DB.prepare(
    'SELECT * FROM direct_conversations WHERE id = ?'
  ).bind(convId).first() as any

  const msgId = crypto.randomUUID()
  const now = new Date().toISOString()

  if (!convRow) {
    const stmt1 = c.env.DB.prepare(
      'INSERT OR IGNORE INTO direct_conversations (id, participant_a_slug, participant_b_slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(convId, partA, partB, now, now)
    const stmt2 = c.env.DB.prepare(
      'INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)'
    ).bind(msgId, convId, viewerSlug, recipientSlug, cleanBody, clientNonce, now)
    try {
      await c.env.DB.batch([stmt1, stmt2])
    } catch (err: any) {
      // 极端并发事务重试机制：重新查询会话是否已生成
      const convExists = await c.env.DB.prepare(
        'SELECT * FROM direct_conversations WHERE id = ?'
      ).bind(convId).first() as any

      if (convExists) {
        // 发现会话已经被另一个并发请求抢先成功创建，在此平滑降级为只重试消息写入即可，保证零崩溃
        const checkMsg = await c.env.DB.prepare(
          'SELECT * FROM direct_messages WHERE sender_slug = ? AND client_nonce = ?'
        ).bind(viewerSlug, clientNonce).first() as any
        if (checkMsg) {
          const conversation = await formatConversation(c.env.DB, convExists, viewerSlug)
          return handleIdempotentResponse(c, checkMsg, viewerSlug, conversation)
        }

        try {
          await c.env.DB.prepare(
            'INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)'
          ).bind(msgId, convId, viewerSlug, recipientSlug, cleanBody, clientNonce, now).run()
        } catch (insertErr: any) {
          const checkMsgDouble = await c.env.DB.prepare(
            'SELECT * FROM direct_messages WHERE sender_slug = ? AND client_nonce = ?'
          ).bind(viewerSlug, clientNonce).first() as any
          if (checkMsgDouble) {
            const conversation = await formatConversation(c.env.DB, convExists, viewerSlug)
            return handleIdempotentResponse(c, checkMsgDouble, viewerSlug, conversation)
          }
          throw insertErr
        }

        await c.env.DB.prepare(
          'UPDATE direct_conversations SET updated_at = ? WHERE id = ?'
        ).bind(now, convId).run()

        const conversation = await formatConversation(c.env.DB, convExists, viewerSlug)
        return c.json({
          success: true,
          data: {
            conversation,
            message: {
              id: msgId,
              conversationId: convId,
              senderSlug: viewerSlug,
              recipientSlug,
              body: cleanBody,
              createdAt: now
            }
          }
        }, 201)
      }
      throw err
    }
    convRow = { id: convId, participant_a_slug: partA, participant_b_slug: partB, created_at: now, updated_at: now }
  } else {
    const stmt1 = c.env.DB.prepare(
      'INSERT INTO direct_messages (id, conversation_id, sender_slug, recipient_slug, body, client_nonce, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)'
    ).bind(msgId, convId, viewerSlug, recipientSlug, cleanBody, clientNonce, now)
    const stmt2 = c.env.DB.prepare(
      'UPDATE direct_conversations SET updated_at = ? WHERE id = ?'
    ).bind(now, convId)
    try {
      await c.env.DB.batch([stmt1, stmt2])
    } catch (err: any) {
      const checkMsg = await c.env.DB.prepare(
        'SELECT * FROM direct_messages WHERE sender_slug = ? AND client_nonce = ?'
      ).bind(viewerSlug, clientNonce).first() as any
      if (checkMsg) {
        const conversation = await formatConversation(c.env.DB, convRow, viewerSlug)
        return handleIdempotentResponse(c, checkMsg, viewerSlug, conversation)
      }
      throw err
    }
  }

  const conversation = await formatConversation(c.env.DB, convRow, viewerSlug)
  return c.json({
    success: true,
    data: {
      conversation,
      message: {
        id: msgId,
        conversationId: convId,
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

  const limitRaw = c.req.query('limit')
  let limitVal = 30
  if (limitRaw !== undefined) {
    if (!/^[1-9]\d*$/.test(limitRaw)) {
      return c.json({ success: false, message: '无效的 limit 参数' }, 400)
    }
    const parsed = Number(limitRaw)
    if (parsed > 30) {
      return c.json({ success: false, message: '无效的 limit 参数' }, 400)
    }
    limitVal = parsed
  }

  const beforeRaw = c.req.query('before')
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
    queryStr += ' AND (julianday(created_at) < julianday(?) OR (julianday(created_at) = julianday(?) AND id < ?))'
    params.push(beforeCursor.timestamp, beforeCursor.timestamp, beforeCursor.id)
  }

  queryStr += ' ORDER BY julianday(created_at) DESC, id DESC LIMIT ?'
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
  if (identity.mustChangePassword) {
    return c.json({ success: false, message: '首次登录请先修改密码后再发私信' }, 403)
  }
  const viewerSlug = identity.slug

  const { id } = c.req.param()
  const conv = await requireParticipant(c.env.DB, id, viewerSlug)
  if (!conv) {
    return c.json({ success: false, message: '会话不存在或无权访问' }, 404)
  }

  let bodyObj: any
  try {
    bodyObj = await c.req.json()
  } catch {
    return c.json({ success: false, message: '无效的 JSON 请求体' }, 400)
  }

  if (!bodyObj || typeof bodyObj !== 'object') {
    return c.json({ success: false, message: '请求体 must be object' }, 400)
  }

  if (typeof bodyObj.body !== 'string') {
    return c.json({ success: false, message: 'body must be string' }, 400)
  }
  const cleanBody = bodyObj.body
  if (cleanBody.length < 1 || cleanBody.length > 2000) {
    return c.json({ success: false, message: '消息内容长度限制在 1-2000 字之间' }, 400)
  }

  if (typeof bodyObj.clientNonce !== 'string') {
    return c.json({ success: false, message: 'clientNonce must be string' }, 400)
  }
  const clientNonce = bodyObj.clientNonce.trim()
  if (!clientNonce) {
    return c.json({ success: false, message: 'clientNonce cannot be empty' }, 400)
  }
  if (clientNonce.length > 128) {
    return c.json({ success: false, message: 'clientNonce 长度不能超过 128 字符' }, 400)
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

  let bodyObj: any
  try {
    bodyObj = await c.req.json()
  } catch {
    return c.json({ success: false, message: '请求体格式错误' }, 400)
  }

  if (!bodyObj || typeof bodyObj !== 'object' || Array.isArray(bodyObj)) {
    return c.json({ success: false, message: '请求体格式错误' }, 400)
  }

  const keys = Object.keys(bodyObj)
  if (keys.length !== 1 || keys[0] !== 'throughMessageId' || typeof bodyObj.throughMessageId !== 'string' || !bodyObj.throughMessageId.trim()) {
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
  await c.env.DB.prepare(`
    UPDATE direct_messages
    SET read_at = ?
    WHERE conversation_id = ?
      AND recipient_slug = ?
      AND read_at IS NULL
      AND (
        julianday(created_at) < julianday(?)
        OR (julianday(created_at) = julianday(?) AND id <= ?)
      )
  `).bind(now, id, viewerSlug, targetMsg.created_at, targetMsg.created_at, throughMessageId).run()

  return c.json({ success: true })
})
