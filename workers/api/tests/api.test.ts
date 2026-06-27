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

  it('GET /api/admin/stats — 成功返回统计信息与巡检数据', async () => {
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin888' }),
    })
    const loginCtx = createExecutionContext()
    const loginRes = await worker.fetch(loginReq, env, loginCtx)
    await waitOnExecutionContext(loginCtx)
    const loginBody = await loginRes.json() as any
    const token = loginBody.data.token

    const req = new Request('http://localhost/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.auditAlerts)).toBe(true)
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
    expect(body.data.museum).toBeDefined()
    expect(body.data.museum.heroEyebrow).toBe('CLASS MEMORY MUSEUM')
    expect(body.data.museum.particleLevel).toBe('low')
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

  it('POST /api/messages/:slug preserves sticker card style', async () => {
    const req = new Request('http://localhost/api/messages/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorName: '李四',
        content: '祝你毕业快乐',
        cardStyle: 'letter',
      }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)

    const row = await env.DB.prepare('SELECT card_style FROM messages WHERE author_name = ? ORDER BY created_at DESC LIMIT 1').bind('李四').first() as any
    expect(row.card_style).toBe('letter')
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
        groupName: '第一小组',
        seatNo: '3-2',
        dormNo: 'A302',
        letterToClassmates: '同学们未来见',
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
    expect(info.letterToClassmates).toBe('同学们未来见')
    expect(info.groupName).toBe('第一小组')
    expect(info.seatNo).toBe('3-2')
    expect(info.dormNo).toBe('A302')
    expect(info.profileModules[0].title).toBe('模块1')
  })
})

describe('Museum Gallery & Timeline API', () => {
  it('GET /api/albums — 包含 tags 与 featured', async () => {
    const req = new Request('http://localhost/api/albums')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    if (body.data.length > 0) {
      expect(body.data[0]).toHaveProperty('tags')
      expect(body.data[0]).toHaveProperty('featured')
    }
  })

  it('GET /api/timeline — 包含 eventType 且为合法值', async () => {
    const req = new Request('http://localhost/api/timeline')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    if (body.data.length > 0 && body.data.some((item: any) => item.type === 'event')) {
      const eventItem = body.data.find((item: any) => item.type === 'event')
      expect(eventItem).toHaveProperty('eventType')
      expect(['class_event', 'activity', 'exam', 'graduation', 'funny']).toContain(eventItem.eventType)
    }
  })
})

