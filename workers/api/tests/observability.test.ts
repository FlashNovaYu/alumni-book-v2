import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import worker, { scheduled } from '../src/index'
import { cleanupExpiredSessions } from '../src/lib/sessionCleanup'
import { initTestDb } from './db-helper'

beforeAll(async () => {
  await initTestDb(env.DB)
})

async function dispatch(path: string, bindings: any = env) {
  const context = createExecutionContext()
  const response = await worker.fetch(new Request(`http://localhost${path}`), bindings, context)
  await waitOnExecutionContext(context)
  return response
}

describe('Worker 可观测性与 readiness', () => {
  it('health 是不依赖外部绑定的存活检查，readiness 报告依赖不可用', async () => {
    const missingBindings = { CORS_ORIGIN: 'http://localhost:4321' }
    expect((await dispatch('/api/health', missingBindings)).status).toBe(200)

    const readiness = await dispatch('/api/readiness', missingBindings)
    expect(readiness.status).toBe(503)
    expect(await readiness.json()).toMatchObject({ success: false, data: { ready: false } })
  })

  it('readiness 在 D1 与 R2 可用时返回 ready', async () => {
    const response = await dispatch('/api/readiness')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, data: { ready: true } })
  })

  it('输出包含请求 ID、路径、状态、耗时和错误分类的结构化日志', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      const response = await dispatch('/api/health')
      const entry = log.mock.calls
        .map(([value]) => typeof value === 'string' ? value : '')
        .map((value) => { try { return JSON.parse(value) } catch { return null } })
        .find((value) => value?.event === 'http_request')

      expect(entry).toMatchObject({
        event: 'http_request',
        requestId: response.headers.get('X-Request-Id'),
        path: '/api/health',
        method: 'GET',
        status: 200,
        errorClass: null,
      })
      expect(entry.durationMs).toBeTypeOf('number')
    } finally {
      log.mockRestore()
    }
  })
})

describe('过期认证记录清理', () => {
  it('在保留 Hono fetch 的同时向默认导出挂载 scheduled handler', () => {
    expect(worker.fetch).toBeTypeOf('function')
    expect((worker as typeof worker & { scheduled?: typeof scheduled }).scheduled).toBe(scheduled)
  })

  it('只删除过期的 classmate/admin session 与 auth attempt 记录', async () => {
    const nowSeconds = Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000)
    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO classmate_sessions (token, student_slug, expires_at) VALUES ('cleanup-expired-classmate', 'test_init', '2020-01-01 00:00:00')"),
      env.DB.prepare("INSERT OR REPLACE INTO classmate_sessions (token, student_slug, expires_at) VALUES ('cleanup-live-classmate', 'test_init', '2099-01-01 00:00:00')"),
      env.DB.prepare("INSERT OR REPLACE INTO admin_sessions (token, expires_at) VALUES ('cleanup-expired-admin', '2020-01-01 00:00:00')"),
      env.DB.prepare("INSERT OR REPLACE INTO admin_sessions (token, expires_at) VALUES ('cleanup-live-admin', '2099-01-01 00:00:00')"),
      env.DB.prepare("INSERT OR REPLACE INTO auth_login_attempts (attempt_key, route, ip, account, failures, last_failed_at) VALUES ('cleanup-expired-attempt', 'test', '127.0.0.1', 'test', 5, ?)").bind(nowSeconds - 901),
      env.DB.prepare("INSERT OR REPLACE INTO auth_login_attempts (attempt_key, route, ip, account, failures, last_failed_at) VALUES ('cleanup-live-attempt', 'test', '127.0.0.1', 'test', 1, ?)").bind(nowSeconds - 60),
      env.DB.prepare("INSERT OR REPLACE INTO auth_login_attempts (attempt_key, route, ip, account, failures, blocked_until, last_failed_at) VALUES ('cleanup-blocked-attempt', 'test', '127.0.0.1', 'test', 6, ?, ?)").bind(nowSeconds + 300, nowSeconds - 901),
    ])

    await cleanupExpiredSessions(env.DB, new Date('2026-01-01T00:00:00Z'))

    expect(await env.DB.prepare("SELECT token FROM classmate_sessions WHERE token LIKE 'cleanup-%'").all()).toMatchObject({ results: [{ token: 'cleanup-live-classmate' }] })
    expect(await env.DB.prepare("SELECT token FROM admin_sessions WHERE token LIKE 'cleanup-%'").all()).toMatchObject({ results: [{ token: 'cleanup-live-admin' }] })
    expect(await env.DB.prepare("SELECT attempt_key FROM auth_login_attempts WHERE attempt_key LIKE 'cleanup-%' ORDER BY attempt_key").all()).toMatchObject({ results: [
      { attempt_key: 'cleanup-blocked-attempt' },
      { attempt_key: 'cleanup-live-attempt' },
    ] })
  })
})
