import { Hono } from 'hono'
import { compareCursorValues, parseCursorTimestamp, type CursorValue } from '../lib/cursor'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

type InboxStream = 'conversations' | 'messages' | 'notifications'
type InboxCursorSet = Record<InboxStream, CursorValue>

interface InboxSyncCursor {
  position: InboxCursorSet
  boundary: InboxCursorSet
}

const DIRECT_SYNC_LIMIT = 100
const NOTIFICATION_SYNC_LIMIT = 50
const STREAMS: InboxStream[] = ['conversations', 'messages', 'notifications']
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const inboxRoutes = new Hono<{ Bindings: Bindings }>()

function isCursorValue(value: unknown): value is CursorValue {
  const cursor = value as CursorValue | undefined
  return typeof cursor?.timestamp === 'string'
    && Number.isFinite(parseCursorTimestamp(cursor.timestamp))
    && typeof cursor.id === 'string'
    && Boolean(cursor.id)
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64UrlToBytes(raw: string) {
  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

async function inboxCursorKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

async function encodeInboxCursor(value: InboxSyncCursor, secret: string, slug: string) {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(value)))
  const signature = await crypto.subtle.sign('HMAC', await inboxCursorKey(secret), encoder.encode(`inbox-sync:${slug}:${payload}`))
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`
}

async function decodeInboxCursor(raw: string | undefined, secret: string, slug: string): Promise<InboxSyncCursor | null> {
  if (!raw || raw.length > 2048) return null
  try {
    const parts = raw.split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null
    const payloadBytes = base64UrlToBytes(parts[0])
    const signatureBytes = base64UrlToBytes(parts[1])
    if (!payloadBytes || !signatureBytes) return null
    const verified = await crypto.subtle.verify(
      'HMAC',
      await inboxCursorKey(secret),
      signatureBytes,
      encoder.encode(`inbox-sync:${slug}:${parts[0]}`),
    )
    if (!verified) return null
    const value = JSON.parse(decoder.decode(payloadBytes)) as InboxSyncCursor
    if (!value || typeof value !== 'object' || !value.position || !value.boundary) return null
    for (const stream of STREAMS) {
      if (!isCursorValue(value.position[stream]) || !isCursorValue(value.boundary[stream])) return null
      if (compareCursorValues(value.position[stream], value.boundary[stream]) > 0) return null
    }
    return value
  } catch {
    return null
  }
}

function initialCursor(): InboxSyncCursor {
  const position = { timestamp: '1970-01-01T00:00:00.000Z', id: '\u0000' }
  return {
    position: { conversations: position, messages: position, notifications: position },
    boundary: { conversations: position, messages: position, notifications: position },
  }
}

function openSyncWindow(cursor: InboxSyncCursor): InboxSyncCursor {
  const boundary = { timestamp: new Date().toISOString(), id: '\uffff' }
  return {
    position: cursor.position,
    boundary: {
      conversations: compareCursorValues(cursor.position.conversations, cursor.boundary.conversations) === 0
        ? boundary
        : cursor.boundary.conversations,
      messages: compareCursorValues(cursor.position.messages, cursor.boundary.messages) === 0
        ? boundary
        : cursor.boundary.messages,
      notifications: compareCursorValues(cursor.position.notifications, cursor.boundary.notifications) === 0
        ? boundary
        : cursor.boundary.notifications,
    },
  }
}

function rangeSql(timestampColumn: string, idColumn: string) {
  return `(
    julianday(${timestampColumn}) > julianday(?)
    OR (julianday(${timestampColumn}) = julianday(?) AND ${idColumn} > ?)
  ) AND (
    julianday(${timestampColumn}) < julianday(?)
    OR (julianday(${timestampColumn}) = julianday(?) AND ${idColumn} <= ?)
  )`
}

function rangeBinds(position: CursorValue, boundary: CursorValue) {
  return [position.timestamp, position.timestamp, position.id, boundary.timestamp, boundary.timestamp, boundary.id]
}

function formatDirectMessage(row: any) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderSlug: row.sender_slug,
    recipientSlug: row.recipient_slug,
    body: row.body,
    createdAt: row.created_at,
  }
}

function formatNotification(row: any) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    relatedType: row.related_type || null,
    relatedId: row.related_id || null,
    readAt: row.read_at || null,
    createdAt: row.created_at,
  }
}

function formatConversation(row: any) {
  return {
    id: row.id,
    peer: {
      name: row.peer_name || '未知同学',
      slug: row.peer_slug,
      avatarUrl: row.peer_avatar_url || null,
    },
    lastMessage: row.last_message_id
      ? {
          id: row.last_message_id,
          senderSlug: row.last_sender_slug,
          body: row.last_body,
          createdAt: row.last_created_at,
        }
      : null,
    unreadCount: Number(row.unread_count || 0),
    updatedAt: row.updated_at,
  }
}

async function getUnread(db: D1Database, slug: string) {
  const [direct, notifications] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS count FROM direct_messages WHERE recipient_slug = ? AND read_at IS NULL').bind(slug).first<any>(),
    db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE recipient_slug = ? AND read_at IS NULL').bind(slug).first<any>(),
  ])
  const directUnread = Number(direct?.count || 0)
  const notificationUnread = Number(notifications?.count || 0)
  return { directUnread, notificationUnread, totalUnread: directUnread + notificationUnread }
}

function nextCursorValue(rows: any[], timestampKey: string, boundary: CursorValue, limit: number): CursorValue {
  if (rows.length < limit) return boundary
  const last = rows[rows.length - 1]
  return { timestamp: last[timestampKey], id: last.id }
}

function nextCursor(current: InboxSyncCursor, conversations: any[], messages: any[], notifications: any[]): InboxSyncCursor {
  const specs: Array<[InboxStream, any[], string, number]> = [
    ['conversations', conversations, 'updated_at', DIRECT_SYNC_LIMIT],
    ['messages', messages, 'created_at', DIRECT_SYNC_LIMIT],
    ['notifications', notifications, 'sync_cursor_timestamp', NOTIFICATION_SYNC_LIMIT],
  ]
  const position = {} as InboxCursorSet
  const boundary = {} as InboxCursorSet

  for (const [stream, rows, timestampKey, limit] of specs) {
    position[stream] = nextCursorValue(rows, timestampKey, current.boundary[stream], limit)
    boundary[stream] = current.boundary[stream]
  }

  return { position, boundary }
}

inboxRoutes.get('/inbox/summary', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity
  return c.json({ success: true, data: await getUnread(c.env.DB, identity.slug) })
})

inboxRoutes.get('/inbox/sync', async (c) => {
  const identity = await requireClassmate(c)
  if (isClassmateResponse(identity)) return identity

  const rawCursor = c.req.query('cursor')
  const decodedCursor = rawCursor
    ? await decodeInboxCursor(rawCursor, c.env.JWT_SECRET, identity.slug)
    : initialCursor()
  if (!decodedCursor) return c.json({ success: false, message: '同步游标无效' }, 400)
  const cursor = openSyncWindow(decodedCursor)

  const viewerSlug = identity.slug
  const conversationRange = rangeSql('c.updated_at', 'c.id')
  const messageRange = rangeSql('m.created_at', 'm.id')
  const notificationTimestamp = "CASE WHEN n.read_at IS NOT NULL AND julianday(n.read_at) > julianday(n.created_at) THEN n.read_at ELSE n.created_at END"
  const notificationRange = rangeSql(notificationTimestamp, 'n.id')

  const [conversationRows, messageRows, notificationRows] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        c.id,
        c.updated_at,
        CASE WHEN c.participant_a_slug = ? THEN c.participant_b_slug ELSE c.participant_a_slug END AS peer_slug,
        peer.name AS peer_name,
        peer.avatar_url AS peer_avatar_url,
        (
          SELECT id FROM direct_messages last_message
          WHERE last_message.conversation_id = c.id
          ORDER BY julianday(last_message.created_at) DESC, last_message.id DESC
          LIMIT 1
        ) AS last_message_id,
        (
          SELECT sender_slug FROM direct_messages last_message
          WHERE last_message.conversation_id = c.id
          ORDER BY julianday(last_message.created_at) DESC, last_message.id DESC
          LIMIT 1
        ) AS last_sender_slug,
        (
          SELECT body FROM direct_messages last_message
          WHERE last_message.conversation_id = c.id
          ORDER BY julianday(last_message.created_at) DESC, last_message.id DESC
          LIMIT 1
        ) AS last_body,
        (
          SELECT created_at FROM direct_messages last_message
          WHERE last_message.conversation_id = c.id
          ORDER BY julianday(last_message.created_at) DESC, last_message.id DESC
          LIMIT 1
        ) AS last_created_at,
        (
          SELECT COUNT(*) FROM direct_messages unread_message
          WHERE unread_message.conversation_id = c.id
            AND unread_message.recipient_slug = ?
            AND unread_message.read_at IS NULL
        ) AS unread_count
      FROM direct_conversations c
      LEFT JOIN students peer ON peer.slug = CASE WHEN c.participant_a_slug = ? THEN c.participant_b_slug ELSE c.participant_a_slug END
      WHERE (c.participant_a_slug = ? OR c.participant_b_slug = ?)
        AND ${conversationRange}
      ORDER BY julianday(c.updated_at) ASC, c.id ASC
      LIMIT ?
    `).bind(
      viewerSlug,
      viewerSlug,
      viewerSlug,
      viewerSlug,
      viewerSlug,
      ...rangeBinds(cursor.position.conversations, cursor.boundary.conversations),
      DIRECT_SYNC_LIMIT,
    ).all(),
    c.env.DB.prepare(`
      SELECT m.*
      FROM direct_messages m
      WHERE (m.sender_slug = ? OR m.recipient_slug = ?)
        AND ${messageRange}
      ORDER BY julianday(m.created_at) ASC, m.id ASC
      LIMIT ?
    `).bind(
      viewerSlug,
      viewerSlug,
      ...rangeBinds(cursor.position.messages, cursor.boundary.messages),
      DIRECT_SYNC_LIMIT,
    ).all(),
    c.env.DB.prepare(`
      SELECT n.*, ${notificationTimestamp} AS sync_cursor_timestamp
      FROM notifications n
      WHERE n.recipient_slug = ?
        AND ${notificationRange}
      ORDER BY julianday(${notificationTimestamp}) ASC, n.id ASC
      LIMIT ?
    `).bind(
      viewerSlug,
      ...rangeBinds(cursor.position.notifications, cursor.boundary.notifications),
      NOTIFICATION_SYNC_LIMIT,
    ).all(),
  ])

  const conversations = conversationRows.results || []
  const messages = messageRows.results || []
  const notifications = notificationRows.results || []
  const next = nextCursor(cursor, conversations, messages, notifications)

  return c.json({
    success: true,
    data: {
      cursor: await encodeInboxCursor(next, c.env.JWT_SECRET, viewerSlug),
      conversations: conversations.map(formatConversation),
      messages: messages.map(formatDirectMessage),
      notifications: notifications.map(formatNotification),
      unread: await getUnread(c.env.DB, viewerSlug),
    },
  })
})
