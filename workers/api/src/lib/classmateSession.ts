// workers/api/src/lib/classmateSession.ts
// CCSwitch: 同学 Session 会话工具函数，提供令牌创建、校验与清理。

export const CLASSMATE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

function base64url(str: string): string {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return base64url(String.fromCharCode(...new Uint8Array(sig)))
}

export async function createClassmateSession(db: D1Database, slug: string, secret: string): Promise<string> {
  const nonce = crypto.randomUUID()
  const issuedAt = Date.now()
  const signature = await hmacSign(`${slug}:${issuedAt}:${nonce}`, secret)
  const token = `${base64url(slug)}.${issuedAt}.${nonce}.${signature}`
  await db.prepare(
    "INSERT INTO classmate_sessions (token, student_slug, expires_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+7 days'))"
  ).bind(token, slug).run()
  return token
}

export async function verifyClassmateSession(db: D1Database, token: string | null | undefined): Promise<string | null> {
  if (!token) return null
  const row = await db.prepare(
    "SELECT student_slug FROM classmate_sessions WHERE token = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
  ).bind(token).first() as any
  return row?.student_slug || null
}

export async function deleteClassmateSession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM classmate_sessions WHERE token = ?').bind(token).run()
}
