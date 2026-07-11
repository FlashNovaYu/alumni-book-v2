import { Hono } from 'hono'
import { hashPassword, verifyPassword } from '../lib/password'
import { getAdminPrincipal, loadActiveAdmin, requireAdminSession } from '../lib/adminAuth'
import { verifyClassmateSession } from '../lib/classmateSession'
import { runAuditedBatch } from '../lib/adminAudit'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

type TokenPayload = {
  kind: 'admin' | 'admin_setup'
  adminAccountId?: string
  nonce?: string
  iat: number
  exp: number
}

const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60
const ADMIN_SETUP_TTL_SECONDS = 10 * 60

export const authRoutes = new Hono<{ Bindings: Bindings }>()

function base64urlEncode(value: string): string {
  return btoa(value).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64urlDecode(value: string): string {
  return atob(value.replace(/-/g, '+').replace(/_/g, '/'))
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return base64urlEncode(String.fromCharCode(...new Uint8Array(signature)))
}

async function createToken(
  payload: Omit<TokenPayload, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64urlEncode(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }))
  return `${header}.${body}.${await sign(`${header}.${body}`, secret)}`
}

async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  try {
    const [header, body, signature] = token.split('.')
    if (!header || !body || !signature) return null
    if (await sign(`${header}.${body}`, secret) !== signature) return null
    const payload = JSON.parse(base64urlDecode(body)) as TokenPayload
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

async function createAdminSession(db: D1Database, accountId: string, secret: string): Promise<string> {
  const token = await createToken(
    { kind: 'admin', adminAccountId: accountId, nonce: crypto.randomUUID() },
    secret,
    ADMIN_SESSION_TTL_SECONDS,
  )
  await db.prepare(
    "INSERT INTO admin_sessions (token, admin_account_id, expires_at) VALUES (?, ?, datetime('now', '+8 hours'))"
  ).bind(token, accountId).run()
  return token
}

async function legacyPasswordIsValid(db: D1Database, password: string): Promise<boolean> {
  const config = await db.prepare("SELECT value FROM site_config WHERE key = 'admin_password'").first<{ value: string }>()
  return config ? verifyPassword(password, config.value) : password === 'admin888'
}

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { username?: string; password?: string }
  const owner = await c.env.DB.prepare(
    'SELECT id FROM admin_accounts WHERE is_owner = 1 AND status = \'active\''
  ).first<{ id: string }>()

  if (!owner) {
    const password = String(body.password || '')
    if (!password || !(await legacyPasswordIsValid(c.env.DB, password))) {
      return c.json({ success: false, message: '管理密码错误' }, 401)
    }
    const setupToken = await createToken({ kind: 'admin_setup' }, c.env.JWT_SECRET, ADMIN_SETUP_TTL_SECONDS)
    return c.json({ success: true, data: { setupToken } })
  }

  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  if (!username || !password) return c.json({ success: false, message: '用户名和密码必填' }, 400)

  const account = await c.env.DB.prepare(
    `SELECT id, password_hash FROM admin_accounts
     WHERE username = ? AND account_type = 'standalone' AND status = 'active'`
  ).bind(username).first<{ id: string; password_hash: string }>()
  if (!account || !(await verifyPassword(password, account.password_hash))) {
    return c.json({ success: false, message: '用户名或密码错误' }, 401)
  }

  await c.env.DB.prepare(
    "UPDATE admin_accounts SET last_login_at = datetime('now') WHERE id = ?"
  ).bind(account.id).run()
  const token = await createAdminSession(c.env.DB, account.id, c.env.JWT_SECRET)
  return c.json({ success: true, data: { token, admin: await loadActiveAdmin(c.env.DB, account.id) } })
})

