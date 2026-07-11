import { Hono } from 'hono'
import { validateImageUpload } from '../lib/imageValidation'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
  JWT_SECRET: string
}

export const uploadRoutes = new Hono<{ Bindings: Bindings }>()

const MAX_SIZES: Record<string, number> = {
  avatar: 2 * 1024 * 1024,      // 2MB
  background: 5 * 1024 * 1024,  // 5MB
  photo: 8 * 1024 * 1024,       // 8MB
  music: 15 * 1024 * 1024,      // 15MB
  misc: 10 * 1024 * 1024,       // 10MB
}

const ALLOWED_MIMES: Record<string, string[]> = {
  avatar: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  background: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  photo: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  music: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'audio/mpeg3', 'audio/x-mpeg-3'],
  misc: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
}

async function deleteOldFile(db: D1Database, r2: R2Bucket, query: string, params: any[]) {
  try {
    const row = await db.prepare(query).bind(...params).first()
    if (!row) return
    
    // 获取现有的文件 URL 并解析出 R2 key
    const url = (row as any).avatar_url || (row as any).background_url || (row as any).music_url
    if (url) {
      const parts = url.split('/api/files/')
      if (parts.length === 2) {
        const oldKey = parts[1]
        await r2.delete(oldKey)
      }
    }
  } catch (e) {
    console.error('Failed to delete old file from R2:', e)
  }
}

uploadRoutes.post('/upload', async (c) => {
  const db = c.env.DB
  const r2 = c.env.R2

  if (!r2) {
    return c.json({ success: false, message: '文件存储(R2)未启用' }, 503)
  }

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const type = formData.get('type') as string
  const slug = formData.get('slug') as string
  const albumId = formData.get('albumId') as string

  if (!file) {
    return c.json({ success: false, message: '没有文件' }, 400)
  }

  // 1. 验证大小
  const maxBytes = MAX_SIZES[type] || MAX_SIZES.misc
  if (file.size > maxBytes) {
    return c.json({ success: false, message: '文件体积超出限制' }, 413)
  }

  // 2. 验证 MIME 类型
  const allowed = ALLOWED_MIMES[type] || ALLOWED_MIMES.misc
  if (!allowed.includes(file.type)) {
    return c.json({ success: false, message: '不支持的文件格式' }, 400)
  }

  const imageContents = file.type.startsWith('image/') ? await file.arrayBuffer() : null
  const imageFormat = imageContents ? validateImageUpload(file.type, imageContents) : null
  if (imageContents && !imageFormat) {
    return c.json({ success: false, message: '图片内容与文件格式不一致' }, 400)
  }

  const ext = imageFormat?.extension || file.name.split('.').pop() || 'bin'
  const timestamp = Date.now()
  let r2Key = ''

  if (type === 'avatar' && slug) {
    r2Key = `avatars/${slug}_${timestamp}.${ext}`
  } else if (type === 'music' && slug) {
    r2Key = `music/${slug}_${timestamp}.${ext}`
  } else if (type === 'photo' && albumId) {
    r2Key = `photos/${albumId}_${timestamp}_${Math.random().toString(36).slice(2, 6)}.${ext}`
  } else if (type === 'background' && slug) {
    r2Key = `backgrounds/${slug}_${timestamp}.${ext}`
  } else if (imageFormat) {
    r2Key = `misc/${timestamp}.${imageFormat.extension}`
  } else {
    r2Key = `misc/${timestamp}_${file.name}`
  }

  // 3. 上传新文件
  await r2.put(r2Key, imageContents || file.stream(), {
    httpMetadata: { contentType: imageFormat?.mime || file.type },
  })

  // 统一存为相对路径，有利于环境迁移与解耦
  const relativeUrl = `/api/files/${r2Key}`

  // 4. 清理旧文件并更新数据库
  if (type === 'avatar' && slug) {
    await deleteOldFile(db, r2, 'SELECT avatar_url FROM students WHERE slug = ?', [slug])
    await db.prepare('UPDATE students SET avatar_url = ? WHERE slug = ?').bind(relativeUrl, slug).run()
  }

  if (type === 'music' && slug) {
    await deleteOldFile(db, r2, 'SELECT music_url FROM students WHERE slug = ?', [slug])
    await db.prepare('UPDATE students SET music_url = ? WHERE slug = ?').bind(relativeUrl, slug).run()
  }

  if (type === 'background' && slug) {
    await deleteOldFile(db, r2, 'SELECT background_url FROM students WHERE slug = ?', [slug])
    await db.prepare('UPDATE students SET background_url = ? WHERE slug = ?').bind(relativeUrl, slug).run()
  }

  if (type === 'photo' && albumId) {
    const photoId = `photo_${timestamp}_${Math.random().toString(36).slice(2, 6)}`
    await db.prepare(
      'INSERT INTO photos (id, album_id, filename, r2_key) VALUES (?, ?, ?, ?)'
    ).bind(photoId, albumId, file.name, r2Key).run()
  }

  const origin = new URL(c.req.url).origin
  const absoluteUrl = `${origin}${relativeUrl}`

  return c.json({ success: true, data: { url: absoluteUrl, r2Key } })
})
