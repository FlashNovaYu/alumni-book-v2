type RateLimitRow = {
  failures: number
  blocked_until: number | null
  last_failed_at: number
}

export type AuthRateLimitKey = {
  route: string
  ip: string
  account: string
}

export type AuthRateLimitStatus = {
  limited: boolean
  retryAfterSeconds: number
}

const MAX_FAILURES = 5
export const AUTH_FAILURE_WINDOW_SECONDS = 15 * 60
const BLOCK_SECONDS = 15 * 60

function keyFor({ route, ip, account }: AuthRateLimitKey) {
  return `${route}:${ip}:${account}`
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function retryAfter(blockedUntil: number, now: number) {
  return Math.max(1, blockedUntil - now)
}

export function clientIp(request: Request) {
  return request.headers.get('CF-Connecting-IP')?.trim()
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown'
}

export function normalizeAccount(value: unknown) {
  return String(value || '').trim().toLowerCase().slice(0, 160) || '<missing>'
}

export async function checkAuthRateLimit(db: D1Database, input: AuthRateLimitKey): Promise<AuthRateLimitStatus> {
  const now = nowSeconds()
  const row = await db.prepare(
    'SELECT failures, blocked_until, last_failed_at FROM auth_login_attempts WHERE attempt_key = ?'
  ).bind(keyFor(input)).first<RateLimitRow>()
  if (!row) return { limited: false, retryAfterSeconds: 0 }

  if (row.blocked_until && row.blocked_until > now) {
    return { limited: true, retryAfterSeconds: retryAfter(row.blocked_until, now) }
  }

  if (now - row.last_failed_at >= AUTH_FAILURE_WINDOW_SECONDS) {
    await db.prepare('DELETE FROM auth_login_attempts WHERE attempt_key = ?').bind(keyFor(input)).run()
  }

  return { limited: false, retryAfterSeconds: 0 }
}

export async function recordAuthFailure(db: D1Database, input: AuthRateLimitKey): Promise<AuthRateLimitStatus> {
  const now = nowSeconds()
  const attemptKey = keyFor(input)
  const row = await db.prepare(
    'SELECT failures, blocked_until, last_failed_at FROM auth_login_attempts WHERE attempt_key = ?'
  ).bind(attemptKey).first<RateLimitRow>()
  const previousFailures = row && now - row.last_failed_at < AUTH_FAILURE_WINDOW_SECONDS ? row.failures : 0
  const failures = previousFailures + 1
  const blockedUntil = failures > MAX_FAILURES ? now + BLOCK_SECONDS : null

  await db.prepare(
    `INSERT INTO auth_login_attempts (attempt_key, route, ip, account, failures, blocked_until, last_failed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(attempt_key) DO UPDATE SET
       failures = excluded.failures,
       blocked_until = excluded.blocked_until,
       last_failed_at = excluded.last_failed_at`
  ).bind(attemptKey, input.route, input.ip, input.account, failures, blockedUntil, now).run()

  return blockedUntil
    ? { limited: true, retryAfterSeconds: BLOCK_SECONDS }
    : { limited: false, retryAfterSeconds: 0 }
}

export async function clearAuthFailures(db: D1Database, input: AuthRateLimitKey) {
  await db.prepare('DELETE FROM auth_login_attempts WHERE attempt_key = ?').bind(keyFor(input)).run()
}

export function rateLimitResponse(c: { header(name: string, value: string): void; json(body: unknown, status: 429): Response }, status: AuthRateLimitStatus) {
  c.header('Retry-After', String(status.retryAfterSeconds))
  return c.json({ success: false, message: '登录尝试过于频繁，请稍后再试' }, 429)
}