authRoutes.post('/setup', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    setupToken?: string; username?: string; displayName?: string; password?: string; confirmPassword?: string
  }
  const setup = body.setupToken ? await verifyToken(body.setupToken, c.env.JWT_SECRET) : null
  if (!setup || setup.kind !== 'admin_setup') return c.json({ success: false, message: '初始化凭据无效或已过期' }, 401)

  const username = String(body.username || '').trim()
  const displayName = String(body.displayName || '').trim()
  const password = String(body.password || '')
  if (username.length < 3 || displayName.length < 1 || password.length < 8) {
    return c.json({ success: false, message: '用户名至少 3 位，新密码至少 8 位，显示名不能为空' }, 400)
  }
  if (password !== body.confirmPassword) return c.json({ success: false, message: '两次输入的新密码不一致' }, 400)

  const owner = await c.env.DB.prepare('SELECT id FROM admin_accounts WHERE is_owner = 1').first()
  if (owner) return c.json({ success: false, message: '主管理员已初始化' }, 409)
  const duplicate = await c.env.DB.prepare('SELECT id FROM admin_accounts WHERE username = ?').bind(username).first()
  if (duplicate) return c.json({ success: false, message: '用户名已存在' }, 409)

  const id = `adm_${crypto.randomUUID()}`
  const passwordHash = await hashPassword(password)
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO admin_accounts
        (id, account_type, username, display_name, password_hash, role_id, is_owner)
       VALUES (?, 'standalone', ?, ?, ?, 'owner', 1)`
    ).bind(id, username, displayName, passwordHash),
    c.env.DB.prepare('DELETE FROM admin_sessions'),
  ])

  return c.json({ success: true, message: '主管理员初始化完成' })
})

authRoutes.post('/classmate-exchange', async (c) => {
  const studentSlug = await verifyClassmateSession(c.env.DB, c.req.header('X-Classmate-Token'))
  if (!studentSlug) return c.json({ success: false, message: '同学登录已失效' }, 401)

  const account = await c.env.DB.prepare(
    `SELECT a.id FROM admin_accounts a
     INNER JOIN students s ON s.slug = a.student_slug
     WHERE a.account_type = 'classmate_linked' AND a.student_slug = ? AND a.status = 'active' AND a.is_owner = 0
       AND s.account_status != 'locked' AND s.account_initial_password_changed = 1 AND s.account_password_hash IS NOT NULL`
  ).bind(studentSlug).first<{ id: string }>()
  if (!account) return c.json({ success: false, message: '当前同学账号没有可用的管理权限' }, 403)

  const token = await createAdminSession(c.env.DB, account.id, c.env.JWT_SECRET)
  return c.json({ success: true, data: { token, admin: await loadActiveAdmin(c.env.DB, account.id) } })
})

authRoutes.get('/me', requireAdminSession, async (c) => {
  return c.json({ success: true, data: { admin: getAdminPrincipal(c) } })
})

authRoutes.get('/verify', requireAdminSession, async (c) => {
  return c.json({ success: true, data: { admin: getAdminPrincipal(c) } })
})

authRoutes.post('/change-password', requireAdminSession, async (c) => {
  const principal = getAdminPrincipal(c)
  if (!principal || principal.accountType !== 'standalone') {
    return c.json({ success: false, message: '绑定同学账号不能在此修改密码' }, 400)
  }
  const body = await c.req.json().catch(() => ({})) as { oldPassword?: string; newPassword?: string; confirmPassword?: string }
  const oldPassword = String(body.oldPassword || '')
  const newPassword = String(body.newPassword || '')
  if (newPassword.length < 8 || newPassword !== body.confirmPassword) {
    return c.json({ success: false, message: '新密码至少 8 位且两次输入必须一致' }, 400)
  }
  const account = await c.env.DB.prepare('SELECT password_hash FROM admin_accounts WHERE id = ?').bind(principal.id).first<{ password_hash: string }>()
  if (!account || !(await verifyPassword(oldPassword, account.password_hash))) {
    return c.json({ success: false, message: '原密码错误' }, 403)
  }
  const currentToken = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '')
  await runAuditedBatch(c.env.DB, principal.id, [
    c.env.DB.prepare(
      "UPDATE admin_accounts SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?"
    ).bind(await hashPassword(newPassword), principal.id),
    c.env.DB.prepare(
      "UPDATE admin_sessions SET revoked_at = datetime('now') WHERE admin_account_id = ? AND token != ? AND revoked_at IS NULL"
    ).bind(principal.id, currentToken || ''),
  ], { action: 'admin_account.change_password', resourceType: 'admin_account', resourceId: principal.id, after: { sessionsRevoked: true } })
  return c.json({ success: true, message: '密码已更新' })
})

authRoutes.post('/logout', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '')
  if (token) {
    await c.env.DB.prepare("UPDATE admin_sessions SET revoked_at = datetime('now') WHERE token = ?").bind(token).run()
  }
  return c.json({ success: true, message: '已注销' })
})
