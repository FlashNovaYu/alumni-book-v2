import { Hono } from 'hono'
import { validateImageUpload } from '../lib/imageValidation'
import { getAdminPrincipal, hasPermission } from '../lib/adminAuth'
import { runAuditedBatch } from '../lib/adminAudit'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
  JWT_SECRET: string
}

export const uploadRoutes = new Hono<{ Bindings: Bindings }>()

const UPLOAD_TYPES = ['avatar', 'background', 'photo', 'music', 'misc'] as const

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

export function buildUploadKey(type: string, file: File, slug: string, albumId: string, extension?: string) {
  const ext = extension || file.name.split('.').pop() || 'bin'
  const timestamp = Date.now()
  if (type === 'avatar' && slug) return `avatars/${slug}_${timestamp}.${ext}`
  if (type === 'music' && slug) return `music/${slug}_${timestamp}.${ext}`
  if (type === 'photo' && albumId) return `photos/${albumId}_${timestamp}_${crypto.randomUUID()}.${ext}`
  if (type === 'background' && slug) return `backgrounds/${slug}_${timestamp}.${ext}`
  return `misc/${timestamp}_${file.name}_${crypto.randomUUID()}`
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
  const type = String(formData.get('type') || '').trim()
  const slug = String(formData.get('slug') || '').trim()
  const albumId = String(formData.get('albumId') || '').trim()

  if (!(UPLOAD_TYPES as readonly string[]).includes(type)) {
    return c.json({ success: false, message: '上传类型无效' }, 400)
  }
  if (['avatar', 'music', 'background'].includes(type) && !slug) {
    return c.json({ success: false, message: '学生标识不能为空' }, 400)
  }
  if (type === 'photo' && !albumId) {
    return c.json({ success: false, message: '相册标识不能为空' }, 400)
  }

  const requiredPermission = ['avatar', 'music', 'background'].includes(type) ? 'students.manage' : 'content.manage'
  if (!hasPermission(admin, requiredPermission)) {
    return c.json({ success: false, message: '当前管理员没有此文件管理权限' }, 403)
  }

  if (!file) {
    return c.json({ success: false, message: '没有文件' }, 400)
  }

  let studentTarget: { avatar_url?: string | null; music_url?: string | null; background_url?: string | null } | null = null
  if (['avatar', 'music', 'background'].includes(type)) {
    studentTarget = await db.prepare(
      'SELECT avatar_url, music_url, background_url FROM students WHERE slug = ?'
    ).bind(slug).first()
    if (!studentTarget) return c.json({ success: false, message: '学生不存在' }, 404)
  }
  if (type === 'photo') {
    const album = await db.prepare('SELECT id FROM albums WHERE id = ?').bind(albumId).first()
    if (!album) return c.json({ success: false, message: '相册不存在' }, 404)
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
  const r2Key = buildUploadKey(type, file, slug, albumId, ext)

  // 3. 上传新文件
  await r2.put(r2Key, imageContents || file.stream(), {
    httpMetadata: { contentType: imageFormat?.mime || file.type },
  })

  // 统一存为相对路径，有利于环境迁移与解耦
  const relativeUrl = `/api/files/${r2Key}`

  // 4. 先让业务数据与审计记录原子提交；批处理失败时补偿删除刚上传的对象。
  let previousKey: string | null = null
  let mutation: D1PreparedStatement | null = null
  let resourceType = 'upload'
  let resourceId = r2Key
  try {
    if (type === 'avatar' && slug) {
      previousKey = fileKeyFromUrl(studentTarget?.avatar_url)
      mutation = db.prepare('UPDATE students SET avatar_url = ? WHERE slug = ?').bind(relativeUrl, slug)
      resourceType = 'student'; resourceId = slug
    }

    if (type === 'music' && slug) {
      previousKey = fileKeyFromUrl(studentTarget?.music_url)
      mutation = db.prepare('UPDATE students SET music_url = ? WHERE slug = ?').bind(relativeUrl, slug)
      resourceType = 'student'; resourceId = slug
    }

    if (type === 'background' && slug) {
      previousKey = fileKeyFromUrl(studentTarget?.background_url)
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
