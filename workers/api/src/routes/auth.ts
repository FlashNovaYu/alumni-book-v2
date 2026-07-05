import { Hono } from 'hono'
import { hashPassword, verifyPassword } from '../lib/password'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const authRoutes = new Hono<{ Bindings: Bindings }>()

// 简单的 HMAC 签名 JWT 实现
async function createToken(payload: any, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const tokenPayload = { ...payload, iat: now, exp: now + 8 * 3600 } // 8小时过期

  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const encodedPayload = btoa(JSON.stringify(tokenPayload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${encodedHeader}.${encodedPayload}`)
  )

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`
}

authRoutes.post('/login', async (c) => {
  const db = c.env.DB
  const { password } = await c.req.json()

  // 从配置中读取管理员密码哈希
  const config = await db.prepare("SELECT value FROM site_config WHERE key = 'admin_password'").first()

  let valid = false
  let needsUpgrade = false
  if (config) {
    // 使用存储的哈希验证
    const storedHash = (config as any).value
    valid = await verifyPassword(password, storedHash)
    // 旧格式哈希验证成功后自动升级为 PBKDF2
    if (valid && !storedHash.startsWith('pbkdf2:')) {
      needsUpgrade = true
    }
  } else {
    // 默认密码 (首次使用，应该修改)
    valid = password === 'admin888'
  }

  if (!valid) {
    return c.json({ success: false, message: '密码错误' }, 401)
  }

  // 存储或升级密码哈希
  if (!config || needsUpgrade) {
    const hash = await hashPassword(password)
    await db.prepare(
      "INSERT OR REPLACE INTO site_config (key, value) VALUES ('admin_password', ?)"
    ).bind(hash).run()
  }

  const token = await createToken({ role: 'admin' }, c.env.JWT_SECRET)

  // 存储会话
  const expiresAt = new Date(Date.now() + 8 * 3600 * 1000).toISOString()
  await db.prepare(
    'INSERT OR REPLACE INTO admin_sessions (token, expires_at) VALUES (?, ?)'
  ).bind(token, expiresAt).run()

  return c.json({ success: true, data: { token } })
})

authRoutes.post('/logout', async (c) => {
  const db = c.env.DB
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (token) {
    await db.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run()
  }

  return c.json({ success: true, message: '已注销' })
})

authRoutes.get('/verify', async (c) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return c.json({ success: false, message: '未提供令牌' }, 401)
  }

  const db = c.env.DB
  const session = await db.prepare(
    'SELECT * FROM admin_sessions WHERE token = ? AND expires_at > datetime(\'now\')'
  ).bind(token).first()

  if (!session) {
    return c.json({ success: false, message: '令牌无效或已过期' }, 401)
  }

  return c.json({ success: true, data: { valid: true } })
})

