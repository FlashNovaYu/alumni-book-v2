import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { cors } from 'hono/cors'
import { jwt } from 'hono/jwt'
import { studentsRoutes } from './routes/students'
import { configRoutes } from './routes/config'
import { albumsRoutes } from './routes/albums'
import { uploadRoutes } from './routes/upload'
import { authRoutes } from './routes/auth'
import { messagesRoutes } from './routes/messages'
import { timelineRoutes } from './routes/timeline'
import { classmateRoutes } from './routes/classmate'
import { highlightsRoutes } from './routes/highlights'
import { classmateAuthRoutes } from './routes/classmateAuth'
import { verifyClassmateSession } from './lib/classmateSession'
import { publicMessagesRoutes } from './routes/publicMessages'
import { notificationsRoutes } from './routes/notifications'
import { inboxRoutes } from './routes/inbox'
import { mailboxRoutes } from './routes/mailbox'
import { adminMailRoutes } from './routes/adminMail'
import { etag } from 'hono/etag'
import { classSpaceRoutes } from './routes/classSpace'
import { groupChatRoutes } from './routes/groupChat'
import { adminGuard } from './lib/adminGuard'
import { adminCommunityRoutes } from './routes/adminCommunity'


type Bindings = {
  DB: D1Database
  R2: R2Bucket
  JWT_SECRET: string
  CORS_ORIGIN: string
}

type Variables = {
  requestId: string
  jwtPayload?: any
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Request ID
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)
  await next()
  c.header('X-Request-Id', requestId)
})

// CORS
app.use('*', async (c, next) => {
  const originVal = c.env.CORS_ORIGIN || '*'
  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) return originVal
      if (
        origin === originVal ||
        origin.endsWith('.pages.dev') ||
        origin.endsWith('.github.io') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return origin
      }
      return originVal
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Classmate-Token'],
  })
  return corsMiddleware(c, next)
})

const PUBLIC_REVALIDATED_GET_PREFIXES = [
  '/api/classmates',
  '/api/students',
  '/api/config',
  '/api/albums',
  '/api/rankings',
  '/api/messages',
  '/api/timeline',
  '/api/highlights',
  '/api/public-messages',
]

function isPublicRevalidatedGet(path: string) {
  return PUBLIC_REVALIDATED_GET_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

// 动态 API 缓存策略：
// - 公开 GET JSON 允许浏览器保存并用 ETag 重新验证，避免重复下载完整响应。
// - 管理、认证、写操作仍禁用存储，避免隐私与后台状态污染。
// - R2 文件路由保留后续专用 immutable 缓存头。
app.use('/api/*', async (c, next) => {
  await next()

  const path = c.req.path
  if (path.startsWith('/api/files/')) return

  if (path === '/api/class-space/overview') {
    c.res.headers.set('Cache-Control', 'private, no-store')
    return
  }

  if (c.req.method === 'GET' && isPublicRevalidatedGet(path)) {
    c.res.headers.set('Cache-Control', 'no-cache, max-age=0, must-revalidate')
    return
  }

  c.res.headers.set('Cache-Control', 'no-store, must-revalidate')
  c.res.headers.set('Pragma', 'no-cache')
  c.res.headers.set('Expires', '0')
})

// 为公开 JSON 接口启用 ETag 自动缓存校验
app.use('/api/classmates', etag())
app.use('/api/students', etag())
app.use('/api/students/*', etag())
app.use('/api/config', etag())
app.use('/api/albums', etag())
app.use('/api/rankings', etag())
app.use('/api/class-space/overview', etag())

// 创建 JWT 中间件
function createJwtMiddleware(secret: string) {
  return jwt({ secret, alg: 'HS256' })
}

// 健康检查
app.get('/api/health', (c) => {
  return c.json({ success: true, data: { status: 'ok', version: '2.0.0' } })
})

// 认证路由 (不需要 JWT)
app.route('/api/auth', authRoutes)
app.route('/api/classmate-auth', classmateAuthRoutes)
app.route('/api', groupChatRoutes)

// 公开路由 (不需要 JWT)
app.get('/api/classmates', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare(
    'SELECT name, slug, avatar_url, info, school, class_name, mbti FROM students ORDER BY name'
  ).all()

  const classmates = (results || []).map((row: any) => {
    const info = JSON.parse(row.info || '{}')
    const required = [
      'nickname', 'motto', 'bestMemory', 'favoriteSong', 'futureSelf',
      'letterToClassmates', 'profileModules', 'favoriteFood', 'bestSubject',
      'targetUniversity', 'futureCareer', 'bestLesson', 'deskmateFun',
      'classMeme', 'mbti'
    ]
    const hasValue = (val: any) => {
      if (Array.isArray(val)) return val.length > 0
      return val !== null && val !== undefined && String(val).trim().length > 0
    }
    const filled = required.filter((key) => hasValue(info[key])).length + (row.avatar_url ? 1 : 0)
    const tags = [info.mbti, info.favoriteSong, info.bestSubject, info.school || row.school]
      .filter(Boolean)
      .map((value: string) => String(value).trim())
      .slice(0, 4)

    return {
      name: row.name,
      slug: row.slug,
      hasPage: true,
      avatarUrl: row.avatar_url,
      motto: info.motto || '',
      nickname: info.nickname || '',
      school: row.school || info.school || '',
      className: row.class_name || info.class || '',
      mbti: row.mbti || info.mbti || '',
      seatNo: info.seatNo || '',
      dormNo: info.dormNo || '',
      groupName: info.groupName || '',
      completion: Math.round((filled / 16) * 100),
      tags,
    }
  })

  c.header('Cache-Control', 'public, max-age=60')
  return c.json({ success: true, data: classmates })
})

