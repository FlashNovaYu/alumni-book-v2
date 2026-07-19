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

const VARIANT_LIMIT = 5
const VARIANT_MAX_TOTAL = 8 * 1024 * 1024
const VARIANT_PREFIX: Record<string, string> = {
  avatar: 'avatars/', background: 'backgrounds/', photo: 'photos/', music: 'music/', misc: 'misc/',
}

type UploadVariant = { key: string; contentType: string; width: number; height: number; kind: string }
type StudentMediaJson = Record<'avatar' | 'background' | 'music', { variants: UploadVariant[] } | undefined>

function parseStudentMediaJson(raw: string | null | undefined): StudentMediaJson {
  try {
    const value = JSON.parse(String(raw || '{}'))
    if (Array.isArray(value?.variants)) return { avatar: { variants: value.variants }, background: undefined, music: undefined }
    return { avatar: value?.avatar, background: value?.background, music: value?.music }
  } catch { return { avatar: undefined, background: undefined, music: undefined } }
}

export async function parseUploadVariants(formData: FormData, type: string, target = ''): Promise<{ metadata: UploadVariant[]; files: Array<{ metadata: UploadVariant; file: File }> } | { error: string }> {
  const raw = formData.get('variants')
  if (!raw) return { metadata: [], files: [] }
  let parsed: unknown
  try { parsed = JSON.parse(String(raw)) } catch { return { error: '变体元数据无效' } }
  if (!Array.isArray(parsed) || parsed.length > VARIANT_LIMIT) return { error: '图片变体数量超出限制' }
  const metadata: UploadVariant[] = []
  const files: Array<{ metadata: UploadVariant; file: File }> = []
  const kinds = new Set<string>()
  const keys = new Set<string>()
  let total = 0
  for (const item of parsed) {
    const value = item as Partial<UploadVariant> & { size?: number }
    const key = String(value.key || '')
    const contentType = String(value.contentType || '')
    const kind = String(value.kind || '')
    const width = Number(value.width)
    const height = Number(value.height)
    if (!key || key.length > 512 || key.includes('..') || !key.startsWith(VARIANT_PREFIX[type]) || (target && !key.startsWith(`${VARIANT_PREFIX[type]}${target}_`)) || !/^image\/(?:webp|jpeg|jpg|png)$/.test(contentType) || !['128', '256', '320', '960'].includes(kind) || kinds.has(kind) || keys.has(key) || !Number.isInteger(width) || width < 1 || width > Number(kind) || !Number.isInteger(height) || height < 1 || height > 10000) {
      return { error: '图片变体元数据无效' }
    }
    const file = formData.get(`variant_${kind}`)
    if (!(file instanceof File)) return { error: `缺少图片变体文件: ${kind}` }
    const expectedType = normalizedContentType(contentType)
    if (file.size > 4 * 1024 * 1024 || file.type !== expectedType || !validateImageUpload(expectedType, await file.arrayBuffer())) return { error: '图片变体过大或格式不匹配' }
    total += file.size
    if (total > VARIANT_MAX_TOTAL) return { error: '图片变体总大小超出限制' }
    const normalized = { key, contentType: contentType === 'image/jpg' ? 'image/jpeg' : contentType, width, height, kind }
    kinds.add(kind)
    keys.add(key)
    metadata.push(normalized)
    files.push({ metadata: normalized, file })
  }
  return { metadata, files }
}

