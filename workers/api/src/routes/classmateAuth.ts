// workers/api/src/routes/classmateAuth.ts
// CCSwitch: 同学账号登录、获取当前身份、首次登录改密与登出的核心 API 路由实现。

import { Hono } from 'hono'
import { hashPassword, verifyPassword } from '../lib/password'
import { createClassmateSession, deleteClassmateSession, verifyClassmateSession } from '../lib/classmateSession'
import { normalizeFileUrl } from '../lib/fileUrl'
import { loadActiveAdmin } from '../lib/adminAuth'
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
  JWT_SECRET: string
}

export const classmateAuthRoutes = new Hono<{ Bindings: Bindings }>()

classmateAuthRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { slug?: string; password?: string }
  const slug = String(body.slug || '').trim()
  const password = String(body.password || '')
  if (!slug || !password) return c.json({ success: false, message: '账号和密码必填' }, 400)

  const rateLimitKey = {
    route: 'classmate-login',
    ip: clientIp(c.req.raw),
    account: normalizeAccount(slug),
  }
  const currentLimit = await checkAuthRateLimit(c.env.DB, rateLimitKey)
  if (currentLimit.limited) return rateLimitResponse(c, currentLimit)
  const failedLogin = async () => {
    const nextLimit = await recordAuthFailure(c.env.DB, rateLimitKey)
    if (nextLimit.limited) return rateLimitResponse(c, nextLimit)
    return c.json({ success: false, message: '账号或密码错误' }, 401)
  }

  const student = await c.env.DB.prepare(
    'SELECT name, slug, avatar_url, account_password_hash, account_initial_password_changed, account_status FROM students WHERE slug = ? OR name = ?'
  ).bind(slug, slug).first() as any

  if (!student || student.account_status === 'locked') {
    return failedLogin()
  }
  if (!student.account_password_hash) {
    return c.json({ success: false, message: '账号尚未初始化，请联系管理员' }, 403)
  }

  const valid = await verifyPassword(password, student.account_password_hash)
  if (!valid) return failedLogin()

  await clearAuthFailures(c.env.DB, rateLimitKey)
  const token = await createClassmateSession(c.env.DB, student.slug, c.env.JWT_SECRET)
  await c.env.DB.prepare(
    "UPDATE students SET account_last_login_at = datetime('now'), account_status = CASE WHEN account_status = 'pending' THEN 'active' ELSE account_status END WHERE slug = ?"
  ).bind(student.slug).run()

  return c.json({
    success: true,
    data: {
      token,
      mustChangePassword: !student.account_initial_password_changed,
      student: { name: student.name, slug: student.slug, avatarUrl: normalizeFileUrl(student.avatar_url) },
    },
  })
})

classmateAuthRoutes.get('/me', async (c) => {
  const token = c.req.header('X-Classmate-Token')
  const slug = await verifyClassmateSession(c.env.DB, token)
  if (!slug) return c.json({ success: false, message: '登录已失效' }, 401)
  const row = await c.env.DB.prepare(
    'SELECT name, slug, avatar_url, account_initial_password_changed, account_status FROM students WHERE slug = ?'
  ).bind(slug).first() as any
  return c.json({
    success: true,
    data: {
      student: { name: row.name, slug: row.slug, avatarUrl: normalizeFileUrl(row.avatar_url) },
      mustChangePassword: !row.account_initial_password_changed,
    },
  })
})

classmateAuthRoutes.get('/admin-entry', async (c) => {
  const slug = await verifyClassmateSession(c.env.DB, c.req.header('X-Classmate-Token'))
  if (!slug) return c.json({ success: false, message: '登录已失效' }, 401)
  const account = await c.env.DB.prepare(
    `SELECT a.id FROM admin_accounts a
     INNER JOIN students s ON s.slug = a.student_slug
     WHERE a.account_type = 'classmate_linked' AND a.student_slug = ? AND a.status = 'active' AND a.is_owner = 0
       AND s.account_status != 'locked' AND s.account_initial_password_changed = 1 AND s.account_password_hash IS NOT NULL`
  ).bind(slug).first<{ id: string }>()
  if (!account) return c.json({ success: true, data: { available: false } })
  const admin = await loadActiveAdmin(c.env.DB, account.id)
  if (!admin) return c.json({ success: true, data: { available: false } })
  return c.json({ success: true, data: { available: true, displayName: admin.displayName, permissions: admin.permissions } })
})

classmateAuthRoutes.post('/change-password', async (c) => {
  const token = c.req.header('X-Classmate-Token')
  const slug = await verifyClassmateSession(c.env.DB, token)
  if (!slug) return c.json({ success: false, message: '登录已失效' }, 401)

  const { oldPassword, newPassword } = await c.req.json()
  if (!oldPassword || !newPassword) return c.json({ success: false, message: '原密码和新密码必填' }, 400)
  if (String(newPassword).length < 8) return c.json({ success: false, message: '新密码至少 8 位' }, 400)

  const row = await c.env.DB.prepare('SELECT account_password_hash FROM students WHERE slug = ?').bind(slug).first() as any
  const valid = await verifyPassword(oldPassword, row.account_password_hash)
  if (!valid) return c.json({ success: false, message: '原密码错误' }, 403)

  const nextHash = await hashPassword(newPassword)
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE students SET account_password_hash = ?, account_initial_password_changed = 1, account_status = 'active', updated_at = datetime('now') WHERE slug = ?"
    ).bind(nextHash, slug),
    c.env.DB.prepare('DELETE FROM classmate_sessions WHERE student_slug = ? AND token != ?').bind(slug, token || ''),
    c.env.DB.prepare(
      `UPDATE admin_sessions SET revoked_at = datetime('now')
       WHERE admin_account_id IN (SELECT id FROM admin_accounts WHERE account_type = 'classmate_linked' AND student_slug = ?)
         AND revoked_at IS NULL`
    ).bind(slug),
  ])

  return c.json({ success: true, message: '密码已更新' })
})

classmateAuthRoutes.post('/logout', async (c) => {
  const token = c.req.header('X-Classmate-Token')
  if (token) await deleteClassmateSession(c.env.DB, token)
  return c.json({ success: true })
})
