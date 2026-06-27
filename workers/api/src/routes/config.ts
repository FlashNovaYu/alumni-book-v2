import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const configRoutes = new Hono<{ Bindings: Bindings }>()

// 更新配置
configRoutes.put('/config', async (c) => {
  const db = c.env.DB
  const body = await c.req.json()

  if (body.museum) {
    const m = body.museum
    if (typeof m !== 'object' || m === null) {
      return c.json({ success: false, message: 'museum 配置格式不正确' }, 400)
    }
    if (
      typeof m.enabled !== 'boolean' ||
      typeof m.heroEyebrow !== 'string' ||
      typeof m.heroTitle !== 'string' ||
      typeof m.heroSubtitle !== 'string' ||
      !['off', 'low', 'medium'].includes(m.particleLevel) ||
      typeof m.enableClassGraph !== 'boolean' ||
      typeof m.enableSeatMap !== 'boolean'
    ) {
      return c.json({ success: false, message: 'museum 配置字段验证失败' }, 400)
    }
  }

  const entries = Object.entries(body)
  for (const [key, value] of entries) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    await db.prepare(
      'INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)'
    ).bind(key, serialized).run()
  }

  return c.json({ success: true, message: '配置已更新' })
})