app.get('/api/classmates/verify', async (c) => {
  const name = c.req.query('name')
  if (!name) {
    return c.json({ success: false, message: '姓名不能为空' }, 400)
  }
  const db = c.env.DB
  const row = await db.prepare('SELECT slug FROM students WHERE name = ?').bind(name).first()
  if (row) {
    return c.json({ success: true, data: { found: true, slug: (row as any).slug } })
  }
  return c.json({ success: true, data: { found: false } })
})

app.get('/api/students', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare(
    'SELECT * FROM students ORDER BY name'
  ).all()

  const formatted = (results || []).map(formatStudent)
  const students = await Promise.all(formatted.map(async (s) => {
    const audience = await determineAudience(c, s.slug)
    return filterStudentForAudience(s, audience)
  }))
  return c.json({ success: true, data: students })
})

app.get('/api/students/:slug', async (c) => {
  const slug = c.req.param('slug')
  const db = c.env.DB
  const row = await db.prepare('SELECT * FROM students WHERE slug = ?').bind(slug).first()

  if (!row) {
    return c.json({ success: false, message: '学生不存在' }, 404)
  }

  const student = formatStudent(row)
  const audience = await determineAudience(c, slug)
  const filtered = filterStudentForAudience(student, audience)
  return c.json({ success: true, data: filtered })
})

app.get('/api/config', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare('SELECT key, value FROM site_config').all()

  const config: Record<string, any> = {}
  for (const row of results || []) {
    try {
      config[(row as any).key] = JSON.parse((row as any).value)
    } catch {
      config[(row as any).key] = (row as any).value
    }
  }

  c.header('Cache-Control', 'public, max-age=60')
  return c.json({
    success: true,
    data: {
      particles: config.particles || {},
      footer: config.footer || { copyright: '同学录 · 青春回忆', beian: '', beianUrl: '' },
      preface: config.preface || { title: '致青春岁月', subtitle: '写在翻开同学录之前', content: '' },
      acknowledgments: config.acknowledgments || [],
      typography: config.typography || { fontFamily: 'default', fontSize: 15 },
      museum: config.museum || {
        enabled: true,
        heroEyebrow: 'CLASS MEMORY MUSEUM',
        heroTitle: '青春纪念馆',
        heroSubtitle: '翻开这本会呼吸的同学录，重新走过我们的青春长廊。',
        particleLevel: 'low',
        enableClassGraph: true,
        enableSeatMap: true,
      },
    },
  })
})

app.get('/api/admin/config', async (c) => {
  const db = c.env.DB
  const { results } = await db.prepare('SELECT key, value FROM site_config').all()

  const config: Record<string, any> = {}
  for (const row of results || []) {
    try {
      config[(row as any).key] = JSON.parse((row as any).value)
    } catch {
      config[(row as any).key] = (row as any).value
    }
  }

  return c.json({
    success: true,
    data: {
      particles: config.particles || {},
      footer: config.footer || { copyright: '同学录 · 青春回忆', beian: '', beianUrl: '' },
      preface: config.preface || { title: '致青春岁月', subtitle: '写在翻开同学录之前', content: '' },
      acknowledgments: config.acknowledgments || [],
      typography: config.typography || { fontFamily: 'default', fontSize: 15 },
      museum: config.museum || {
        enabled: true,
        heroEyebrow: 'CLASS MEMORY MUSEUM',
        heroTitle: '青春纪念馆',
        heroSubtitle: '翻开这本会呼吸的同学录，重新走过我们的青春长廊。',
        particleLevel: 'low',
        enableClassGraph: true,
        enableSeatMap: true,
      },
    },
  })
})

