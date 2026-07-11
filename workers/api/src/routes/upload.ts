import { Hono } from 'hono'
import { getAdminPrincipal, hasPermission } from '../lib/adminAuth'
import { runAuditedBatch } from '../lib/adminAudit'

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

function fileKeyFromUrl(url: string | null | undefined) {
  const parts = String(url || '').split('/api/files/')
  return parts.length === 2 ? parts[1] : null
}

uploadRoutes.post('/upload', async (c) => {
  const db = c.env.DB
  const r2 = c.env.R2
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)

  if (!r2) {
    return c.json({ success: false, message: '文件存储(R2)未启用' }, 503)
  }

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const type = formData.get('type') as string
  const slug = formData.get('slug') as string
  const albumId = formData.get('albumId') as string

  const requiredPermission = ['avatar', 'music', 'background'].includes(type) ? 'students.manage' : 'content.manage'
  if (!hasPermission(admin, requiredPermission)) {
    return c.json({ success: false, message: '当前管理员没有此文件管理权限' }, 403)
  }

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

  const ext = file.name.split('.').pop() || 'bin'
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
  } else {
    r2Key = `misc/${timestamp}_${file.name}`
  }

  // 3. 上传新文件
  await r2.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })

  // 统一存为相对路径，有利于环境迁移与解耦
  const relativeUrl = `/api/files/${r2Key}`

  // 4. 先让业务数据与审计记录原子提交；批处理失败时补偿删除刚上传的对象。
  let previousKey: string | null = null
  let mutation: D1PreparedStatement | null = null
  let resourceType = 'upload'
  let resourceId = r2Key
  if (type === 'avatar' && slug) {
    const previous = await db.prepare('SELECT avatar_url FROM students WHERE slug = ?').bind(slug).first<any>()
    previousKey = fileKeyFromUrl(previous?.avatar_url)
    mutation = db.prepare('UPDATE students SET avatar_url = ? WHERE slug = ?').bind(relativeUrl, slug)
    resourceType = 'student'; resourceId = slug
  }

  if (type === 'music' && slug) {
    const previous = await db.prepare('SELECT music_url FROM students WHERE slug = ?').bind(slug).first<any>()
    previousKey = fileKeyFromUrl(previous?.music_url)
    mutation = db.prepare('UPDATE students SET music_url = ? WHERE slug = ?').bind(relativeUrl, slug)
    resourceType = 'student'; resourceId = slug
  }

  if (type === 'background' && slug) {
    const previous = await db.prepare('SELECT background_url FROM students WHERE slug = ?').bind(slug).first<any>()
    previousKey = fileKeyFromUrl(previous?.background_url)
    mutation = db.prepare('UPDATE students SET background_url = ? WHERE slug = ?').bind(relativeUrl, slug)
    resourceType = 'student'; resourceId = slug
  }

  if (type === 'photo' && albumId) {
    const photoId = `photo_${timestamp}_${Math.random().toString(36).slice(2, 6)}`
    mutation = db.prepare(
      'INSERT INTO photos (id, album_id, filename, r2_key) VALUES (?, ?, ?, ?)'
    ).bind(photoId, albumId, file.name, r2Key)
    resourceType = 'photo'; resourceId = photoId
  }

  try {
    await runAuditedBatch(db, admin.id, mutation ? [mutation] : [], {
      action: 'file.upload', resourceType, resourceId, after: { type, filename: file.name, r2Key },
    })
  } catch (error) {
    await r2.delete(r2Key).catch(() => undefined)
    return c.json({ success: false, message: '文件记录保存失败，请重试' }, 500)
  }
  if (previousKey && previousKey !== r2Key) {
    await r2.delete(previousKey).catch(() => undefined)
  }

  const origin = new URL(c.req.url).origin
  const absoluteUrl = `${origin}${relativeUrl}`

  return c.json({ success: true, data: { url: absoluteUrl, r2Key } })
})
