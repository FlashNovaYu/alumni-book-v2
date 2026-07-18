import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { hashPassword } from '../src/lib/password'
import { initTestDb } from './db-helper'

async function request(path: string, body: unknown, ip: string) {
  const context = createExecutionContext()
  const response = await worker.fetch(new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  }), env, context)
  await waitOnExecutionContext(context)
  return response
}

async function expectBlocked(path: string, body: unknown, ip: string, invalidStatus: number) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    expect((await request(path, body, ip)).status).toBe(invalidStatus)
  }
  const blocked = await request(path, body, ip)
  expect(blocked.status).toBe(429)
  const retryAfter = Number(blocked.headers.get('Retry-After'))
  expect(Number.isInteger(retryAfter)).toBe(true)
  expect(retryAfter).toBeGreaterThan(0)
}

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR REPLACE INTO admin_accounts
       (id, account_type, username, display_name, password_hash, role_id, is_owner, status)
       VALUES ('adm_rate_limit', 'standalone', 'rate-limit-owner', '限流测试管理员', ?, 'owner', 1, 'active')`
    ).bind(await hashPassword('rate-limit-password')),
    env.DB.prepare(
      `INSERT OR REPLACE INTO students
       (id, name, slug, account_password_hash, account_initial_password_changed, account_status, edit_secret_hash)
       VALUES ('stu_rate_classmate', '限流同学', 'rate-limit-classmate', ?, 1, 'active', NULL)`
    ).bind(await hashPassword('rate-limit-classmate-password')),
    env.DB.prepare(
      `INSERT OR REPLACE INTO students
       (id, name, slug, edit_secret_hash)
       VALUES ('stu_rate_legacy', '限流旧账号', 'rate-limit-legacy', ?)`
    ).bind(await hashPassword('rate-limit-edit-secret')),
  ])
})

describe('认证登录失败限流', () => {
  it('管理员登录按 IP 与账号限流，并在成功后清理失败记录', async () => {
    const decayIp = '198.51.100.11'
    expect((await request('/api/auth/login', { username: 'rate-limit-owner', password: 'wrong' }, decayIp)).status).toBe(401)
    expect((await request('/api/auth/login', { username: 'rate-limit-owner', password: 'rate-limit-password' }, decayIp)).status).toBe(200)
    expect((await request('/api/auth/login', { username: 'rate-limit-owner', password: 'wrong' }, decayIp)).status).toBe(401)

    await expectBlocked(
      '/api/auth/login',
      { username: 'rate-limit-owner', password: 'wrong' },
      '198.51.100.12',
      401,
    )
  })

  it('正式同学账号登录按 IP 与账号限流，并返回 Retry-After', async () => {
    const decayIp = '198.51.100.21'
    expect((await request('/api/classmate-auth/login', { slug: 'rate-limit-classmate', password: 'wrong' }, decayIp)).status).toBe(401)
    expect((await request('/api/classmate-auth/login', { slug: 'rate-limit-classmate', password: 'rate-limit-classmate-password' }, decayIp)).status).toBe(200)
    expect((await request('/api/classmate-auth/login', { slug: 'rate-limit-classmate', password: 'wrong' }, decayIp)).status).toBe(401)

    await expectBlocked(
      '/api/classmate-auth/login',
      { slug: 'rate-limit-classmate', password: 'wrong' },
      '198.51.100.22',
      401,
    )
  })

  it('旧版同学 token 口令验证按 IP 与账号限流', async () => {
    const decayIp = '198.51.100.31'
    expect((await request('/api/classmate/token', { name: '限流旧账号', slug: 'rate-limit-legacy', editSecret: 'wrong' }, decayIp)).status).toBe(403)
    expect((await request('/api/classmate/token', { name: '限流旧账号', slug: 'rate-limit-legacy', editSecret: 'rate-limit-edit-secret' }, decayIp)).status).toBe(200)
    expect((await request('/api/classmate/token', { name: '限流旧账号', slug: 'rate-limit-legacy', editSecret: 'wrong' }, decayIp)).status).toBe(403)

    await expectBlocked(
      '/api/classmate/token',
      { name: '限流旧账号', slug: 'rate-limit-legacy', editSecret: 'wrong' },
      '198.51.100.32',
      403,
    )
  })

  it('管理员旧密码配置缺失时拒绝默认密码，不签发初始化凭据', async () => {
    await env.DB.prepare("UPDATE admin_accounts SET status = 'disabled' WHERE is_owner = 1").run()
    await env.DB.prepare("DELETE FROM site_config WHERE key = 'admin_password'").run()
    const response = await request('/api/auth/login', { password: 'admin888' }, '198.51.100.41')
    expect(response.status).toBe(503)
    const body = await response.json() as any
    expect(body.success).toBe(false)
    expect(body.data?.setupToken).toBeUndefined()
  })
})
