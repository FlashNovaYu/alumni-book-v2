import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
  JWT_SECRET: string
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256)
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)))
  const saltStr = btoa(String.fromCharCode(...salt))
  return `pbkdf2:${saltStr}:${hash}`
}

export const studentsRoutes = new Hono<{ Bindings: Bindings }>()

// 创建学生
studentsRoutes.post('/students', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()
  const { name, slug } = body

  if (!name || !slug) {
    return c.json({ success: false, message: '姓名和 slug 必填' }, 400)
  }

  const existing = await db.prepare('SELECT id FROM students WHERE slug = ?').bind(slug).first()
  if (existing) {
    return c.json({ success: false, message: 'slug 已存在' }, 409)
  }

  const id = `stu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const info = JSON.stringify({
    name,
    nickname: '',
    gender: '',
    birthday: '',
    school: '',
    class: '',
    studentId: '',
    seatNo: '',
    dormNo: '',
    groupName: '',
    graduationYear: '',
    motto: '',
    bestMemory: '',
    deskmateFun: '',
    classMeme: '',
    futureSelf: '',
    letterToClassmates: ''
  })

  await db.prepare(
    'INSERT INTO students (id, name, slug, info) VALUES (?, ?, ?, ?)'
  ).bind(id, name, slug, info).run()

  return c.json({ success: true, data: { id, name, slug } })
})

// 更新学生
studentsRoutes.put('/students/:slug', async (c) => {
  const slug = c.req.param('slug')
  const db = c.env.DB
  const body = await c.req.json()

  const existing = await db.prepare('SELECT id FROM students WHERE slug = ?').bind(slug).first()
  if (!existing) {
    return c.json({ success: false, message: '学生不存在' }, 404)
  }

  const fields: string[] = []
  const values: any[] = []

  if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name) }
  if (body.isOwner !== undefined) { fields.push('is_owner = ?'); values.push(body.isOwner ? 1 : 0) }
  if (body.avatarUrl !== undefined) { fields.push('avatar_url = ?'); values.push(body.avatarUrl) }
  if (body.musicUrl !== undefined) { fields.push('music_url = ?'); values.push(body.musicUrl) }
  if (body.musicTitle !== undefined) { fields.push('music_title = ?'); values.push(body.musicTitle) }
  if (body.musicAutoplay !== undefined) { fields.push('music_autoplay = ?'); values.push(body.musicAutoplay ? 1 : 0) }
  if (body.backgroundUrl !== undefined) { fields.push('background_url = ?'); values.push(body.backgroundUrl) }
  if (body.backgroundColor !== undefined) { fields.push('background_color = ?'); values.push(body.backgroundColor) }
  if (body.customHtml !== undefined) { fields.push('custom_html = ?'); values.push(body.customHtml) }
  if (body.info?.mbti !== undefined) { fields.push('mbti = ?'); values.push(body.info.mbti) }
  if (body.info?.graduationYear !== undefined) { fields.push('graduation_year = ?'); values.push(body.info.graduationYear) }
  if (body.info?.school !== undefined) { fields.push('school = ?'); values.push(body.info.school) }
  if (body.info?.class !== undefined) { fields.push('class_name = ?'); values.push(body.info.class) }
  if (body.info !== undefined) {
    // 确保整个 info JSON 字符串（包括座位、宿舍、回忆与寄语等新字段）被整体解析和保存到数据库中
    fields.push('info = ?')
    values.push(JSON.stringify(body.info))
  }
  if (body.photos !== undefined) { fields.push('photos = ?'); values.push(JSON.stringify(body.photos)) }
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

  return c.json({ success: true, message: '更新成功' })
})

// 删除学生
studentsRoutes.delete('/students/:slug', async (c) => {
  const slug = c.req.param('slug')
  const db = c.env.DB

  const existing = await db.prepare('SELECT id FROM students WHERE slug = ?').bind(slug).first()
  if (!existing) {
    return c.json({ success: false, message: '学生不存在' }, 404)
  }

  await db.prepare('DELETE FROM students WHERE slug = ?').bind(slug).run()

  return c.json({ success: true, message: '删除成功' })
})
