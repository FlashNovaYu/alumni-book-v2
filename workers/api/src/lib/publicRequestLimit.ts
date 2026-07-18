export type PublicRequestLimitResult = {
  limited: boolean
  retryAfterSeconds: number
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

export function publicClientIp(request: Request) {
  return request.headers.get('CF-Connecting-IP')?.trim()
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown'
}

export async function claimPublicRequestSlot(
  db: D1Database,
  key: string,
  windowSeconds: number,
): Promise<PublicRequestLimitResult> {
  const now = nowSeconds()
  const expiresAt = now + windowSeconds
  const result = await db.prepare(
    `INSERT INTO public_request_limits (limit_key, expires_at)
     VALUES (?, ?)
     ON CONFLICT(limit_key) DO UPDATE SET expires_at = excluded.expires_at
     WHERE public_request_limits.expires_at <= ?`
  ).bind(key, expiresAt, now).run()

  if (result.meta.changes > 0) {
    return { limited: false, retryAfterSeconds: 0 }
  }

  const existing = await db.prepare(
    'SELECT expires_at FROM public_request_limits WHERE limit_key = ?'
  ).bind(key).first<{ expires_at: number }>()

  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Number(existing?.expires_at || expiresAt) - now),
  }
}
