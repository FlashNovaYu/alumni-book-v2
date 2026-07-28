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

  const acceptsClassmateUploads = body.acceptsClassmateUploads ? 1 : 0
  const statements = acceptsClassmateUploads ? [db.prepare('UPDATE albums SET accepts_classmate_uploads = 0 WHERE accepts_classmate_uploads = 1')] : []
  statements.push(db.prepare(
    'INSERT INTO albums (id, title, description, frame_style, cover_r2_key, tags, featured, accepts_classmate_uploads) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.title,
    body.description || '',
    body.frameStyle || 'none',
    body.coverR2Key || null,
    body.tags ? JSON.stringify(body.tags) : '[]',
    body.featured ? 1 : 0,
    acceptsClassmateUploads
  ))
  await runAuditedBatch(db, admin.id, statements, { action: 'album.create', resourceType: 'album', resourceId: id, after: { title: body.title, acceptsClassmateUploads: Boolean(acceptsClassmateUploads) } })

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
  if (body.acceptsClassmateUploads !== undefined) { fields.push('accepts_classmate_uploads = ?'); values.push(body.acceptsClassmateUploads ? 1 : 0) }

  if (fields.length === 0) {
    return c.json({ success: false, message: '没有要更新的字段' }, 400)
  }

  const before = await db.prepare('SELECT title, description, frame_style, sort_order, featured, accepts_classmate_uploads FROM albums WHERE id = ?').bind(id).first()
  if (!before) return c.json({ success: false, message: '相册不存在' }, 404)
  values.push(id)
  const statements = body.acceptsClassmateUploads ? [db.prepare('UPDATE albums SET accepts_classmate_uploads = 0 WHERE id != ? AND accepts_classmate_uploads = 1').bind(id)] : []
  statements.push(db.prepare(`UPDATE albums SET ${fields.join(', ')} WHERE id = ?`).bind(...values))
  await runAuditedBatch(db, admin.id, statements, { action: 'album.update', resourceType: 'album', resourceId: id, before, after: body })

  return c.json({ success: true, message: '更新成功' })
})

albumsRoutes.post('/photos/move', async (c) => {
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const body = await parseLimitedJson<any>(c, { fallback: {} })
  const photoIds = [...new Set(Array.isArray(body.photoIds) ? body.photoIds.map((id: unknown) => String(id).trim()).filter(Boolean) : [])]
  const targetAlbumId = String(body.targetAlbumId || '').trim()
  if (!photoIds.length || !targetAlbumId) return c.json({ success: false, message: '请选择照片和目标相册' }, 400)
  const target = await c.env.DB.prepare('SELECT id FROM albums WHERE id = ?').bind(targetAlbumId).first()
  if (!target) return c.json({ success: false, message: '目标相册不存在' }, 404)
  const marks = photoIds.map(() => '?').join(', ')
  const { results } = await c.env.DB.prepare(`SELECT id, album_id, sort_order FROM photos WHERE id IN (${marks}) ORDER BY album_id, sort_order, id`).bind(...photoIds).all<any>()
  if ((results || []).length !== photoIds.length) return c.json({ success: false, message: '存在不存在的照片' }, 404)
  if ((results || []).some((photo: any) => photo.album_id === targetAlbumId)) return c.json({ success: false, message: '不能移动到当前相册' }, 400)
  const maximum = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS value FROM photos WHERE album_id = ?').bind(targetAlbumId).first<any>()
  const statements = (results || []).map((photo: any, index) => c.env.DB.prepare('UPDATE photos SET album_id = ?, sort_order = ? WHERE id = ?').bind(targetAlbumId, Number(maximum?.value || -1) + index + 1, photo.id))
  await runAuditedBatch(c.env.DB, admin.id, statements, { action: 'photo.move', resourceType: 'photo', resourceId: photoIds.join(','), before: { photoIds, sourceAlbums: [...new Set((results || []).map((photo: any) => photo.album_id))] }, after: { targetAlbumId } })
  return c.json({ success: true, data: { moved: photoIds.length } })
})

albumsRoutes.get('/albums/storage', async (c) => {
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const storage: any = (c.env as any).R2
  if (!storage?.getDiskUsage) return c.json({ success: true, data: { available: false, environment: 'cloudflare', message: '该运行环境不提供服务器磁盘统计' } })
  const [{ results: photos }, disk] = await Promise.all([
    c.env.DB.prepare('SELECT r2_key, media_json FROM photos').all<any>(), storage.getDiskUsage(),
  ])
  let albumsBytes = 0
  for (const photo of photos || []) for (const key of photoObjectKeys(photo)) albumsBytes += Number((await storage.head(key))?.size || 0)
  return c.json({ success: true, data: { available: true, environment: 'self-hosted', filesystem: disk, uploads: { totalBytes: disk.uploadsBytes }, albums: { totalBytes: albumsBytes } } })
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
