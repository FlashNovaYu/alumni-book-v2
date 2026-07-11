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

  it('classmate account schema exposes first-login account fields', async () => {
    const row = await env.DB.prepare('PRAGMA table_info(students)').all() as any
    const names = row.results.map((item: any) => item.name)
    expect(names).toContain('account_password_hash')
    expect(names).toContain('account_initial_password_changed')
    expect(names).toContain('account_status')
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

  it('GET /api/health — 缺少生产绑定时返回安全的 503', async () => {
    const req = new Request('http://localhost/api/health')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, { CORS_ORIGIN: '*' } as any, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(503)
    const body = await res.json() as any
    expect(body.success).toBe(false)
    expect(body.message).toBe('服务配置不完整')
    expect(body.requestId).toBeTruthy()
    expect(JSON.stringify(body)).not.toContain('JWT_SECRET')
    expect(JSON.stringify(body)).not.toContain('DB')
    expect(JSON.stringify(body)).not.toContain('R2')
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

  it('GET /api/classmates uses revalidation-friendly cache headers instead of no-store', async () => {
    const req = new Request('http://localhost/api/classmates')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const cacheControl = res.headers.get('Cache-Control') || ''
    expect(cacheControl).toContain('no-cache')
    expect(cacheControl).not.toContain('no-store')
  })

  it('GET /api/config supports ETag conditional revalidation', async () => {
    const firstReq = new Request('http://localhost/api/config')
    const firstCtx = createExecutionContext()
    const firstRes = await worker.fetch(firstReq, env, firstCtx)
    await waitOnExecutionContext(firstCtx)

    const etag = firstRes.headers.get('ETag')
    expect(firstRes.status).toBe(200)
    expect(etag).toBeTruthy()

    const secondReq = new Request('http://localhost/api/config', {
      headers: { 'If-None-Match': etag || '' },
    })
    const secondCtx = createExecutionContext()
    const secondRes = await worker.fetch(secondReq, env, secondCtx)
    await waitOnExecutionContext(secondCtx)

    expect(secondRes.status).toBe(304)
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

describe('Admin Student API & Message Submission', () => {
  it('PUT /api/students/:slug — 管理员更新学生档案与隐私权限', async () => {
    // 1. 登录获取 admin token
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

    // 2. 发送 PUT 更新请求
    const payload = {
      name: '测试更新_管理员',
      privacyLevel: 'public',
      isOwner: true,
      avatarUrl: '/api/files/avatars/test.jpg',
      musicUrl: '/api/files/music/test.mp3',
      musicTitle: '测试音乐',
      musicAutoplay: true,
      backgroundUrl: '/api/files/backgrounds/test.png',
      backgroundColor: '#ffffff',
      customHtml: '<h1>Custom</h1>',
      info: {
        nickname: '管理员改名',
        mbti: 'INTJ',
        graduationYear: '2026',
        school: '测试大学',
        class: '测试班级'
      }
    }

    const req = new Request('http://localhost/api/students/test', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)

    // 3. 验证数据库
    const row = await env.DB.prepare('SELECT name, privacy_level, is_owner, avatar_url, info FROM students WHERE slug = ?').bind('test').first() as any
    expect(row.name).toBe('测试更新_管理员')
    expect(row.privacy_level).toBe('public')
    expect(row.is_owner).toBe(1)
    expect(row.avatar_url).toBe('/api/files/avatars/test.jpg')
    const info = JSON.parse(row.info)
    expect(info.nickname).toBe('管理员改名')
    expect(info.mbti).toBe('INTJ')
  })

  it('POST /api/messages/:slug — 提交留言正常', async () => {
    const payload = {
      authorName: '留言测试者',
      content: '这是一条由单元测试发出的祝福贴纸内容',
      cardStyle: 'letter'
    }
    const req = new Request('http://localhost/api/messages/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.message).toContain('等待审核')
  })

  it('PUT /api/config persists museum highlight switches used by public pages', async () => {
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin888' }),
    })
    const loginCtx = createExecutionContext()
    const loginRes = await worker.fetch(loginReq, env, loginCtx)
    await waitOnExecutionContext(loginCtx)
    const loginBody = await loginRes.json() as any

    const req = new Request('http://localhost/api/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginBody.data.token}`,
      },
      body: JSON.stringify({
        museum: {
          enabled: true,
          heroEyebrow: 'CLASS MEMORY MUSEUM',
          heroTitle: '青春纪念馆',
          heroSubtitle: '测试副标题',
          particleLevel: 'low',
          enableClassGraph: true,
          enableSeatMap: true,
        },
      }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)

    const readCtx = createExecutionContext()
    const readRes = await worker.fetch(new Request('http://localhost/api/config'), env, readCtx)
    await waitOnExecutionContext(readCtx)
    const readBody = await readRes.json() as any

    expect(readBody.data.museum.enableClassGraph).toBe(true)
    expect(readBody.data.museum.enableSeatMap).toBe(true)
  })
})

async function testHashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = new Uint8Array(16)
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256)
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)))
  const saltStr = btoa(String.fromCharCode(...salt))
  return `pbkdf2:${saltStr}:${hash}`
}

