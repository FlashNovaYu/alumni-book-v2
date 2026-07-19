import { hashPassword } from '../lib/password'
import type { SqliteDatabase } from '../runtime/sqlite'

export async function createOwnerAccount(
  database: SqliteDatabase,
  input: { id: string; username: string; password: string; displayName: string },
): Promise<void> {
  const username = input.username.trim()
  const displayName = input.displayName.trim()
  if (username.length < 3 || input.password.length < 8 || !displayName) {
    throw new Error('用户名至少 3 位，密码至少 8 位，显示名不能为空')
  }
  const owner = await database.prepare('SELECT id FROM admin_accounts WHERE is_owner = 1').first()
  if (owner) throw new Error('主管理员已初始化')
  const duplicate = await database.prepare('SELECT id FROM admin_accounts WHERE username = ?').bind(username).first()
  if (duplicate) throw new Error('用户名已存在')

  const passwordHash = await hashPassword(input.password)
  await database.batch([
    database.prepare(
      `INSERT INTO admin_accounts
        (id, account_type, username, display_name, password_hash, role_id, is_owner)
       VALUES (?, 'standalone', ?, ?, ?, 'owner', 1)`,
    ).bind(input.id, username, displayName, passwordHash),
    database.prepare('DELETE FROM admin_sessions'),
  ])
}
