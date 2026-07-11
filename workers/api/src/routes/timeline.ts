import { Hono } from 'hono'
import { getTimelineFeed, TimelineFeedType } from '../lib/timelineFeed'
import { getAdminPrincipal } from '../lib/adminAuth'
import { runAuditedBatch } from '../lib/adminAudit'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const timelineRoutes = new Hono<{ Bindings: Bindings }>()

// 公开获取时光轴
timelineRoutes.get('/timeline', async (c) => {
  const requestedType = c.req.query('type') as TimelineFeedType | undefined
  const timeline = await getTimelineFeed(c.env.DB, { type: requestedType, limit: 100 })
  return c.json({ success: true, data: timeline })
})

// 管理后台 CRUD
timelineRoutes.post('/timeline/events', async (c) => {
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const body = await c.req.json()
  if (!body.title || !body.eventDate) {
    return c.json({ success: false, message: '标题和日期必填' }, 400)
  }
  const id = `tle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await runAuditedBatch(db, admin.id, [db.prepare(
    'INSERT INTO timeline_events (id, title, description, event_date, photo_r2_key, is_milestone, event_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, body.title, body.description || '', body.eventDate, body.photoR2Key || null, body.isMilestone ? 1 : 0, body.eventType || 'class_event')], { action: 'timeline_event.create', resourceType: 'timeline_event', resourceId: id, after: { title: body.title, eventDate: body.eventDate } })
  return c.json({ success: true, data: { id } })
})

timelineRoutes.put('/timeline/events/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const body = await c.req.json()
  const fields: string[] = []
  const values: any[] = []
  if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title) }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description) }
  if (body.eventDate !== undefined) { fields.push('event_date = ?'); values.push(body.eventDate) }
  if (body.photoR2Key !== undefined) { fields.push('photo_r2_key = ?'); values.push(body.photoR2Key) }
  if (body.isMilestone !== undefined) { fields.push('is_milestone = ?'); values.push(body.isMilestone ? 1 : 0) }
  if (body.eventType !== undefined) { fields.push('event_type = ?'); values.push(body.eventType) }
  if (fields.length === 0) {
    return c.json({ success: false, message: '没有要更新的字段' }, 400)
  }
  const before = await db.prepare('SELECT title, event_date, event_type FROM timeline_events WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '时光轴事件不存在' }, 404)
  values.push(id)
  await runAuditedBatch(db, admin.id, [db.prepare(`UPDATE timeline_events SET ${fields.join(', ')} WHERE id = ?`).bind(...values)], { action: 'timeline_event.update', resourceType: 'timeline_event', resourceId: id, before, after: body })
  return c.json({ success: true, message: '更新成功' })
})

timelineRoutes.delete('/timeline/events/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { reason } = await c.req.json().catch(() => ({}))
  const cleanReason = String(reason || '').trim()
  if (!cleanReason) return c.json({ success: false, message: '删除时光轴事件时请填写原因' }, 400)
  const before = await db.prepare('SELECT title, event_date FROM timeline_events WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '时光轴事件不存在' }, 404)
  await runAuditedBatch(db, admin.id, [db.prepare('DELETE FROM timeline_events WHERE id = ?').bind(id)], { action: 'timeline_event.delete', resourceType: 'timeline_event', resourceId: id, reason: cleanReason, before })
  return c.json({ success: true, message: '删除成功' })
})
