import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { cors } from 'hono/cors'
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
import { adminAccountsRoutes } from './routes/adminAccounts'
import { getAdminPrincipal, hasPermission, loadActiveAdmin, requireAdminSession, requireOwner, requirePasswordChangeCompleted, requirePermission, type AdminPermission } from './lib/adminAuth'
import { adminMailRoutes } from './routes/adminMail'
import { etag } from 'hono/etag'
import { classSpaceRoutes } from './routes/classSpace'
import { groupChatRoutes } from './routes/groupChat'
import { adminCommunityRoutes } from './routes/adminCommunity'
import { directConversationsRoutes } from './routes/directConversations'
import { filesRoutes } from './routes/files'
import { normalizeFileUrl } from './lib/fileUrl'
import { audienceForStudent, filterStudentForAudience, type StudentViewer } from './lib/studentAudience'


type Bindings = {
  DB: D1Database
  R2: R2Bucket
  JWT_SECRET: string
  CORS_ORIGIN: string
  CORS_PREVIEW_ORIGINS?: string
}

type Variables = {
  requestId: string
  jwtPayload?: any
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const DEFAULT_CORS_ORIGIN = 'https://alumni-book.pages.dev'

function normalizeHttpsOrigin(value: string | undefined): string | null {
  if (!value || value === '*') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash
      ? url.origin
      : null
  } catch {
    return null
  }
}

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  } catch {
    return false
  }
}

function resolveCorsOrigin(origin: string, env: Bindings): string | undefined {
  if (isLocalDevelopmentOrigin(origin)) return origin

  const allowedOrigins = new Set([
    normalizeHttpsOrigin(env.CORS_ORIGIN) || DEFAULT_CORS_ORIGIN,
    ...(env.CORS_PREVIEW_ORIGINS || '')
      .split(',')
      .map(normalizeHttpsOrigin)
      .filter((value): value is string => value !== null),
  ])

  return allowedOrigins.has(origin) ? origin : undefined
}

// Request ID
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)
  await next()
  c.header('X-Request-Id', requestId)
})

// API 仅返回数据，不应被嵌入或作为可执行文档加载。
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  c.header('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
})

// CORS
app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: (origin) => resolveCorsOrigin(origin, c.env),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Classmate-Token'],
  })
  return corsMiddleware(c, next)
})

