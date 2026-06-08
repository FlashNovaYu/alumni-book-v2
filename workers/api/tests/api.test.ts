import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

beforeAll(async () => {
  await initTestDb(env.DB)
})

describe('Auth API', () => {
  it('POST /api/auth/login — 默认密码登录成功', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin888' }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.data.token).toBeTruthy()
  })

  it('POST /api/auth/login — 错误密码返回 401', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrongpassword' }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })

  it('GET /api/admin/stats — 无 token 返回 401', async () => {
    const req = new Request('http://localhost/api/admin/stats')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })
})

describe('Public API', () => {
  it('GET /api/health — 健康检查', async () => {
    const req = new Request('http://localhost/api/health')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.data.status).toBe('ok')
  })

  it('GET /api/classmates — 返回同学名单', async () => {
    const req = new Request('http://localhost/api/classmates')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('GET /api/config — 返回站点配置', async () => {
    const req = new Request('http://localhost/api/config')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.data.preface).toBeDefined()
  })

  it('POST /api/students/:slug/visit — 增加访问计数', async () => {
    // 需要先插入一个学生
    const stuId = `stu_test_${Date.now()}`
    await env.DB.prepare(
      'INSERT INTO students (id, name, slug) VALUES (?, ?, ?)'
    ).bind(stuId, '测试', 'test').run()

    const req = new Request('http://localhost/api/students/test/visit', { method: 'POST' })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.data.visitCount).toBe(1)
  })

  it('GET /api/rankings — 返回排行榜', async () => {
    const req = new Request('http://localhost/api/rankings')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.visits)).toBe(true)
    expect(Array.isArray(body.data.messages)).toBe(true)
    expect(Array.isArray(body.data.recent)).toBe(true)
  })
})

describe('Messages API', () => {
  it('GET /api/messages/approved returns global approved messages instead of slug messages', async () => {
    await env.DB.prepare(
      "INSERT INTO messages (id, student_slug, author_name, content, is_approved, is_hidden, card_style, pinned) VALUES (?, ?, ?, ?, 1, 0, 'paper', 0)"
    ).bind('msg_global_approved_1', 'test', '王五', '这是一条全站留言').run()

    const req = new Request('http://localhost/api/messages/approved')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.data.some((m: any) => m.id === 'msg_global_approved_1')).toBe(true)
  })

  it('GET /api/messages/:slug still returns messages for a student slug', async () => {
    const req = new Request('http://localhost/api/messages/test')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })
})