describe('Classmate Auth API', () => {
  it('POST /api/classmate-auth/login returns mustChangePassword for initial password', async () => {
    await env.DB.prepare(
      "UPDATE students SET account_password_hash = ?, account_initial_password_changed = 0, account_status = 'pending' WHERE slug = ?"
    ).bind(await testHashPassword('123456'), 'test_init').run()

    const req = new Request('http://localhost/api/classmate-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'test_init', password: '123456' }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(body.data.token).toBeTruthy()
    expect(body.data.mustChangePassword).toBe(true)
    expect(body.data.student.slug).toBe('test_init')
  })
})

async function loginAsAdminForTest(): Promise<string> {
  const loginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin888' }),
  })
  const loginCtx = createExecutionContext()
  const loginRes = await worker.fetch(loginReq, env, loginCtx)
  await waitOnExecutionContext(loginCtx)
  const loginBody = await loginRes.json() as any
  return loginBody.data.token
}

describe('Admin Classmate Account Management API', () => {
  it('admin can set classmate initial password and mark account pending', async () => {
    const token = await loginAsAdminForTest()
    const req = new Request('http://localhost/api/students/test_init', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: '测试同学',
        accountInitialPassword: 'init-123456',
      }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(200)

    const row = await env.DB.prepare(
      'SELECT account_password_hash, account_initial_password_changed, account_status FROM students WHERE slug = ?'
    ).bind('test_init').first() as any
    expect(row.account_password_hash).toMatch(/^pbkdf2:/)
    expect(row.account_initial_password_changed).toBe(0)
    expect(row.account_status).toBe('pending')
  })
})

async function loginAsClassmateForTest(slug = 'test_init'): Promise<string> {
  const hash = await testHashPassword('123456')
  await env.DB.prepare(
    "UPDATE students SET account_password_hash = ?, account_initial_password_changed = 1, account_status = 'active' WHERE slug = ?"
  ).bind(hash, slug).run()

  const req = new Request('http://localhost/api/classmate-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, password: '123456' }),
  })
  const ctx = createExecutionContext()
  const res = await worker.fetch(req, env, ctx)
  await waitOnExecutionContext(ctx)
  const body = await res.json() as any
  return body.data.token
}

describe('Post Office Community API', () => {
  it('POST /api/public-messages requires classmate token', async () => {
    const req = new Request('http://localhost/api/public-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '未登录留言' }),
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.status).toBe(401)
  })

  it('classmate can submit public message and admin approval creates notification', async () => {
    const classmateToken = await loginAsClassmateForTest()
    const submitReq = new Request('http://localhost/api/public-messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Classmate-Token': classmateToken,
      },
      body: JSON.stringify({ content: '愿我们顶峰相见', cardStyle: 'letter' }),
    })
    const submitCtx = createExecutionContext()
    const submitRes = await worker.fetch(submitReq, env, submitCtx)
    await waitOnExecutionContext(submitCtx)
    expect(submitRes.status).toBe(200)
    const submitBody = await submitRes.json() as any
    expect(submitBody.data.status).toBe('pending')

    const adminToken = await loginAsAdminForTest()
    const approveReq = new Request(`http://localhost/api/admin/public-messages/${submitBody.data.id}/approve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const approveCtx = createExecutionContext()
    const approveRes = await worker.fetch(approveReq, env, approveCtx)
    await waitOnExecutionContext(approveCtx)
    expect(approveRes.status).toBe(200)

    const summaryReq = new Request('http://localhost/api/notifications/summary', {
      headers: { 'X-Classmate-Token': classmateToken },
    })
    const summaryCtx = createExecutionContext()
    const summaryRes = await worker.fetch(summaryReq, env, summaryCtx)
    await waitOnExecutionContext(summaryCtx)
    const summaryBody = await summaryRes.json() as any
    expect(summaryBody.data.unreadCount).toBeGreaterThanOrEqual(1)
  })

  it('non-recipient cannot read mailbox thread', async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO students (id, name, slug, account_status) VALUES ('stu_other', '其他同学', 'other', 'active')").run()
    const ownerToken = await loginAsClassmateForTest('test_init')
    const otherToken = await loginAsClassmateForTest('other')

    const createReq = new Request('http://localhost/api/mailbox/threads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Classmate-Token': ownerToken,
      },
      body: JSON.stringify({ recipientSlug: 'other', subject: '一封测试信', body: '你好，未来见。' }),
    })
    const createCtx = createExecutionContext()
    const createRes = await worker.fetch(createReq, env, createCtx)
    await waitOnExecutionContext(createCtx)
    const createBody = await createRes.json() as any

    const recipientReq = new Request(`http://localhost/api/mailbox/threads/${createBody.data.id}`, {
      headers: { 'X-Classmate-Token': otherToken },
    })
    const recipientCtx = createExecutionContext()
    const recipientRes = await worker.fetch(recipientReq, env, recipientCtx)
    await waitOnExecutionContext(recipientCtx)
    expect(recipientRes.status).toBe(200)

    await env.DB.prepare("INSERT OR IGNORE INTO students (id, name, slug, account_status) VALUES ('stu_third', '第三同学', 'third', 'active')").run()
    const thirdToken = await loginAsClassmateForTest('third')
    const forbiddenReq = new Request(`http://localhost/api/mailbox/threads/${createBody.data.id}`, {
      headers: { 'X-Classmate-Token': thirdToken },
    })
    const forbiddenCtx = createExecutionContext()
    const forbiddenRes = await worker.fetch(forbiddenReq, env, forbiddenCtx)
    await waitOnExecutionContext(forbiddenCtx)
    expect(forbiddenRes.status).toBe(403)
  })
})