function normalizedContentType(value: string) { return value === 'image/jpg' ? 'image/jpeg' : value }

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
  const parsedVariants = await parseUploadVariants(formData, type, albumId || slug)
  if ('error' in parsedVariants) return c.json({ success: false, message: parsedVariants.error }, 400)
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

  let studentTarget: { avatar_url?: string | null; music_url?: string | null; background_url?: string | null; media_json?: string | null } | null = null
  if (['avatar', 'music', 'background'].includes(type)) {
    studentTarget = await db.prepare(
      'SELECT avatar_url, music_url, background_url, media_json FROM students WHERE slug = ?'
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
  const variantKeys = parsedVariants.metadata.map((variant) => variant.key)
  for (const key of variantKeys) if (await r2.head(key)) return c.json({ success: false, message: '图片变体键已存在' }, 409)

  // 3. 上传新文件
  const uploadedKeys: string[] = [r2Key]
  try {
    await r2.put(r2Key, imageContents || file.stream(), { httpMetadata: { contentType: imageFormat?.mime || file.type } })
    for (const variant of parsedVariants.files) {
      await r2.put(variant.metadata.key, variant.file.stream(), { httpMetadata: { contentType: variant.metadata.contentType } })
      uploadedKeys.push(variant.metadata.key)
    }
  } catch {
    await Promise.all(uploadedKeys.map((key) => r2.delete(key).catch(() => undefined)))
    return c.json({ success: false, message: '文件上传失败，请重试' }, 500)
  }

  // 统一存为相对路径，有利于环境迁移与解耦
  const relativeUrl = `/api/files/${r2Key}`

  // 4. 先让业务数据与审计记录原子提交；批处理失败时补偿删除刚上传的对象。
  let previousKey: string | null = null
  let previousVariantKeys: string[] = []
  let mutation: D1PreparedStatement | null = null
  let resourceType = 'upload'
  let resourceId = r2Key
  try {
    if (type === 'avatar' && slug) {
      previousKey = fileKeyFromUrl(studentTarget?.avatar_url)
      const media = parseStudentMediaJson(studentTarget?.media_json); previousVariantKeys = media.avatar?.variants.map((item) => item.key) || []; media.avatar = { variants: parsedVariants.metadata }
      mutation = db.prepare('UPDATE students SET avatar_url = ?, media_json = ? WHERE slug = ?').bind(relativeUrl, JSON.stringify(media), slug)
      resourceType = 'student'; resourceId = slug
    }

    if (type === 'music' && slug) {
      previousKey = fileKeyFromUrl(studentTarget?.music_url)
      const media = parseStudentMediaJson(studentTarget?.media_json); previousVariantKeys = media.music?.variants.map((item) => item.key) || []; media.music = { variants: parsedVariants.metadata }
      mutation = db.prepare('UPDATE students SET music_url = ?, media_json = ? WHERE slug = ?').bind(relativeUrl, JSON.stringify(media), slug)
      resourceType = 'student'; resourceId = slug
    }

    if (type === 'background' && slug) {
      previousKey = fileKeyFromUrl(studentTarget?.background_url)
      const media = parseStudentMediaJson(studentTarget?.media_json); previousVariantKeys = media.background?.variants.map((item) => item.key) || []; media.background = { variants: parsedVariants.metadata }
      mutation = db.prepare('UPDATE students SET background_url = ?, media_json = ? WHERE slug = ?').bind(relativeUrl, JSON.stringify(media), slug)
      resourceType = 'student'; resourceId = slug
    }

    if (type === 'photo' && albumId) {
      const photoId = `photo_${timestamp}_${Math.random().toString(36).slice(2, 6)}`
      mutation = db.prepare(
        'INSERT INTO photos (id, album_id, filename, r2_key, media_json) VALUES (?, ?, ?, ?, ?)'
      ).bind(photoId, albumId, file.name, r2Key, JSON.stringify({ variants: parsedVariants.metadata }))
      resourceType = 'photo'; resourceId = photoId
    }

    await runAuditedBatch(db, admin.id, mutation ? [mutation] : [], {
      action: 'file.upload', resourceType, resourceId, after: { type, filename: file.name, r2Key },
    })
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => r2.delete(key).catch(() => undefined)))
    return c.json({ success: false, message: '文件记录保存失败，请重试' }, 500)
  }
  if (previousKey && previousKey !== r2Key) {
    await r2.delete(previousKey).catch(() => undefined)
  }
  if (previousVariantKeys.length) await Promise.all(previousVariantKeys.filter((key) => !variantKeys.includes(key)).map((key) => r2.delete(key).catch(() => undefined)))

  const origin = new URL(c.req.url).origin
  const absoluteUrl = `${origin}${relativeUrl}`

  return c.json({ success: true, data: { url: absoluteUrl, r2Key, ...(parsedVariants.metadata.length ? { variants: parsedVariants.metadata } : {}) } })
})
