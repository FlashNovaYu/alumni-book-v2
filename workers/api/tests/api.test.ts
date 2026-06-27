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
    await env.DB.prepare(
      "INSERT INTO students (id, name, slug, info) VALUES (?, ?, ?, ?)"
    ).bind('test-uuid-classmate', '测试同学', 'test-classmate', JSON.stringify({ motto: '我的一天', nickname: '小测' })).run()

    const req = new Request('http://localhost/api/classmates')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data[0]).toHaveProperty('completion')
    expect(body.data[0]).toHaveProperty('tags')
    expect(Array.isArray(body.data[0].tags)).toBe(true)
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

describe('Classmate Self-Edit API', () => {
  let classmateToken = ''

  it('POST /api/classmate/token — 获取编辑 token 成功', async () => {
    const req = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '测试', slug: 'test' }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.data.token).toBeTruthy()
    classmateToken = body.data.token
  })

  it('PUT /api/classmate/students/test — 使用 token 更新资料成功', async () => {
    const payload = {
      name: '测试更新',
      privacyLevel: 'classmates',
      info: {
        nickname: '测试昵称',
        profileModules: [
          { title: '模块1', content: '小传测试内容' }
        ],
        visibility: {
          phone: 'owner',
          wechat: 'classmates'
        }
      }
    }

    const req = new Request('http://localhost/api/classmate/students/test', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Classmate-Token': classmateToken
      },
      body: JSON.stringify(payload)
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.message).toBe('保存成功')

    // 验证数据库是否已更新
    const row = await env.DB.prepare('SELECT name, info, privacy_level FROM students WHERE slug = ?').bind('test').first() as any
    expect(row.name).toBe('测试更新')
    expect(row.privacy_level).toBe('classmates')
    const info = JSON.parse(row.info)
    expect(info.nickname).toBe('测试昵称')
    expect(info.profileModules[0].title).toBe('模块1')
  })
})

