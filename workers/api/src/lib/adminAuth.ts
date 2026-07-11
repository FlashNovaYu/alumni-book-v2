import { jwt } from 'hono/jwt'
import type { Context, MiddlewareHandler, Next } from 'hono'

export const ADMIN_PERMISSIONS = [
  'dashboard.view',
  'moderation.view',
  'moderation.manage',
  'content.manage',
  'notifications.view',
  'notifications.publish',
  'students.manage',
  'site.settings.manage',
  'admins.manage',
  'audit.view',
] as const

export type AdminPermission = typeof ADMIN_PERMISSIONS[number]

export type AdminPrincipal = {
  id: string
  displayName: string
  accountType: 'standalone' | 'classmate_linked'
  studentSlug: string | null
  isOwner: boolean
  mustChangePassword: boolean
  permissions: AdminPermission[]
}

type AdminAccountRow = {
  id: string
  account_type: AdminPrincipal['accountType']
  display_name: string
  student_slug: string | null
  role_id: string
  status: string
  is_owner: number
  must_change_password: number
}

function isPermission(value: string): value is AdminPermission {
  return (ADMIN_PERMISSIONS as readonly string[]).includes(value)
}

export async function getAdminPermissions(db: D1Database, accountId: string): Promise<AdminPermission[]> {
  const account = await db.prepare(
    'SELECT role_id, status, is_owner FROM admin_accounts WHERE id = ?'
  ).bind(accountId).first<Pick<AdminAccountRow, 'role_id' | 'status' | 'is_owner'>>()

  if (!account || account.status !== 'active') return []
  if (account.is_owner) return [...ADMIN_PERMISSIONS]

  const { results: roleRows } = await db.prepare(
    'SELECT permission FROM admin_role_permissions WHERE role_id = ?'
  ).bind(account.role_id).all<{ permission: string }>()
  const { results: overrideRows } = await db.prepare(
    'SELECT permission, effect FROM admin_account_permissions WHERE admin_account_id = ?'
  ).bind(accountId).all<{ permission: string; effect: 'allow' | 'deny' }>()

  const permissions = new Set<AdminPermission>()
  for (const row of roleRows || []) {
    if (isPermission(row.permission)) permissions.add(row.permission)
  }
  for (const row of overrideRows || []) {
    if (row.effect === 'deny' && isPermission(row.permission)) permissions.delete(row.permission)
  }
  for (const row of overrideRows || []) {
    if (row.effect === 'allow' && isPermission(row.permission)) permissions.add(row.permission)
  }

  return ADMIN_PERMISSIONS.filter(permission => permissions.has(permission))
}

export async function loadActiveAdmin(db: D1Database, accountId: string): Promise<AdminPrincipal | null> {
  const account = await db.prepare(
    `SELECT id, account_type, display_name, student_slug, role_id, status, is_owner, must_change_password
     FROM admin_accounts WHERE id = ?`
  ).bind(accountId).first<AdminAccountRow>()

  if (!account || account.status !== 'active') return null

  return {
    id: account.id,
    displayName: account.display_name,
    accountType: account.account_type,
    studentSlug: account.student_slug,
    isOwner: !!account.is_owner,
    mustChangePassword: !!account.must_change_password,
    permissions: await getAdminPermissions(db, account.id),
  }
}

export function hasPermission(principal: AdminPrincipal, permission: AdminPermission): boolean {
  return principal.isOwner || principal.permissions.includes(permission)
}

export function getAdminPrincipal(c: Context): AdminPrincipal | null {
  return (c.get('admin') as AdminPrincipal | undefined) || null
}

export async function requireAdminSession(c: Context, next: Next): Promise<Response | void> {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return c.json({ success: false, message: '未提供管理会话' }, 401)

  try {
    const middleware = jwt({ secret: c.env.JWT_SECRET, alg: 'HS256' })
    let verified = false
    await middleware(c, async () => { verified = true })
    if (!verified) return c.json({ success: false, message: '管理会话无效' }, 401)
  } catch {
    return c.json({ success: false, message: '管理会话无效' }, 401)
  }

  const session = await c.env.DB.prepare(
    `SELECT admin_account_id FROM admin_sessions
     WHERE token = ? AND revoked_at IS NULL AND expires_at > datetime('now')`
  ).bind(token).first() as { admin_account_id: string | null } | null
  if (!session?.admin_account_id) return c.json({ success: false, message: '管理会话已失效' }, 401)

  const principal = await loadActiveAdmin(c.env.DB, session.admin_account_id)
  if (!principal) return c.json({ success: false, message: '管理员账号已停用' }, 401)
  c.set('admin', principal)
  return next()
}

export function requirePermission(permission: AdminPermission): MiddlewareHandler {
  return async (c, next) => {
    const principal = getAdminPrincipal(c)
    if (!principal) return c.json({ success: false, message: '未提供管理会话' }, 401)
    if (!hasPermission(principal, permission)) {
      return c.json({ success: false, message: '当前管理员没有此操作权限' }, 403)
    }
    return next()
  }
}

export const requireOwner: MiddlewareHandler = async (c, next) => {
  const principal = getAdminPrincipal(c)
  if (!principal) return c.json({ success: false, message: '未提供管理会话' }, 401)
  if (!principal.isOwner) return c.json({ success: false, message: '仅主管理员可执行此操作' }, 403)
  return next()
}
