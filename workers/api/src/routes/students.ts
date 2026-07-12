import { Hono } from 'hono'
import { hashPassword } from '../lib/password'
import { getAdminPrincipal } from '../lib/adminAuth'
import { runAuditedBatch } from '../lib/adminAudit'

type Bindings = {
  DB: D1Database
  R2: R2Bucket
  JWT_SECRET: string
}

export const studentsRoutes = new Hono<{ Bindings: Bindings }>()


// 创建学生
studentsRoutes.post('/students', async (c) => {
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
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
  const initialPasswordHash = await hashPassword('123456')

  await runAuditedBatch(db, admin.id, [db.prepare(
    `INSERT INTO students (
      id, name, slug, info,
      account_password_hash,
      account_initial_password_changed,
      account_status
    ) VALUES (?, ?, ?, ?, ?, 0, 'pending')`
  ).bind(id, name, slug, info, initialPasswordHash)], {
    action: 'student.create',
    resourceType: 'student',
    resourceId: slug,
    after: { name, slug },
  })

  return c.json({ success: true, data: { id, name, slug } })
})

// 更新学生
studentsRoutes.put('/students/:slug', async (c) => {
  const slug = c.req.param('slug')
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const body = await c.req.json()

  const existing = await db.prepare('SELECT * FROM students WHERE slug = ?').bind(slug).first()
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
  if (body.accountInitialPassword !== undefined && body.accountInitialPassword !== null && body.accountInitialPassword !== '') {
    const hash = await hashPassword(body.accountInitialPassword)
    fields.push('account_password_hash = ?')
    values.push(hash)
    fields.push('account_initial_password_changed = 0')
    fields.push("account_status = 'pending'")
  }

  if (fields.length === 0) {
    return c.json({ success: false, message: '没有要更新的字段' }, 400)
  }

  fields.push("updated_at = datetime('now')")
  values.push(slug)

  const mutations: D1PreparedStatement[] = [db.prepare(`UPDATE students SET ${fields.join(', ')} WHERE slug = ?`).bind(...values)]
  if (body.accountInitialPassword !== undefined && body.accountInitialPassword !== null && body.accountInitialPassword !== '') {
    mutations.push(
      db.prepare('DELETE FROM classmate_sessions WHERE student_slug = ?').bind(slug),
      db.prepare(
        `UPDATE admin_sessions SET revoked_at = datetime('now')
         WHERE admin_account_id IN (SELECT id FROM admin_accounts WHERE account_type = 'classmate_linked' AND student_slug = ?)
           AND revoked_at IS NULL`
      ).bind(slug),
    )
  }
  await runAuditedBatch(db, admin.id, mutations, { action: 'student.update', resourceType: 'student', resourceId: slug, before: { name: (existing as any).name }, after: { changedFields: Object.keys(body).filter(key => !key.toLowerCase().includes('password') && key !== 'editSecret'), sessionsRevoked: mutations.length > 1 } })

  return c.json({ success: true, message: '更新成功' })
})

// 删除学生
studentsRoutes.delete('/students/:slug', async (c) => {
  const slug = c.req.param('slug')
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const { reason } = await c.req.json().catch(() => ({}))
  const cleanReason = String(reason || '').trim()
  if (!cleanReason) return c.json({ success: false, message: '删除学生档案时请填写原因' }, 400)

  const existing = await db.prepare('SELECT id FROM students WHERE slug = ?').bind(slug).first()
  if (!existing) {
    return c.json({ success: false, message: '学生不存在' }, 404)
  }

  await runAuditedBatch(db, admin.id, [db.prepare('DELETE FROM students WHERE slug = ?').bind(slug)], { action: 'student.delete', resourceType: 'student', resourceId: slug, reason: cleanReason, before: existing })

  return c.json({ success: true, message: '删除成功' })
})
