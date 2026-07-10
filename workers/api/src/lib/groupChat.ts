import type { GroupChatMessage, GroupChatStatus } from '../../../../packages/shared/src/types'

export const GROUP_REACTIONS = ['❤️', '👍', '😂', '🎉'] as const

type MessageRow = Record<string, any>

type ListOptions = {
  before?: { timestamp: string; id: string }
  updatedAfter?: { timestamp: string; id: string }
  limit: number
  mine?: boolean
}

function parseReactions(raw: string | null): Record<string, number> {
  try {
    const value = JSON.parse(raw || '{}')
    return Object.fromEntries(Object.entries(value).filter(([, count]) => Number.isFinite(count)).map(([key, count]) => [key, Number(count)]))
  } catch {
    return {}
  }
}

function isRecalled(status: string) {
  return status === 'recalled_by_author' || status === 'recalled_by_admin'
}

export async function formatGroupMessage(db: D1Database, row: MessageRow, viewerSlug: string): Promise<GroupChatMessage> {
  const [reactionRows, myReactionRow, replyRow] = await Promise.all([
    db.prepare('SELECT reaction, COUNT(*) AS count FROM group_chat_reactions WHERE message_id = ? GROUP BY reaction').bind(row.id).all(),
    db.prepare('SELECT reaction FROM group_chat_reactions WHERE message_id = ? AND reactor_slug = ?').bind(row.id, viewerSlug).first(),
    row.reply_to_id ? db.prepare('SELECT id, author_name, content, status FROM public_messages WHERE id = ?').bind(row.reply_to_id).first() : Promise.resolve(null),
  ])
  const reactionCounts = parseReactions(row.reactions)
  for (const reaction of reactionRows.results || []) {
    const item = reaction as any
    reactionCounts[item.reaction] = (reactionCounts[item.reaction] || 0) + Number(item.count)
  }

  const reply = replyRow as any
  const replyTo = row.reply_to_id ? {
    id: row.reply_to_id,
    authorName: reply?.author_name || '',
    preview: reply?.status === 'visible'
      ? String(reply.content).slice(0, 60)
      : '原消息不可用',
  } : null
  const ownPrivateMessage = row.author_slug === viewerSlug && (row.status === 'hidden' || row.status === 'pending' || row.status === 'rejected')
  const content = isRecalled(row.status) ? null : row.content
  const createdAt = row.created_at

  return {
    id: row.id,
    author: { slug: row.author_slug, name: row.author_name, avatarUrl: row.avatar_url || null },
    content,
    status: row.status as GroupChatStatus,
    replyTo,
    reactionCounts,
    myReaction: (myReactionRow as any)?.reaction || null,
    canRecall: row.author_slug === viewerSlug && row.status === 'visible' && Date.now() - new Date(createdAt).getTime() <= 2 * 60 * 1000,
    ...(ownPrivateMessage ? { moderationReason: row.moderation_reason || null } : {}),
    createdAt,
    updatedAt: row.updated_at,
  }
}

export async function listGroupMessages(db: D1Database, viewerSlug: string, options: ListOptions): Promise<GroupChatMessage[]> {
  const clauses = [options.mine ? 'pm.author_slug = ?' : "pm.status = 'visible'"]
  const values: unknown[] = options.mine ? [viewerSlug] : []
  if (options.before) {
    clauses.push('(julianday(pm.created_at) < julianday(?) OR (julianday(pm.created_at) = julianday(?) AND pm.id < ?))')
    values.push(options.before.timestamp, options.before.timestamp, options.before.id)
  }
  if (options.updatedAfter) {
    clauses.push('(julianday(pm.updated_at) > julianday(?) OR (julianday(pm.updated_at) = julianday(?) AND pm.id > ?))')
    values.push(options.updatedAfter.timestamp, options.updatedAfter.timestamp, options.updatedAfter.id)
  }
  values.push(options.limit)
  const result = await db.prepare(
    `SELECT pm.*, s.avatar_url FROM public_messages pm LEFT JOIN students s ON s.slug = pm.author_slug WHERE ${clauses.join(' AND ')} ORDER BY julianday(pm.created_at) DESC, pm.id DESC LIMIT ?`
  ).bind(...values).all()
  const messages = await Promise.all((result.results || []).map((row) => formatGroupMessage(db, row, viewerSlug)))
  return messages.reverse()
}

export async function getActiveMute(db: D1Database, slug: string): Promise<{ reason: string; mutedUntil: string | null } | null> {
  const row = await db.prepare(
    "SELECT reason, muted_until FROM group_chat_mutes WHERE student_slug = ? AND (muted_until IS NULL OR datetime(muted_until) > datetime('now'))"
  ).bind(slug).first() as any
  return row ? { reason: row.reason, mutedUntil: row.muted_until } : null
}
