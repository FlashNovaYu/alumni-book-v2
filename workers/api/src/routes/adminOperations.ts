import { Hono } from 'hono'
import { scanR2Orphans } from '../lib/r2OrphanReport'

type Bindings = { DB: D1Database; R2: R2Bucket; JWT_SECRET: string }
export const adminOperationsRoutes = new Hono<{ Bindings: Bindings }>()

adminOperationsRoutes.get('/admin/operations/r2-orphans', async (c) => {
  const prefix = c.req.query('prefix') || ''
  if (prefix.length > 200 || prefix.includes('..')) return c.json({ success: false, message: 'prefix 无效' }, 400)
  const report = await scanR2Orphans(c.env.DB, c.env.R2, prefix)
  return c.json({ success: true, data: report })
})