app.get('/api/albums', async (c) => {
  const db = c.env.DB
  const { results: albums } = await db.prepare(
    'SELECT * FROM albums ORDER BY sort_order, created_at'
  ).all()

  const albumsWithPhotos = await Promise.all(
    (albums || []).map(async (album: any) => {
      const { results: photos } = await db.prepare(
        'SELECT * FROM photos WHERE album_id = ? ORDER BY sort_order'
      ).bind(album.id).all()

      return {
        id: album.id,
        title: album.title,
        description: album.description,
        frameStyle: album.frame_style,
        sortOrder: album.sort_order,
        coverR2Key: album.cover_r2_key,
        tags: JSON.parse(album.tags || '[]'),
        featured: !!album.featured,
        photos: (photos || []).map((p: any) => ({
          id: p.id,
          albumId: p.album_id,
          filename: p.filename,
          caption: p.caption,
          r2Key: p.r2_key,
          sortOrder: p.sort_order,
          createdAt: p.created_at,
        })),
        createdAt: album.created_at,
      }
    })
  )

  c.header('Cache-Control', 'public, max-age=60')
  return c.json({ success: true, data: albumsWithPhotos })
})

// 同学自助路由 (HMAC token 认证，无需 JWT)
app.route('/api', classmateRoutes)

// 访问计数
app.post('/api/students/:slug/visit', async (c) => {
  const slug = c.req.param('slug')
  const db = c.env.DB
  await db.prepare('UPDATE students SET visit_count = visit_count + 1 WHERE slug = ?').bind(slug).run()
  const row = await db.prepare('SELECT visit_count FROM students WHERE slug = ?').bind(slug).first()
  return c.json({ success: true, data: { visitCount: (row as any)?.visit_count || 0 } })
})

// 人气排行
app.get('/api/rankings', async (c) => {
  const db = c.env.DB
  
  try {
    const [visitsResults, messagesResults, recentResults] = await Promise.all([
      db.prepare('SELECT name, slug, avatar_url, visit_count FROM students ORDER BY visit_count DESC LIMIT 5').all(),
      db.prepare('SELECT s.name, s.slug, s.avatar_url, COUNT(m.id) as message_count FROM students s JOIN messages m ON s.slug = m.student_slug WHERE m.is_approved = 1 GROUP BY s.slug ORDER BY message_count DESC LIMIT 5').all(),
      db.prepare('SELECT name, slug, avatar_url, updated_at FROM students ORDER BY updated_at DESC LIMIT 5').all()
    ])

    const visits = (visitsResults.results || []).map((r: any) => ({
      name: r.name,
      slug: r.slug,
      avatarUrl: r.avatar_url,
      value: `${r.visit_count || 0} 次浏览`,
    }))

    const messages = (messagesResults.results || []).map((r: any) => ({
      name: r.name,
      slug: r.slug,
      avatarUrl: r.avatar_url,
      value: `${r.message_count || 0} 条留言`,
    }))

    const recent = (recentResults.results || []).map((r: any) => {
      const dateStr = r.updated_at ? r.updated_at.split(' ')[0] : '最近'
      return {
        name: r.name,
        slug: r.slug,
        avatarUrl: r.avatar_url,
        value: `更新于 ${dateStr}`,
      }
    })

    c.header('Cache-Control', 'public, max-age=60')
    return c.json({
      success: true,
      data: { visits, messages, recent }
    })
  } catch (e: any) {
    console.error('Failed to query rankings:', e)
    return c.json({ success: false, message: '排行数据查询失败' }, 500)
  }
})

// R2 文件访问
app.get('/api/files/*', async (c) => {
  const key = c.req.path.replace('/api/files/', '')
  if (!key) {
    return c.json({ success: false, message: '文件路径无效' }, 400)
  }
  if (!c.env.R2) {
    return c.json({ success: false, message: '文件存储(R2)未启用' }, 503)
  }
  
  const object = await c.env.R2.get(key)

  if (!object) {
    return c.json({ success: false, message: '文件不存在' }, 404)
  }

  const clientEtag = c.req.header('If-None-Match')
  if (object.httpEtag && clientEtag === object.httpEtag) {
    return new Response(null, { status: 304 })
  }

  const headers = new Headers()
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag)
  }

  return new Response(object.body, { headers })
})

