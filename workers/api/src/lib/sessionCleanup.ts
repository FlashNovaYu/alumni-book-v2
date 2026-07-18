import { AUTH_FAILURE_WINDOW_SECONDS } from './authRateLimit'

type CleanupResult = {
  classmateSessions: number
  adminSessions: number
  authAttempts: number
}

function sqliteDate(value: Date) {
  return value.toISOString().slice(0, 19).replace('T', ' ')
}

function changedRows(result: D1Result<unknown>) {
  return Number(result.meta?.changes || 0)
}

/** 清理已过期的认证记录；不触碰仍在有效期内的会话或限流计数。 */
export async function cleanupExpiredSessions(db: D1Database, now = new Date()): Promise<CleanupResult> {
  const expiresBefore = sqliteDate(now)
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const attemptsBefore = nowSeconds - AUTH_FAILURE_WINDOW_SECONDS
  const [classmate, admin, attempts] = await db.batch([
    db.prepare('DELETE FROM classmate_sessions WHERE expires_at <= ?').bind(expiresBefore),
    db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(expiresBefore),
    db.prepare(
      `DELETE FROM auth_login_attempts
       WHERE last_failed_at <= ? AND (blocked_until IS NULL OR blocked_until <= ?)`
    ).bind(attemptsBefore, nowSeconds),
  ])

  return {
    classmateSessions: changedRows(classmate),
    adminSessions: changedRows(admin),
    authAttempts: changedRows(attempts),
  }
}
