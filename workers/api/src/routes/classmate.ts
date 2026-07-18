import { Hono } from 'hono'
import { parseLimitedJson } from '../lib/jsonBodyLimit'
import { hashPassword, verifyPassword } from '../lib/password'
import { verifyClassmateSession } from '../lib/classmateSession'
import { validateImageUpload } from '../lib/imageValidation'
import {
  checkAuthRateLimit,
  clearAuthFailures,
  clientIp,
  normalizeAccount,
  rateLimitResponse,
  recordAuthFailure,
} from '../lib/authRateLimit'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
  JWT_SECRET: string
}

export const classmateRoutes = new Hono<{ Bindings: Bindings }>()


const TOKEN_TTL = 30 * 60 * 1000 // 30 分钟

// 从 JWT_SECRET 派生独立密钥，避免密钥重用
let _derivedSecret: string | null = null
async function getClassmateSecret(jwtSecret: string): Promise<string> {
  if (!_derivedSecret) {
    _derivedSecret = await hmacSign('classmate-auth', jwtSecret)
  }
  return _derivedSecret
}

/** base64url 编码 */
function base64url(str: string): string {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** base64url 解码 */
function fromBase64url(str: string): string {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'))
}

/** HMAC-SHA256 签名 */
async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return base64url(String.fromCharCode(...new Uint8Array(sig)))
}

/** 生成 classmate token: base64(slug).base64(ts).base64(HMAC) */
async function generateClassmateToken(slug: string, secret: string): Promise<string> {
  const ts = String(Date.now())
  const a = base64url(slug)
  const b = base64url(ts)
  const c = await hmacSign(`${slug}:${ts}`, secret)
  return `${a}.${b}.${c}`
}

/** 验证 token，成功返回 slug，失败返回 null */
async function verifyClassmateToken(token: string, secret: string): Promise<string | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const slug = fromBase64url(parts[0])
    const ts = parseInt(fromBase64url(parts[1]))

    if (Date.now() - ts > TOKEN_TTL) return null

    const expectedSig = await hmacSign(`${slug}:${ts}`, secret)
    if (expectedSig !== parts[2]) return null

    return slug
  } catch {
    return null
  }
}

/** 从请求头中提取并验证 token */
async function authClassmate(c: any): Promise<string | null> {
  const token = c.req.header('X-Classmate-Token')
  if (!token) return null
  return verifyClassmateSession(c.env.DB, token)
}

// POST /api/classmate/token — 获取编辑凭证
classmateRoutes.post('/classmate/token', async (c) => {
  const db = c.env.DB
  const body = await parseLimitedJson<any>(c, { fallback: {} }) as { name?: string; slug?: string; editSecret?: string }
  const name = String(body.name || '').trim()
  const slug = String(body.slug || '').trim()
  const editSecret = String(body.editSecret || '')

  if (!name || !slug) {
    return c.json({ success: false, message: '姓名和 slug 必填' }, 400)
  }

  const rateLimitKey = {
    route: 'classmate-token',
    ip: clientIp(c.req.raw),
    account: normalizeAccount(slug || name),
  }
  const currentLimit = await checkAuthRateLimit(db, rateLimitKey)
  if (currentLimit.limited) return rateLimitResponse(c, currentLimit)
  const failedToken = async (body: Record<string, unknown>, status: 403 | 404) => {
    const nextLimit = await recordAuthFailure(db, rateLimitKey)
    if (nextLimit.limited) return rateLimitResponse(c, nextLimit)
    return c.json(body, status)
  }

  const student = await db.prepare('SELECT name, edit_secret_hash FROM students WHERE slug = ?').bind(slug).first()
  if (!student) {
    return failedToken({ success: false, message: '同学不存在' }, 404)
  }

  if ((student as any).name !== name) {
    return failedToken({ success: false, message: '姓名不匹配' }, 403)
  }

  const storedHash = (student as any).edit_secret_hash
  if (storedHash) {
    if (!editSecret) {
      return failedToken({ success: false, message: '请输入编辑口令', requireSecret: true }, 403)
    }
    const valid = await verifyPassword(editSecret, storedHash)
    if (!valid) {
      return failedToken({ success: false, message: '口令错误', requireSecret: true }, 403)
    }
  }

  await clearAuthFailures(db, rateLimitKey)
  const token = await generateClassmateToken(slug, await getClassmateSecret(c.env.JWT_SECRET))
  await db.prepare(
    "INSERT INTO classmate_sessions (token, student_slug, expires_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+7 days'))"
  ).bind(token, slug).run()

  return c.json({
    success: true,
    data: {
      token,
      needSetup: !storedHash,
    }
  })
})

