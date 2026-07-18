import { Hono } from 'hono'
import { parseLimitedJson } from '../lib/jsonBodyLimit'
import { getAdminPrincipal } from '../lib/adminAuth'
import { runAuditedBatch } from '../lib/adminAudit'

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

export const configRoutes = new Hono<{ Bindings: Bindings }>()

// 更新配置
configRoutes.put('/config', async (c) => {
  const db = c.env.DB
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)
  const body = await parseLimitedJson(c)

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

  if (body.identity !== undefined) {
    const identity = body.identity
    const keys = ['siteName', 'className', 'classYear', 'shareDescription'] as const
    if (!identity || typeof identity !== 'object' || keys.some((key) => typeof identity[key] !== 'string')) {
      return c.json({ success: false, message: 'identity 配置格式不正确' }, 400)
    }
    if (
      identity.siteName.trim().length > 60 ||
      identity.className.trim().length > 80 ||
      identity.classYear.trim().length > 40 ||
      identity.shareDescription.trim().length > 160
    ) {
      return c.json({ success: false, message: '站点基本资料长度超出限制' }, 400)
    }
  }

  const entries = Object.entries(body)
  const previous: Record<string, unknown> = {}
  const statements: D1PreparedStatement[] = []
  for (const [key, value] of entries) {
    const old = await db.prepare('SELECT value FROM site_config WHERE key = ?').bind(key).first<{ value: string }>()
    previous[key] = old?.value || null
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    statements.push(db.prepare(
      'INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)'
    ).bind(key, serialized))
  }
  await runAuditedBatch(db, admin.id, statements, { action: 'site_config.update', resourceType: 'site_config', resourceId: entries.map(([key]) => key).join(','), before: previous, after: body })

  return c.json({ success: true, message: '配置已更新' })
})
