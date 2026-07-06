import { verifyClassmateSession } from './classmateSession'

export type ClassmateIdentity = {
  slug: string
  name: string
  accountStatus: string
  mustChangePassword: boolean
}

export async function requireClassmate(c: any): Promise<ClassmateIdentity | Response> {
  const token = c.req.header('X-Classmate-Token')
  const slug = await verifyClassmateSession(c.env.DB, token)
  if (!slug) {
    return c.json({ success: false, message: '未授权，请先登录同学账号' }, 401)
  }

  const row = await c.env.DB.prepare(
    'SELECT name, slug, account_status, account_initial_password_changed FROM students WHERE slug = ?'
  ).bind(slug).first() as any

  if (!row || row.account_status === 'locked') {
    return c.json({ success: false, message: '账号不可用，请联系管理员' }, 403)
  }

  return {
    slug: row.slug,
    name: row.name,
    accountStatus: row.account_status || 'active',
    mustChangePassword: !row.account_initial_password_changed,
  }
}

export function isClassmateResponse(value: ClassmateIdentity | Response): value is Response {
  return value instanceof Response
}
