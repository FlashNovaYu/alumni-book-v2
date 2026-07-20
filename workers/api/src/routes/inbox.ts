import { Hono } from 'hono'
import { isClassmateResponse, requireClassmate } from '../lib/classmateGuard'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

type InboxStream = 'conversations' | 'messages' | 'notifications'
type InboxCursorSet = Record<InboxStream, number>

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

function isCursorPosition(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
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
      if (!isCursorPosition(value.position[stream]) || !isCursorPosition(value.boundary[stream])) return null
      if (value.position[stream] > value.boundary[stream]) return null
    }
    return value
  } catch {
    return null
  }
}

function initialCursor(): InboxSyncCursor {
  return {
    position: { conversations: 0, messages: 0, notifications: 0 },
    boundary: { conversations: 0, messages: 0, notifications: 0 },
  }
}

async function openSyncWindow(db: D1Database, cursor: InboxSyncCursor, slug: string): Promise<InboxSyncCursor> {
  const [conversationMax, messageMax, notificationMax] = await Promise.all([
    db.prepare(
      'SELECT COALESCE(MAX(rowid), 0) AS value FROM direct_conversations WHERE participant_a_slug = ? OR participant_b_slug = ?'
    ).bind(slug, slug).first<any>(),
    db.prepare(
      'SELECT COALESCE(MAX(rowid), 0) AS value FROM direct_messages WHERE sender_slug = ? OR recipient_slug = ?'
    ).bind(slug, slug).first<any>(),
    db.prepare(
      'SELECT COALESCE(MAX(sequence), 0) AS value FROM notification_sync_events WHERE recipient_slug = ?'
    ).bind(slug).first<any>(),
  ])
  const maxima: InboxCursorSet = {
    conversations: Number(conversationMax?.value || 0),
    messages: Number(messageMax?.value || 0),
    notifications: Number(notificationMax?.value || 0),
  }
  const boundary = {} as InboxCursorSet
  for (const stream of STREAMS) {
    boundary[stream] = cursor.position[stream] === cursor.boundary[stream]
      ? maxima[stream]
      : cursor.boundary[stream]
  }
  return { position: { ...cursor.position }, boundary }
}

function formatDirectMessage(row: any) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderSlug: row.sender_slug,
    recipientSlug: row.recipient_slug,
    body: row.body,
    createdAt: row.created_at,
    clientNonce: row.client_nonce,
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

function nextCursorValue(rows: any[], rowIdKey: string, boundary: number, limit: number): number {
  if (rows.length < limit) return boundary
  return Number(rows[rows.length - 1][rowIdKey])
}

function nextNotificationCursor(rows: any[], boundary: number): number {
  if (Number(rows[0]?.sync_event_count || 0) < NOTIFICATION_SYNC_LIMIT) return boundary
  return Math.max(...rows.map((row) => Number(row.sync_rowid)))
}

