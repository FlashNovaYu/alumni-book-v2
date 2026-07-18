import type { GroupChatMessage } from '../../../../packages/shared/src/types'
import { formatGroupMessage, getActiveMute } from './groupChat'

export interface GroupChatCreatorIdentity {
  slug: string
  name: string
  mustChangePassword: boolean
}

export interface CreateGroupChatMessageInput {
  content?: unknown
  clientNonce?: unknown
  replyToId?: unknown
  cardStyle?: unknown
}

export type CreateGroupChatMessageResult =
  | { ok: true; created: boolean; message: GroupChatMessage; cardStyle: string }
  | { ok: false; status: 400 | 403 | 429; message: string; retryAfter?: number }

const ALLOWED_CARD_STYLES = ['paper', 'chalkboard', 'photoback', 'letter'] as const

function normalizeInput(input: CreateGroupChatMessageInput) {
  const content = typeof input.content === 'string' ? input.content.trim() : ''
  const clientNonce = typeof input.clientNonce === 'string' ? input.clientNonce.trim() : ''
  const replyToId = typeof input.replyToId === 'string' ? input.replyToId : null
  const cardStyle = ALLOWED_CARD_STYLES.includes(input.cardStyle as any) ? input.cardStyle as string : 'paper'
  return { content, clientNonce, replyToId, cardStyle }
}

function retryAfterSeconds(earliestTimestamp: unknown, windowSeconds: number) {
  const earliest = Date.parse(String(earliestTimestamp || ''))
  return Number.isFinite(earliest)
    ? Math.max(1, Math.ceil(windowSeconds - (Date.now() - earliest) / 1000))
    : windowSeconds
}

export async function createGroupChatMessage(
  db: D1Database,
  identity: GroupChatCreatorIdentity,
  input: CreateGroupChatMessageInput,
): Promise<CreateGroupChatMessageResult> {
  // 1. mustChangePassword check
  if (identity.mustChangePassword) {
    return { ok: false, status: 403, message: '请先修改初始密码' }
  }

  // 2. Normalize and validate input
  const { content, clientNonce, replyToId, cardStyle } = normalizeInput(input)
  if (!content || content.length > 500 || !clientNonce || clientNonce.length > 128) {
    return { ok: false, status: 400, message: '消息内容或请求标识无效' }
  }

  // 3. Idempotency check
  const duplicate = await db.prepare(
    'SELECT * FROM public_messages WHERE author_slug = ? AND client_nonce = ?'
  ).bind(identity.slug, clientNonce).first() as any
  if (duplicate) {
    return { ok: true, created: false, message: await formatGroupMessage(db, duplicate, identity.slug), cardStyle }
  }

  // 4. Active mute check
  const mute = await getActiveMute(db, identity.slug)
  if (mute) {
    return { ok: false, status: 403, message: mute.reason }
  }

  // 5. Reply target validation
  if (replyToId) {
    const reply = await db.prepare('SELECT id FROM public_messages WHERE id = ?').bind(replyToId).first()
    if (!reply) {
      return { ok: false, status: 400, message: '引用消息不存在' }
    }
  }

  // 6. Rate limit check
  const now = new Date().toISOString()
  const [recent, hourly] = await Promise.all([
    db.prepare(
      "SELECT COUNT(*) AS count, MIN(created_at) AS earliest FROM public_messages WHERE author_slug = ? AND status IN ('visible', 'recalled_by_author', 'recalled_by_admin') AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 seconds')"
    ).bind(identity.slug).first(),
    db.prepare(
      "SELECT COUNT(*) AS count, MIN(created_at) AS earliest FROM public_messages WHERE author_slug = ? AND status IN ('visible', 'recalled_by_author', 'recalled_by_admin') AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')"
    ).bind(identity.slug).first(),
  ])
  const recentCount = Number((recent as any)?.count || 0)
  const hourlyCount = Number((hourly as any)?.count || 0)
  if (recentCount >= 6 || hourlyCount >= 60) {
    const retryAfter = recentCount >= 6
      ? retryAfterSeconds((recent as any)?.earliest, 30)
      : retryAfterSeconds((hourly as any)?.earliest, 3600)
    return { ok: false, status: 429, message: '发送过于频繁', retryAfter }
  }

  // 7. Atomic insert with guard conditions
  const id = crypto.randomUUID()
  const insertion = await db.prepare(
    `INSERT INTO public_messages (
       id, author_slug, author_name, content, card_style, status,
       reply_to_id, client_nonce, created_at, updated_at
     )
     SELECT ?, ?, ?, ?, ?, 'visible', ?, ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM group_chat_mutes
       WHERE student_slug = ?
         AND (muted_until IS NULL OR muted_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     )
     AND (
       SELECT COUNT(*) FROM public_messages
       WHERE author_slug = ?
         AND status IN ('visible', 'recalled_by_author', 'recalled_by_admin')
         AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 seconds')
     ) < 6
     AND (
       SELECT COUNT(*) FROM public_messages
       WHERE author_slug = ?
         AND status IN ('visible', 'recalled_by_author', 'recalled_by_admin')
         AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')
     ) < 60
     ON CONFLICT(author_slug, client_nonce) WHERE client_nonce IS NOT NULL DO NOTHING`
  ).bind(id, identity.slug, identity.name, content, cardStyle, replyToId, clientNonce, now, now, identity.slug, identity.slug, identity.slug).run()

  // 8. Re-query by (author_slug, client_nonce)
  const row = await db.prepare(
    'SELECT * FROM public_messages WHERE author_slug = ? AND client_nonce = ?'
  ).bind(identity.slug, clientNonce).first() as any

  if (!row) {
    // 9. Re-check mute and rate limit for error diagnosis
    const activeMute = await getActiveMute(db, identity.slug)
    if (activeMute) {
      return { ok: false, status: 403, message: activeMute.reason }
    }
    const [latestRecent, latestHourly] = await Promise.all([
      db.prepare(
        "SELECT COUNT(*) AS count, MIN(created_at) AS earliest FROM public_messages WHERE author_slug = ? AND status IN ('visible', 'recalled_by_author', 'recalled_by_admin') AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 seconds')"
      ).bind(identity.slug).first(),
      db.prepare(
        "SELECT COUNT(*) AS count, MIN(created_at) AS earliest FROM public_messages WHERE author_slug = ? AND status IN ('visible', 'recalled_by_author', 'recalled_by_admin') AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')"
      ).bind(identity.slug).first(),
    ])
    const latestRecentCount = Number((latestRecent as any)?.count || 0)
    const latestHourlyCount = Number((latestHourly as any)?.count || 0)
    if (latestRecentCount >= 6 || latestHourlyCount >= 60) {
      const retryAfter = latestRecentCount >= 6
        ? retryAfterSeconds((latestRecent as any)?.earliest, 30)
        : retryAfterSeconds((latestHourly as any)?.earliest, 3600)
      return { ok: false, status: 429, message: '发送过于频繁', retryAfter }
    }
    throw new Error('群聊消息创建条件未满足')
  }

  // 10. Format and return
  const created = insertion.meta.changes === 1
  return { ok: true, created, message: await formatGroupMessage(db, row, identity.slug), cardStyle }
}
