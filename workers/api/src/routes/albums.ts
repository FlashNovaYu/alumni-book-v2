import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const albumsRoutes = new Hono<{ Bindings: Bindings }>()

// 创建相册
albumsRoutes.post('/albums', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()

  if (!body.title) {
    return c.json({ success: false, message: '相册名称必填' }, 400)
  }

  const id = `album_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  await db.prepare(
    'INSERT INTO albums (id, title, description, frame_style, cover_r2_key, tags) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    body.title,
    body.description || '',
    body.frameStyle || 'none',
    body.coverR2Key || null,
    body.tags ? JSON.stringify(body.tags) : '[]'
  ).run()

  return c.json({ success: true, data: { id } })
})

// 更新相册
albumsRoutes.put('/albums/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()

  const fields: string[] = []
  const values: any[] = []

  if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title) }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description) }
  if (body.frameStyle !== undefined) { fields.push('frame_style = ?'); values.push(body.frameStyle) }
  if (body.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(body.sortOrder) }
  if (body.coverR2Key !== undefined) { fields.push('cover_r2_key = ?'); values.push(body.coverR2Key) }
  if (body.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(body.tags)) }

  if (fields.length === 0) {
    return c.json({ success: false, message: '没有要更新的字段' }, 400)
  }

  values.push(id)
  await db.prepare(`UPDATE albums SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()

  return c.json({ success: true, message: '更新成功' })
})

// 删除相册
albumsRoutes.delete('/albums/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const r2 = (c.env as any).R2

  // 物理删除该相册下的所有 R2 文件
  try {
    const { results } = await db.prepare('SELECT r2_key FROM photos WHERE album_id = ?').bind(id).all()
    if (results && r2) {
      for (const row of results) {
        const key = (row as any).r2_key
        if (key) {
          await r2.delete(key)
        }
      }
    }
  } catch (e) {
    console.error('Failed to cleanup album photos from R2:', e)
  }

  await db.prepare('DELETE FROM photos WHERE album_id = ?').bind(id).run()
  await db.prepare('DELETE FROM albums WHERE id = ?').bind(id).run()

  return c.json({ success: true, message: '删除成功' })
})

// 更新照片
albumsRoutes.put('/photos/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const body = await c.req.json()

  const fields: string[] = []
  const values: any[] = []

  if (body.caption !== undefined) { fields.push('caption = ?'); values.push(body.caption) }
  if (body.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(body.sortOrder) }

  if (fields.length === 0) {
    return c.json({ success: false, message: '没有要更新的字段' }, 400)
  }

  values.push(id)
  await db.prepare(`UPDATE photos SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()

  return c.json({ success: true, message: '照片更新成功' })
})

// 删除照片
albumsRoutes.delete('/photos/:id', async (c) => {
  const id = c.req.param('id')
  const db = c.env.DB
  const r2 = (c.env as any).R2

  const photo = await db.prepare('SELECT r2_key FROM photos WHERE id = ?').bind(id).first()
  if (!photo) {
    return c.json({ success: false, message: '照片不存在' }, 404)
  }

  const key = (photo as any).r2_key
  if (key && r2) {
    try {
      await r2.delete(key)
    } catch (e) {
      console.error('Failed to delete photo from R2:', e)
    }
  }

  await db.prepare('DELETE FROM photos WHERE id = ?').bind(id).run()

  return c.json({ success: true, message: '照片删除成功' })
})
