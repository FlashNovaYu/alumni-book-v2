import { normalizeFileUrl } from './fileUrl'

export type TimelineFeedType = 'event' | 'message' | 'photo' | 'join'

export async function getTimelineFeed(
  db: D1Database,
  options: { type?: TimelineFeedType; limit?: number; curatedOnly?: boolean } = {},
): Promise<any[]> {
  const { type, limit = 100, curatedOnly = false } = options
  const timeline: any[] = []
  const queries: Promise<unknown>[] = []

  if (!type || type === 'event') {
    queries.push(
      db.prepare('SELECT * FROM timeline_events ORDER BY event_date DESC, sort_order').all()
        .then(({ results }) => {
          for (const e of (results || [])) {
            timeline.push({
              type: 'event',
              id: (e as any).id,
              title: (e as any).title,
              description: (e as any).description,
              date: (e as any).event_date,
              photoUrl: (e as any).photo_r2_key ? `/api/files/${(e as any).photo_r2_key}` : null,
              isMilestone: !!(e as any).is_milestone,
              eventType: (e as any).event_type || 'class_event',
            })
          }
        })
    )
  }

  if (!curatedOnly && (!type || type === 'message')) {
    queries.push(
      db.prepare("SELECT id, student_slug, author_name, content, created_at FROM messages WHERE is_approved = 1 AND is_hidden = 0 ORDER BY created_at DESC LIMIT 30").all()
        .then(({ results }) => {
          for (const m of (results || [])) {
            timeline.push({
              type: 'message',
              id: `msg_${(m as any).id}`,
              title: `${(m as any).author_name} 在同学录留言`,
              description: (m as any).content,
              date: (m as any).created_at,
              studentSlug: (m as any).student_slug,
            })
          }
        })
    )
  }

  if (!curatedOnly && (!type || type === 'photo')) {
    queries.push(
      db.prepare("SELECT p.*, a.title as album_title FROM photos p JOIN albums a ON p.album_id = a.id ORDER BY p.created_at DESC LIMIT 30").all()
        .then(({ results }) => {
          for (const p of (results || [])) {
            timeline.push({
              type: 'photo',
              id: `photo_${(p as any).id}`,
              title: `班级照片 · ${(p as any).album_title}`,
              description: (p as any).caption,
              date: (p as any).created_at,
              photoUrl: `/api/files/${(p as any).r2_key}`,
            })
          }
        })
    )
  }

  if (!curatedOnly && (!type || type === 'join')) {
    queries.push(
      db.prepare("SELECT name, slug, avatar_url, created_at FROM students ORDER BY created_at DESC LIMIT 30").all()
        .then(({ results }) => {
          for (const s of (results || [])) {
            timeline.push({
              type: 'join',
              id: `join_${(s as any).slug}`,
              title: `${(s as any).name} 加入了同学录`,
              date: (s as any).created_at,
              slug: (s as any).slug,
              avatarUrl: normalizeFileUrl((s as any).avatar_url),
            })
          }
        })
    )
  }

  await Promise.all(queries)

  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return timeline.slice(0, limit)
}
