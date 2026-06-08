import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const timelineRoutes = new Hono<{ Bindings: Bindings }>()

// 公开获取时光轴
timelineRoutes.get('/timeline', async (c) => {
  const db = c.env.DB
  const type = c.req.query('type')

  const timeline: any[] = []
  const queries: Promise<any>[] = []

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
            })
          }
        })
    )
  }

  if (!type || type === 'message') {
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

  if (!type || type === 'photo') {
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

  if (!type || type === 'join') {
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
              avatarUrl: (s as any).avatar_url,
            })
          }
        })
    )
  }

  await Promise.all(queries)

  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return c.json({ success: true, data: timeline.slice(0, 100) })
})

// 管理后台 CRUD
timelineRoutes.post('/timeline/events', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  if (!body.title || !body.eventDate) {
    return c.json({ success: false, message: '标题和日期必填' }, 400)
  }
  const id = `tle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await db.prepare(
    'INSERT INTO timeline_events (id, title, description, event_date, photo_r2_key, is_milestone) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, body.title, body.description || '', body.eventDate, body.photoR2Key || null, body.isMilestone ? 1 : 0).run()
  return c.json({ success: true, data: { id } })
})

timelineRoutes.put('/timeline/events/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()
  const fields: string[] = []
  const values: any[] = []
  if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title) }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description) }
  if (body.eventDate !== undefined) { fields.push('event_date = ?'); values.push(body.eventDate) }
  if (body.photoR2Key !== undefined) { fields.push('photo_r2_key = ?'); values.push(body.photoR2Key) }
  if (body.isMilestone !== undefined) { fields.push('is_milestone = ?'); values.push(body.isMilestone ? 1 : 0) }
  if (fields.length === 0) {
    return c.json({ success: false, message: '没有要更新的字段' }, 400)
  }
  values.push(id)
  await db.prepare(`UPDATE timeline_events SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ success: true, message: '更新成功' })
})

timelineRoutes.delete('/timeline/events/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  await db.prepare('DELETE FROM timeline_events WHERE id = ?').bind(id).run()
  return c.json({ success: true, message: '删除成功' })
})
