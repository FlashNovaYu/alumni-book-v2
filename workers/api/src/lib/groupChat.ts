import type { GroupChatMessage, GroupChatStatus } from '../../../../packages/shared/src/types'

export const GROUP_REACTIONS = ['❤️', '👍', '😂', '🎉'] as const

type MessageRow = Record<string, any>

type ListOptions = {
  before?: { timestamp: string; id: string }
  updatedAfter?: { timestamp: string; id: string }
  updatedBefore?: { timestamp: string; id: string }
  includeStatusChanges?: boolean
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

export async function formatGroupMessage(db: D1Database, row: MessageRow, viewerSlug: string, hideHiddenContent = false): Promise<GroupChatMessage> {
  const preloaded = Object.prototype.hasOwnProperty.call(row, 'reaction_counts_json')
  const [reactionRows, myReactionRow, replyRow] = preloaded ? [null, null, null] : await Promise.all([
    db.prepare('SELECT reaction, COUNT(*) AS count FROM group_chat_reactions WHERE message_id = ? GROUP BY reaction').bind(row.id).all(),
    db.prepare('SELECT reaction FROM group_chat_reactions WHERE message_id = ? AND reactor_slug = ?').bind(row.id, viewerSlug).first(),
    row.reply_to_id ? db.prepare('SELECT id, author_name, content, status FROM public_messages WHERE id = ?').bind(row.reply_to_id).first() : Promise.resolve(null),
  ])
  const reactionCounts = parseReactions(row.reactions)
  if (preloaded) {
    for (const [reaction, count] of Object.entries(parseReactions(row.reaction_counts_json))) {
      reactionCounts[reaction] = (reactionCounts[reaction] || 0) + count
    }
  } else {
    for (const reaction of reactionRows?.results || []) {
      const item = reaction as any
      reactionCounts[item.reaction] = (reactionCounts[item.reaction] || 0) + Number(item.count)
    }
  }

  const reply = preloaded ? {
    id: row.reply_id,
    author_name: row.reply_author_name,
    content: row.reply_content,
    status: row.reply_status,
  } : replyRow as any
  const replyTo = row.reply_to_id ? {
    id: row.reply_to_id,
    authorName: reply?.author_name || '',
    preview: reply?.status === 'visible'
      ? String(reply.content).slice(0, 60)
      : '原消息不可用',
  } : null
  const ownPrivateMessage = row.author_slug === viewerSlug && (row.status === 'hidden' || row.status === 'pending' || row.status === 'rejected')
  const content = isRecalled(row.status) || (hideHiddenContent && row.status === 'hidden') ? null : row.content
  const createdAt = row.created_at

  return {
    id: row.id,
    author: { slug: row.author_slug, name: row.author_name, avatarUrl: row.avatar_url || null },
    content,
    status: row.status as GroupChatStatus,
    replyTo,
    reactionCounts,
    myReaction: preloaded ? row.my_reaction || null : (myReactionRow as any)?.reaction || null,
    canRecall: row.author_slug === viewerSlug && row.status === 'visible' && Date.now() - new Date(createdAt).getTime() <= 2 * 60 * 1000,
    ...(ownPrivateMessage ? { moderationReason: row.moderation_reason || null } : {}),
    createdAt,
    updatedAt: row.updated_at,
  }
}

export async function listGroupMessages(db: D1Database, viewerSlug: string, options: ListOptions): Promise<GroupChatMessage[]> {
  if (options.before && options.updatedAfter) {
    throw new Error('before 和 updatedAfter 不能同时使用')
  }

  const clauses = [options.mine
    ? 'pm.author_slug = ?'
    : options.includeStatusChanges
      ? "pm.status IN ('visible', 'hidden', 'recalled_by_author', 'recalled_by_admin')"
      : "pm.status = 'visible'"]
  const values: unknown[] = options.mine ? [viewerSlug] : []
  if (options.before) {
    clauses.push('(julianday(pm.created_at) < julianday(?) OR (julianday(pm.created_at) = julianday(?) AND pm.id < ?))')
    values.push(options.before.timestamp, options.before.timestamp, options.before.id)
  }
  if (options.updatedAfter) {
    clauses.push('(julianday(pm.updated_at) > julianday(?) OR (julianday(pm.updated_at) = julianday(?) AND pm.id > ?))')
    values.push(options.updatedAfter.timestamp, options.updatedAfter.timestamp, options.updatedAfter.id)
  }
  if (options.updatedBefore) {
    clauses.push('(julianday(pm.updated_at) < julianday(?) OR (julianday(pm.updated_at) = julianday(?) AND pm.id <= ?))')
    values.push(options.updatedBefore.timestamp, options.updatedBefore.timestamp, options.updatedBefore.id)
  }
  values.push(options.limit)
  const orderBy = options.updatedAfter
    ? 'julianday(pm.updated_at) ASC, pm.id ASC'
    : 'julianday(pm.created_at) DESC, pm.id DESC'
  const result = await db.prepare(
    `WITH reaction_counts AS (
       SELECT message_id, reaction, COUNT(*) AS count FROM group_chat_reactions GROUP BY message_id, reaction
     ), reaction_aggregates AS (
       SELECT message_id, json_group_object(reaction, count) AS reaction_counts_json FROM reaction_counts GROUP BY message_id
     )
     SELECT pm.*, s.avatar_url, ra.reaction_counts_json, mine_reaction.reaction AS my_reaction,
       reply.id AS reply_id, reply.author_name AS reply_author_name, reply.content AS reply_content, reply.status AS reply_status
     FROM public_messages pm
     LEFT JOIN students s ON s.slug = pm.author_slug
     LEFT JOIN reaction_aggregates ra ON ra.message_id = pm.id
     LEFT JOIN group_chat_reactions mine_reaction ON mine_reaction.message_id = pm.id AND mine_reaction.reactor_slug = ?
     LEFT JOIN public_messages reply ON reply.id = pm.reply_to_id
     WHERE ${clauses.join(' AND ')} ORDER BY ${orderBy} LIMIT ?`
  ).bind(viewerSlug, ...values).all()
  const messages = await Promise.all((result.results || []).map((row) => formatGroupMessage(db, row, viewerSlug, options.includeStatusChanges)))
  return options.updatedAfter ? messages : messages.reverse()
}

export async function getActiveMute(db: D1Database, slug: string): Promise<{ reason: string; mutedUntil: string | null } | null> {
  await db.prepare(
    "DELETE FROM group_chat_mutes WHERE student_slug = ? AND muted_until IS NOT NULL AND julianday(muted_until) <= julianday('now')"
  ).bind(slug).run()
  const row = await db.prepare(
    "SELECT reason, muted_until FROM group_chat_mutes WHERE student_slug = ? AND (muted_until IS NULL OR julianday(muted_until) > julianday('now'))"
  ).bind(slug).first() as any
  return row ? { reason: row.reason, mutedUntil: row.muted_until } : null
}