function nextCursor(current: InboxSyncCursor, conversations: any[], messages: any[], notifications: any[]): InboxSyncCursor {
  const newConversations = conversations
    .filter((row) => row.conversation_sync_rowid !== null && row.conversation_sync_rowid !== undefined)
    .sort((a, b) => Number(a.conversation_sync_rowid) - Number(b.conversation_sync_rowid))
  return {
    position: {
      conversations: nextCursorValue(newConversations, 'conversation_sync_rowid', current.boundary.conversations, DIRECT_SYNC_LIMIT),
      messages: nextCursorValue(messages, 'sync_rowid', current.boundary.messages, DIRECT_SYNC_LIMIT),
      notifications: nextNotificationCursor(notifications, current.boundary.notifications),
    },
    boundary: { ...current.boundary },
  }
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
  const viewerSlug = identity.slug
  const cursor = await openSyncWindow(c.env.DB, decodedCursor, viewerSlug)

  const [conversationRows, messageRows, notificationRows] = await Promise.all([
    c.env.DB.prepare(`
      WITH new_conversations AS (
        SELECT c.id, c.rowid AS sync_rowid
        FROM direct_conversations c
        WHERE (c.participant_a_slug = ? OR c.participant_b_slug = ?)
          AND c.rowid > ? AND c.rowid <= ?
        ORDER BY c.rowid ASC
        LIMIT ?
      ),
      sync_messages AS (
        SELECT m.conversation_id
        FROM direct_messages m
        WHERE (m.sender_slug = ? OR m.recipient_slug = ?)
          AND m.rowid > ? AND m.rowid <= ?
        ORDER BY m.rowid ASC
        LIMIT ?
      ),
      changed_conversations AS (
        SELECT id FROM new_conversations
        UNION
        SELECT conversation_id AS id FROM sync_messages
      )
      SELECT
        c.id,
        c.updated_at,
        new_conversations.sync_rowid AS conversation_sync_rowid,
        CASE WHEN c.participant_a_slug = ? THEN c.participant_b_slug ELSE c.participant_a_slug END AS peer_slug,
        peer.name AS peer_name,
        peer.avatar_url AS peer_avatar_url,
        last_message.id AS last_message_id,
        last_message.sender_slug AS last_sender_slug,
        last_message.body AS last_body,
        last_message.created_at AS last_created_at,
        COALESCE(unread.unread_count, 0) AS unread_count
      FROM changed_conversations changed
      JOIN direct_conversations c ON c.id = changed.id
      LEFT JOIN new_conversations ON new_conversations.id = c.id
      LEFT JOIN students peer ON peer.slug = CASE WHEN c.participant_a_slug = ? THEN c.participant_b_slug ELSE c.participant_a_slug END
      LEFT JOIN direct_messages last_message ON last_message.id = (
        SELECT latest.id
        FROM direct_messages latest
        WHERE latest.conversation_id = c.id
        ORDER BY latest.created_at DESC, latest.id DESC
        LIMIT 1
      )
      LEFT JOIN (
        SELECT conversation_id, COUNT(*) AS unread_count
        FROM direct_messages
        WHERE recipient_slug = ? AND read_at IS NULL
        GROUP BY conversation_id
      ) unread ON unread.conversation_id = c.id
      WHERE c.participant_a_slug = ? OR c.participant_b_slug = ?
      ORDER BY COALESCE(new_conversations.sync_rowid, 9223372036854775807), c.id ASC
    `).bind(
      viewerSlug,
      viewerSlug,
      cursor.position.conversations,
      cursor.boundary.conversations,
      DIRECT_SYNC_LIMIT,
      viewerSlug,
      viewerSlug,
      cursor.position.messages,
      cursor.boundary.messages,
      DIRECT_SYNC_LIMIT,
      viewerSlug,
      viewerSlug,
      viewerSlug,
      viewerSlug,
      viewerSlug,
    ).all(),
    c.env.DB.prepare(`
      SELECT m.rowid AS sync_rowid, m.*
      FROM direct_messages m
      WHERE (m.sender_slug = ? OR m.recipient_slug = ?)
        AND m.rowid > ? AND m.rowid <= ?
      ORDER BY m.rowid ASC
      LIMIT ?
    `).bind(
      viewerSlug,
      viewerSlug,
      cursor.position.messages,
      cursor.boundary.messages,
      DIRECT_SYNC_LIMIT,
    ).all(),
    c.env.DB.prepare(`
      WITH notification_events AS (
        SELECT sequence AS sync_rowid, notification_id
        FROM notification_sync_events
        WHERE recipient_slug = ?
          AND sequence > ? AND sequence <= ?
        ORDER BY sequence ASC
        LIMIT ?
      ),
      latest_events AS (
        SELECT notification_id, MAX(sync_rowid) AS sync_rowid
        FROM notification_events
        GROUP BY notification_id
      )
      SELECT
        latest_events.sync_rowid,
        (SELECT COUNT(*) FROM notification_events) AS sync_event_count,
        n.*
      FROM latest_events
      JOIN notifications n ON n.id = latest_events.notification_id
      ORDER BY latest_events.sync_rowid ASC
    `).bind(
      viewerSlug,
      cursor.position.notifications,
      cursor.boundary.notifications,
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
