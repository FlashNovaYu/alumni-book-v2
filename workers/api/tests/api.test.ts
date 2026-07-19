import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
import worker from '../src/index'
import { initTestDb } from './db-helper'
import { hashPassword } from '../src/lib/password'

beforeAll(async () => {
  await initTestDb(env.DB)
  await env.DB.prepare(
    `INSERT INTO admin_accounts (id, account_type, username, display_name, password_hash, role_id, is_owner)
     VALUES (?, 'standalone', ?, ?, ?, 'owner', 1)`
  ).bind('adm_api_owner', 'test-owner', '测试主管理员', await hashPassword('test-owner-pass')).run()
})

describe('Auth API', () => {
  it('POST /api/auth/login — 命名主管理员登录成功', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test-owner', password: 'test-owner-pass' }),
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
      body: JSON.stringify({ username: 'test-owner', password: 'wrongpassword' }),
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
      body: JSON.stringify({ username: 'test-owner', password: 'test-owner-pass' }),
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

  it('GET /api/readiness — 缺少生产绑定时返回安全的 503', async () => {
    const req = new Request('http://localhost/api/readiness')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, { CORS_ORIGIN: '*' } as any, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(503)
    const body = await res.json() as any
    expect(body.success).toBe(false)
    expect(body.data.ready).toBe(false)
    expect(body.message).toBe('服务依赖尚未就绪')
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

  it('GET /api/classmates — 不公开座位号和宿舍号', async () => {
    await env.DB.prepare(
      "INSERT INTO students (id, name, slug, info) VALUES (?, ?, ?, ?)"
    ).bind('test-private-directory', '隐私测试同学', 'private-directory', JSON.stringify({
      seatNo: '3-2',
      dormNo: 'A302',
      groupName: '第一组',
    })).run()

    const res = await worker.fetch(new Request('http://localhost/api/classmates'), env, createExecutionContext())
    expect(res.status).toBe(200)
    const body = await res.json() as any
    const classmate = body.data.find((item: any) => item.slug === 'private-directory')

    expect(classmate).toBeDefined()
    expect(classmate).not.toHaveProperty('seatNo')
    expect(classmate).not.toHaveProperty('dormNo')
    expect(classmate.groupName).toBe('第一组')
  })

  it('公开 API 将旧 Worker 文件地址规范化为同源路径', async () => {
    const legacyOrigin = 'https://alumni-book-api.chenyuhao2263.workers.dev'
    await env.DB.prepare(`
      INSERT INTO students (
        id, name, slug, avatar_url, music_url, background_url, info, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      'legacy-file-url-id',
      '旧地址同学',
      'legacy-file-url',
      `${legacyOrigin}/api/files/avatars/legacy.png`,
      `${legacyOrigin}/api/files/music/legacy.mp3`,
      `${legacyOrigin}/api/files/backgrounds/legacy.png`,
      '{}',
    ).run()

    const studentCtx = createExecutionContext()
    const studentRes = await worker.fetch(
      new Request('http://localhost/api/students/legacy-file-url?audience=public'),
      env,
      studentCtx,
    )
    await waitOnExecutionContext(studentCtx)
    const studentBody = await studentRes.json() as any
    expect(studentBody.data.avatarUrl).toBe('/api/files/avatars/legacy.png')
    expect(studentBody.data.musicUrl).toBe('/api/files/music/legacy.mp3')
    expect(studentBody.data.backgroundUrl).toBe('/api/files/backgrounds/legacy.png')

    const classmatesCtx = createExecutionContext()
    const classmatesRes = await worker.fetch(new Request('http://localhost/api/classmates'), env, classmatesCtx)
    await waitOnExecutionContext(classmatesCtx)
    const classmatesBody = await classmatesRes.json() as any
    const classmate = classmatesBody.data.find((item: any) => item.slug === 'legacy-file-url')
    expect(classmate.avatarUrl).toBe('/api/files/avatars/legacy.png')

    const timelineCtx = createExecutionContext()
    const timelineRes = await worker.fetch(new Request('http://localhost/api/timeline?type=join'), env, timelineCtx)
    await waitOnExecutionContext(timelineCtx)
    const timelineBody = await timelineRes.json() as any
    const timelineItem = timelineBody.data.find((item: any) => item.slug === 'legacy-file-url')
    expect(timelineItem.avatarUrl).toBe('/api/files/avatars/legacy.png')
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

  it('GET /api/classmates uses the short shared public cache policy', async () => {
    const req = new Request('http://localhost/api/classmates')
    const ctx = createExecutionContext()
    const res = await worker.fetch(req, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(res.status).toBe(200)
    const cacheControl = res.headers.get('Cache-Control') || ''
    expect(cacheControl).toBe('public, max-age=60, s-maxage=60, stale-while-revalidate=300')
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
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.71' },
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

  it('GET /api/albums batches photo loading without changing album order or photo fields', async () => {
    const albumIds = ['albums-batch-a', 'albums-batch-b']
    await env.DB.batch([
      env.DB.prepare('DELETE FROM photos WHERE album_id IN (?, ?)').bind(...albumIds),
      env.DB.prepare('DELETE FROM albums WHERE id IN (?, ?)').bind(...albumIds),
      env.DB.prepare(
        `INSERT INTO albums (id, title, description, frame_style, sort_order, cover_r2_key, tags, featured, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(albumIds[0], '批量相册甲', '相册甲说明', 'paper', 10, 'covers/batch-a.jpg', '["甲"]', 1, '2026-07-18 00:00:01'),
      env.DB.prepare(
        `INSERT INTO albums (id, title, description, frame_style, sort_order, cover_r2_key, tags, featured, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(albumIds[1], '批量相册乙', '相册乙说明', 'film', 20, null, '["乙"]', 0, '2026-07-18 00:00:02'),
      env.DB.prepare(
        `INSERT INTO photos (id, album_id, filename, caption, r2_key, sort_order, created_at, media_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind('albums-batch-photo-1', albumIds[0], '甲-1.jpg', '甲-1', 'photos/batch-a-1.jpg', 2, '2026-07-18 00:00:03', JSON.stringify({ variants: [{ key: 'photos/batch-a-1_320.webp', contentType: 'image/webp', width: 320, height: 213, kind: '320' }] })),
      env.DB.prepare(
        `INSERT INTO photos (id, album_id, filename, caption, r2_key, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind('albums-batch-photo-2', albumIds[0], '甲-2.jpg', '甲-2', 'photos/batch-a-2.jpg', 1, '2026-07-18 00:00:04'),
      env.DB.prepare(
        `INSERT INTO photos (id, album_id, filename, caption, r2_key, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind('albums-batch-photo-3', albumIds[1], '乙-1.jpg', '乙-1', 'photos/batch-b-1.jpg', 1, '2026-07-18 00:00:05'),
    ])

    const preparedQueries: string[] = []
    const countingDb = new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property !== 'prepare') return Reflect.get(target, property, receiver)
        return (query: string) => {
          preparedQueries.push(query)
          return target.prepare(query)
        }
      },
    }) as unknown as D1Database
    const bindings = new Proxy(env, {
      get(target, property, receiver) {
        return property === 'DB' ? countingDb : Reflect.get(target, property, receiver)
      },
    })

    const ctx = createExecutionContext()
    const res = await worker.fetch(new Request('http://localhost/api/albums'), bindings, ctx)
    await waitOnExecutionContext(ctx)
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.filter((album: any) => albumIds.includes(album.id))).toEqual([
      {
        id: albumIds[0],
        title: '批量相册甲',
        description: '相册甲说明',
        frameStyle: 'paper',
        sortOrder: 10,
        coverR2Key: 'covers/batch-a.jpg',
        tags: ['甲'],
        featured: true,
        photos: [
          { id: 'albums-batch-photo-2', albumId: albumIds[0], filename: '甲-2.jpg', caption: '甲-2', r2Key: 'photos/batch-a-2.jpg', sortOrder: 1, createdAt: '2026-07-18 00:00:04' },
          { id: 'albums-batch-photo-1', albumId: albumIds[0], filename: '甲-1.jpg', caption: '甲-1', r2Key: 'photos/batch-a-1.jpg', sortOrder: 2, createdAt: '2026-07-18 00:00:03', media: { variants: [{ key: 'photos/batch-a-1_320.webp', contentType: 'image/webp', width: 320, height: 213, kind: '320' }] } },
        ],
        createdAt: '2026-07-18 00:00:01',
      },
      {
        id: albumIds[1],
        title: '批量相册乙',
        description: '相册乙说明',
        frameStyle: 'film',
        sortOrder: 20,
        coverR2Key: null,
        tags: ['乙'],
        featured: false,
        photos: [
          { id: 'albums-batch-photo-3', albumId: albumIds[1], filename: '乙-1.jpg', caption: '乙-1', r2Key: 'photos/batch-b-1.jpg', sortOrder: 1, createdAt: '2026-07-18 00:00:05' },
        ],
        createdAt: '2026-07-18 00:00:02',
      },
    ])
    expect(preparedQueries.filter(query => /SELECT \* FROM photos WHERE album_id = \?/.test(query))).toHaveLength(0)
    expect(preparedQueries.filter(query => /FROM photos/.test(query))).toHaveLength(1)

    const timelineCtx = createExecutionContext()
    const timelineRes = await worker.fetch(new Request('http://localhost/api/timeline?type=photo'), env, timelineCtx)
    await waitOnExecutionContext(timelineCtx)
    const timelineBody = await timelineRes.json() as any
    const timelinePhoto = timelineBody.data.find((item: any) => item.id === 'photo_albums-batch-photo-1')
    expect(timelinePhoto.media.variants[0]).toMatchObject({ key: 'photos/batch-a-1_320.webp', width: 320 })
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
  it('POST /api/students — 自动初始化默认密码并要求首次改密', async () => {
    const token = await loginAsAdminForTest()
    const createReq = new Request('http://localhost/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: '新建账号同学', slug: 'new-account-student' }),
    })
    const createCtx = createExecutionContext()
    const createRes = await worker.fetch(createReq, env, createCtx)
    await waitOnExecutionContext(createCtx)
    const createBody = await createRes.json() as any

    expect(createRes.status).toBe(200)
    expect(createBody.data).not.toHaveProperty('initialPassword')

    const row = await env.DB.prepare(
      'SELECT account_password_hash, account_initial_password_changed, account_status FROM students WHERE slug = ?'
    ).bind('new-account-student').first() as any
    expect(row.account_password_hash).toMatch(/^pbkdf2:/)
    expect(row.account_password_hash).not.toContain('123456')
    expect(row.account_initial_password_changed).toBe(0)
    expect(row.account_status).toBe('pending')

    const loginReq = new Request('http://localhost/api/classmate-auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'new-account-student', password: '123456' }),
    })
    const loginCtx = createExecutionContext()
    const loginRes = await worker.fetch(loginReq, env, loginCtx)
    await waitOnExecutionContext(loginCtx)
    const loginBody = await loginRes.json() as any

    expect(loginRes.status).toBe(200)
    expect(loginBody.data.mustChangePassword).toBe(true)
  })

  it('PUT /api/students/:slug — 管理员更新学生档案与隐私权限', async () => {
    // 1. 登录获取 admin token
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test-owner', password: 'test-owner-pass' }),
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
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.72' },
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
      body: JSON.stringify({ username: 'test-owner', password: 'test-owner-pass' }),
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
    body: JSON.stringify({ username: 'test-owner', password: 'test-owner-pass' }),
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

  it('classmate can submit public message and the legacy endpoint returns approved with visible database status', async () => {
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
    expect(submitBody.data.status).toBe('approved')

    // Database status should be 'visible' (not 'pending')
    const row = await env.DB.prepare(
      "SELECT status FROM public_messages WHERE id = ?"
    ).bind(submitBody.data.id).first() as any
    expect(row.status).toBe('visible')
  })

  it('non-recipient cannot read mailbox thread', async () => {
    await env.DB.prepare("INSERT OR IGNORE INTO students (id, name, slug, account_status, account_initial_password_changed, account_password_hash) VALUES ('stu_other', '其他同学', 'other', 'active', 1, ?)").bind(await testHashPassword('123456')).run()
    const ownerToken = await loginAsClassmateForTest('test_init')
    const otherToken = await loginAsClassmateForTest('other')

    // Seed thread, message, and recipient via SQL
    await env.DB.prepare(
      "INSERT INTO mail_threads (id, subject, thread_type, created_by_type, created_by_slug, allow_reply, created_at, updated_at) VALUES ('api-test-mail-thread', '一封测试信', 'private', 'student', 'test_init', 1, datetime('now'), datetime('now'))"
    ).run()
    await env.DB.prepare(
      "INSERT INTO mail_messages (id, thread_id, sender_type, sender_slug, body, created_at) VALUES ('api-test-mail-msg', 'api-test-mail-thread', 'student', 'test_init', '你好，未来见。', datetime('now'))"
    ).run()
    await env.DB.prepare(
      "INSERT INTO mail_recipients (id, thread_id, recipient_slug) VALUES ('api-test-mail-rcp', 'api-test-mail-thread', 'other')"
    ).run()

    const recipientReq = new Request('http://localhost/api/mailbox/threads/api-test-mail-thread', {
      headers: { 'X-Classmate-Token': otherToken },
    })
    const recipientCtx = createExecutionContext()
    const recipientRes = await worker.fetch(recipientReq, env, recipientCtx)
    await waitOnExecutionContext(recipientCtx)
    expect(recipientRes.status).toBe(200)

    await env.DB.prepare("INSERT OR IGNORE INTO students (id, name, slug, account_status, account_initial_password_changed, account_password_hash) VALUES ('stu_third', '第三同学', 'third', 'active', 1, ?)").bind(await testHashPassword('123456')).run()
    const thirdToken = await loginAsClassmateForTest('third')
    const forbiddenReq = new Request('http://localhost/api/mailbox/threads/api-test-mail-thread', {
      headers: { 'X-Classmate-Token': thirdToken },
    })
    const forbiddenCtx = createExecutionContext()
    const forbiddenRes = await worker.fetch(forbiddenReq, env, forbiddenCtx)
    await waitOnExecutionContext(forbiddenCtx)
    expect(forbiddenRes.status).toBe(403)
  })
})