app.use('/api/*', async (c, next) => {
  const missingBindings = [
    !c.env?.DB && 'DB',
    !c.env?.R2 && 'R2',
    !c.env?.JWT_SECRET && 'JWT_SECRET',
  ].filter(Boolean)

  if (missingBindings.length > 0) {
    const requestId = c.get('requestId') || 'unknown'
    console.error(`[Request ID: ${requestId}] Cloudflare bindings are incomplete`)
    return c.json({
      success: false,
      message: '服务配置不完整',
      requestId,
    }, 503)
  }

  return next()
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
    'SELECT name, slug, avatar_url, info, school, class_name, mbti, is_owner, custom_html FROM students ORDER BY name'
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
      hasStandardProfile: !(row.is_owner && row.custom_html),
      avatarUrl: normalizeFileUrl(row.avatar_url),
      motto: info.motto || '',
      nickname: info.nickname || '',
      school: row.school || info.school || '',
      className: row.class_name || info.class || '',
      mbti: row.mbti || info.mbti || '',
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

  const viewer = await resolveStudentViewer(c)
  const students = (results || [])
    .map(formatStudent)
    .map(student => filterStudentForAudience(student, audienceForStudent(viewer, student.slug)))
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
  const viewer = await resolveStudentViewer(c)
  const filtered = filterStudentForAudience(student, audienceForStudent(viewer, slug))
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
      identity: config.identity || { siteName: '同学录', className: '', classYear: '', shareDescription: '' },
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

app.use('/api/admin/config', requireAdminSession, requirePasswordChangeCompleted, requirePermission('site.settings.manage'))
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
      identity: config.identity || { siteName: '同学录', className: '', classYear: '', shareDescription: '' },
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
      avatarUrl: normalizeFileUrl(r.avatar_url),
      value: `${r.visit_count || 0} 次浏览`,
    }))

    const messages = (messagesResults.results || []).map((r: any) => ({
      name: r.name,
      slug: r.slug,
      avatarUrl: normalizeFileUrl(r.avatar_url),
      value: `${r.message_count || 0} 条留言`,
    }))

    const recent = (recentResults.results || []).map((r: any) => {
      const dateStr = r.updated_at ? r.updated_at.split(' ')[0] : '最近'
      return {
        name: r.name,
        slug: r.slug,
        avatarUrl: normalizeFileUrl(r.avatar_url),
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
app.route('/api', filesRoutes)

function permissionForMethod(read: AdminPermission, write: AdminPermission) {
  return async (c: any, next: any) => requirePermission(c.req.method === 'GET' ? read : write)(c, next)
}

function requireSessionForWrites(c: any, next: any) {
  return c.req.method === 'GET' ? next() : requireAdminSession(c, async () => { await requirePasswordChangeCompleted(c, next) })
}

function requireOwnerForWrites(c: any, next: any) {
  return c.req.method === 'GET' ? next() : requireOwner(c, next)
}

function permissionForWrites(permission: AdminPermission) {
  return async (c: any, next: any) => c.req.method === 'GET' ? next() : requirePermission(permission)(c, next)
}

// 管理接口先解析会话，再按业务能力授权。前端隐藏入口不构成安全边界。
app.use('/api/admin/*', requireAdminSession, requirePasswordChangeCompleted)
app.use('/api/admin/stats', requireOwner)
app.use('/api/admin/workbench', requirePermission('dashboard.view'))
app.use('/api/admin/accounts*', requireOwner)
app.use('/api/admin/account-candidates', requireOwner)
app.use('/api/admin/audit-logs', requireOwner)
app.use('/api/admin/messages', permissionForMethod('moderation.view', 'moderation.manage'))
app.use('/api/admin/messages/:id', permissionForMethod('moderation.view', 'moderation.manage'))
app.use('/api/admin/messages/*', permissionForMethod('moderation.view', 'moderation.manage'))
app.use('/api/admin/messages/batch', permissionForMethod('moderation.view', 'moderation.manage'))
app.use('/api/admin/public-messages', permissionForMethod('moderation.view', 'moderation.manage'))
app.use('/api/admin/public-messages/:id', permissionForMethod('moderation.view', 'moderation.manage'))
app.use('/api/admin/public-messages/*', permissionForMethod('moderation.view', 'moderation.manage'))
app.use('/api/admin/timeline/*', requirePermission('content.manage'))
app.use('/api/admin/notifications/*', permissionForMethod('notifications.view', 'notifications.publish'))
app.use('/api/admin/group-chat/*', permissionForMethod('moderation.view', 'moderation.manage'))
app.use('/api/admin/mail/*', permissionForMethod('notifications.view', 'notifications.publish'))

app.use('/api/students', requireSessionForWrites, requireOwnerForWrites)
app.use('/api/students/:slug', requireSessionForWrites, requireOwnerForWrites)
app.use('/api/config', requireSessionForWrites, requireOwnerForWrites)
app.use('/api/albums', requireSessionForWrites, permissionForWrites('content.manage'))
app.use('/api/albums/:id', requireAdminSession, requirePasswordChangeCompleted, requirePermission('content.manage'))
app.use('/api/photos/:id', requireAdminSession, requirePasswordChangeCompleted, requirePermission('content.manage'))
app.use('/api/upload', requireAdminSession, requirePasswordChangeCompleted)
app.use('/api/timeline/events', requireSessionForWrites, permissionForWrites('content.manage'))
app.use('/api/timeline/events/:id', requireAdminSession, requirePasswordChangeCompleted, requirePermission('content.manage'))

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
app.route('/api', directConversationsRoutes)
app.route('/api', mailboxRoutes)
app.route('/api', adminMailRoutes)
app.route('/api', adminCommunityRoutes)
app.route('/api', adminAccountsRoutes)

// 次级管理员工作台只聚合其职责范围内的计数与快捷入口，避免下发同学档案、浏览排行或资料完整度等数据。
app.get('/api/admin/workbench', async (c) => {
  const admin = getAdminPrincipal(c)
  if (!admin) return c.json({ success: false, message: '未提供管理会话' }, 401)

  const todos: Array<{ id: string; label: string; count: number; to: string }> = []
  const summary: Array<{ id: string; label: string; value: number; to: string }> = []

  if (hasPermission(admin, 'moderation.view')) {
    const [profileMessages, groupChatToday] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM messages WHERE is_approved = 0').first<{ count: number }>(),
      c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM public_messages WHERE client_nonce IS NOT NULL AND client_nonce NOT LIKE 'legacy:%' AND date(created_at, '+8 hours') = date('now', '+8 hours')"
      ).first<{ count: number }>(),
    ])
    todos.push({ id: 'profile-messages', label: '个人留言待审核', count: profileMessages?.count || 0, to: '/messages' })
    summary.push({ id: 'group-chat-today', label: '今日公共群聊', value: groupChatToday?.count || 0, to: '/messages?tab=group' })
  }

  if (hasPermission(admin, 'content.manage')) {
    const [albums, photos, timelineEvents] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM albums').first<{ count: number }>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM photos').first<{ count: number }>(),
      c.env.DB.prepare('SELECT COUNT(*) AS count FROM timeline_events').first<{ count: number }>(),
    ])
    summary.push(
      { id: 'albums', label: '班级相册', value: albums?.count || 0, to: '/albums' },
      { id: 'photos', label: '相册照片', value: photos?.count || 0, to: '/albums' },
      { id: 'timeline-events', label: '时光轴事件', value: timelineEvents?.count || 0, to: '/timeline' },
    )
  }

  if (hasPermission(admin, 'notifications.view')) {
    const threads = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM mail_threads WHERE created_by_type = 'admin'"
    ).first<{ count: number }>()
    summary.push({ id: 'mail-threads', label: '已发通知', value: threads?.count || 0, to: '/mail' })
  }

  return c.json({ success: true, data: { todos, summary } })
})

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
async function resolveStudentViewer(c: any): Promise<StudentViewer> {
  const authHeader = c.req.header('Authorization')
  const adminToken = authHeader?.replace(/^Bearer\s+/i, '')
  if (adminToken) {
    try {
      const session = await c.env.DB.prepare(
        `SELECT admin_account_id FROM admin_sessions
         WHERE token = ? AND revoked_at IS NULL AND julianday(expires_at) > julianday('now')`
      ).bind(adminToken).first() as { admin_account_id: string } | null
      const admin = session ? await loadActiveAdmin(c.env.DB, session.admin_account_id) : null
      if (admin && !admin.mustChangePassword && hasPermission(admin, 'students.manage')) return { kind: 'admin' }
    } catch {}
  }

  const classmateToken = c.req.header('X-Classmate-Token')
  if (classmateToken) {
    const authedSlug = await verifyClassmateSession(c.env.DB, classmateToken)
    if (authedSlug) return { kind: 'classmate', slug: authedSlug }
  }

  return { kind: 'public' }
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
    avatarUrl: normalizeFileUrl(row.avatar_url),
    musicUrl: normalizeFileUrl(row.music_url),
    musicTitle: row.music_title,
    musicAutoplay: !!row.music_autoplay,
    backgroundUrl: normalizeFileUrl(row.background_url),
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

