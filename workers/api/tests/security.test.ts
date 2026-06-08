import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.prepare(`
    INSERT INTO students (id, name, slug, avatar_url, background_url, privacy_level, info)
    VALUES ('test_zhangsan', '张三', 'zhangsan', '/api/files/avatars/old.png', '', 'classmates', '{}')
  `).run()
  await env.DB.prepare(`
    INSERT INTO students (id, name, slug, info)
    VALUES ('test_lisi', '李四', 'lisi', '{}')
  `).run()
})

describe('Security and Session Revocation', () => {
  it('OPTIONS allows X-Classmate-Token for preflight requests', async () => {
    const req = new Request('http://localhost/api/students', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:4321',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type,x-classmate-token',
      },
    })
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-classmate-token')
  })

  it('Session Revocation Flow (Login -> Access Admin API -> Logout -> Rejected)', async () => {
    // 1. 登录
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin888' }),
    })
    const ctx1 = createExecutionContext()
    const loginRes = await worker.fetch(loginReq, env, ctx1)
    await waitOnExecutionContext(ctx1)
    expect(loginRes.status).toBe(200)
    const loginBody = await loginRes.json() as any
    const token = loginBody.data.token
    expect(token).toBeTruthy()

    // 2. 访问管理员 API 应该成功
    const statsReq = new Request('http://localhost/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const ctx2 = createExecutionContext()
    const statsRes = await worker.fetch(statsReq, env, ctx2)
    await waitOnExecutionContext(ctx2)
    expect(statsRes.status).toBe(200)

    // 3. 注销登出
    const logoutReq = new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const ctx3 = createExecutionContext()
    const logoutRes = await worker.fetch(logoutReq, env, ctx3)
    await waitOnExecutionContext(ctx3)
    expect(logoutRes.status).toBe(200)

    // 4. 再次访问管理员 API 应该被拒绝，返回 401
    const statsReq2 = new Request('http://localhost/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const ctx4 = createExecutionContext()
    const statsRes2 = await worker.fetch(statsReq2, env, ctx4)
    await waitOnExecutionContext(ctx4)
    expect(statsRes2.status).toBe(401)
    const errBody = await statsRes2.json() as any
    expect(errBody.success).toBe(false)
    expect(errBody.message).toContain('登录已失效')
  })

  it('Classmate Self-Service Auth Flow (No Secret -> Set Secret -> Require Secret -> Verify)', async () => {
    // 1. 张三目前没有设置密码，用名字和 slug 获取 token 应该成功且 needSetup = true
    const tokenReq1 = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '张三', slug: 'zhangsan' })
    })
    const res1 = await worker.fetch(tokenReq1, env, createExecutionContext())
    expect(res1.status).toBe(200)
    const body1 = await res1.json() as any
    expect(body1.success).toBe(true)
    expect(body1.data.needSetup).toBe(true)
    const classmateToken = body1.data.token
    expect(classmateToken).toBeTruthy()

    // 2. 自助修改资料并首次设置口令 'my-edit-secret' 且设置 privacyLevel，以及一些 visibility
    const info = {
      phone: '13888888888',
      wechat: 'zs123',
      visibility: {
        phone: 'owner',
        wechat: 'classmates'
      }
    }
    const updateReq = new Request('http://localhost/api/classmate/students/zhangsan', {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'X-Classmate-Token': classmateToken
      },
      body: JSON.stringify({ info, editSecret: 'my-edit-secret' })
    })
    const res2 = await worker.fetch(updateReq, env, createExecutionContext())
    expect(res2.status).toBe(200)

    // 3. 再次获取 token 时如果不传 editSecret，应该返回 403 并且 requireSecret = true
    const tokenReq2 = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '张三', slug: 'zhangsan' })
    })
    const res3 = await worker.fetch(tokenReq2, env, createExecutionContext())
    expect(res3.status).toBe(403)
    const body3 = await res3.json() as any
    expect(body3.requireSecret).toBe(true)

    // 4. 输入错误口令应该返回 403
    const tokenReq3 = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '张三', slug: 'zhangsan', editSecret: 'wrong-secret' })
    })
    const res4 = await worker.fetch(tokenReq3, env, createExecutionContext())
    expect(res4.status).toBe(403)

    // 5. 输入正确口令应该返回 token 并且 needSetup = false
    const tokenReq4 = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '张三', slug: 'zhangsan', editSecret: 'my-edit-secret' })
    })
    const res5 = await worker.fetch(tokenReq4, env, createExecutionContext())
    expect(res5.status).toBe(200)
    const body5 = await res5.json() as any
    expect(body5.success).toBe(true)
    expect(body5.data.needSetup).toBe(false)
  })

  it('Privacy Level Filtering (Public vs Classmate vs Owner)', async () => {
    // 首先获取张三的 token (Owner)
    const tReqZs = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '张三', slug: 'zhangsan', editSecret: 'my-edit-secret' })
    })
    const tResZs = await worker.fetch(tReqZs, env, createExecutionContext())
    const tBodyZs = await tResZs.json() as any
    const zsToken = tBodyZs.data.token

    // 获取李四的 token (普通 Classmate)
    const tReqLs = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '李四', slug: 'lisi' })
    })
    const tResLs = await worker.fetch(tReqLs, env, createExecutionContext())
    const tBodyLs = await tResLs.json() as any
    const lisiToken = tBodyLs.data.token

    // 1. 公开访问 (?audience=public)
    const pubReq = new Request('http://localhost/api/students/zhangsan?audience=public')
    const pubRes = await worker.fetch(pubReq, env, createExecutionContext())
    const pubData = await pubRes.json() as any
    expect(pubData.data.info.phone).toBeUndefined()
    expect(pubData.data.info.wechat).toBeUndefined()

    // 2. 默认无 token 访问（默认是 public 视角）
    const classmateReq = new Request('http://localhost/api/students/zhangsan')
    const classmateRes = await worker.fetch(classmateReq, env, createExecutionContext())
    const classmateData = await classmateRes.json() as any
    expect(classmateData.data.info.phone).toBeUndefined() // owner 级被隐去
    expect(classmateData.data.info.wechat).toBeUndefined() // classmates 级不可见

    // 3. 李四 (其他同学 token) 访问张三
    const lisiReq = new Request('http://localhost/api/students/zhangsan', {
      headers: { 'X-Classmate-Token': lisiToken }
    })
    const lisiRes = await worker.fetch(lisiReq, env, createExecutionContext())
    const lisiData = await lisiRes.json() as any
    expect(lisiData.data.info.phone).toBeUndefined()
    expect(lisiData.data.info.wechat).toBe('zs123')

    // 4. 张三 (本人 token) 访问自己
    const ownerReq = new Request('http://localhost/api/students/zhangsan', {
      headers: { 'X-Classmate-Token': zsToken }
    })
    const ownerRes = await worker.fetch(ownerReq, env, createExecutionContext())
    const ownerData = await ownerRes.json() as any
    expect(ownerData.data.info.phone).toBe('13888888888') // owner 级可见
    expect(ownerData.data.info.wechat).toBe('zs123')
  })

  it('Anonymous student detail defaults to public audience and hides classmate-only fields', async () => {
    const info = {
      phone: '13900000000',
      wechat: 'private-wechat',
      email: 'public@example.com',
      visibility: {
        phone: 'owner',
        wechat: 'classmates',
        email: 'public',
      },
    }
    await env.DB.prepare(
      'UPDATE students SET info = ? WHERE slug = ?'
    ).bind(JSON.stringify(info), 'zhangsan').run()

    const req = new Request('http://localhost/api/students/zhangsan')
    const res = await worker.fetch(req, env, createExecutionContext())
    expect(res.status).toBe(200)
    const body = await res.json() as any

    expect(body.data.info.phone).toBeUndefined()
    expect(body.data.info.wechat).toBeUndefined()
    expect(body.data.info.email).toBe('public@example.com')
  })

  it('Anonymous student list also hides classmate-only fields', async () => {
    const req = new Request('http://localhost/api/students')
    const res = await worker.fetch(req, env, createExecutionContext())
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const zhangsan = body.data.find((s: any) => s.slug === 'zhangsan')

    expect(zhangsan.info.phone).toBeUndefined()
    expect(zhangsan.info.wechat).toBeUndefined()
    expect(zhangsan.info.email).toBe('public@example.com')
  })

  it('Message Wall Reply Auth', async () => {
    // 插入留言，属于张三的页面
    await env.DB.prepare(`
      INSERT INTO messages (id, student_slug, author_name, content, is_approved)
      VALUES ('msg_test_1', 'zhangsan', '留言人', '你好', 1)
    `).run()

    // 获取张三 (Owner) 和 李四 (普通 Classmate) 的 token
    const tReqZs = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '张三', slug: 'zhangsan', editSecret: 'my-edit-secret' })
    })
    const tResZs = await worker.fetch(tReqZs, env, createExecutionContext())
    const tBodyZs = await tResZs.json() as any
    const zsToken = tBodyZs.data.token

    const tReqLs = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '李四', slug: 'lisi' })
    })
    const tResLs = await worker.fetch(tReqLs, env, createExecutionContext())
    const tBodyLs = await tResLs.json() as any
    const lisiToken = tBodyLs.data.token

    // 1. 无 token 回复应该被拒绝 401
    const replyReq1 = new Request('http://localhost/api/messages/msg_test_1/reply', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: '你好呀' })
    })
    const replyRes1 = await worker.fetch(replyReq1, env, createExecutionContext())
    expect(replyRes1.status).toBe(401)

    // 2. 李四 (非页面主人) 试图回复被拒绝 403
    const replyReq2 = new Request('http://localhost/api/messages/msg_test_1/reply', {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'X-Classmate-Token': lisiToken
      },
      body: JSON.stringify({ reply: '我是李四' })
    })
    const replyRes2 = await worker.fetch(replyReq2, env, createExecutionContext())
    expect(replyRes2.status).toBe(403)

    // 3. 张三 (页面主人) 回复成功 200
    const replyReq3 = new Request('http://localhost/api/messages/msg_test_1/reply', {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'X-Classmate-Token': zsToken
      },
      body: JSON.stringify({ reply: '我是张三主人' })
    })
    const replyRes3 = await worker.fetch(replyReq3, env, createExecutionContext())
    expect(replyRes3.status).toBe(200)
  })

  it('Classmate Self-Service Upload File Limit', async () => {
    // 获取张三的 token
    const tReqZs = new Request('http://localhost/api/classmate/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '张三', slug: 'zhangsan', editSecret: 'my-edit-secret' })
    })
    const tResZs = await worker.fetch(tReqZs, env, createExecutionContext())
    const tBodyZs = await tResZs.json() as any
    const zsToken = tBodyZs.data.token

    // 1. 上传体积限制：构造一个 3MB 的大文件作为头像（最大 2MB 限制）
    const bigFile = new File([new Uint8Array(3 * 1024 * 1024)], 'avatar.png', { type: 'image/png' })
    const fd1 = new FormData()
    fd1.append('file', bigFile)
    fd1.append('type', 'avatar')
    fd1.append('slug', 'zhangsan')

    const uploadReq1 = new Request('http://localhost/api/classmate/upload', {
      method: 'POST',
      headers: { 'X-Classmate-Token': zsToken },
      body: fd1
    })
    const uploadRes1 = await worker.fetch(uploadReq1, env, createExecutionContext())
    expect(uploadRes1.status).toBe(413) // Payload Too Large

    // 2. MIME 类型限制：上传不支持的格式（如 text/plain 作为头像）
    const textFile = new File(['hello'], 'text.txt', { type: 'text/plain' })
    const fd2 = new FormData()
    fd2.append('file', textFile)
    fd2.append('type', 'avatar')
    fd2.append('slug', 'zhangsan')

    const uploadReq2 = new Request('http://localhost/api/classmate/upload', {
      method: 'POST',
      headers: { 'X-Classmate-Token': zsToken },
      body: fd2
    })
    const uploadRes2 = await worker.fetch(uploadReq2, env, createExecutionContext())
    expect(uploadRes2.status).toBe(400) // Bad Request

    // 3. 上传合法头像，旧的 /api/files/avatars/old.png 应当在 R2 里被清理
    const validFile = new File(['fake-png-content'], 'avatar.png', { type: 'image/png' })
    const fd3 = new FormData()
    fd3.append('file', validFile)
    fd3.append('type', 'avatar')
    fd3.append('slug', 'zhangsan')

    await env.R2.put('avatars/old.png', 'fake-png-content')

    const uploadReq3 = new Request('http://localhost/api/classmate/upload', {
      method: 'POST',
      headers: { 'X-Classmate-Token': zsToken },
      body: fd3
    })
    const uploadRes3 = await worker.fetch(uploadReq3, env, createExecutionContext())
    expect(uploadRes3.status).toBe(200)

    // 验证 R2 中的旧文件已清理
    const oldObj = await env.R2.get('avatars/old.png')
    expect(oldObj).toBeNull()

    // 验证数据库中存入的是相对路径 
    const stu = await env.DB.prepare('SELECT avatar_url FROM students WHERE slug = ?').bind('zhangsan').first()
    expect((stu as any).avatar_url).toContain('/api/files/avatars/zhangsan_')
  })

  it('Response includes X-Request-Id header', async () => {
    const req = new Request('http://localhost/api/health')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)
    expect(res.headers.get('x-request-id')).toBeTruthy()
  })
})