// JWT 中间件包装器
function jwtGuard(secret: string) {
  const mw = createJwtMiddleware(secret)
  return async (c: any, next: any) => {
    try {
      await mw(c, next)
    } catch (e) {
      if (e instanceof HTTPException) return e.getResponse()
      throw e
    }
  }
}

// 需要认证的路由
app.use('/api/admin/*', async (c, next) => {
  return adminGuard(c, next)
})

app.use('/api/students', async (c, next) => {
  if (c.req.method === 'GET') return next()
  return adminGuard(c, next)
})

app.use('/api/students/:slug', async (c, next) => {
  if (c.req.method === 'GET') return next()
  return adminGuard(c, next)
})

app.use('/api/config', async (c, next) => {
  if (c.req.method === 'GET') return next()
  return adminGuard(c, next)
})

app.use('/api/albums', async (c, next) => {
  if (c.req.method === 'GET') return next()
  return adminGuard(c, next)
})

app.use('/api/albums/:id', async (c, next) => {
  return adminGuard(c, next)
})

app.use('/api/photos/:id', async (c, next) => {
  return adminGuard(c, next)
})

app.use('/api/upload', async (c, next) => {
  return adminGuard(c, next)
})

app.use('/api/admin/messages', async (c, next) => {
  return adminGuard(c, next)
})

app.use('/api/admin/messages/:id', async (c, next) => {
  return adminGuard(c, next)
})

app.use('/api/timeline/events', async (c, next) => {
  if (c.req.method === 'GET') return next()
  return adminGuard(c, next)
})

app.use('/api/timeline/events/:id', async (c, next) => {
  return adminGuard(c, next)
})

// 注册路由
app.route('/api', studentsRoutes)
app.route('/api', configRoutes)
app.route('/api', albumsRoutes)
app.route('/api', uploadRoutes)
app.route('/api', messagesRoutes)
app.route('/api', timelineRoutes)
app.route('/api', classSpaceRoutes)
app.route('/api/highlights', highlightsRoutes)
app.route('/api', publicMessagesRoutes)
app.route('/api', notificationsRoutes)
app.route('/api', inboxRoutes)
app.route('/api', mailboxRoutes)
app.route('/api', adminMailRoutes)
app.route('/api', adminCommunityRoutes)

// 管理后台统计
app.get('/api/admin/stats', async (c) => {
  const db = c.env.DB
  
  const [
    studentsVal,
    albumsVal,
    photosVal,
    pendingMessagesVal,
    approvedMessagesVal,
    totalVisitsVal,
    recentStudentsList,
    topVisitedList,
    recentMessagesList,
    allStudents
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) as count FROM students').first(),
    db.prepare('SELECT COUNT(*) as count FROM albums').first(),
    db.prepare('SELECT COUNT(*) as count FROM photos').first(),
    db.prepare('SELECT COUNT(*) as count FROM messages WHERE is_approved = 0').first(),
    db.prepare('SELECT COUNT(*) as count FROM messages WHERE is_approved = 1').first(),
    db.prepare('SELECT SUM(visit_count) as sum FROM students').first(),
    db.prepare('SELECT name, slug, updated_at, info FROM students ORDER BY updated_at DESC LIMIT 5').all(),
    db.prepare('SELECT name, slug, visit_count FROM students ORDER BY visit_count DESC LIMIT 5').all(),
    db.prepare('SELECT id, author_name as authorName, student_slug as studentSlug, content, created_at as createdAt, is_approved as isApproved FROM messages ORDER BY created_at DESC LIMIT 5').all(),
    db.prepare('SELECT name, avatar_url, info FROM students').all()
  ])

  // 内容与安全审计
  const auditAlerts: any[] = []
  for (const s of allStudents.results || []) {
    const row = s as any
    const name = row.name
    let info: any = {}
    try {
      info = JSON.parse(row.info || '{}')
    } catch {}

    if (!row.avatar_url) {
      auditAlerts.push({ type: 'missingAvatar', message: `${name} 未上传头像` })
    }
    if (!info.motto) {
      auditAlerts.push({ type: 'missingMotto', message: `${name} 缺少座右铭` })
    }
    if (!info.bestMemory || !info.letterToClassmates) {
      auditAlerts.push({ type: 'incompleteProfile', message: `${name} 档案内容待完善` })
    }
    if (!info.seatNo) {
      auditAlerts.push({ type: 'missingSeatNo', message: `${name} 缺少座位号 (seatNo)` })
    }
    if (!info.groupName) {
      auditAlerts.push({ type: 'missingGroupName', message: `${name} 缺少小组信息 (groupName)` })
    }
  }

  const pendingCount = (pendingMessagesVal as any)?.count || 0

  return c.json({
    success: true,
    data: {
      studentCount: (studentsVal as any)?.count || 0,
      albumCount: (albumsVal as any)?.count || 0,
      photoCount: (photosVal as any)?.count || 0,
      pendingMessageCount: pendingCount,
      approvedMessageCount: (approvedMessagesVal as any)?.count || 0,
      totalVisitCount: (totalVisitsVal as any)?.sum || 0,
      recentStudents: recentStudentsList.results || [],
      topVisited: topVisitedList.results || [],
      recentMessages: recentMessagesList.results || [],
      auditAlerts,
    },
  })
})

