import { jwt } from 'hono/jwt'
import { HTTPException } from 'hono/http-exception'

export async function adminGuard(c: any, next: any) {
  if (c.get('adminVerified')) return next()

  const mw = jwt({ secret: c.env.JWT_SECRET, alg: 'HS256' })
  try {
    let verified = false
    let response: Response | null = null
    await mw(c, async () => {
      const token = c.req.header('Authorization')?.replace('Bearer ', '')
      if (!token) {
        response = c.json({ success: false, message: '未授权' }, 401)
        return
      }
      const session = await c.env.DB.prepare(
        "SELECT token FROM admin_sessions WHERE token = ? AND julianday(expires_at) > julianday('now')"
      ).bind(token).first()
      if (!session) {
        response = c.json({ success: false, message: '登录已失效' }, 401)
        return
      }
      verified = true
      c.set('adminVerified', true)
    })
    if (verified) return next()
    return response || c.json({ success: false, message: '未授权' }, 401)
  } catch (error) {
    if (error instanceof HTTPException) return error.getResponse()
    throw error
  }
}
