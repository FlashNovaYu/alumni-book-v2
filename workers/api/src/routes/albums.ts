import { Hono } from 'hono'
import { parseLimitedJson } from '../lib/jsonBodyLimit'
import { getAdminPrincipal } from '../lib/adminAuth'
import { runAuditedBatch } from '../lib/adminAudit'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

function photoObjectKeys(row: any): string[] {
  const keys = row?.r2_key ? [String(row.r2_key)] : []
  try {
    const media = JSON.parse(String(row?.media_json || '{}'))
    for (const variant of media?.variants || []) if (variant?.key) keys.push(String(variant.key))
  } catch { /* legacy row */ }
  return [...new Set(keys)]
}

export const albumsRoutes = new Hono<{ Bindings: Bindings }>()

// 创建相册
albumsRoutes.post('/albums', async (c) => {
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const body = await parseLimitedJson(c)

  if (!body.title) {
    return c.json({ success: false, message: '相册名称必填' }, 400)
  }

  const id = `album_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  await runAuditedBatch(db, admin.id, [db.prepare(
    'INSERT INTO albums (id, title, description, frame_style, cover_r2_key, tags, featured) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.title,
    body.description || '',
    body.frameStyle || 'none',
    body.coverR2Key || null,
    body.tags ? JSON.stringify(body.tags) : '[]',
    body.featured ? 1 : 0
  )], { action: 'album.create', resourceType: 'album', resourceId: id, after: { title: body.title } })

  return c.json({ success: true, data: { id } })
})

// 更新相册
albumsRoutes.put('/albums/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const body = await parseLimitedJson(c)

  const fields: string[] = []
  const values: any[] = []

  if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title) }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description) }
  if (body.frameStyle !== undefined) { fields.push('frame_style = ?'); values.push(body.frameStyle) }
  if (body.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(body.sortOrder) }
  if (body.coverR2Key !== undefined) { fields.push('cover_r2_key = ?'); values.push(body.coverR2Key) }
  if (body.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(body.tags)) }
  if (body.featured !== undefined) { fields.push('featured = ?'); values.push(body.featured ? 1 : 0) }

  if (fields.length === 0) {
    return c.json({ success: false, message: '没有要更新的字段' }, 400)
  }

  const before = await db.prepare('SELECT title, description, frame_style, sort_order, featured FROM albums WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '相册不存在' }, 404)
  values.push(id)
  await runAuditedBatch(db, admin.id, [db.prepare(`UPDATE albums SET ${fields.join(', ')} WHERE id = ?`).bind(...values)], { action: 'album.update', resourceType: 'album', resourceId: id, before, after: body })

  return c.json({ success: true, message: '更新成功' })
})

// 删除相册
albumsRoutes.delete('/albums/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const r2 = (c.env as any).R2
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { reason } = await parseLimitedJson<any>(c, { fallback: {} })
  const cleanReason = String(reason || '').trim() || null
  if (!cleanReason) return c.json({ success: false, message: '必须填写删除原因' }, 400)
  const album = await db.prepare('SELECT title FROM albums WHERE id = ?').bind(id).first()
  if (!album) return c.json({ success: false, message: '相册不存在' }, 404)
  const { results: photos } = await db.prepare('SELECT r2_key, media_json FROM photos WHERE album_id = ?').bind(id).all()

  await runAuditedBatch(db, admin.id, [
    db.prepare('DELETE FROM photos WHERE album_id = ?').bind(id),
    db.prepare('DELETE FROM albums WHERE id = ?').bind(id),
  ], { action: 'album.delete', resourceType: 'album', resourceId: id, reason: cleanReason, before: { album, photoCount: photos?.length || 0 } })

  // D1 与审计先原子提交；对象存储清理失败仅留下不可访问的孤儿文件，不会破坏数据库一致性。
  try {
    if (photos && r2) {
      for (const row of photos) {
        for (const key of photoObjectKeys(row)) await r2.delete(key)
      }
    }
  } catch (e) {
    console.error('Failed to cleanup album photos from R2:', e)
  }

  return c.json({ success: true, message: '删除成功' })
})

// 更新照片
albumsRoutes.put('/photos/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const body = await parseLimitedJson(c)

  const fields: string[] = []
  const values: any[] = []

  if (body.caption !== undefined) { fields.push('caption = ?'); values.push(body.caption) }
  if (body.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(body.sortOrder) }

  if (fields.length === 0) {
    return c.json({ success: false, message: '没有要更新的字段' }, 400)
  }

  const before = await db.prepare('SELECT caption, sort_order FROM photos WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '照片不存在' }, 404)
  values.push(id)
  await runAuditedBatch(db, admin.id, [db.prepare(`UPDATE photos SET ${fields.join(', ')} WHERE id = ?`).bind(...values)], { action: 'photo.update', resourceType: 'photo', resourceId: id, before, after: body })

  return c.json({ success: true, message: '照片更新成功' })
})

// 删除照片
albumsRoutes.delete('/photos/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const r2 = (c.env as any).R2
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { reason } = await parseLimitedJson<any>(c, { fallback: {} })
  const cleanReason = String(reason || '').trim() || null
  if (!cleanReason) return c.json({ success: false, message: '必须填写删除原因' }, 400)

  const photo = await db.prepare('SELECT r2_key, media_json FROM photos WHERE id = ?').bind(id).first()
  if (!photo) {
    return c.json({ success: false, message: '照片不存在' }, 404)
  }

  await runAuditedBatch(db, admin.id, [db.prepare('DELETE FROM photos WHERE id = ?').bind(id)], { action: 'photo.delete', resourceType: 'photo', resourceId: id, reason: cleanReason, before: photo })
  if (r2) {
    try {
      for (const key of photoObjectKeys(photo)) await r2.delete(key)
    } catch (e) {
      console.error('Failed to delete photo from R2:', e)
    }
  }

  return c.json({ success: true, message: '照片删除成功' })
})
