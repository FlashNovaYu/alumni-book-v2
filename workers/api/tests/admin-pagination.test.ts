import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { hashPassword } from '../src/lib/password'
import { initTestDb } from './db-helper'
import { loginTestAdmin } from './admin-test-auth'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.prepare(
    "INSERT OR REPLACE INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id, is_owner) VALUES ('adm_page_owner', 'standalone', 'test-owner', '分页主管理员', ?, 'owner', 1)"
  ).bind(await hashPassword('test-admin-123')).run()
})

async function request(path: string, options: RequestInit = {}) {
  const context = createExecutionContext()
  const response = await worker.fetch(new Request(`http://localhost${path}`, options), env, context)
  await waitOnExecutionContext(context)
  return response
}

describe('后台列表分页与上限', () => {
  it('管理员留言列表支持 page/limit，并限制单页上限', async () => {
    await env.DB.batch(Array.from({ length: 105 }, (_, index) => env.DB.prepare(
      `INSERT OR REPLACE INTO messages (id, student_slug, author_name, content, created_at)
       VALUES (?, 'test_init', ?, ?, ?)`
    ).bind(`page-message-${index}`, `分页作者${index}`, `分页内容${index}`, `2026-01-${String(index % 28 + 1).padStart(2, '0')} 00:00:00`)))
    const token = await loginTestAdmin((path, options) => request(path, options))
    const response = await request('/api/admin/messages?page=2&limit=10', { headers: { Authorization: `Bearer ${token}` } })
    const body = await response.json() as any
    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(10)
    expect(body.data[0].id).not.toBe('page-message-104')

    const capped = await request('/api/admin/messages?page=1&limit=1000', { headers: { Authorization: `Bearer ${token}` } })
    expect((await capped.json() as any).data.length).toBeLessThanOrEqual(100)
  })

  it('通知历史和审计日志支持分页，默认响应仍为数组/既有包装', async () => {
    await env.DB.batch(Array.from({ length: 105 }, (_, index) => env.DB.prepare(
      `INSERT OR REPLACE INTO notifications (id, recipient_slug, type, title, body, related_type, related_id, created_at)
       VALUES (?, 'test_init', 'admin_notice', ?, '分页通知', 'admin_notice', ?, ?)`
    ).bind(`page-notification-${index}`, `通知${index}`, `page-related-${index}`, `2026-01-${String(index % 28 + 1).padStart(2, '0')} 00:00:00`)))
    await env.DB.batch(Array.from({ length: 105 }, (_, index) => env.DB.prepare(
      `INSERT OR REPLACE INTO admin_audit_logs (id, admin_account_id, action, resource_type, resource_id, created_at)
       VALUES (?, 'adm_page_owner', 'page.test', 'test', ?, ?)`
    ).bind(`page-audit-${index}`, `page-resource-${index}`, `2026-01-${String(index % 28 + 1).padStart(2, '0')} 00:00:00`)))
    const token = await loginTestAdmin((path, options) => request(path, options))
    const headers = { Authorization: `Bearer ${token}` }

    const history = await request('/api/admin/notifications/history?page=2&limit=10', { headers })
    expect((await history.json() as any).data.items).toHaveLength(10)
    const audit = await request('/api/admin/audit-logs?page=2&limit=10', { headers })
    expect((await audit.json() as any).data).toHaveLength(10)
  })
})