// PUT /api/classmate/students/:slug — 自助编辑资料
classmateRoutes.put('/classmate/students/:slug', async (c) => {
  const slug = c.req.param('slug')
  const db = c.env.DB

  const authedSlug = await authClassmate(c)
  if (!authedSlug) {
    return c.json({ success: false, message: '未授权，请先验证身份' }, 401)
  }
  if (authedSlug !== slug) {
    return c.json({ success: false, message: '只能编辑自己的资料' }, 403)
  }

  const body = await parseLimitedJson(c)
  const fields: string[] = []
  const values: any[] = []

  // 仅允许编辑这些字段（禁止 isOwner / customHtml）
  if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name) }
  if (body.avatarUrl !== undefined) { fields.push('avatar_url = ?'); values.push(body.avatarUrl) }
  if (body.musicUrl !== undefined) { fields.push('music_url = ?'); values.push(body.musicUrl) }
  if (body.musicTitle !== undefined) { fields.push('music_title = ?'); values.push(body.musicTitle) }
  if (body.musicAutoplay !== undefined) { fields.push('music_autoplay = ?'); values.push(body.musicAutoplay ? 1 : 0) }
  if (body.backgroundUrl !== undefined) { fields.push('background_url = ?'); values.push(body.backgroundUrl) }
  if (body.backgroundColor !== undefined) { fields.push('background_color = ?'); values.push(body.backgroundColor) }
  if (body.info?.mbti !== undefined) { fields.push('mbti = ?'); values.push(body.info.mbti) }
  if (body.info?.graduationYear !== undefined) { fields.push('graduation_year = ?'); values.push(body.info.graduationYear) }
  if (body.info?.school !== undefined) { fields.push('school = ?'); values.push(body.info.school) }
  if (body.info?.class !== undefined) { fields.push('class_name = ?'); values.push(body.info.class) }
  if (body.info !== undefined) { fields.push('info = ?'); values.push(JSON.stringify(body.info)) }
  if (body.editSecret !== undefined && body.editSecret !== null && body.editSecret !== '') {
    const hash = await hashPassword(body.editSecret)
    fields.push('edit_secret_hash = ?')
    values.push(hash)
    fields.push("edit_secret_updated_at = datetime('now')")
  }
  if (body.privacyLevel !== undefined) {
    fields.push('privacy_level = ?')
    values.push(body.privacyLevel)
  }

  if (fields.length === 0) {
    return c.json({ success: false, message: '没有要更新的字段' }, 400)
  }

  fields.push("updated_at = datetime('now')")
  values.push(slug)

  await db.prepare(`UPDATE students SET ${fields.join(', ')} WHERE slug = ?`).bind(...values).run()

  return c.json({ success: true, message: '保存成功' })
})

const MAX_SIZES: Record<string, number> = {
  avatar: 2 * 1024 * 1024,      // 2MB
  background: 5 * 1024 * 1024,  // 5MB
}

const ALLOWED_MIMES: Record<string, string[]> = {
  avatar: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  background: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
}

function fileKeyFromUrl(url: string | null | undefined) {
  const parts = String(url || '').split('/api/files/')
  return parts.length === 2 ? parts[1] : null
}

// POST /api/classmate/upload — 自助上传头像/背景图
classmateRoutes.post('/classmate/upload', async (c) => {
  const db = c.env.DB
  const r2 = c.env.R2

  if (!r2) {
    return c.json({ success: false, message: '文件存储未启用' }, 503)
  }

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const type = formData.get('type') as string
  const slug = formData.get('slug') as string

  // 仅允许 avatar 和 background
  if (type !== 'avatar' && type !== 'background') {
    return c.json({ success: false, message: '不允许的上传类型' }, 400)
  }

  const authedSlug = await authClassmate(c)
  if (!authedSlug) {
    return c.json({ success: false, message: '未授权' }, 401)
  }
  if (authedSlug !== slug) {
    return c.json({ success: false, message: '只能编辑自己的资料' }, 403)
  }

  if (!file) {
    return c.json({ success: false, message: '没有文件' }, 400)
  }

  // 1. 验证大小
  const maxBytes = MAX_SIZES[type]
  if (file.size > maxBytes) {
    return c.json({ success: false, message: '文件体积超出限制' }, 413)
  }

  // 2. 验证 MIME 类型
  const allowed = ALLOWED_MIMES[type]
  if (!allowed.includes(file.type)) {
    return c.json({ success: false, message: '不支持的文件格式' }, 400)
  }

  const imageContents = await file.arrayBuffer()
  const imageFormat = validateImageUpload(file.type, imageContents)
  if (!imageFormat) {
    return c.json({ success: false, message: '图片内容与文件格式不一致' }, 400)
  }

  const timestamp = Date.now()
  const r2Key = type === 'avatar'
    ? `avatars/${slug}_${timestamp}.${imageFormat.extension}`
    : `backgrounds/${slug}_${timestamp}.${imageFormat.extension}`

  const urlColumn = type === 'avatar' ? 'avatar_url' : 'background_url'
  const existing = await db.prepare(`SELECT ${urlColumn}, media_json FROM students WHERE slug = ?`).bind(slug).first() as any
  const oldKey = fileKeyFromUrl(existing?.[urlColumn])
  let oldVariantKeys: string[] = []
  try { oldVariantKeys = JSON.parse(String(existing?.media_json || '{}')).variants?.map((item: any) => item.key) || [] } catch { oldVariantKeys = [] }

  // 3. 上传新文件到 R2
  await r2.put(r2Key, imageContents, {
    httpMetadata: { contentType: imageFormat.mime },
  })

  // 统一存为相对路径，有利于环境迁移与解耦
  const relativeUrl = `/api/files/${r2Key}`

  // 4. Commit the pointer first. If D1 fails, preserve the old object and
  // compensate the newly uploaded object; only successful commits retire it.
  try {
    await db.prepare(`UPDATE students SET ${urlColumn} = ?, media_json = ?, updated_at = datetime('now') WHERE slug = ?`)
      .bind(relativeUrl, JSON.stringify({ variants: [] }), slug).run()
  } catch (error) {
    await r2.delete(r2Key).catch(() => undefined)
    return c.json({ success: false, message: '文件记录保存失败，请重试' }, 500)
  }
  if (oldKey && oldKey !== r2Key) {
    await r2.delete(oldKey).catch((error) => {
      console.error('Failed to delete old file from R2:', error)
    })
  }
  if (oldVariantKeys.length) await Promise.all(oldVariantKeys.map((key) => r2.delete(key).catch(() => undefined)))

  const origin = new URL(c.req.url).origin
  const absoluteUrl = `${origin}${relativeUrl}`

  return c.json({ success: true, data: { url: absoluteUrl, r2Key } })
})