// base64url 解码和编码辅助函数
function fromBase64url(str: string): string {
  try {
    return atob(str.replace(/-/g, '+').replace(/_/g, '/'))
  } catch {
    return ''
  }
}

function base64url(str: string): string {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return base64url(String.fromCharCode(...new Uint8Array(sig)))
}

async function verifyClassmateToken(token: string, secret: string): Promise<string | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const slug = fromBase64url(parts[0])
    const ts = parseInt(fromBase64url(parts[1]))
    if (Date.now() - ts > 30 * 60 * 1000) return null
    const derived = await hmacSign('classmate-auth', secret)
    const expectedSig = await hmacSign(`${slug}:${ts}`, derived)
    if (expectedSig !== parts[2]) return null
    return slug
  } catch {
    return null
  }
}

async function determineAudience(c: any, studentSlug: string): Promise<'public' | 'classmates' | 'owner' | 'admin'> {
  const authHeader = c.req.header('Authorization')
  const adminToken = authHeader?.replace('Bearer ', '')
  if (adminToken) {
    try {
      const session = await c.env.DB.prepare(
        "SELECT token FROM admin_sessions WHERE token = ? AND expires_at > datetime('now')"
      ).bind(adminToken).first()
      if (session) return 'admin'
    } catch {}
  }

  const classmateToken = c.req.header('X-Classmate-Token')
  if (classmateToken) {
    const authedSlug = await verifyClassmateSession(c.env.DB, classmateToken)
    if (authedSlug) {
      if (authedSlug === studentSlug) return 'owner'
      return 'classmates'
    }
  }

  const url = new URL(c.req.url)
  const requestedAudience = url.searchParams.get('audience')
  if (requestedAudience === 'public') {
    return 'public'
  }

  return 'public'
}

function filterStudentForAudience(student: any, audience: 'public' | 'classmates' | 'owner' | 'admin') {
  const info = { ...student.info }
  const visibility = info.visibility || {}
  
  const sensitiveFields = ['qq', 'wechat', 'phone', 'email', 'address', 'weibo']
  
  for (const key of sensitiveFields) {
    const level = visibility[key] || 'classmates'
    
    if (level === 'owner' && audience !== 'owner' && audience !== 'admin') {
      delete info[key]
    }
    if (level === 'hidden' && audience !== 'admin') {
      delete info[key]
    }
    if (level === 'classmates' && audience === 'public') {
      delete info[key]
    }
  }
  return { ...student, info }
}

// 错误处理
app.onError((err, c) => {
  const requestId = c.get('requestId') || 'unknown'
  console.error(`[Request ID: ${requestId}] Worker error:`, err)
  
  if (err instanceof HTTPException) {
    const res = err.getResponse()
    res.headers.set('X-Request-Id', requestId)
    return res
  }
  return c.json({ success: false, message: '服务器内部错误', requestId }, 500)
})

app.notFound((c) => {
  return c.json({ success: false, message: '接口不存在' }, 404)
})

function formatStudent(row: any) {
  const info = JSON.parse(row.info || '{}')
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isOwner: !!row.is_owner,
    avatarUrl: row.avatar_url,
    musicUrl: row.music_url,
    musicTitle: row.music_title,
    musicAutoplay: !!row.music_autoplay,
    backgroundUrl: row.background_url,
    backgroundColor: row.background_color,
    customHtml: row.custom_html,
    privacyLevel: row.privacy_level || 'classmates',
    accountStatus: row.account_status,
    accountLastLoginAt: row.account_last_login_at,
    info: {
      ...info,
      mbti: row.mbti || info.mbti || '',
      graduationYear: row.graduation_year || info.graduationYear || '',
      school: row.school || info.school || '',
      class: row.class_name || info.class || '',
    },
    photos: JSON.parse(row.photos || '[]'),
    visitCount: row.visit_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export default app
// Trigger worker deployment verification on push - try 2

