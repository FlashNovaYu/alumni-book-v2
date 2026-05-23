import { Hono } from 'hono'

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
async function authClassmate(c: any, secret: string): Promise<string | null> {
  const token = c.req.header('X-Classmate-Token')
  if (!token) return null
  return verifyClassmateToken(token, secret)
}

// POST /api/classmate/token — 获取编辑凭证
classmateRoutes.post('/classmate/token', async (c) => {
  const db = c.env.DB
  const { name, slug } = await c.req.json()

  if (!name || !slug) {
    return c.json({ success: false, message: '姓名和 slug 必填' }, 400)
  }

  const student = await db.prepare('SELECT name FROM students WHERE slug = ?').bind(slug).first()
  if (!student) {
    return c.json({ success: false, message: '同学不存在' }, 404)
  }

  if ((student as any).name !== name) {
    return c.json({ success: false, message: '姓名不匹配' }, 403)
  }

  const token = await generateClassmateToken(slug, await getClassmateSecret(c.env.JWT_SECRET))
  return c.json({ success: true, data: { token } })
})

// PUT /api/classmate/students/:slug — 自助编辑资料
classmateRoutes.put('/classmate/students/:slug', async (c) => {
  const slug = c.req.param('slug')
  const db = c.env.DB

  const authedSlug = await authClassmate(c, await getClassmateSecret(c.env.JWT_SECRET))
  if (!authedSlug) {
    return c.json({ success: false, message: '未授权，请先验证身份' }, 401)
  }
  if (authedSlug !== slug) {
    return c.json({ success: false, message: '只能编辑自己的资料' }, 403)
  }

  const body = await c.req.json()
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

  if (fields.length === 0) {
    return c.json({ success: false, message: '没有要更新的字段' }, 400)
  }

  fields.push("updated_at = datetime('now')")
  values.push(slug)

  await db.prepare(`UPDATE students SET ${fields.join(', ')} WHERE slug = ?`).bind(...values).run()

  return c.json({ success: true, message: '保存成功' })
})

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

  const authedSlug = await authClassmate(c, await getClassmateSecret(c.env.JWT_SECRET))
  if (!authedSlug) {
    return c.json({ success: false, message: '未授权' }, 401)
  }
  if (authedSlug !== slug) {
    return c.json({ success: false, message: '只能编辑自己的资料' }, 403)
  }

  if (!file) {
    return c.json({ success: false, message: '没有文件' }, 400)
  }

  const ext = file.name.split('.').pop() || 'bin'
  const timestamp = Date.now()
  const r2Key = type === 'avatar'
    ? `avatars/${slug}_${timestamp}.${ext}`
    : `backgrounds/${slug}_${timestamp}.${ext}`

  await r2.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })

  const origin = new URL(c.req.url).origin
  const publicUrl = `${origin}/api/files/${r2Key}`

  const col = type === 'avatar' ? 'avatar_url' : 'background_url'
  await db.prepare(`UPDATE students SET ${col} = ?, updated_at = datetime('now') WHERE slug = ?`)
    .bind(publicUrl, slug).run()

  return c.json({ success: true, data: { url: publicUrl, r2Key } })
})
