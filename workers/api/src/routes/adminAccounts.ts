import { Hono } from 'hono'
import { ADMIN_PERMISSIONS, getAdminPrincipal, type AdminPermission } from '../lib/adminAuth'
import { runAuditedBatch } from '../lib/adminAudit'
import { hashPassword } from '../lib/password'

type Bindings = { DB: D1Database; JWT_SECRET: string }
type Override = { permission: AdminPermission; effect: 'allow' | 'deny' }

const SECONDARY_ROLES = new Set(['content_admin', 'moderator', 'operator'])
export const adminAccountsRoutes = new Hono<{ Bindings: Bindings }>()

function validOverrides(value: unknown): Override[] | null {
  if (!Array.isArray(value)) return []
  const overrides: Override[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const { permission, effect } = item as Override
    if (!(ADMIN_PERMISSIONS as readonly string[]).includes(permission) || (effect !== 'allow' && effect !== 'deny')) return null
    overrides.push({ permission, effect })
  }
  return overrides
}

adminAccountsRoutes.get('/admin/accounts', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, account_type, username, display_name, student_slug, role_id, status, is_owner, must_change_password, last_login_at, created_at
     FROM admin_accounts ORDER BY is_owner DESC, created_at ASC`
  ).all()
  return c.json({
    success: true,
    data: (results || []).map((row: any) => ({
      id: row.id,
      accountType: row.account_type,
      username: row.username || null,
      displayName: row.display_name,
      studentSlug: row.student_slug || null,
      roleId: row.role_id,
      status: row.status,
      isOwner: !!row.is_owner,
      mustChangePassword: !!row.must_change_password,
      lastLoginAt: row.last_login_at || null,
      createdAt: row.created_at,
      canDisable: !row.is_owner,
    })),
  })
})

adminAccountsRoutes.get('/admin/account-candidates', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.name, s.slug, s.avatar_url AS avatarUrl
     FROM students s
     LEFT JOIN admin_accounts a ON a.student_slug = s.slug
     WHERE a.id IS NULL
     ORDER BY s.name`
  ).all()
  return c.json({ success: true, data: results || [] })
})

adminAccountsRoutes.post('/admin/accounts', async (c) => {
  const principal = getAdminPrincipal(c)
  if (!principal) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const body = await c.req.json().catch(() => ({})) as any
  const accountType = body.accountType
  const displayName = String(body.displayName || '').trim()
  const roleId = String(body.roleId || '')
  const overrides = validOverrides(body.permissionOverrides)
  if (!displayName || !SECONDARY_ROLES.has(roleId) || !overrides) {
    return c.json({ success: false, message: '管理员资料、角色或权限覆盖无效' }, 400)
  }

  const id = `adm_${crypto.randomUUID()}`
  const statements: D1PreparedStatement[] = []
  let auditAfter: Record<string, unknown>
  if (accountType === 'standalone') {
    const username = String(body.username || '').trim()
    const initialPassword = String(body.initialPassword || '')
    if (username.length < 3 || initialPassword.length < 8) {
      return c.json({ success: false, message: '用户名至少 3 位，初始密码至少 8 位' }, 400)
    }
    const exists = await c.env.DB.prepare('SELECT id FROM admin_accounts WHERE username = ?').bind(username).first()
    if (exists) return c.json({ success: false, message: '用户名已存在' }, 409)
    statements.push(c.env.DB.prepare(
      `INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id, must_change_password)
       VALUES (?, 'standalone', ?, ?, ?, ?, 1)`
    ).bind(id, username, displayName, await hashPassword(initialPassword), roleId))
    auditAfter = { accountType, username, displayName, roleId }
  } else if (accountType === 'classmate_linked') {
    const studentSlug = String(body.studentSlug || '').trim()
    const student = await c.env.DB.prepare('SELECT slug FROM students WHERE slug = ?').bind(studentSlug).first()
    if (!student) return c.json({ success: false, message: '绑定的同学账号不存在' }, 404)
    statements.push(c.env.DB.prepare(
      `INSERT INTO admin_accounts (id, account_type, display_name, student_slug, role_id)
       VALUES (?, 'classmate_linked', ?, ?, ?)`
    ).bind(id, displayName, studentSlug, roleId))
    auditAfter = { accountType, studentSlug, displayName, roleId }
  } else {
    return c.json({ success: false, message: '管理员账号类型无效' }, 400)
  }

  for (const override of overrides) {
    statements.push(c.env.DB.prepare(
      'INSERT INTO admin_account_permissions (admin_account_id, permission, effect) VALUES (?, ?, ?)'
    ).bind(id, override.permission, override.effect))
  }
  await runAuditedBatch(c.env.DB, principal.id, statements, {
    action: 'admin_account.create', resourceType: 'admin_account', resourceId: id, after: { ...auditAfter, overrides },
  })
  return c.json({ success: true, data: { id } }, 201)
})

adminAccountsRoutes.post('/admin/accounts/:id/disable', async (c) => {
  const principal = getAdminPrincipal(c)
  if (!principal) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const id = c.req.param('id')
  const account = await c.env.DB.prepare('SELECT is_owner, status FROM admin_accounts WHERE id = ?').bind(id).first<any>()
  if (!account) return c.json({ success: false, message: '管理员不存在' }, 404)
  if (account.is_owner) return c.json({ success: false, message: '唯一主管理员不可停用' }, 400)
  await runAuditedBatch(c.env.DB, principal.id, [
    c.env.DB.prepare("UPDATE admin_accounts SET status = 'disabled', updated_at = datetime('now') WHERE id = ?").bind(id),
    c.env.DB.prepare("UPDATE admin_sessions SET revoked_at = datetime('now') WHERE admin_account_id = ? AND revoked_at IS NULL").bind(id),
  ], { action: 'admin_account.disable', resourceType: 'admin_account', resourceId: id, before: { status: account.status }, after: { status: 'disabled' } })
  return c.json({ success: true })
})

adminAccountsRoutes.get('/admin/audit-logs', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT l.*, a.display_name AS admin_display_name
     FROM admin_audit_logs l JOIN admin_accounts a ON a.id = l.admin_account_id
     ORDER BY l.created_at DESC LIMIT 100`
  ).all()
  return c.json({ success: true, data: results || [] })
})
