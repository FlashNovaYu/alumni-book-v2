import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'
import worker from '../src/index'

const migrations = [
  { name: '0001_init', queries: [
    `CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      is_owner INTEGER DEFAULT 0,
      avatar_url TEXT,
      music_url TEXT,
      music_title TEXT,
      music_autoplay INTEGER DEFAULT 0,
      background_url TEXT,
      background_color TEXT,
      info TEXT DEFAULT '{}',
      photos TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS site_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      frame_style TEXT DEFAULT 'none',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      album_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      caption TEXT DEFAULT '',
      r2_key TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
  ]},
  { name: '0002_add_custom_html', queries: [
    `ALTER TABLE students ADD COLUMN custom_html TEXT`,
  ]},
  { name: '0003_add_messages', queries: [
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      student_slug TEXT NOT NULL,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      is_hidden INTEGER DEFAULT 0,
      is_approved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_student ON messages(student_slug, is_approved, created_at DESC)`,
  ]},
  { name: '0004_add_timeline', queries: [
    `CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      event_date TEXT NOT NULL,
      photo_r2_key TEXT,
      is_milestone INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline_events(event_date DESC)`,
  ]},
  { name: '0005_info_columns', queries: [
    `ALTER TABLE students ADD COLUMN mbti TEXT DEFAULT ''`,
    `ALTER TABLE students ADD COLUMN graduation_year TEXT DEFAULT ''`,
    `ALTER TABLE students ADD COLUMN school TEXT DEFAULT ''`,
    `ALTER TABLE students ADD COLUMN class_name TEXT DEFAULT ''`,
  ]},
  { name: '0006_self_service_fields', queries: [
    `ALTER TABLE students ADD COLUMN visit_count INTEGER DEFAULT 0`,
    `ALTER TABLE messages ADD COLUMN reactions TEXT DEFAULT '{}'`,
    `ALTER TABLE messages ADD COLUMN reply TEXT`,
    `ALTER TABLE messages ADD COLUMN reply_at TEXT`,
  ]},
]

beforeAll(async () => {
  await applyD1Migrations(env.DB, migrations)
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
    expect(Array.isArray(body.data)).toBe(true)
  })
})
